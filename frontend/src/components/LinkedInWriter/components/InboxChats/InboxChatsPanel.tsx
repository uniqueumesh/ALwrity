import React, { useCallback, useMemo, useState } from 'react';
import { useLinkedInSocialConnection } from '../../../../hooks/useLinkedInSocialConnection';
import { useInboxChats } from '../../hooks/useInboxChats';
import { ChatListItem } from './ChatListItem';
import { IdleState, NoChatsState, NotConnectedState, RefreshBar } from './EmptyState';
import { ErrorState } from './ErrorState';
import { InboxFilters } from './InboxFilters';
import { InboxSummary } from './InboxSummary';
import {
  applyInboxChatFilters,
  DEFAULT_INBOX_FILTERS,
  type InboxChatFilterState,
} from './inboxChatFilters';
import { LoadingState } from './LoadingState';
import { colors, panelContainer, primaryBtn, secondaryBtn } from './styles';

interface InboxChatsPanelProps {
  isActive: boolean;
}

export const InboxChatsPanel: React.FC<InboxChatsPanelProps> = ({ isActive }) => {
  const {
    connected,
    isLoading: isConnectionLoading,
    isConnecting,
    connectWithOAuth,
  } = useLinkedInSocialConnection();
  const { data, panelState, errorMessage, fetchChats, loadMoreChats, refreshChats } =
    useInboxChats();
  const [filters, setFilters] = useState<InboxChatFilterState>(DEFAULT_INBOX_FILTERS);

  const isLoading = panelState === 'loading';
  const showSkeleton = isLoading && !data;

  const filteredChats = useMemo(() => {
    if (!data?.chats) {
      return [];
    }
    return applyInboxChatFilters(data.chats, filters);
  }, [data?.chats, filters]);

  const handleFetch = useCallback(() => {
    if (!connected) {
      return;
    }
    void fetchChats();
  }, [connected, fetchChats]);

  const handleRefresh = useCallback(() => {
    if (!connected) {
      return;
    }
    void refreshChats();
  }, [connected, refreshChats]);

  const handleLoadMore = useCallback(() => {
    void loadMoreChats();
  }, [loadMoreChats]);

  if (!isActive) {
    return null;
  }

  const showLoadedContent = data && panelState !== 'idle';

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
          onClick={showLoadedContent ? handleRefresh : handleFetch}
          disabled={isLoading || !connected || isConnectionLoading}
          style={{
            ...primaryBtn,
            flexShrink: 0,
            background: isLoading ? '#93c5fd' : colors.primary,
            cursor: isLoading || !connected ? 'not-allowed' : 'pointer',
          }}
          aria-label="Get inbox chats list"
        >
          {isLoading ? 'Loading…' : 'Get Inbox Chats List'}
        </button>
      </header>

      {!isConnectionLoading && !connected && (
        <NotConnectedState onConnect={() => void connectWithOAuth()} connecting={isConnecting} />
      )}

      {connected && panelState === 'idle' && !isLoading && (
        <IdleState onFetch={handleFetch} />
      )}

      {connected && showSkeleton && <LoadingState />}

      {connected && panelState === 'error' && !isLoading && (
        <ErrorState message={errorMessage} onRetry={handleRefresh} retrying={isLoading} />
      )}

      {connected && showLoadedContent && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {data.chats.length === 0 ? (
            <NoChatsState onRefresh={handleRefresh} refreshing={isLoading} />
          ) : (
            <>
              <RefreshBar
                chatCount={data.chats.length}
                filteredCount={filteredChats.length}
                hasMore={data.has_more}
                onRefresh={handleRefresh}
                refreshing={isLoading}
              />

              <InboxFilters filters={filters} onChange={setFilters} disabled={isLoading} />

              {isLoading && (
                <p style={{ margin: 0, fontSize: 13, color: colors.textSecondary }}>
                  Refreshing inbox chats…
                </p>
              )}

              {filteredChats.length > 0 && <InboxSummary chats={filteredChats} />}

              {filteredChats.length === 0 ? (
                <NoChatsState onRefresh={handleRefresh} refreshing={isLoading} />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {filteredChats.map((chat) => (
                    <ChatListItem key={chat.id} chat={chat} />
                  ))}
                </div>
              )}

              {data.has_more && (
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={isLoading}
                  style={{
                    ...secondaryBtn,
                    alignSelf: 'center',
                    marginTop: 4,
                    opacity: isLoading ? 0.7 : 1,
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isLoading ? 'Loading…' : 'Load More Chats'}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
