import React, { type CSSProperties } from 'react';

/* ─── Styles ──────────────────────────────────────────────────────────────── */

const colors = {
  bgCard: '#16213e',
  accent: '#7c5cfc',
  text: '#e0e0e0',
  textDim: '#8a8a9a',
  border: '#2a2a4a',
};

const s: Record<string, CSSProperties> = {
  card: {
    background: colors.bgCard,
    borderRadius: 12,
    border: `1px solid ${colors.border}`,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: 700,
    color: colors.accent,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
  liveBadge: {
    fontSize: 10,
    fontWeight: 600,
    color: '#00c853',
    background: 'rgba(0, 200, 83, 0.12)',
    padding: '2px 6px',
    borderRadius: 4,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  content: {
    fontSize: 14,
    lineHeight: 1.6,
    color: colors.text,
  },
  bullet: {
    paddingLeft: 12,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 13,
    color: colors.textDim,
    fontStyle: 'italic',
    textAlign: 'center' as const,
    padding: '12px 0',
  },
};

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function renderContent(text: string): React.ReactNode[] {
  const lines = text.split('\n').filter((l) => l.trim());
  return lines.map((line, i) => {
    const trimmed = line.trim();
    const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('+ ');
    const isHeader = trimmed.startsWith('## ') || trimmed.startsWith('### ');

    if (isHeader) {
      const headerText = trimmed.replace(/^#+\s*/, '');
      return (
        <div
          key={i}
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: colors.accent,
            marginTop: i > 0 ? 8 : 0,
            marginBottom: 4,
          }}
        >
          {headerText}
        </div>
      );
    }

    if (isBullet) {
      return (
        <div key={i} style={s.bullet}>
          &bull; {trimmed.slice(2)}
        </div>
      );
    }

    return (
      <div key={i} style={{ marginBottom: 4 }}>
        {trimmed}
      </div>
    );
  });
}

/* ─── Component ───────────────────────────────────────────────────────────── */

interface Props {
  content: string | null;
}

export default function SummarySoFar({ content }: Props) {
  return (
    <div style={s.card}>
      <div style={s.header}>
        <span style={s.title}>Summary So Far</span>
        {content && <span style={s.liveBadge}>Live</span>}
      </div>

      {content ? (
        <div style={s.content}>{renderContent(content)}</div>
      ) : (
        <div style={s.emptyText}>
          A progressive summary will build up as the meeting continues.
        </div>
      )}
    </div>
  );
}
