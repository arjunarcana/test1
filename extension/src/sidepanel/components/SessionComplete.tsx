import React, { useState, useCallback, type CSSProperties } from 'react';
import type { TranscriptSegment, MentionEvent } from '../../shared/types.ts';

/* ─── Styles ──────────────────────────────────────────────────────────────── */

const colors = {
  bg: '#1a1a2e',
  bgLight: '#16213e',
  bgCard: '#0f3460',
  accent: '#7c5cfc',
  accentHover: '#6a4de0',
  text: '#e0e0e0',
  textDim: '#8a8a9a',
  border: '#2a2a4a',
  green: '#00c853',
};

const s: Record<string, CSSProperties> = {
  container: {
    flex: 1,
    overflow: 'auto',
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  header: {
    textAlign: 'center' as const,
    padding: '8px 0',
  },
  checkmark: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    background: 'rgba(0, 200, 83, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 12px',
    fontSize: 24,
    color: colors.green,
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 4,
  },
  duration: {
    fontSize: 13,
    color: colors.textDim,
  },
  section: {
    background: colors.bgLight,
    borderRadius: 12,
    border: `1px solid ${colors.border}`,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: colors.accent,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
  sectionContent: {
    fontSize: 14,
    lineHeight: 1.6,
    color: colors.text,
  },
  bullet: {
    paddingLeft: 12,
    marginBottom: 4,
  },
  exportRow: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap' as const,
  },
  exportBtn: {
    flex: 1,
    minWidth: 120,
    padding: '10px 14px',
    borderRadius: 8,
    border: `1px solid ${colors.border}`,
    background: colors.bgLight,
    color: colors.text,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s',
    textAlign: 'center' as const,
  },
  newMeetingBtn: {
    width: '100%',
    padding: '14px 20px',
    borderRadius: 10,
    border: 'none',
    background: `linear-gradient(135deg, ${colors.accent}, #a78bfa)`,
    color: '#fff',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 4px 16px rgba(124, 92, 252, 0.3)',
  },
  toast: {
    position: 'fixed' as const,
    bottom: 20,
    left: '50%',
    transform: 'translateX(-50%)',
    background: colors.bgCard,
    color: colors.text,
    padding: '10px 20px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    zIndex: 100,
    border: `1px solid ${colors.border}`,
  },
};

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function parseSummaryIntoSections(
  summary: string | null
): { title: string; items: string[] }[] {
  if (!summary) {
    return [
      { title: 'Key Points', items: ['No summary available for this meeting.'] },
    ];
  }

  const sections: { title: string; items: string[] }[] = [];
  let currentTitle = 'Key Points';
  let currentItems: string[] = [];

  const lines = summary.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Detect section headers (## Header or **Header**)
    const headerMatch = trimmed.match(/^(?:#{1,3}\s+|\*\*)(.*?)(?:\*\*)?$/);
    if (headerMatch && headerMatch[1]) {
      if (currentItems.length > 0) {
        sections.push({ title: currentTitle, items: currentItems });
      }
      currentTitle = headerMatch[1].replace(/\*\*/g, '');
      currentItems = [];
      continue;
    }

    // Bullet points
    const bulletMatch = trimmed.match(/^[-*+]\s+(.+)/);
    if (bulletMatch) {
      currentItems.push(bulletMatch[1]);
    } else {
      currentItems.push(trimmed);
    }
  }
  if (currentItems.length > 0) {
    sections.push({ title: currentTitle, items: currentItems });
  }

  // Ensure we always have the 4 canonical sections
  const canonical = ['Key Points', 'Decisions', 'Action Items', 'Risks'];
  const existingTitles = new Set(sections.map((s) => s.title));
  for (const title of canonical) {
    if (!existingTitles.has(title)) {
      sections.push({ title, items: ['None identified.'] });
    }
  }

  return sections;
}

function buildMarkdown(
  segments: TranscriptSegment[],
  globalSummary: string | null,
  mentions: MentionEvent[],
  duration: number
): string {
  let md = `# Meeting Notes\n\n`;
  md += `**Duration:** ${formatDuration(duration)}\n\n`;

  if (globalSummary) {
    md += `## Summary\n\n${globalSummary}\n\n`;
  }

  if (mentions.length > 0) {
    md += `## Mentions\n\n`;
    for (const m of mentions) {
      md += `- **@${m.name}** [${m.sentiment}]: "${m.context}"\n`;
    }
    md += '\n';
  }

  md += `## Transcript\n\n`;
  for (const seg of segments) {
    const time = formatTimestamp(seg.timestamp);
    const speaker = seg.speaker ? `**${seg.speaker}**: ` : '';
    md += `[${time}] ${speaker}${seg.text}\n\n`;
  }

  return md;
}

function formatTimestamp(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/* ─── Component ───────────────────────────────────────────────────────────── */

interface Props {
  segments: TranscriptSegment[];
  globalSummary: string | null;
  mentions: MentionEvent[];
  duration: number;
  onReset: () => void;
}

export default function SessionComplete({
  segments,
  globalSummary,
  mentions,
  duration,
  onReset,
}: Props) {
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const handleCopy = useCallback(async () => {
    const md = buildMarkdown(segments, globalSummary, mentions, duration);
    try {
      await navigator.clipboard.writeText(md);
      showToast('Copied to clipboard');
    } catch {
      showToast('Failed to copy');
    }
  }, [segments, globalSummary, mentions, duration, showToast]);

  const handleDownload = useCallback(() => {
    const md = buildMarkdown(segments, globalSummary, mentions, duration);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meeting-notes-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Downloaded');
  }, [segments, globalSummary, mentions, duration, showToast]);

  const handleNotion = useCallback(() => {
    showToast('Notion integration coming soon');
  }, [showToast]);

  const summarySections = parseSummaryIntoSections(globalSummary);

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.checkmark}>&#10003;</div>
        <div style={s.title}>Meeting Complete</div>
        <div style={s.duration}>Duration: {formatDuration(duration)}</div>
      </div>

      {/* Summary sections */}
      {summarySections.map((section, i) => (
        <div key={i} style={s.section}>
          <div style={s.sectionTitle}>{section.title}</div>
          <div style={s.sectionContent}>
            {section.items.map((item, j) => (
              <div key={j} style={s.bullet}>
                &bull; {item}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Export buttons */}
      <div style={s.exportRow}>
        <button
          style={s.exportBtn}
          onClick={handleCopy}
          onMouseOver={(e) => { e.currentTarget.style.borderColor = colors.accent; }}
          onMouseOut={(e) => { e.currentTarget.style.borderColor = colors.border; }}
        >
          Copy to Clipboard
        </button>
        <button
          style={s.exportBtn}
          onClick={handleDownload}
          onMouseOver={(e) => { e.currentTarget.style.borderColor = colors.accent; }}
          onMouseOut={(e) => { e.currentTarget.style.borderColor = colors.border; }}
        >
          Download Markdown
        </button>
        <button
          style={s.exportBtn}
          onClick={handleNotion}
          onMouseOver={(e) => { e.currentTarget.style.borderColor = colors.accent; }}
          onMouseOut={(e) => { e.currentTarget.style.borderColor = colors.border; }}
        >
          Send to Notion
        </button>
      </div>

      {/* New meeting */}
      <button style={s.newMeetingBtn} onClick={onReset}>
        New Meeting
      </button>

      {/* Toast */}
      {toast && <div style={s.toast}>{toast}</div>}
    </div>
  );
}
