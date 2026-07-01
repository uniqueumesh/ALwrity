import { useCallback, useEffect, useRef, useState } from 'react';
import {
  inboxChatsApi,
  type FetchInboxChatsParams,
  type InboxChatListResponse,
} from '../../../services/inboxChatsApi';

export type InboxChatsPanelState = 'idle' | 'loading' | 'loaded' | 'error';

const CACHE_KEY = 'alwrity_inbox_chats';
const CACHE_TTL_MS = 30 * 60 * 1000;

interface CacheEntry {
  data: InboxChatListResponse;
  fetchedAt: number;
}

function getCache(): CacheEntry | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: CacheEntry = JSON.parse(raw);
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function setCache(entry: CacheEntry) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // ignore storage errors
  }
}

function clearCache() {
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}

function normalizeCursor(cursor: string | null | undefined): string | undefined {
  return cursor ?? undefined;
}

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

  useEffect(() => {
    const cached = getCache();
    if (cached) {
      setData(cached.data);
      setPanelState('loaded');
    }
  }, []);

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
      setCache({ data: result, fetchedAt: Date.now() });
      setPanelState('loaded');
    } catch (err: unknown) {
      console.error('[InboxChats] Failed to fetch chats:', err);
      setErrorMessage(extractErrorMessage(err));
      setPanelState('error');
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const loadMoreChats = useCallback(async () => {
    if (inFlightRef.current || !data?.has_more || !data.cursor) {
      return;
    }

    inFlightRef.current = true;
    setPanelState('loading');

    try {
      const result = await inboxChatsApi.fetchChats({ cursor: data.cursor });
      const nextCursor = normalizeCursor(result.cursor);
      const merged: InboxChatListResponse = {
        chats: [...data.chats, ...result.chats],
        cursor: nextCursor,
        has_more: result.has_more,
        total_count: result.total_count,
      };
      setData(merged);
      setCache({ data: merged, fetchedAt: Date.now() });
      setPanelState('loaded');
    } catch (err: unknown) {
      console.error('[InboxChats] Failed to load more chats:', err);
      setErrorMessage(extractErrorMessage(err));
      setPanelState('error');
    } finally {
      inFlightRef.current = false;
    }
  }, [data]);

  const refreshChats = useCallback(async () => {
    clearCache();
    setData(null);
    setPanelState('idle');
    await fetchChats();
  }, [fetchChats]);

  return {
    data,
    panelState,
    errorMessage,
    fetchChats,
    loadMoreChats,
    refreshChats,
  };
}
