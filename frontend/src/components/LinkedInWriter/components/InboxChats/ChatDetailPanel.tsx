import React from 'react';
import type { InboxChat } from '../../../../services/inboxChatsApi';
import { colors } from './styles';

interface ChatDetailPanelProps {
  chat: InboxChat;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: colors.textSecondary, textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{ fontSize: 13, color: colors.textBody, wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}

function truncateId(id: string, max = 24): string {
  if (id.length <= max) {
    return id;
  }
  return `${id.slice(0, max)}…`;
}

export const ChatDetailPanel: React.FC<ChatDetailPanelProps> = React.memo(({ chat }) => {
  const folders = chat.folders ?? [];
  const folderLabels = chat.folder_labels ?? [];
  const disabledFeatures = chat.disabled_features ?? [];

  return (
    <div
      style={{
        marginTop: 14,
        paddingTop: 14,
        borderTop: `1px solid ${colors.border}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <DetailRow label="Chat ID" value={<span title={chat.id}>{truncateId(chat.id)}</span>} />
      <DetailRow label="Provider ID" value={chat.provider_id} />
      <DetailRow label="Attendee provider ID" value={chat.attendee_provider_id} />
      <DetailRow
        label="Chat type"
        value={chat.chat_type !== null && chat.chat_type !== undefined ? String(chat.chat_type) : null}
      />
      <DetailRow label="Mailbox ID" value={chat.mailbox_id} />

      {folders.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: colors.textSecondary,
              textTransform: 'uppercase',
            }}
          >
            Folders
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {folders.map((folder, index) => (
              <span
                key={`${folder}-${index}`}
                style={{
                  fontSize: 12,
                  fontFamily: 'ui-monospace, monospace',
                  color: colors.textBody,
                  background: colors.surface,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 6,
                  padding: '4px 8px',
                }}
                title={folderLabels[index] ?? folder}
              >
                {folder}
              </span>
            ))}
          </div>
        </div>
      )}

      {disabledFeatures.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: colors.textSecondary,
              textTransform: 'uppercase',
            }}
          >
            Disabled features
          </span>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: colors.textBody }}>
            {disabledFeatures.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
});

ChatDetailPanel.displayName = 'InboxChatDetailPanel';
