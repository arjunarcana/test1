import React, { useState, useEffect, type CSSProperties } from 'react';
import type { RollingSummary } from '../../shared/types.ts';

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
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 13,
    fontWeight: 700,
    color: colors.accent,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
  timeRange: {
    fontSize: 11,
    color: colors.textDim,
  },
  content: {
    fontSize: 14,
    lineHeight: 1.6,
    color: colors.text,
  },
  bullet: {
    paddingLeft: 12,
    marginBottom: 4,
    position: 'relative' as const,
  },
  footer: {
    fontSize: 11,
    color: colors.textDim,
    fontStyle: 'italic',
  },
  skeleton: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  skeletonLine: {
    height: 14,
    borderRadius: 4,
    background: 'rgba(124, 92, 252, 0.08)',
    animation: 'shimmer 1.5s infinite',
  },
  emptyText: {
    fontSize: 13,
    color: colors.textDim,
    fontStyle: 'italic',
    textAlign: 'center' as const,
    padding: '8px 0',
  },
};

const shimmerKeyframes = `
@keyframes shimmer {
  0% { opacity: 0.3; }
  50% { opacity: 0.6; }
  100% { opacity: 0.3; }
}
`;

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function renderContent(text: string): React.ReactNode[] {
  const lines = text.split('\n').filter((l) => l.trim());
  return lines.map((line, i) => {
    const trimmed = line.trim();
    const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('+ ');
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
  summary: RollingSummary | null;
}

export default function RollingSummaryCard({ summary }: Props) {
  const [agoText, setAgoText] = useState('');

  useEffect(() => {
    if (!summary) return;
    const update = () => {
      const sec = Math.floor((Date.now() - summary.updatedAt) / 1000);
      setAgoText(sec < 5 ? 'just now' : `${sec}s ago`);
    };
    update();
    const id = setInterval(update, 5000);
    return () => clearInterval(id);
  }, [summary?.updatedAt]);

  return (
    <div style={s.card}>
      <style>{shimmerKeyframes}</style>
      <div style={s.header}>
        <span style={s.title}>Last 5 Minutes</span>
        {summary && (
          <span style={s.timeRange}>
            {formatTime(summary.windowStart)} - {formatTime(summary.windowEnd)}
          </span>
        )}
      </div>

      {summary ? (
        <>
          <div style={s.content}>{renderContent(summary.content)}</div>
          <div style={s.footer}>Updated {agoText}</div>
        </>
      ) : (
        <div style={s.skeleton}>
          <div style={{ ...s.skeletonLine, width: '90%' }} />
          <div style={{ ...s.skeletonLine, width: '75%' }} />
          <div style={{ ...s.skeletonLine, width: '82%' }} />
          <div style={s.emptyText}>Summary will appear after a few minutes of conversation.</div>
        </div>
      )}
    </div>
  );
}
