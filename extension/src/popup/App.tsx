import React, { useState, useEffect, useCallback, type CSSProperties } from 'react';
import type { CaptureSource, SessionStatus } from '../shared/types.ts';
import { MSG } from '../shared/protocol.ts';

/* ─── Style constants ─────────────────────────────────────────────────────── */

const colors = {
  bg: '#1a1a2e',
  bgLight: '#16213e',
  bgCard: '#0f3460',
  accent: '#7c5cfc',
  accentHover: '#6a4de0',
  text: '#e0e0e0',
  textDim: '#8a8a9a',
  green: '#00c853',
  red: '#ff1744',
  border: '#2a2a4a',
};

const s: Record<string, CSSProperties> = {
  container: {
    width: 380,
    minHeight: 500,
    background: colors.bg,
    color: colors.text,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '18px 20px 14px',
    borderBottom: `1px solid ${colors.border}`,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    width: 28,
    height: 28,
    borderRadius: 8,
    background: `linear-gradient(135deg, ${colors.accent}, #a78bfa)`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    fontWeight: 700,
    color: '#fff',
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: '-0.01em',
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: colors.red,
    animation: 'pulse 1.4s ease-in-out infinite',
  },
  body: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    padding: '20px',
    gap: 18,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    color: colors.textDim,
  },
  select: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 8,
    border: `1px solid ${colors.border}`,
    background: colors.bgLight,
    color: colors.text,
    fontSize: 14,
    outline: 'none',
    cursor: 'pointer',
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
  },
  bigButton: {
    width: '100%',
    padding: '16px 20px',
    borderRadius: 12,
    border: 'none',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    letterSpacing: '0.01em',
  },
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '10px 0',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
  },
  statusText: {
    fontSize: 13,
    color: colors.textDim,
  },
  links: {
    display: 'flex',
    gap: 12,
    justifyContent: 'center',
    padding: '4px 0',
  },
  link: {
    background: 'none',
    border: 'none',
    color: colors.accent,
    fontSize: 13,
    cursor: 'pointer',
    padding: '6px 12px',
    borderRadius: 6,
    transition: 'background 0.15s',
  },
  privacy: {
    padding: '12px 20px 16px',
    borderTop: `1px solid ${colors.border}`,
    fontSize: 11,
    color: colors.textDim,
    textAlign: 'center' as const,
    lineHeight: 1.5,
  },
};

/* ─── Pulse animation ─────────────────────────────────────────────────────── */

const pulseKeyframes = `
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.85); }
}
`;

/* ─── Source labels ────────────────────────────────────────────────────────── */

const sourceLabels: Record<CaptureSource, string> = {
  auto: 'Auto (Recommended)',
  tab: 'Tab Audio',
  'system+mic': 'System Audio + Microphone',
  'mic-only': 'Microphone Only',
};

/* ─── Status helpers ──────────────────────────────────────────────────────── */

function statusColor(status: SessionStatus): string {
  switch (status) {
    case 'recording':
    case 'transcribing':
      return colors.green;
    case 'connecting':
      return '#ffc107';
    case 'error':
      return colors.red;
    default:
      return colors.textDim;
  }
}

function statusLabel(status: SessionStatus): string {
  switch (status) {
    case 'idle':
      return 'Ready to record';
    case 'connecting':
      return 'Connecting to backend...';
    case 'recording':
      return 'Recording in progress';
    case 'transcribing':
      return 'Transcribing...';
    case 'error':
      return 'An error occurred';
    case 'stopped':
      return 'Session ended';
    default:
      return '';
  }
}

/* ─── App component ───────────────────────────────────────────────────────── */

export default function App() {
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [source, setSource] = useState<CaptureSource>('auto');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch current status on mount
  useEffect(() => {
    chrome.runtime.sendMessage({ type: MSG.GET_STATUS }, (response) => {
      if (response) {
        setStatus(response.status ?? 'idle');
        setSource(response.source ?? 'auto');
        if (response.error) setError(response.error);
      }
    });
  }, []);

  // Listen for state updates from background
  useEffect(() => {
    const listener = (message: { type: string; payload?: Record<string, unknown> }) => {
      if (message.type === MSG.SESSION_STATE_UPDATE && message.payload) {
        if (message.payload.status) setStatus(message.payload.status as SessionStatus);
        if (message.payload.error !== undefined) setError(message.payload.error as string | null);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const isActive = status === 'recording' || status === 'transcribing' || status === 'connecting';

  const handleToggle = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isActive) {
        await chrome.runtime.sendMessage({ type: MSG.STOP_RECORDING });
        setStatus('stopped');
      } else {
        await chrome.runtime.sendMessage({
          type: MSG.START_RECORDING,
          payload: { source },
        });
        setStatus('connecting');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    } finally {
      setLoading(false);
    }
  }, [isActive, source]);

  const handleOpenSidePanel = useCallback(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId !== undefined) {
        (chrome.sidePanel as unknown as {
          open: (opts: { tabId: number }) => Promise<void>;
        }).open({ tabId });
      }
    });
  }, []);

  const handleOpenSettings = useCallback(() => {
    chrome.runtime.openOptionsPage();
  }, []);

  return (
    <div style={s.container}>
      <style>{pulseKeyframes}</style>

      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <div style={s.logo}>M</div>
          <span style={s.title}>Meeting Copilot</span>
        </div>
        {isActive && <div style={s.recordingDot} />}
      </div>

      {/* Body */}
      <div style={s.body}>
        {/* Source selector */}
        <div style={s.section}>
          <span style={s.label}>Audio Source</span>
          <select
            style={s.select}
            value={source}
            onChange={(e) => setSource(e.target.value as CaptureSource)}
            disabled={isActive}
          >
            {(Object.keys(sourceLabels) as CaptureSource[]).map((key) => (
              <option key={key} value={key}>
                {sourceLabels[key]}
              </option>
            ))}
          </select>
        </div>

        {/* Start / Stop button */}
        <button
          style={{
            ...s.bigButton,
            background: isActive
              ? `linear-gradient(135deg, ${colors.red}, #d50000)`
              : `linear-gradient(135deg, ${colors.accent}, #a78bfa)`,
            color: '#fff',
            opacity: loading ? 0.7 : 1,
            boxShadow: isActive
              ? '0 4px 20px rgba(255, 23, 68, 0.3)'
              : '0 4px 20px rgba(124, 92, 252, 0.3)',
          }}
          onClick={handleToggle}
          disabled={loading}
        >
          {loading
            ? 'Please wait...'
            : isActive
              ? 'Stop Recording'
              : 'Start Recording'}
        </button>

        {/* Status */}
        <div style={s.statusBar}>
          <div
            style={{
              ...s.statusDot,
              background: statusColor(status),
              boxShadow: `0 0 6px ${statusColor(status)}`,
            }}
          />
          <span style={s.statusText}>{statusLabel(status)}</span>
        </div>

        {/* Error message */}
        {error && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: 'rgba(255, 23, 68, 0.12)',
              border: `1px solid ${colors.red}`,
              fontSize: 13,
              color: colors.red,
              lineHeight: 1.4,
            }}
          >
            {error}
          </div>
        )}

        {/* Links */}
        <div style={s.links}>
          <button
            style={s.link}
            onClick={handleOpenSidePanel}
            onMouseOver={(e) => {
              (e.currentTarget.style.background = 'rgba(124, 92, 252, 0.12)');
            }}
            onMouseOut={(e) => {
              (e.currentTarget.style.background = 'none');
            }}
          >
            Open Side Panel
          </button>
          <button
            style={s.link}
            onClick={handleOpenSettings}
            onMouseOver={(e) => {
              (e.currentTarget.style.background = 'rgba(124, 92, 252, 0.12)');
            }}
            onMouseOut={(e) => {
              (e.currentTarget.style.background = 'none');
            }}
          >
            Settings
          </button>
        </div>
      </div>

      {/* Privacy notice */}
      <div style={s.privacy}>
        Audio is streamed to your configured backend for transcription.
        <br />
        No audio is stored locally.
      </div>
    </div>
  );
}
