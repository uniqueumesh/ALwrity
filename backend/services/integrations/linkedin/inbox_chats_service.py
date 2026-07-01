"""
LinkedIn Inbox Chats Service — fetch and normalize Unipile chat list.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from loguru import logger

from models.linkedin_inbox_models import InboxChat, InboxChatListResponse
from services.integrations.linkedin.inbox_chats_filter import is_personal_linkedin_chat
from services.integrations.linkedin.unipile_client import UnipileAPIError, UnipileClient

FOLDER_LABELS: dict[str, str] = {
    "INBOX": "Inbox",
    "INBOX_LINKEDIN_CLASSIC": "Classic Inbox",
    "INBOX_LINKEDIN_RECRUITER": "Recruiter",
    "INBOX_LINKEDIN_SALES_NAVIGATOR": "Sales Navigator",
    "INBOX_LINKEDIN_ORGANIZATION": "Organization",
    "INBOX_INSTAGRAM_GENERAL": "Instagram",
}

FOLDER_DISPLAY_PRIORITY: tuple[str, ...] = (
    "INBOX_LINKEDIN_CLASSIC",
    "INBOX",
    "INBOX_LINKEDIN_RECRUITER",
    "INBOX_LINKEDIN_SALES_NAVIGATOR",
    "INBOX_LINKEDIN_ORGANIZATION",
    "INBOX_INSTAGRAM_GENERAL",
)


def _parse_timestamp(date_str: Optional[str]) -> Optional[datetime]:
    """Parse Unipile timestamp string to datetime, or None if missing/invalid."""
    if not date_str:
        return None

    if isinstance(date_str, (int, float)):
        try:
            return datetime.utcfromtimestamp(float(date_str) / 1000.0 if date_str > 1e12 else float(date_str))
        except (OSError, ValueError, OverflowError):
            return None

    if not isinstance(date_str, str):
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


def _flag_to_bool(value: Any) -> bool:
    """Convert Unipile 0/1 or boolean flags to bool."""
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes"}
    return False


def _is_muted(muted_until: Any) -> bool:
    """Determine if chat is muted from Unipile muted_until field."""
    if muted_until is None:
        return False
    if muted_until is True or muted_until == -1:
        return True
    if isinstance(muted_until, (int, float)):
        if muted_until <= 0:
            return muted_until == -1
        parsed = _parse_timestamp(str(int(muted_until)))
        return parsed is not None and parsed > datetime.utcnow()
    if isinstance(muted_until, str) and muted_until.strip():
        parsed = _parse_timestamp(muted_until)
        if parsed:
            return parsed > datetime.utcnow()
        return True
    return False


def _normalize_folders(raw_folders: Any) -> list[str]:
    if not isinstance(raw_folders, list):
        return []
    return [str(folder) for folder in raw_folders if folder]


def _folder_labels(folders: list[str]) -> list[str]:
    labels: list[str] = []
    for folder in folders:
        labels.append(FOLDER_LABELS.get(folder, folder.replace("_", " ").title()))
    return labels


def _primary_folder_label(folders: list[str], labels: list[str]) -> Optional[str]:
    for key in FOLDER_DISPLAY_PRIORITY:
        if key in folders:
            idx = folders.index(key)
            return labels[idx]
    return labels[0] if labels else None


def _normalize_disabled_features(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    return [str(feature) for feature in raw if feature]


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

    raw_subject = item.get("subject")
    subject = raw_subject.strip() if isinstance(raw_subject, str) and raw_subject.strip() else None

    raw_content_type = item.get("content_type")
    content_type = (
        raw_content_type.strip().lower()
        if isinstance(raw_content_type, str) and raw_content_type.strip()
        else None
    )

    folders = _normalize_folders(item.get("folder"))
    labels = _folder_labels(folders)
    primary = _primary_folder_label(folders, labels)
    if primary and labels and labels[0] != primary:
        labels = [primary] + [label for label in labels if label != primary]

    chat_type = item.get("type")
    parsed_type: Optional[int] = None
    if chat_type is not None:
        try:
            parsed_type = int(chat_type)
        except (TypeError, ValueError):
            parsed_type = None

    return InboxChat(
        id=str(chat_id),
        name=name,
        subject=subject,
        timestamp=_parse_timestamp(item.get("timestamp")),
        unread_count=unread_count,
        content_type=content_type,
        folders=folders,
        folder_labels=labels,
        is_pinned=_flag_to_bool(item.get("pinned")),
        is_archived=_flag_to_bool(item.get("archived")),
        is_readonly=_flag_to_bool(item.get("read_only")),
        is_muted=_is_muted(item.get("muted_until")),
        disabled_features=_normalize_disabled_features(item.get("disabledFeatures")),
        chat_type=parsed_type,
        provider_id=str(item["provider_id"]) if item.get("provider_id") else None,
        attendee_provider_id=(
            str(item["attendee_provider_id"]) if item.get("attendee_provider_id") else None
        ),
        organization_id=str(item["organization_id"]) if item.get("organization_id") else None,
        mailbox_id=str(item["mailbox_id"]) if item.get("mailbox_id") else None,
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
            skipped = 0
            for item in items:
                try:
                    if not isinstance(item, dict):
                        continue
                    if not is_personal_linkedin_chat(item, personal_account_id=account_id):
                        skipped += 1
                        continue
                    normalized.append(_normalize_chat(item))
                except Exception as exc:
                    logger.warning(f"[InboxChatsService] Failed to normalize chat: {exc}")

            if skipped:
                logger.info(
                    f"[InboxChatsService] Filtered out {skipped} non-personal chats "
                    f"account_id={account_id}"
                )

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
