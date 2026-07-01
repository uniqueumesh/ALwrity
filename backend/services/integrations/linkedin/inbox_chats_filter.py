"""
Personal-profile chat filtering for Unipile inbox list responses.
"""

from __future__ import annotations

from typing import Any

from loguru import logger

ORG_FOLDER = "INBOX_LINKEDIN_ORGANIZATION"

PERSONAL_FOLDER_KEYS: frozenset[str] = frozenset({
    "INBOX",
    "INBOX_LINKEDIN_CLASSIC",
    "INBOX_LINKEDIN_RECRUITER",
    "INBOX_LINKEDIN_SALES_NAVIGATOR",
})


def _normalize_folders(raw_folders: Any) -> list[str]:
    if not isinstance(raw_folders, list):
        return []
    return [str(folder) for folder in raw_folders if folder]


def is_personal_linkedin_chat(item: dict[str, Any], personal_account_id: str) -> bool:
    """
    Return True when a raw Unipile chat belongs to the user's personal LinkedIn inbox.

    Excludes non-LinkedIn account types (e.g. WHATSAPP), other Unipile accounts,
    organization-page inboxes, and org-scoped chats.
    """
    item_account_id = item.get("account_id")
    if item_account_id and str(item_account_id) != str(personal_account_id):
        logger.debug(
            f"[InboxChatsFilter] Skipping chat id={item.get('id')}: "
            f"account_id mismatch"
        )
        return False

    account_type = item.get("account_type")
    if isinstance(account_type, str) and account_type.strip().upper() != "LINKEDIN":
        logger.debug(
            f"[InboxChatsFilter] Skipping chat id={item.get('id')}: "
            f"account_type={account_type}"
        )
        return False

    org_id = item.get("organization_id")
    if org_id and str(org_id).strip():
        logger.debug(
            f"[InboxChatsFilter] Skipping chat id={item.get('id')}: organization_id set"
        )
        return False

    folders = _normalize_folders(item.get("folder"))
    if ORG_FOLDER in folders:
        has_personal_folder = any(folder in PERSONAL_FOLDER_KEYS for folder in folders)
        if not has_personal_folder:
            logger.debug(
                f"[InboxChatsFilter] Skipping chat id={item.get('id')}: org-only folder"
            )
            return False

    return True
