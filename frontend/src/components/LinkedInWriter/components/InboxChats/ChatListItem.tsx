import React, { useMemo } from 'react';
import type { InboxChat } from '../../../../services/inboxChatsApi';
import { cardBase, colors } from './styles';

interface ChatListItemProps {
  chat: InboxChat;
}

function formatRelativeTime(timestamp: string | null | undefined): string {
  if (!timestamp) {
    return '';
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMinutes < 1) {
    return 'Just now';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

export const ChatListItem: React.FC<ChatListItemProps> = React.memo(({ chat }) => {
  const relativeTime = useMemo(() => formatRelativeTime(chat.timestamp), [chat.timestamp]);
  const initials = useMemo(() => initialsFromName(chat.name), [chat.name]);
  const hasUnread = chat.unread_count > 0;

  return (
    <article
      style={{
        ...cardBase,
        borderLeft: hasUnread ? `3px solid ${colors.primary}` : cardBase.border,
      }}
      aria-label={`Chat with ${chat.name}`}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: colors.primaryLight,
            color: colors.primary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 15,
            flexShrink: 0,
          }}
          aria-hidden="true"
        >
          {initials}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <span
              style={{
                fontWeight: hasUnread ? 700 : 600,
                fontSize: 15,
                color: colors.textDark,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {chat.name}
            </span>
            {relativeTime && (
              <span
                style={{
                  fontSize: 12,
                  color: colors.textMuted,
                  flexShrink: 0,
                }}
              >
                {relativeTime}
              </span>
            )}
          </div>

          {hasUnread && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 20,
                height: 20,
                padding: '0 6px',
                marginTop: 6,
                borderRadius: 999,
                background: colors.primary,
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
              }}
              aria-label={`${chat.unread_count} unread`}
            >
              {chat.unread_count}
            </span>
          )}
        </div>
      </div>
    </article>
  );
});

ChatListItem.displayName = 'InboxChatListItem';
