import React from 'react';
import { colors, primaryBtn } from './styles';

export const IdleState: React.FC<{ onFetch: () => void }> = React.memo(({ onFetch }) => (
  <div
    style={{
      border: `1px dashed ${colors.dashedBorder}`,
      borderRadius: 12,
      padding: '32px 24px',
      textAlign: 'center',
      background: colors.surface,
    }}
  >
    <span style={{ fontSize: 28, display: 'block', marginBottom: 12 }} aria-hidden="true">
      💬
    </span>
    <div style={{ fontWeight: 700, fontSize: 16, color: colors.textDark, marginBottom: 8 }}>
      Browse your LinkedIn inbox
    </div>
    <p style={{ margin: '0 0 16px', fontSize: 13, color: colors.textSecondary, lineHeight: 1.6 }}>
      Load your personal LinkedIn conversations — unread status, message type, and folder context.
    </p>
    <button type="button" onClick={onFetch} style={primaryBtn}>
      Get Inbox Chats List
    </button>
  </div>
));

IdleState.displayName = 'InboxChatsIdleState';

export const NoChatsState: React.FC<{ onRefresh?: () => void; refreshing?: boolean }> = React.memo(
  ({ onRefresh, refreshing }) => (
    <div
      style={{
        border: `1px dashed ${colors.dashedBorder}`,
        borderRadius: 12,
        padding: '32px 24px',
        textAlign: 'center',
        background: colors.surface,
      }}
    >
      <span style={{ fontSize: 28, display: 'block', marginBottom: 12 }} aria-hidden="true">
        📭
      </span>
      <div style={{ fontWeight: 700, fontSize: 16, color: colors.textDark, marginBottom: 8 }}>
        No conversations found
      </div>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: colors.textSecondary, lineHeight: 1.6 }}>
        We did not receive any inbox chats from your LinkedIn personal profile. Try refreshing or
        check your connection.
      </p>
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          style={{
            ...primaryBtn,
            opacity: refreshing ? 0.7 : 1,
            cursor: refreshing ? 'not-allowed' : 'pointer',
          }}
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      )}
    </div>
  )
);

NoChatsState.displayName = 'InboxChatsNoChatsState';
