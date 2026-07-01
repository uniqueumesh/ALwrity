import { useCallback, useRef, useState } from 'react';
import {
  inboxChatsApi,
  type FetchInboxChatsParams,
  type InboxChatListResponse,
} from '../../../services/inboxChatsApi';

export type InboxChatsPanelState = 'idle' | 'loading' | 'loaded' | 'error';

function extractErrorMessage(err: unknown): string {
  const response = (err as { response?: { data?: { detail?: unknown }; status?: number } })
    ?.response;
  const detail = response?.data?.detail;
  const status = response?.status;

  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }

  if (detail && typeof detail === 'object' && 'message' in detail) {
    const message = (detail as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  if (status === 501) {
    return 'Inbox chats are not available yet. This feature will be enabled in a future update.';
  }

  if (err instanceof Error && err.message) {
    return err.message;
  }

  return 'Failed to load LinkedIn inbox chats';
}

export function useInboxChats() {
  const [data, setData] = useState<InboxChatListResponse | null>(null);
  const [panelState, setPanelState] = useState<InboxChatsPanelState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const inFlightRef = useRef(false);

  const fetchChats = useCallback(async (params?: FetchInboxChatsParams) => {
    if (inFlightRef.current) {
      return;
    }

    inFlightRef.current = true;
    setPanelState('loading');
    setErrorMessage('');

    try {
      const result = await inboxChatsApi.fetchChats(params);
      setData(result);
      setPanelState('loaded');
    } catch (err: unknown) {
      console.error('[InboxChats] Failed to fetch chats:', err);
      setErrorMessage(extractErrorMessage(err));
      setPanelState('error');
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  return {
    data,
    panelState,
    errorMessage,
    fetchChats,
  };
}
