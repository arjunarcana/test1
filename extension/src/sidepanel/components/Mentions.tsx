import React, { type CSSProperties } from 'react';
import type { MentionEvent } from '../../shared/types.ts';

/* ─── Styles ──────────────────────────────────────────────────────────────── */

const colors = {
  bg: '#1a1a2e',
  bgCard: '#16213e',
  accent: '#7c5cfc',
  text: '#e0e0e0',
  textDim: '#8a8a9a',
  border: '#2a2a4a',
  red: '#ff1744',
  blue: '#448aff',
  gray: '#78909c',
  orange: '#ff9100',
};

const sentimentConfig: Record<string, { label: string; color: string; bg: string }> = {
  action_request: { label: 'Action', color: colors.red, bg: 'rgba(255, 23, 68, 0.12)' },
  question: { label: 'Question', color: colors.blue, bg: 'rgba(68, 138, 255, 0.12)' },
  fyi: { label: 'FYI', color: colors.gray, bg: 'rgba(120, 144, 156, 0.15)' },
  positive: { label: 'Positive', color: '#00c853', bg: 'rgba(0, 200, 83, 0.12)' },
  negative: { label: 'Negative', color: colors.orange, bg: 'rgba(255, 145, 0, 0.12)' },
};

function getSentimentStyle(sentiment: string) {
  return sentimentConfig[sentiment] ?? sentimentConfig.fyi;
}

function formatTimestamp(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const s: Record<string, CSSProperties> = {
  container: {
    flex: 1,
    overflow: 'auto',
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  empty: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    color: colors.textDim,
    fontSize: 14,
    textAlign: 'center' as const,
    padding: '0 24px',
  },
  configPrompt: {
    fontSize: 12,
    color: colors.accent,
    cursor: 'pointer',
    marginTop: 4,
  },
  card: {
    background: colors.bgCard,
    borderRadius: 10,
    border: `1px solid ${colors.border}`,
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    fontSize: 14,
    fontWeight: 700,
    color: colors.accent,
  },
  badge: {
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 10,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
  time: {
    fontSize: 11,
    color: colors.textDim,
    fontVariantNumeric: 'tabular-nums',
  },
  context: {
    fontSize: 13,
    lineHeight: 1.5,
    color: colors.text,
  },
};

/* ─── Component ───────────────────────────────────────────────────────────── */

interface Props {
  mentions: MentionEvent[];
}

export default function Mentions({ mentions }: Props) {
  if (mentions.length === 0) {
    return (
      <div style={s.empty}>
        <div style={{ fontSize: 28, opacity: 0.4 }}>@</div>
        <div>No mentions detected yet</div>
        <div style={{ fontSize: 12, color: colors.textDim, lineHeight: 1.5 }}>
          When someone says a name you're tracking, it will appear here with context.
        </div>
        <div
          style={s.configPrompt}
          onClick={() => chrome.runtime.openOptionsPage()}
        >
          Configure names in Settings
        </div>
      </div>
    );
  }

  return (
    <div style={s.container}>
      {mentions.map((mention, i) => {
        const sentStyle = getSentimentStyle(mention.sentiment);
        return (
          <div key={`${mention.name}-${mention.timestamp}-${i}`} style={s.card}>
            <div style={s.cardHeader}>
              <div style={s.nameRow}>
                <span style={s.name}>@{mention.name}</span>
                <span
                  style={{
                    ...s.badge,
                    color: sentStyle.color,
                    background: sentStyle.bg,
                  }}
                >
                  {sentStyle.label}
                </span>
              </div>
              <span style={s.time}>{formatTimestamp(mention.timestamp)}</span>
            </div>
            <div style={s.context}>"{mention.context}"</div>
          </div>
        );
      })}
    </div>
  );
}
