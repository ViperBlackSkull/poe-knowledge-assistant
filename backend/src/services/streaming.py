"""
Streaming response generator for POE Knowledge Assistant.
Provides Server-Sent Events (SSE) streaming for real-time chat responses.
"""
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Generator, List, Optional

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from src.config import get_settings
from src.services.llm_provider import (
    LLMProviderError,
    OpenAILLM,
    AnthropicLLM,
    OllamaLLM,
    LMStudioLLM,
    get_llm,
)
from src.services.rag_chain import RAGChain, RAGChainError, Citation, get_rag_chain
from src.services.conversation_history import (
    get_conversation_store,
    MessageRole,
)

logger = logging.getLogger(__name__)


class StreamingError(Exception):
    """Custom exception for streaming errors."""
    pass


# System prompt template for RAG-based responses
SYSTEM_PROMPT_TEMPLATE = """You are the POE Knowledge Assistant, an expert AI assistant for Path of Exile (PoE) and Path of Exile 2 (PoE2) game knowledge.

You provide accurate, helpful answers about game mechanics, builds, skills, items, and strategies.

Use the following retrieved context to answer the user's question. If the context doesn't contain relevant information, say so honestly.

Always specify whether your answer applies to PoE1 or PoE2.

Game Version: {game}
{build_context_section}

Retrieved Context:
{context}"""


def _format_sse_event(event: str, data: Dict[str, Any]) -> str:
    """
    Format a Server-Sent Event message.

    Args:
        event: The event type (e.g., 'token', 'sources', 'done', 'error')
        data: The data payload as a dictionary

    Returns:
        Formatted SSE string
    """
    json_data = json.dumps(data)
    return f"event: {event}\ndata: {json_data}\n\n"


def _build_messages(
    query: str,
    context: str,
    game: str,
    build_context: Optional[str] = None,
    conversation_history: Optional[List[Dict[str, str]]] = None,
) -> List[BaseMessage]:
    """
    Build the list of LangChain messages for the LLM.

    Args:
        query: The user's query
        context: The retrieved context text
        game: Game version string ('poe1' or 'poe2')
        build_context: Optional build context
        conversation_history: Optional list of previous messages with 'role' and 'content'

    Returns:
        List of LangChain BaseMessage objects
    """
    build_context_section = ""
    if build_context:
        build_context_section = f"Build Context: {build_context}"

    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
        game=game,
        build_context_section=build_context_section,
        context=context,
    )

    messages: List[BaseMessage] = [SystemMessage(content=system_prompt)]

    # Add conversation history if provided
    if conversation_history:
        for msg in conversation_history:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role == "user":
                messages.append(HumanMessage(content=content))
            elif role == "assistant":
                messages.append(AIMessage(content=content))

    # Add the current query
    messages.append(HumanMessage(content=query))

    return messages


def generate_streaming_response(
    query: str,
    game: str = "poe2",
    build_context: Optional[str] = None,
    conversation_id: Optional[str] = None,
    conversation_history: Optional[List[Dict[str, str]]] = None,
) -> Generator[str, None, None]:
    """
    Generate a streaming response using SSE format.

    This function:
    1. Retrieves relevant documents using the RAG chain
    2. Sends source citations as an SSE event
    3. Streams LLM response tokens as SSE events
    4. Sends completion event when done
    5. Handles errors gracefully with error SSE events

    Args:
        query: The user's question
        game: Game version ('poe1' or 'poe2')
        build_context: Optional build context for filtering
        conversation_id: Optional conversation ID
        conversation_history: Optional list of previous messages

    Yields:
        Formatted SSE event strings
    """
    # Generate conversation ID if not provided
    if not conversation_id:
        conversation_id = f"conv-{uuid.uuid4().hex[:12]}"

    settings = get_settings()
    conv_store = get_conversation_store()

    # Store the user's message in conversation history
    conv_store.add_message(
        conversation_id=conversation_id,
        role=MessageRole.USER,
        content=query,
    )

    # If no explicit conversation_history was passed, retrieve from the store
    if conversation_history is None:
        conversation_history = conv_store.get_history_messages(
            conversation_id=conversation_id,
            max_messages=20,
        )
        # Exclude the message we just added (it will be added by _build_messages as
        # the current query). The store now has the user message as the last entry,
        # so we take all but the last.
        if conversation_history and conversation_history[-1]["content"] == query:
            conversation_history = conversation_history[:-1]

    try:
        # Step 1: Retrieve context using RAG chain
        logger.info(
            f"Starting streaming response for query: '{query[:50]}...', "
            f"game={game}, conversation_id={conversation_id}"
        )

        rag_chain = get_rag_chain()
        retrieval_result = rag_chain.retrieve(
            query=query,
            game=game,
            build_context=build_context,
        )

        context_text = retrieval_result.get_context_text()

        # Step 2: Send sources event with citations
        sources_data = []
        for citation in retrieval_result.citations:
            sources_data.append({
                "content": citation.content[:200] + ("..." if len(citation.content) > 200 else ""),
                "source": citation.source,
                "relevance_score": round(citation.relevance_score, 4),
            })

        yield _format_sse_event("sources", {
            "sources": sources_data,
            "conversation_id": conversation_id,
            "document_count": len(retrieval_result.documents),
        })

        # Step 3: Build messages for LLM
        messages = _build_messages(
            query=query,
            context=context_text if context_text else "No relevant context found.",
            game=game,
            build_context=build_context,
            conversation_history=conversation_history,
        )

        # Step 4: Get LLM instance and stream response
        llm = get_llm()

        if not llm.is_ready():
            yield _format_sse_event("error", {
                "error": "LLM service is not ready. Please check your configuration.",
                "error_type": "llm_not_ready",
            })
            return

        # Use the LangChain streaming interface
        client = llm.client
        if client is None:
            yield _format_sse_event("error", {
                "error": "LLM client is not initialized.",
                "error_type": "client_not_initialized",
            })
            return

        # Stream tokens from the LLM
        full_response = ""
        chunk_count = 0

        try:
            for chunk in client.stream(messages):
                if hasattr(chunk, 'content') and chunk.content:
                    token = chunk.content
                    full_response += token
                    chunk_count += 1

                    yield _format_sse_event("token", {
                        "token": token,
                        "chunk_index": chunk_count,
                    })
        except Exception as stream_error:
            logger.error(f"Streaming error: {str(stream_error)}")

            # If we already have some content, send what we have
            if full_response:
                yield _format_sse_event("partial_complete", {
                    "message": "Response was interrupted",
                    "partial_response": full_response,
                })

            yield _format_sse_event("error", {
                "error": f"Streaming interrupted: {str(stream_error)}",
                "error_type": "stream_interrupted",
            })
            return

        # Step 5: Store the assistant response in conversation history
        if full_response:
            conv_store.add_message(
                conversation_id=conversation_id,
                role=MessageRole.ASSISTANT,
                content=full_response,
                metadata={
                    "sources_count": len(sources_data),
                    "chunk_count": chunk_count,
                },
            )

        # Step 6: Send completion event
        yield _format_sse_event("done", {
            "conversation_id": conversation_id,
            "game": game,
            "total_chunks": chunk_count,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        logger.info(
            f"Streaming response complete: {chunk_count} chunks, "
            f"conversation_id={conversation_id}"
        )

    except RAGChainError as e:
        logger.error(f"RAG chain error during streaming: {str(e)}")
        yield _format_sse_event("error", {
            "error": f"Failed to retrieve context: {str(e)}",
            "error_type": "rag_error",
            "conversation_id": conversation_id,
        })

    except LLMProviderError as e:
        logger.error(f"LLM provider error during streaming: {str(e)}")
        yield _format_sse_event("error", {
            "error": f"LLM generation failed: {str(e)}",
            "error_type": "llm_error",
            "conversation_id": conversation_id,
        })

    except Exception as e:
        logger.error(f"Unexpected error during streaming: {str(e)}")
        yield _format_sse_event("error", {
            "error": f"An unexpected error occurred: {str(e)}",
            "error_type": "unexpected_error",
            "conversation_id": conversation_id,
        })


def check_streaming_health() -> dict:
    """
    Check the health of the streaming service dependencies.

    Returns:
        dict with health status information for streaming dependencies
    """
    result = {
        "status": "error",
        "message": "Streaming service not ready",
        "dependencies": {},
    }

    try:
        # Check RAG chain
        rag_chain = get_rag_chain()
        rag_health = rag_chain.health_check()
        result["dependencies"]["rag_chain"] = rag_health.get("status", "unknown")

        # Check LLM
        try:
            llm = get_llm()
            llm_health = llm.health_check()
            result["dependencies"]["llm"] = llm_health.get("status", "unknown")
        except LLMProviderError as e:
            result["dependencies"]["llm"] = "error"
            result["dependencies"]["llm_error"] = str(e)

        # Determine overall status
        all_ready = all(
            v == "ready"
            for k, v in result["dependencies"].items()
            if not k.endswith("_error")
        )

        if all_ready:
            result["status"] = "ready"
            result["message"] = "Streaming service ready"
        else:
            result["message"] = "One or more dependencies not ready"

    except Exception as e:
        result["message"] = f"Health check failed: {str(e)}"

    return result


__all__ = [
    "StreamingError",
    "generate_streaming_response",
    "check_streaming_health",
]
