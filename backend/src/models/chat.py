"""
Chat models for API requests and responses.
Handles conversation messages and chat interactions.
"""
from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


class MessageRole(str, Enum):
    """Roles for chat messages."""
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class ChatMessage(BaseModel):
    """
    A single chat message in the conversation.

    Attributes:
        role: Who sent the message (user/assistant/system)
        content: The message text content
        timestamp: When the message was created
        metadata: Optional additional message data
    """
    role: MessageRole = Field(
        ...,
        description="Role of the message sender"
    )
    content: str = Field(
        ...,
        description="Text content of the message",
        min_length=1,
        max_length=10000
    )
    timestamp: datetime = Field(
        default_factory=datetime.utcnow,
        description="When the message was created"
    )
    metadata: Optional[dict] = Field(
        default=None,
        description="Optional metadata (e.g., sources, citations)"
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "role": "user",
                    "content": "What is the best build for Witch in PoE2?",
                    "timestamp": "2024-01-15T10:30:00Z",
                    "metadata": None
                }
            ]
        }
    }


class GameVersion(str, Enum):
    """Supported Path of Exile game versions."""
    POE1 = "poe1"
    POE2 = "poe2"


class ChatRequest(BaseModel):
    """
    Request model for chat endpoint.

    Attributes:
        message: The user's message
        conversation_id: Optional conversation identifier for context
        game_version: Which game version to query (poe1 or poe2)
        build_context: Optional build context for personalized responses
        stream: Whether to stream the response
    """
    message: str = Field(
        ...,
        description="User's message content",
        min_length=1,
        max_length=10000
    )
    conversation_id: Optional[str] = Field(
        default=None,
        description="Optional conversation ID for maintaining context",
        max_length=100
    )
    game_version: GameVersion = Field(
        default=GameVersion.POE2,
        description="Game version to query"
    )
    build_context: Optional[str] = Field(
        default=None,
        description="Optional build context (e.g., class, ascendancy)",
        max_length=500
    )
    stream: bool = Field(
        default=False,
        description="Whether to stream the response"
    )

    @field_validator("message")
    @classmethod
    def validate_message(cls, v):
        """Ensure message is not just whitespace."""
        if not v or not v.strip():
            raise ValueError("Message cannot be empty or only whitespace")
        return v.strip()

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "message": "What are the best skills for a Witch in PoE2?",
                    "conversation_id": "conv-123",
                    "game_version": "poe2",
                    "build_context": "Witch - Blood Mage",
                    "stream": False
                }
            ]
        }
    }


class Source(BaseModel):
    """
    Source citation for RAG responses.

    Attributes:
        content: The retrieved content snippet
        source: Original source URL or document name
        relevance_score: Similarity score (0-1)
    """
    content: str = Field(
        ...,
        description="Retrieved content snippet"
    )
    source: str = Field(
        ...,
        description="Original source (URL or document name)"
    )
    relevance_score: float = Field(
        ...,
        description="Similarity score between 0 and 1",
        ge=0.0,
        le=1.0
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "content": "The Blood Mage ascendancy focuses on life and blood magic...",
                    "source": "https://poedb.tw/us/Blood_Mage",
                    "relevance_score": 0.92
                }
            ]
        }
    }


class ChatResponse(BaseModel):
    """
    Response model for chat endpoint.

    Attributes:
        message: The assistant's response message
        conversation_id: Conversation identifier for future requests
        sources: List of sources used to generate the response
        game_version: The game version that was queried
        timestamp: When the response was generated
    """
    message: ChatMessage = Field(
        ...,
        description="Assistant's response message"
    )
    conversation_id: str = Field(
        ...,
        description="Conversation ID for maintaining context"
    )
    sources: List[Source] = Field(
        default_factory=list,
        description="Sources used to generate the response"
    )
    game_version: GameVersion = Field(
        ...,
        description="Game version that was queried"
    )
    timestamp: datetime = Field(
        default_factory=datetime.utcnow,
        description="When the response was generated"
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "Based on the current meta...",
                        "timestamp": "2024-01-15T10:30:05Z"
                    },
                    "conversation_id": "conv-123",
                    "sources": [
                        {
                            "content": "Blood Mage skills...",
                            "source": "https://poedb.tw/us/Blood_Mage",
                            "relevance_score": 0.92
                        }
                    ],
                    "game_version": "poe2",
                    "timestamp": "2024-01-15T10:30:05Z"
                }
            ]
        }
    }


class ConversationHistory(BaseModel):
    """
    Model for managing conversation history.

    Attributes:
        conversation_id: Unique identifier for the conversation
        messages: List of all messages in the conversation
        created_at: When the conversation was created
        updated_at: When the conversation was last updated
        game_version: The game version for this conversation
        build_context: Build context for this conversation
    """
    conversation_id: str = Field(
        ...,
        description="Unique conversation identifier"
    )
    messages: List[ChatMessage] = Field(
        default_factory=list,
        description="List of messages in the conversation"
    )
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="When the conversation was created"
    )
    updated_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="When the conversation was last updated"
    )
    game_version: GameVersion = Field(
        default=GameVersion.POE2,
        description="Game version for this conversation"
    )
    build_context: Optional[str] = Field(
        default=None,
        description="Build context for this conversation"
    )

    def add_message(self, message: ChatMessage) -> None:
        """Add a message to the conversation history."""
        self.messages.append(message)
        self.updated_at = datetime.utcnow()

    def get_context_window(self, max_messages: int = 10) -> List[ChatMessage]:
        """
        Get the most recent messages for context.

        Args:
            max_messages: Maximum number of messages to return

        Returns:
            List of most recent messages
        """
        return self.messages[-max_messages:] if self.messages else []

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "conversation_id": "conv-123",
                    "messages": [
                        {
                            "role": "user",
                            "content": "What is the best Witch build?",
                            "timestamp": "2024-01-15T10:30:00Z"
                        },
                        {
                            "role": "assistant",
                            "content": "The Blood Mage is strong...",
                            "timestamp": "2024-01-15T10:30:05Z"
                        }
                    ],
                    "created_at": "2024-01-15T10:30:00Z",
                    "updated_at": "2024-01-15T10:30:05Z",
                    "game_version": "poe2",
                    "build_context": "Witch - Blood Mage"
                }
            ]
        }
    }


__all__ = [
    "MessageRole",
    "ChatMessage",
    "GameVersion",
    "ChatRequest",
    "Source",
    "ChatResponse",
    "ConversationHistory",
]
