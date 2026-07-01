"""
API tests for GET /api/linkedin/inbox/chats.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))


def _load_linkedin_inbox_routes():
    module_name = "_linkedin_inbox_routes_under_test"
    if module_name in sys.modules:
        return sys.modules[module_name]

    routes_path = _BACKEND_ROOT / "api" / "linkedin_inbox_routes.py"
    spec = importlib.util.spec_from_file_location(module_name, routes_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load route module from {routes_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


_routes = _load_linkedin_inbox_routes()


@pytest.mark.anyio
async def test_get_inbox_chats_requires_authenticated_user() -> None:
    with pytest.raises(HTTPException) as exc_info:
        await _routes.get_inbox_chats_list(current_user={})

    assert exc_info.value.status_code == 401


@pytest.mark.anyio
async def test_get_inbox_chats_returns_401_when_not_connected() -> None:
    with patch.object(
        _routes,
        "_resolve_personal_account_and_identifier",
        new=AsyncMock(
            side_effect=HTTPException(
                status_code=401,
                detail={
                    "error_code": "NOT_CONNECTED",
                    "message": "LinkedIn account not connected. Please connect your LinkedIn account first.",
                },
            )
        ),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await _routes.get_inbox_chats_list(
                current_user={"id": "user_1"},
                inbox_service=_routes.get_inbox_chats_service(),
            )

    assert exc_info.value.status_code == 401
    detail = exc_info.value.detail
    assert isinstance(detail, dict)
    assert detail.get("error_code") == "NOT_CONNECTED"


@pytest.mark.anyio
async def test_get_inbox_chats_returns_normalized_list() -> None:
    from models.linkedin_inbox_models import InboxChat, InboxChatListResponse

    mock_service = AsyncMock()
    mock_service.fetch_inbox_chats.return_value = InboxChatListResponse(
        chats=[
            InboxChat(
                id="chat-1",
                name="Jane Doe",
                unread_count=2,
            )
        ],
        has_more=False,
    )

    with patch.object(
        _routes,
        "_resolve_personal_account_and_identifier",
        new=AsyncMock(return_value=("acc_personal", "ACo123")),
    ):
        response = await _routes.get_inbox_chats_list(
            current_user={"id": "user_1"},
            inbox_service=mock_service,
        )

    assert len(response.chats) == 1
    assert response.chats[0].name == "Jane Doe"
    mock_service.fetch_inbox_chats.assert_awaited_once_with(
        account_id="acc_personal",
        cursor=None,
        limit=50,
    )
