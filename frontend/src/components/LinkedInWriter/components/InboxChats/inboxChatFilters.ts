import type { InboxChat } from '../../../../services/inboxChatsApi';

export type InboxFolderFilter =
  | 'all'
  | 'INBOX'
  | 'INBOX_LINKEDIN_CLASSIC'
  | 'INBOX_LINKEDIN_RECRUITER'
  | 'INBOX_LINKEDIN_SALES_NAVIGATOR';

export interface InboxChatFilterState {
  unreadOnly: boolean;
  showArchived: boolean;
  folder: InboxFolderFilter;
}

export const DEFAULT_INBOX_FILTERS: InboxChatFilterState = {
  unreadOnly: false,
  showArchived: false,
  folder: 'all',
};

export const FOLDER_FILTER_OPTIONS: { value: InboxFolderFilter; label: string }[] = [
  { value: 'all', label: 'All folders' },
  { value: 'INBOX_LINKEDIN_CLASSIC', label: 'Classic Inbox' },
  { value: 'INBOX', label: 'Inbox' },
  { value: 'INBOX_LINKEDIN_RECRUITER', label: 'Recruiter' },
  { value: 'INBOX_LINKEDIN_SALES_NAVIGATOR', label: 'Sales Navigator' },
];

export function applyInboxChatFilters(
  chats: InboxChat[],
  filters: InboxChatFilterState
): InboxChat[] {
  return chats.filter((chat) => {
    if (filters.unreadOnly && chat.unread_count <= 0) {
      return false;
    }
    if (!filters.showArchived && chat.is_archived) {
      return false;
    }
    if (filters.folder !== 'all') {
      const folders = chat.folders ?? [];
      if (!folders.includes(filters.folder)) {
        return false;
      }
    }
    return true;
  });
}
