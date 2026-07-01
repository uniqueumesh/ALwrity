import React, { useMemo } from 'react';
import type { InboxChat } from '../../../../services/inboxChatsApi';
import { cardBase, chipMuted, chipPrimary, chipWarning, colors } from './styles';

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

function formatContentTypeLabel(contentType: string): string {
  if (contentType.toLowerCase() === 'inmail') {
    return 'InMail';
  }
  return contentType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function ChatChip({
  label,
  variant = 'default',
}: {
  label: string;
  variant?: 'default' | 'primary' | 'muted' | 'warning';
}) {
  const style =
    variant === 'primary'
      ? chipPrimary
      : variant === 'warning'
        ? chipWarning
        : variant === 'muted'
          ? chipMuted
          : {
              fontSize: 11,
              fontWeight: 600,
              color: colors.textBody,
              background: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: 999,
              padding: '2px 8px',
            };

  return <span style={style}>{label}</span>;
}

export const ChatListItem: React.FC<ChatListItemProps> = React.memo(({ chat }) => {
  const relativeTime = useMemo(() => formatRelativeTime(chat.timestamp), [chat.timestamp]);
  const initials = useMemo(() => initialsFromName(chat.name), [chat.name]);
  const hasUnread = chat.unread_count > 0;
  const subjectLine = chat.subject?.trim() || 'No subject';
  const primaryFolder = (chat.folder_labels ?? [])[0];
  const replyDisabled = (chat.disabled_features ?? []).includes('reply');

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

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {relativeTime && (
                <span style={{ fontSize: 12, color: colors.textMuted }}>{relativeTime}</span>
              )}
              {hasUnread && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 20,
                    height: 20,
                    padding: '0 6px',
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

          <p
            style={{
              margin: '6px 0 10px',
              fontSize: 13,
              color: chat.subject ? colors.textBody : colors.textMuted,
              lineHeight: 1.5,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            Subject: {subjectLine}
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {chat.content_type && (
              <ChatChip label={formatContentTypeLabel(chat.content_type)} variant="primary" />
            )}
            {primaryFolder && <ChatChip label={primaryFolder} />}
            {chat.is_pinned && <ChatChip label="Pinned" variant="warning" />}
            {chat.is_archived && <ChatChip label="Archived" variant="muted" />}
            {chat.is_readonly && <ChatChip label="Read-only" variant="muted" />}
            {chat.is_muted && <ChatChip label="Muted" variant="muted" />}
            {replyDisabled && <ChatChip label="Replies disabled" variant="muted" />}
          </div>
        </div>
      </div>
    </article>
  );
});

ChatListItem.displayName = 'InboxChatListItem';
