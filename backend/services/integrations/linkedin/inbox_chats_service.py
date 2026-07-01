"""
LinkedIn Inbox Chats Service — fetch and normalize Unipile chat list.

Phase 3: minimal normalization (id, name, timestamp, unread_count).
Phase 5+: personal-profile filtering and extended fields.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from loguru import logger

from models.linkedin_inbox_models import InboxChat, InboxChatListResponse
from services.integrations.linkedin.unipile_client import UnipileAPIError, UnipileClient


def _parse_timestamp(date_str: Optional[str]) -> Optional[datetime]:
    """Parse Unipile timestamp string to datetime, or None if missing/invalid."""
    if not date_str:
        return None

    formats = [
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S.%fZ",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%d",
    ]

    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue

    logger.warning(f"[InboxChatsService] Could not parse timestamp: {date_str}")
    return None


def _normalize_chat(item: dict[str, Any]) -> InboxChat:
    """Map a raw Unipile Chat item to InboxChat."""
    raw_name = item.get("name")
    name = raw_name.strip() if isinstance(raw_name, str) and raw_name.strip() else "Unknown"

    unread = item.get("unread_count", 0)
    try:
        unread_count = max(0, int(unread))
    except (TypeError, ValueError):
        unread_count = 0

    chat_id = item.get("id")
    if not chat_id:
        raise ValueError("Chat item missing id")

    return InboxChat(
        id=str(chat_id),
        name=name,
        timestamp=_parse_timestamp(item.get("timestamp")),
        unread_count=unread_count,
    )


class InboxChatsServiceError(RuntimeError):
    """Raised when inbox chats service encounters an error."""

    def __init__(self, message: str, *, cause: Optional[Exception] = None) -> None:
        super().__init__(message)
        self.cause = cause


class InboxChatsService:
    """Service for fetching and normalizing LinkedIn inbox chats."""

    def __init__(self, unipile_client: Optional[UnipileClient] = None) -> None:
        self._client = unipile_client or UnipileClient()

    async def fetch_inbox_chats(
        self,
        account_id: str,
        cursor: Optional[str] = None,
        limit: int = 50,
    ) -> InboxChatListResponse:
        """
        Fetch and normalize inbox chats for a personal Unipile account.

        Args:
            account_id: Unipile personal account ID
            cursor: Optional pagination cursor
            limit: Number of chats to fetch (default 50, max 100)

        Returns:
            InboxChatListResponse with chats sorted by timestamp descending
        """
        logger.info(
            f"[InboxChatsService] Fetching chats account_id={account_id} limit={limit}"
        )

        try:
            raw_response = await self._client.list_chats(
                account_id=account_id,
                cursor=cursor,
                limit=limit,
            )

            if not isinstance(raw_response, dict):
                raise InboxChatsServiceError(
                    f"Unexpected response type from Unipile: {type(raw_response)}"
                )

            items = raw_response.get("items", [])
            if not isinstance(items, list):
                raise InboxChatsServiceError(
                    f"Unexpected items type from Unipile: {type(items)}"
                )

            normalized: list[InboxChat] = []
            for item in items:
                try:
                    if isinstance(item, dict):
                        normalized.append(_normalize_chat(item))
                except Exception as exc:
                    logger.warning(f"[InboxChatsService] Failed to normalize chat: {exc}")

            normalized.sort(
                key=lambda chat: chat.timestamp or datetime.min,
                reverse=True,
            )

            next_cursor = raw_response.get("cursor")
            has_more = bool(next_cursor)

            paging = raw_response.get("paging", {})
            total_count = None
            if isinstance(paging, dict):
                page_count = paging.get("page_count")
                if page_count:
                    total_count = page_count * limit

            logger.info(
                f"[InboxChatsService] Normalized {len(normalized)} chats "
                f"account_id={account_id}"
            )

            return InboxChatListResponse(
                chats=normalized,
                cursor=next_cursor,
                has_more=has_more,
                total_count=total_count,
            )

        except UnipileAPIError as exc:
            logger.error(f"[InboxChatsService] Unipile API error: {exc}")
            raise InboxChatsServiceError(
                f"Failed to fetch inbox chats from LinkedIn: {exc}",
                cause=exc,
            ) from exc
        except InboxChatsServiceError:
            raise
        except Exception as exc:
            logger.error(f"[InboxChatsService] Unexpected error: {exc}")
            raise InboxChatsServiceError(
                f"Failed to fetch inbox chats: {exc}",
                cause=exc,
            ) from exc


_inbox_chats_service_instance: Optional[InboxChatsService] = None


def get_inbox_chats_service() -> InboxChatsService:
    """Get or create singleton InboxChatsService instance."""
    global _inbox_chats_service_instance
    if _inbox_chats_service_instance is None:
        _inbox_chats_service_instance = InboxChatsService()
    return _inbox_chats_service_instance


def reset_inbox_chats_service() -> None:
    """Reset the singleton instance (useful for testing)."""
    global _inbox_chats_service_instance
    _inbox_chats_service_instance = None
