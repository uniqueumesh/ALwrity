import React, { useMemo } from 'react';
import type { InboxChat } from '../../../../services/inboxChatsApi';
import { cardBase, colors } from './styles';

interface InboxSummaryProps {
  chats: InboxChat[];
}

function formatContentTypeLabel(contentType: string): string {
  if (contentType.toLowerCase() === 'inmail') {
    return 'InMail';
  }
  return contentType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export const InboxSummary: React.FC<InboxSummaryProps> = React.memo(({ chats }) => {
  const stats = useMemo(() => {
    let unreadConversations = 0;
    const contentTypeCounts = new Map<string, number>();

    for (const chat of chats) {
      if (chat.unread_count > 0) {
        unreadConversations += 1;
      }
      if (chat.content_type) {
        const label = formatContentTypeLabel(chat.content_type);
        contentTypeCounts.set(label, (contentTypeCounts.get(label) ?? 0) + 1);
      }
    }

    return {
      total: chats.length,
      unreadConversations,
      contentTypeCounts: Array.from(contentTypeCounts.entries()).sort((a, b) => b[1] - a[1]),
    };
  }, [chats]);

  if (stats.total === 0) {
    return null;
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 12,
        padding: '16px 20px',
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
      }}
    >
      <div>
        <div style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 4 }}>
          Conversations
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: colors.textDark }}>{stats.total}</div>
      </div>

      <div>
        <div style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 4 }}>Unread</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: colors.primary }}>
          {stats.unreadConversations}
        </div>
      </div>

      {stats.contentTypeCounts.length > 0 && (
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 8 }}>
            By message type
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {stats.contentTypeCounts.map(([label, count]) => (
              <span
                key={label}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: colors.textBody,
                  background: colors.white,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 999,
                  padding: '4px 10px',
                }}
              >
                {label} · {count}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

InboxSummary.displayName = 'InboxChatsSummary';
