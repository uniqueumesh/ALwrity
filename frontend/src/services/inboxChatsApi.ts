import { aiApiClient } from '../api/client';

const BASE = '/api/linkedin/inbox/chats';

/** Phase 3 minimal chat shape; extended fields added in later phases. */
export interface InboxChat {
  id: string;
  name: string;
  timestamp?: string | null;
  unread_count: number;
}

export interface InboxChatListResponse {
  chats: InboxChat[];
  cursor?: string | null;
  has_more: boolean;
  total_count?: number | null;
}

export interface FetchInboxChatsParams {
  cursor?: string;
  limit?: number;
}

export const inboxChatsApi = {
  async fetchChats(params?: FetchInboxChatsParams): Promise<InboxChatListResponse> {
    const { data } = await aiApiClient.get<InboxChatListResponse>(BASE, { params });
    return data;
  },
};
