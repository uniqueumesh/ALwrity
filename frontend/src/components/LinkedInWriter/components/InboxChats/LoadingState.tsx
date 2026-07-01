import React from 'react';
import { cardBase, colors } from './styles';

const skeletonPulse = `
  @keyframes inboxChatsSkeletonPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.45; }
  }
`;

function SkeletonBlock({ width, height, radius = 6 }: { width: string | number; height: number; radius?: number }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: radius,
        background: '#e2e8f0',
        animation: 'inboxChatsSkeletonPulse 1.4s ease-in-out infinite',
      }}
    />
  );
}

function SkeletonRow() {
  return (
    <div style={cardBase} aria-hidden="true">
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <SkeletonBlock width={44} height={44} radius={22} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
            <SkeletonBlock width="35%" height={14} />
            <SkeletonBlock width={48} height={12} />
          </div>
          <SkeletonBlock width="80%" height={12} />
          <div style={{ height: 8 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <SkeletonBlock width={64} height={22} radius={999} />
            <SkeletonBlock width={88} height={22} radius={999} />
          </div>
        </div>
      </div>
    </div>
  );
}

export const LoadingState: React.FC = React.memo(() => (
  <div role="status" aria-label="Loading inbox chats">
    <style>{skeletonPulse}</style>
    <p style={{ margin: '0 0 16px', fontSize: 13, color: colors.textSecondary }}>
      Loading your inbox chats…
    </p>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SkeletonRow />
      <SkeletonRow />
      <SkeletonRow />
    </div>
  </div>
));

LoadingState.displayName = 'InboxChatsLoadingState';
