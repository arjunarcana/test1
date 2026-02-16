import React, { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react';
import type { SessionState, TranscriptSegment, RollingSummary, MentionEvent } from '../shared/types.ts';
import { DEFAULT_SESSION_STATE } from '../shared/types.ts';
import { MSG } from '../shared/protocol.ts';
import { getSettings } from '../shared/storage.ts';
import Transcript from './components/Transcript.tsx';
import RollingSummaryCard from './components/RollingSummary.tsx';
import SummarySoFar from './components/SummarySoFar.tsx';
import Mentions from './components/Mentions.tsx';
import SessionComplete from './components/SessionComplete.tsx';

/* ─── SpeechRecognition types (Chrome uses webkit prefix) ──────────────── */

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
  stop(): void;
}

interface SpeechResultItem {
  isFinal: boolean;
  0: { transcript: string };
}

interface SpeechResultEvent {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechResultItem };
}

const SpeechRecognitionCtor = (
  window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }
).webkitSpeechRecognition;

/* ─── Styles ──────────────────────────────────────────────────────────────── */

const colors = {
  bg: '#1a1a2e',
  bgLight: '#16213e',
  accent: '#7c5cfc',
  text: '#e0e0e0',
  textDim: '#8a8a9a',
  border: '#2a2a4a',
  green: '#00c853',
  red: '#ff1744',
};

const s: Record<string, CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: colors.bg,
    color: colors.text,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    borderBottom: `1px solid ${colors.border}`,
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: '50%',
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: 600,
  },
  timer: {
    fontSize: 13,
    fontWeight: 500,
    color: colors.textDim,
    fontVariantNumeric: 'tabular-nums',
  },
  tabs: {
    display: 'flex',
    borderBottom: `1px solid ${colors.border}`,
    flexShrink: 0,
  },
  tab: {
    flex: 1,
    padding: '10px 0',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: colors.textDim,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  activeTab: {
    color: colors.accent,
    borderBottomColor: colors.accent,
  },
  content: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
};

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

type TabId = 'transcript' | 'summary' | 'mentions';

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/* ─── App ─────────────────────────────────────────────────────────────────── */

export default function App() {
  const [session, setSession] = useState<SessionState>(DEFAULT_SESSION_STATE);
  const [activeTab, setActiveTab] = useState<TabId>('transcript');
  const [elapsed, setElapsed] = useState(0);

  // Fetch initial state
  useEffect(() => {
    chrome.runtime.sendMessage({ type: MSG.GET_SESSION_STATE }, (response) => {
      if (response) {
        setSession((prev) => ({ ...prev, ...response }));
      }
    });
  }, []);

  // Listen for live updates from background
  useEffect(() => {
    const listener = (message: { type: string; payload?: Partial<SessionState> }) => {
      if (message.type === MSG.SESSION_STATE_UPDATE && message.payload) {
        setSession((prev) => {
          const next = { ...prev };

          // Merge scalar fields
          if (message.payload!.status !== undefined) next.status = message.payload!.status;
          if (message.payload!.sessionId !== undefined) next.sessionId = message.payload!.sessionId;
          if (message.payload!.source !== undefined) next.source = message.payload!.source;
          if (message.payload!.startedAt !== undefined) next.startedAt = message.payload!.startedAt;
          if (message.payload!.error !== undefined) next.error = message.payload!.error;
          if (message.payload!.rollingSummary !== undefined) next.rollingSummary = message.payload!.rollingSummary;
          if (message.payload!.globalSummary !== undefined) next.globalSummary = message.payload!.globalSummary;

          // Append or update segments
          if (message.payload!.segments) {
            const newSegs = message.payload!.segments;
            const segMap = new Map(next.segments.map((seg) => [seg.id, seg]));
            for (const seg of newSegs) {
              segMap.set(seg.id, seg);
            }
            next.segments = Array.from(segMap.values()).sort((a, b) => a.timestamp - b.timestamp);
          }

          // Append mentions
          if (message.payload!.mentions && message.payload!.mentions.length > 0) {
            const existingTimestamps = new Set(next.mentions.map((m) => `${m.name}-${m.timestamp}`));
            const newMentions = message.payload!.mentions.filter(
              (m) => !existingTimestamps.has(`${m.name}-${m.timestamp}`)
            );
            next.mentions = [...next.mentions, ...newMentions];
          }

          return next;
        });
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // ─── Speech Recognition: runs in side panel page context ─────────────────
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldRestartRef = useRef(false);
  const segCounterRef = useRef(0);

  useEffect(() => {
    const isRecording = session.status === 'recording';

    if (isRecording && SpeechRecognitionCtor && !recognitionRef.current) {
      shouldRestartRef.current = true;
      segCounterRef.current = 0;

      const langMap: Record<string, string> = {
        en: 'en-US', es: 'es-ES', fr: 'fr-FR',
        de: 'de-DE', pt: 'pt-BR', ja: 'ja-JP', zh: 'zh-CN',
      };

      const startRecognition = async () => {
        const settings = await getSettings();
        const lang = langMap[settings.language] ?? 'en-US';

        const createRecognition = () => {
          if (!shouldRestartRef.current || !SpeechRecognitionCtor) return;

          const rec = new SpeechRecognitionCtor();
          rec.continuous = true;
          rec.interimResults = true;
          rec.lang = lang;
          rec.maxAlternatives = 1;
          recognitionRef.current = rec;

          rec.onresult = (event: unknown) => {
            const e = event as SpeechResultEvent;
            for (let i = e.resultIndex; i < e.results.length; i++) {
              const result = e.results[i];
              const text = result[0].transcript.trim();
              if (!text) continue;

              if (result.isFinal) {
                segCounterRef.current++;
                chrome.runtime.sendMessage({
                  type: MSG.TRANSCRIPT_FINAL,
                  payload: {
                    id: `seg_${segCounterRef.current}`,
                    text,
                    timestamp: Date.now(),
                  },
                }).catch(() => {});
              } else {
                chrome.runtime.sendMessage({
                  type: MSG.TRANSCRIPT_PARTIAL,
                  payload: {
                    id: `seg_${segCounterRef.current + 1}`,
                    text,
                    timestamp: Date.now(),
                  },
                }).catch(() => {});
              }
            }
          };

          rec.onerror = (event: unknown) => {
            const e = event as { error: string };
            if (e.error === 'no-speech' || e.error === 'aborted') return;
            console.error('[sidepanel] Speech error:', e.error);
          };

          rec.onend = () => {
            recognitionRef.current = null;
            if (shouldRestartRef.current) {
              setTimeout(() => createRecognition(), 100);
            }
          };

          try {
            rec.start();
          } catch (err) {
            console.error('[sidepanel] Failed to start recognition:', err);
          }
        };

        createRecognition();
      };

      startRecognition();
    }

    if (!isRecording && recognitionRef.current) {
      shouldRestartRef.current = false;
      try {
        recognitionRef.current.abort();
      } catch { /* already stopped */ }
      recognitionRef.current = null;
    }

    return () => {
      if (!isRecording) {
        shouldRestartRef.current = false;
        if (recognitionRef.current) {
          try { recognitionRef.current.abort(); } catch { /* ok */ }
          recognitionRef.current = null;
        }
      }
    };
  }, [session.status]);

  // Elapsed timer
  useEffect(() => {
    if (!session.startedAt || session.status === 'idle' || session.status === 'stopped') {
      return;
    }
    const tick = () => setElapsed(Date.now() - session.startedAt!);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session.startedAt, session.status]);

  // Compute elapsed for stopped sessions
  const displayElapsed =
    session.status === 'stopped' && session.startedAt
      ? elapsed || Date.now() - session.startedAt
      : elapsed;

  const isActive = session.status === 'recording' || session.status === 'transcribing' || session.status === 'connecting';
  const isStopped = session.status === 'stopped';

  const statusColor = isActive ? colors.green : session.status === 'error' ? colors.red : colors.textDim;

  const handleReset = useCallback(() => {
    setSession(DEFAULT_SESSION_STATE);
    setElapsed(0);
    chrome.runtime.sendMessage({ type: MSG.STOP_RECORDING });
  }, []);

  // Show session complete view
  if (isStopped && session.segments.length > 0) {
    return (
      <div style={s.container}>
        <SessionComplete
          segments={session.segments}
          globalSummary={session.globalSummary}
          mentions={session.mentions}
          duration={displayElapsed}
          onReset={handleReset}
        />
      </div>
    );
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'transcript', label: 'Transcript' },
    { id: 'summary', label: 'Summary' },
    { id: 'mentions', label: `Mentions${session.mentions.length > 0 ? ` (${session.mentions.length})` : ''}` },
  ];

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <div
            style={{
              ...s.statusIndicator,
              background: statusColor,
              boxShadow: isActive ? `0 0 8px ${statusColor}` : 'none',
            }}
          />
          <span style={s.headerTitle}>
            {isActive ? 'Recording' : session.status === 'error' ? 'Error' : 'Idle'}
          </span>
        </div>
        {session.startedAt && <span style={s.timer}>{formatElapsed(displayElapsed)}</span>}
      </div>

      {/* Tabs */}
      <div style={s.tabs}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            style={{
              ...s.tab,
              ...(activeTab === tab.id ? s.activeTab : {}),
            }}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={s.content}>
        {activeTab === 'transcript' && <Transcript segments={session.segments} />}
        {activeTab === 'summary' && (
          <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <RollingSummaryCard summary={session.rollingSummary} />
            <SummarySoFar content={session.globalSummary} />
          </div>
        )}
        {activeTab === 'mentions' && <Mentions mentions={session.mentions} />}
      </div>
    </div>
  );
}
