import React, { useCallback } from 'react';
import { useInboxChats } from '../../hooks/useInboxChats';
import { ChatListItem } from './ChatListItem';
import { IdleState, NoChatsState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { LoadingState } from './LoadingState';
import { colors, panelContainer, primaryBtn } from './styles';

interface InboxChatsPanelProps {
  isActive: boolean;
}

export const InboxChatsPanel: React.FC<InboxChatsPanelProps> = ({ isActive }) => {
  const { data, panelState, errorMessage, fetchChats } = useInboxChats();
  const isLoading = panelState === 'loading';
  const showSkeleton = isLoading && !data;

  const handleFetch = useCallback(() => {
    void fetchChats();
  }, [fetchChats]);

  if (!isActive) {
    return null;
  }

  return (
    <div style={panelContainer}>
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: colors.textDark }}>
            Inbox Chats
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: colors.textSecondary, lineHeight: 1.5 }}>
            Browse your personal LinkedIn inbox conversations — unread status, message type, and
            folder context.
          </p>
        </div>
        <button
          type="button"
          onClick={handleFetch}
          disabled={isLoading}
          style={{
            ...primaryBtn,
            flexShrink: 0,
            background: isLoading ? '#93c5fd' : colors.primary,
            cursor: isLoading ? 'not-allowed' : 'pointer',
          }}
          aria-label="Get inbox chats list"
        >
          {isLoading ? 'Loading…' : 'Get Inbox Chats List'}
        </button>
      </header>

      {panelState === 'idle' && !isLoading && <IdleState onFetch={handleFetch} />}

      {showSkeleton && <LoadingState />}

      {panelState === 'error' && !isLoading && (
        <ErrorState message={errorMessage} onRetry={handleFetch} retrying={isLoading} />
      )}

      {data && panelState === 'loaded' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {data.chats.length === 0 ? (
            <NoChatsState onRefresh={handleFetch} refreshing={isLoading} />
          ) : (
            <>
              <p style={{ margin: 0, fontSize: 13, color: colors.textSecondary }}>
                Showing {data.chats.length} conversation{data.chats.length === 1 ? '' : 's'}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {data.chats.map((chat) => (
                  <ChatListItem key={chat.id} chat={chat} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
