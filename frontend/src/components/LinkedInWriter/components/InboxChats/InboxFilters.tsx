import React from 'react';
import {
  FOLDER_FILTER_OPTIONS,
  type InboxChatFilterState,
  type InboxFolderFilter,
} from './inboxChatFilters';
import { colors, secondaryBtn } from './styles';

interface InboxFiltersProps {
  filters: InboxChatFilterState;
  onChange: (filters: InboxChatFilterState) => void;
  disabled?: boolean;
}

export const InboxFilters: React.FC<InboxFiltersProps> = React.memo(
  ({ filters, onChange, disabled }) => (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        background: colors.white,
        border: `1px solid ${colors.border}`,
        borderRadius: 10,
      }}
    >
      <label
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          color: colors.textBody,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={filters.unreadOnly}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...filters, unreadOnly: event.target.checked })
          }
        />
        Unread only
      </label>

      <label
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          color: colors.textBody,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={filters.showArchived}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...filters, showArchived: event.target.checked })
          }
        />
        Show archived
      </label>

      <label
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          color: colors.textBody,
        }}
      >
        <span>Folder</span>
        <select
          value={filters.folder}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...filters,
              folder: event.target.value as InboxFolderFilter,
            })
          }
          style={{
            ...secondaryBtn,
            padding: '6px 10px',
            fontSize: 13,
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          {FOLDER_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
);

InboxFilters.displayName = 'InboxChatsFilters';
