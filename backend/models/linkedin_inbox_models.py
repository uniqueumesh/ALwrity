"""
Pydantic models for LinkedIn Inbox Chats API.

Request/response models for fetching user's LinkedIn inbox conversations.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class InboxChat(BaseModel):
    """A single inbox chat (minimal fields for Phase 3)."""

    id: str = Field(..., description="Unique chat identifier")
    name: str = Field(..., description="Chat display name")
    timestamp: Optional[datetime] = Field(
        default=None,
        description="Last activity timestamp",
    )
    unread_count: int = Field(default=0, ge=0, description="Number of unread messages")


class InboxChatListResponse(BaseModel):
    """Response model for inbox chat list."""

    chats: list[InboxChat] = Field(
        default_factory=list,
        description="List of inbox chats",
    )
    cursor: Optional[str] = Field(
        default=None,
        description="Pagination cursor for next page",
    )
    has_more: bool = Field(
        default=False,
        description="Whether more chats are available",
    )
    total_count: Optional[int] = Field(
        default=None,
        description="Total number of chats (if available)",
    )


class InboxChatsErrorResponse(BaseModel):
    """Error response for inbox chats API."""

    error_code: str = Field(..., description="Machine-readable error code")
    message: str = Field(..., description="Human-readable error message")
    details: Optional[dict[str, Any]] = Field(
        default=None,
        description="Additional error details",
    )
