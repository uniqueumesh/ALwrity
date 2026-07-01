"""
Unit tests for personal-profile inbox chat filtering.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

_BACKEND_ROOT = Path(__file__).resolve().parents[4]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from services.integrations.linkedin.inbox_chats_filter import is_personal_linkedin_chat

PERSONAL_ACCOUNT = "acc_personal_123"


def _base_chat(**overrides: object) -> dict:
    item = {
        "id": "chat-1",
        "account_id": PERSONAL_ACCOUNT,
        "account_type": "LINKEDIN",
        "name": "Jane Doe",
        "folder": ["INBOX", "INBOX_LINKEDIN_CLASSIC"],
    }
    item.update(overrides)
    return item


def test_accepts_personal_linkedin_classic_inbox() -> None:
    assert is_personal_linkedin_chat(_base_chat(), PERSONAL_ACCOUNT) is True


def test_rejects_whatsapp_account_type() -> None:
    assert (
        is_personal_linkedin_chat(
            _base_chat(account_type="WHATSAPP"),
            PERSONAL_ACCOUNT,
        )
        is False
    )


def test_rejects_mismatched_account_id() -> None:
    assert (
        is_personal_linkedin_chat(
            _base_chat(account_id="acc_other"),
            PERSONAL_ACCOUNT,
        )
        is False
    )


def test_rejects_organization_id() -> None:
    assert (
        is_personal_linkedin_chat(
            _base_chat(organization_id="org-999"),
            PERSONAL_ACCOUNT,
        )
        is False
    )


def test_rejects_org_only_folder() -> None:
    assert (
        is_personal_linkedin_chat(
            _base_chat(folder=["INBOX_LINKEDIN_ORGANIZATION"]),
            PERSONAL_ACCOUNT,
        )
        is False
    )


def test_accepts_org_folder_with_personal_classic() -> None:
    assert (
        is_personal_linkedin_chat(
            _base_chat(
                folder=["INBOX_LINKEDIN_ORGANIZATION", "INBOX_LINKEDIN_CLASSIC"]
            ),
            PERSONAL_ACCOUNT,
        )
        is True
    )


def test_accepts_when_account_type_missing_but_account_matches() -> None:
    assert (
        is_personal_linkedin_chat(
            _base_chat(account_type=None),
            PERSONAL_ACCOUNT,
        )
        is True
    )
