"""
LinkedIn Inbox API routes.

Provides endpoints for fetching user's LinkedIn inbox chats via Unipile.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from loguru import logger

from api.linkedin_posts_routes import (
    _map_unipile_error,
    _resolve_personal_account_and_identifier,
)
from middleware.auth_middleware import get_current_user
from models.linkedin_inbox_models import (
    InboxChatListResponse,
    InboxChatsErrorResponse,
)
from services.integrations.linkedin.inbox_chats_service import (
    InboxChatsService,
    InboxChatsServiceError,
    get_inbox_chats_service,
)
from services.integrations.linkedin.unipile_client import UnipileAPIError

router = APIRouter(prefix="/api/linkedin", tags=["LinkedIn Inbox"])


def _user_id(current_user: dict) -> str:
    uid = current_user.get("id") if current_user else None
    if not uid:
        raise HTTPException(status_code=401, detail="Authentication required")
    return str(uid)


@router.get(
    "/inbox/chats",
    response_model=InboxChatListResponse,
    responses={
        401: {"model": InboxChatsErrorResponse, "description": "Not authenticated or not connected"},
        404: {"model": InboxChatsErrorResponse, "description": "Account not found"},
        429: {"model": InboxChatsErrorResponse, "description": "Rate limit exceeded"},
        500: {"model": InboxChatsErrorResponse, "description": "Internal server error"},
    },
    summary="Fetch user's LinkedIn inbox chats",
    description=(
        "Fetch the authenticated user's LinkedIn inbox conversations. "
        "Uses the connected personal LinkedIn profile only."
    ),
)
async def get_inbox_chats_list(
    cursor: Optional[str] = Query(None, description="Pagination cursor for next page"),
    limit: int = Query(50, ge=1, le=100, description="Number of chats to fetch (max 100)"),
    current_user: dict = Depends(get_current_user),
    inbox_service: InboxChatsService = Depends(get_inbox_chats_service),
) -> InboxChatListResponse:
    """Fetch LinkedIn inbox chats for the authenticated user."""
    user_id = _user_id(current_user)
    logger.info(
        f"[LinkedInInbox] Fetching inbox chats user={user_id} limit={limit} "
        f"cursor={'set' if cursor else 'none'}"
    )

    try:
        account_id, _identifier = await _resolve_personal_account_and_identifier(user_id)
        logger.info(f"[LinkedInInbox] Using personal account_id={account_id}")

        result = await inbox_service.fetch_inbox_chats(
            account_id=account_id,
            cursor=cursor,
            limit=limit,
        )

        logger.info(
            f"[LinkedInInbox] Successfully fetched {len(result.chats)} chats "
            f"for user={user_id}"
        )
        return result

    except HTTPException:
        raise

    except InboxChatsServiceError as exc:
        logger.error(f"[LinkedInInbox] Inbox chats service error: {exc}")

        cause = exc.cause
        if isinstance(cause, UnipileAPIError):
            status_code, error_code, message = _map_unipile_error(cause)
            raise HTTPException(
                status_code=status_code,
                detail={
                    "error_code": error_code,
                    "message": message,
                    "details": {
                        "unipile_status": cause.status_code,
                        "unipile_error_type": cause.error_type,
                    },
                },
            ) from exc

        status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        error_code = "FETCH_ERROR"
        message = str(exc)

        error_str = str(exc).lower()
        if "rate limit" in error_str or "429" in error_str:
            status_code = status.HTTP_429_TOO_MANY_REQUESTS
            error_code = "RATE_LIMITED"
        elif "not found" in error_str:
            status_code = status.HTTP_404_NOT_FOUND
            error_code = "NOT_FOUND"

        raise HTTPException(
            status_code=status_code,
            detail={
                "error_code": error_code,
                "message": message,
            },
        ) from exc

    except Exception as exc:
        logger.exception(f"[LinkedInInbox] Unexpected error fetching inbox chats: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error_code": "INTERNAL_ERROR",
                "message": "An unexpected error occurred while fetching inbox chats.",
            },
        ) from exc
