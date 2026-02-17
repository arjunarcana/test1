import React, { useEffect, useRef, type CSSProperties } from 'react';
import type { TranscriptSegment } from '../../shared/types.ts';

/* ─── Styles ──────────────────────────────────────────────────────────────── */

const colors = {
  bg: '#1a1a2e',
  bgLight: '#16213e',
  accent: '#7c5cfc',
  text: '#e0e0e0',
  textDim: '#8a8a9a',
  border: '#2a2a4a',
};

const speakerColors = [
  '#7c5cfc', '#00c853', '#ff6d00', '#00b8d4',
  '#ff1744', '#ffc107', '#e040fb', '#76ff03',
];

function getSpeakerColor(speaker: string | undefined): string {
  if (!speaker) return colors.textDim;
  let hash = 0;
  for (let i = 0; i < speaker.length; i++) {
    hash = ((hash << 5) - hash + speaker.charCodeAt(i)) | 0;
  }
  return speakerColors[Math.abs(hash) % speakerColors.length];
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
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: colors.textDim,
    fontSize: 14,
    fontStyle: 'italic',
  },
  segment: {
    display: 'flex',
    gap: 10,
    padding: '6px 0',
    lineHeight: 1.5,
  },
  timestamp: {
    fontSize: 11,
    fontWeight: 500,
    color: colors.textDim,
    fontVariantNumeric: 'tabular-nums',
    flexShrink: 0,
    paddingTop: 2,
    width: 40,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  speaker: {
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 1,
  },
  text: {
    fontSize: 14,
    color: colors.text,
    wordBreak: 'break-word' as const,
  },
  partial: {
    fontSize: 14,
    color: colors.textDim,
    fontStyle: 'italic',
    wordBreak: 'break-word' as const,
  },
};

/* ─── Component ───────────────────────────────────────────────────────────── */

interface Props {
  segments: TranscriptSegment[];
  startedAt?: number | null;
}

export default function Transcript({ segments, startedAt }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new segments
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [segments.length, segments[segments.length - 1]?.text]);

  if (segments.length === 0) {
    return <div style={s.empty}>Waiting for speech...</div>;
  }

  return (
    <div style={s.container}>
      {segments.map((seg) => (
        <div key={seg.id} style={s.segment}>
          <span style={s.timestamp}>{formatTimestamp(startedAt ? seg.timestamp - startedAt : seg.timestamp)}</span>
          <div style={s.body}>
            {seg.speaker && (
              <div style={{ ...s.speaker, color: getSpeakerColor(seg.speaker) }}>
                {seg.speaker}
              </div>
            )}
            <div style={seg.isFinal ? s.text : s.partial}>{seg.text}</div>
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
