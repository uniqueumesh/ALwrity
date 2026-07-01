"""
Pydantic models for LinkedIn Inbox Chats API.

Request/response models for fetching user's LinkedIn inbox conversations.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class InboxChat(BaseModel):
    """A single inbox chat with normalized Unipile v1 list fields."""

    id: str = Field(..., description="Unique chat identifier")
    name: str = Field(..., description="Chat display name")
    subject: Optional[str] = Field(default=None, description="Chat subject line")
    timestamp: Optional[datetime] = Field(
        default=None,
        description="Last activity timestamp",
    )
    unread_count: int = Field(default=0, ge=0, description="Number of unread messages")
    content_type: Optional[str] = Field(
        default=None,
        description="Message content type (e.g. inmail)",
    )
    folders: list[str] = Field(
        default_factory=list,
        description="Raw folder identifiers from Unipile",
    )
    folder_labels: list[str] = Field(
        default_factory=list,
        description="Human-readable folder labels",
    )
    is_pinned: bool = Field(default=False, description="Whether the chat is pinned")
    is_archived: bool = Field(default=False, description="Whether the chat is archived")
    is_readonly: bool = Field(default=False, description="Whether the chat is read-only")
    is_muted: bool = Field(default=False, description="Whether the chat is muted")
    disabled_features: list[str] = Field(
        default_factory=list,
        description="Disabled chat features (e.g. reply, reactions)",
    )
    chat_type: Optional[int] = Field(
        default=None,
        description="Raw Unipile chat type integer",
    )
    provider_id: Optional[str] = Field(default=None, description="Provider chat id")
    attendee_provider_id: Optional[str] = Field(
        default=None,
        description="Attendee provider id for 1:1 chats",
    )
    organization_id: Optional[str] = Field(
        default=None,
        description="Organization id when chat is org-scoped",
    )
    mailbox_id: Optional[str] = Field(default=None, description="Mailbox id if set")


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
