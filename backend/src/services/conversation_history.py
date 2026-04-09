"""
Conversation history management for POE Knowledge Assistant.
Provides in-memory storage and retrieval of conversation messages by conversation_id.
"""
import logging
import threading
import time
import uuid
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Dict, List, Optional

from src.models.chat import (
    ChatMessage,
    ConversationHistory,
    GameVersion,
    MessageRole,
)

logger = logging.getLogger(__name__)


class ConversationHistoryError(Exception):
    """Custom exception for conversation history errors."""
    pass


class ConversationNotFoundError(ConversationHistoryError):
    """Raised when a conversation is not found."""
    pass


class ConversationStore:
    """
    Thread-safe in-memory store for conversation histories.

    Features:
    - Stores conversations keyed by conversation_id
    - Supports configurable max conversations (LRU eviction)
    - Supports configurable max messages per conversation (sliding window)
    - Automatic cleanup of expired conversations based on TTL
    - Thread-safe operations using a reentrant lock

    Attributes:
        max_conversations: Maximum number of conversations to keep in memory
        max_messages_per_conversation: Maximum messages to retain per conversation
        conversation_ttl_seconds: Time-to-live for idle conversations (0 = no expiry)
    """

    def __init__(
        self,
        max_conversations: int = 1000,
        max_messages_per_conversation: int = 50,
        conversation_ttl_seconds: int = 0,
    ):
        """
        Initialize the conversation store.

        Args:
            max_conversations: Maximum conversations to keep (LRU eviction)
            max_messages_per_conversation: Max messages per conversation (sliding window)
            conversation_ttl_seconds: TTL in seconds for idle conversations (0 = no expiry)
        """
        self.max_conversations = max_conversations
        self.max_messages_per_conversation = max_messages_per_conversation
        self.conversation_ttl_seconds = conversation_ttl_seconds
        self._conversations: OrderedDict[str, ConversationHistory] = OrderedDict()
        self._lock = threading.RLock()

        logger.info(
            f"ConversationStore initialized: max_conversations={max_conversations}, "
            f"max_messages={max_messages_per_conversation}, "
            f"ttl={conversation_ttl_seconds}s"
        )

    def _evict_expired(self) -> None:
        """Remove expired conversations based on TTL. Must be called with lock held."""
        if self.conversation_ttl_seconds <= 0:
            return

        now = datetime.now(timezone.utc)
        expired_ids = []

        for conv_id, conv in self._conversations.items():
            age = (now - conv.updated_at.replace(tzinfo=timezone.utc)).total_seconds()
            if age > self.conversation_ttl_seconds:
                expired_ids.append(conv_id)

        for conv_id in expired_ids:
            del self._conversations[conv_id]
            logger.debug(f"Evicted expired conversation: {conv_id}")

        if expired_ids:
            logger.info(f"Evicted {len(expired_ids)} expired conversations")

    def _evict_lru(self) -> None:
        """Evict oldest conversations if over max_conversations limit. Must be called with lock held."""
        while len(self._conversations) > self.max_conversations:
            evicted_key, _ = self._conversations.popitem(last=False)
            logger.debug(f"Evicted LRU conversation: {evicted_key}")

    def get_or_create_conversation(
        self,
        conversation_id: Optional[str] = None,
        game_version: GameVersion = GameVersion.POE2,
        build_context: Optional[str] = None,
    ) -> ConversationHistory:
        """
        Get an existing conversation or create a new one.

        Args:
            conversation_id: Optional existing conversation ID
            game_version: Game version for new conversations
            build_context: Build context for new conversations

        Returns:
            ConversationHistory instance
        """
        with self._lock:
            self._evict_expired()

            if conversation_id and conversation_id in self._conversations:
                # Move to end (most recently used)
                self._conversations.move_to_end(conversation_id)
                conv = self._conversations[conversation_id]
                logger.debug(f"Retrieved existing conversation: {conversation_id} "
                             f"({len(conv.messages)} messages)")
                return conv

            # Create new conversation
            if not conversation_id:
                conversation_id = f"conv-{uuid.uuid4().hex[:12]}"

            conv = ConversationHistory(
                conversation_id=conversation_id,
                game_version=game_version,
                build_context=build_context,
            )
            self._conversations[conversation_id] = conv
            self._evict_lru()

            logger.info(f"Created new conversation: {conversation_id}")
            return conv

    def add_message(
        self,
        conversation_id: str,
        role: MessageRole,
        content: str,
        metadata: Optional[dict] = None,
    ) -> ChatMessage:
        """
        Add a message to a conversation.

        If the conversation does not exist, a new one is created.

        Args:
            conversation_id: Conversation ID to add the message to
            role: Message role (user, assistant, system)
            content: Message content
            metadata: Optional metadata for the message

        Returns:
            The created ChatMessage
        """
        with self._lock:
            conv = self.get_or_create_conversation(conversation_id)

            message = ChatMessage(
                role=role,
                content=content,
                metadata=metadata,
            )
            conv.add_message(message)

            # Trim messages if over limit (sliding window)
            if len(conv.messages) > self.max_messages_per_conversation:
                excess = len(conv.messages) - self.max_messages_per_conversation
                conv.messages = conv.messages[excess:]
                logger.debug(
                    f"Trimmed {excess} messages from conversation {conversation_id}"
                )

            # Move to end (most recently used)
            self._conversations.move_to_end(conversation_id)

            logger.debug(
                f"Added {role.value} message to conversation {conversation_id} "
                f"(total: {len(conv.messages)})"
            )
            return message

    def get_conversation(self, conversation_id: str) -> ConversationHistory:
        """
        Get a conversation by ID.

        Args:
            conversation_id: Conversation ID to retrieve

        Returns:
            ConversationHistory instance

        Raises:
            ConversationNotFoundError: If the conversation does not exist
        """
        with self._lock:
            self._evict_expired()

            if conversation_id not in self._conversations:
                raise ConversationNotFoundError(
                    f"Conversation '{conversation_id}' not found"
                )

            self._conversations.move_to_end(conversation_id)
            return self._conversations[conversation_id]

    def get_history_messages(
        self,
        conversation_id: str,
        max_messages: int = 20,
    ) -> List[Dict[str, str]]:
        """
        Get conversation history as a list of message dicts for LLM context.

        Returns messages in the format [{"role": "user", "content": "..."}, ...]
        suitable for passing to the streaming service's _build_messages function.

        Args:
            conversation_id: Conversation ID
            max_messages: Maximum number of recent messages to return

        Returns:
            List of message dicts with 'role' and 'content' keys
        """
        with self._lock:
            if conversation_id not in self._conversations:
                return []

            conv = self._conversations[conversation_id]
            recent = conv.get_context_window(max_messages)

            return [
                {"role": msg.role.value, "content": msg.content}
                for msg in recent
            ]

    def delete_conversation(self, conversation_id: str) -> bool:
        """
        Delete a conversation by ID.

        Args:
            conversation_id: Conversation ID to delete

        Returns:
            True if the conversation was found and deleted, False otherwise
        """
        with self._lock:
            if conversation_id in self._conversations:
                del self._conversations[conversation_id]
                logger.info(f"Deleted conversation: {conversation_id}")
                return True
            return False

    def list_conversations(self) -> List[Dict]:
        """
        List all conversations with summary information.

        Returns:
            List of dicts with conversation summary info
        """
        with self._lock:
            self._evict_expired()

            summaries = []
            for conv_id, conv in self._conversations.items():
                summaries.append({
                    "conversation_id": conv.conversation_id,
                    "message_count": len(conv.messages),
                    "created_at": conv.created_at.isoformat(),
                    "updated_at": conv.updated_at.isoformat(),
                    "game_version": conv.game_version.value,
                    "build_context": conv.build_context,
                })
            return summaries

    def get_stats(self) -> Dict:
        """
        Get statistics about the conversation store.

        Returns:
            Dict with store statistics
        """
        with self._lock:
            total_messages = sum(
                len(conv.messages) for conv in self._conversations.values()
            )
            return {
                "total_conversations": len(self._conversations),
                "total_messages": total_messages,
                "max_conversations": self.max_conversations,
                "max_messages_per_conversation": self.max_messages_per_conversation,
                "conversation_ttl_seconds": self.conversation_ttl_seconds,
            }

    def clear_all(self) -> int:
        """
        Clear all conversations.

        Returns:
            Number of conversations that were cleared
        """
        with self._lock:
            count = len(self._conversations)
            self._conversations.clear()
            logger.info(f"Cleared all conversations ({count} removed)")
            return count


# Global singleton instance
_conversation_store: Optional[ConversationStore] = None
_store_lock = threading.Lock()


def get_conversation_store() -> ConversationStore:
    """
    Get the global ConversationStore instance.

    Returns:
        ConversationStore singleton instance
    """
    global _conversation_store
    if _conversation_store is None:
        with _store_lock:
            if _conversation_store is None:
                _conversation_store = ConversationStore()
    return _conversation_store


def reset_conversation_store() -> None:
    """Reset the global conversation store (useful for testing)."""
    global _conversation_store
    with _store_lock:
        if _conversation_store is not None:
            _conversation_store.clear_all()
        _conversation_store = None


def check_conversation_history_health() -> Dict:
    """
    Check the health of the conversation history service.

    Returns:
        Dict with health status information
    """
    try:
        store = get_conversation_store()
        stats = store.get_stats()
        return {
            "status": "ready",
            "message": "Conversation history service is operational",
            "stats": stats,
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Conversation history service error: {str(e)}",
        }


__all__ = [
    "ConversationStore",
    "ConversationHistoryError",
    "ConversationNotFoundError",
    "get_conversation_store",
    "reset_conversation_store",
    "check_conversation_history_health",
]
