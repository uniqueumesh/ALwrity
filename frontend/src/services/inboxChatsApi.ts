import { aiApiClient } from '../api/client';

const BASE = '/api/linkedin/inbox/chats';

export interface InboxChat {
  id: string;
  name: string;
  subject?: string | null;
  timestamp?: string | null;
  unread_count: number;
  content_type?: string | null;
  folders: string[];
  folder_labels: string[];
  is_pinned: boolean;
  is_archived: boolean;
  is_readonly: boolean;
  is_muted: boolean;
  disabled_features: string[];
  chat_type?: number | null;
  provider_id?: string | null;
  attendee_provider_id?: string | null;
  organization_id?: string | null;
  mailbox_id?: string | null;
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
