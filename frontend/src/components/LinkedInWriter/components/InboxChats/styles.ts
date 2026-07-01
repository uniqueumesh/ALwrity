import type React from 'react';

export const colors = {
  white: '#ffffff',
  border: '#e2e8f0',
  dashedBorder: '#d1d5db',
  textDark: '#0f172a',
  textBody: '#334155',
  textSecondary: '#64748b',
  textMuted: '#9ca3af',
  primary: '#0a66c2',
  primaryLight: '#e8f4fc',
  surface: '#f8fafc',
  errorBg: '#fef2f2',
  errorBorder: '#fecaca',
  errorText: '#991b1b',
} as const;

export const panelContainer: React.CSSProperties = {
  padding: '24px 32px',
  maxWidth: 960,
  margin: '0 auto',
};

export const cardBase: React.CSSProperties = {
  background: colors.white,
  border: `1px solid ${colors.border}`,
  borderRadius: 12,
  padding: '16px 20px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
};

export const primaryBtn: React.CSSProperties = {
  padding: '10px 18px',
  borderRadius: 8,
  border: 'none',
  background: colors.primary,
  color: '#fff',
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
};

export const secondaryBtn: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: `1px solid ${colors.border}`,
  background: colors.white,
  color: colors.textBody,
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
};

export const chipPrimary: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: colors.primary,
  background: colors.primaryLight,
  border: `1px solid #bfdbfe`,
  borderRadius: 999,
  padding: '2px 8px',
};

export const chipMuted: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: colors.textSecondary,
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: 999,
  padding: '2px 8px',
};

export const chipWarning: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#92400e',
  background: '#fef3c7',
  border: '1px solid #fde68a',
  borderRadius: 999,
  padding: '2px 8px',
};
