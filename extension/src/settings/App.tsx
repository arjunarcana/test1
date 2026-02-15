import React, { useState, useEffect, useCallback, type CSSProperties } from 'react';
import type { UserSettings } from '../shared/types.ts';
import { DEFAULT_SETTINGS } from '../shared/types.ts';
import { getSettings, saveSettings } from '../shared/storage.ts';

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
  page: {
    minHeight: '100vh',
    background: colors.bg,
    color: colors.text,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    display: 'flex',
    justifyContent: 'center',
    padding: '40px 20px',
  },
  wrapper: {
    width: '100%',
    maxWidth: 600,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textDim,
  },
  section: {
    background: colors.bgLight,
    borderRadius: 12,
    border: `1px solid ${colors.border}`,
    padding: 20,
    marginBottom: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: colors.accent,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
  sectionDesc: {
    fontSize: 13,
    color: colors.textDim,
    lineHeight: 1.5,
    marginTop: -6,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: colors.text,
    marginBottom: 4,
    display: 'block',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 8,
    border: `1px solid ${colors.border}`,
    background: colors.bg,
    color: colors.text,
    fontSize: 14,
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  select: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 8,
    border: `1px solid ${colors.border}`,
    background: colors.bg,
    color: colors.text,
    fontSize: 14,
    outline: 'none',
    cursor: 'pointer',
    appearance: 'none' as const,
  },
  nameRow: {
    display: 'flex',
    gap: 8,
  },
  addBtn: {
    padding: '10px 18px',
    borderRadius: 8,
    border: 'none',
    background: colors.accent,
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'background 0.15s',
  },
  nameList: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 8,
  },
  nameTag: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    borderRadius: 20,
    background: 'rgba(124, 92, 252, 0.15)',
    border: `1px solid rgba(124, 92, 252, 0.3)`,
    fontSize: 13,
    fontWeight: 500,
    color: colors.accent,
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    color: colors.textDim,
    fontSize: 16,
    cursor: 'pointer',
    padding: 0,
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggle: {
    position: 'relative' as const,
    width: 44,
    height: 24,
    borderRadius: 12,
    cursor: 'pointer',
    transition: 'background 0.2s',
    flexShrink: 0,
  },
  toggleKnob: {
    position: 'absolute' as const,
    top: 3,
    width: 18,
    height: 18,
    borderRadius: '50%',
    background: '#fff',
    transition: 'left 0.2s',
  },
  slider: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    appearance: 'none' as const,
    background: colors.border,
    outline: 'none',
    cursor: 'pointer',
  },
  sliderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  sliderValue: {
    fontSize: 14,
    fontWeight: 600,
    color: colors.accent,
    minWidth: 50,
    textAlign: 'right' as const,
  },
  saveBtn: {
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
    marginTop: 8,
  },
  toast: {
    position: 'fixed' as const,
    bottom: 24,
    left: '50%',
    transform: 'translateX(-50%)',
    background: colors.green,
    color: '#fff',
    padding: '10px 24px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
    zIndex: 100,
  },
};

/* ─── Languages ───────────────────────────────────────────────────────────── */

const languages = [
  { code: 'en', label: 'English', available: true },
  { code: 'es', label: 'Spanish', available: false },
  { code: 'fr', label: 'French', available: false },
  { code: 'de', label: 'German', available: false },
  { code: 'pt', label: 'Portuguese', available: false },
  { code: 'ja', label: 'Japanese', available: false },
  { code: 'zh', label: 'Chinese', available: false },
];

/* ─── Component ───────────────────────────────────────────────────────────── */

export default function App() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [nameInput, setNameInput] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Load settings on mount
  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      setLoaded(true);
    });
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }, []);

  const handleAddName = useCallback(() => {
    const name = nameInput.trim();
    if (!name) return;
    if (settings.names.includes(name)) {
      showToast('Name already exists');
      return;
    }
    setSettings((prev) => ({ ...prev, names: [...prev.names, name] }));
    setNameInput('');
  }, [nameInput, settings.names, showToast]);

  const handleRemoveName = useCallback((name: string) => {
    setSettings((prev) => ({
      ...prev,
      names: prev.names.filter((n) => n !== name),
    }));
  }, []);

  const handleSave = useCallback(async () => {
    try {
      await saveSettings(settings);
      showToast('Settings saved');
    } catch {
      showToast('Failed to save');
    }
  }, [settings, showToast]);

  const updateField = useCallback(<K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  if (!loaded) return null;

  return (
    <div style={s.page}>
      <div style={s.wrapper}>
        {/* Header */}
        <div style={s.header}>
          <div style={s.title}>Settings</div>
          <div style={s.subtitle}>Configure Meeting Copilot to your preferences.</div>
        </div>

        {/* Your Names */}
        <div style={s.section}>
          <div style={s.sectionTitle}>Your Names</div>
          <div style={s.sectionDesc}>
            Add names or aliases to detect when you are mentioned during meetings.
          </div>
          <div style={s.nameRow}>
            <input
              style={s.input}
              placeholder="Enter a name or alias..."
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddName()}
              onFocus={(e) => { e.currentTarget.style.borderColor = colors.accent; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = colors.border; }}
            />
            <button style={s.addBtn} onClick={handleAddName}>
              Add
            </button>
          </div>
          {settings.names.length > 0 && (
            <div style={s.nameList}>
              {settings.names.map((name) => (
                <div key={name} style={s.nameTag}>
                  {name}
                  <button
                    style={s.removeBtn}
                    onClick={() => handleRemoveName(name)}
                    title="Remove"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Language */}
        <div style={s.section}>
          <div style={s.sectionTitle}>Language</div>
          <select
            style={s.select}
            value={settings.language}
            onChange={(e) => updateField('language', e.target.value)}
          >
            {languages.map((lang) => (
              <option
                key={lang.code}
                value={lang.code}
                disabled={!lang.available}
              >
                {lang.label}{!lang.available ? ' (coming soon)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Transcription */}
        <div style={s.section}>
          <div style={s.sectionTitle}>Transcription</div>

          <div style={s.toggleRow}>
            <div>
              <span style={s.label}>Speaker Diarization</span>
              <div style={{ fontSize: 12, color: colors.textDim, marginTop: 2 }}>
                Identify different speakers in the transcript
              </div>
            </div>
            <div
              style={{
                ...s.toggle,
                background: settings.diarizationEnabled ? colors.accent : colors.border,
              }}
              onClick={() => updateField('diarizationEnabled', !settings.diarizationEnabled)}
            >
              <div
                style={{
                  ...s.toggleKnob,
                  left: settings.diarizationEnabled ? 23 : 3,
                }}
              />
            </div>
          </div>

          <div>
            <span style={s.label}>Provider</span>
            <select
              style={s.select}
              value={settings.transcriptionProvider}
              onChange={(e) =>
                updateField('transcriptionProvider', e.target.value as 'mock' | 'deepgram')
              }
            >
              <option value="mock">Mock (Development)</option>
              <option value="deepgram">Deepgram</option>
            </select>
          </div>
        </div>

        {/* Backend */}
        <div style={s.section}>
          <div style={s.sectionTitle}>Backend</div>
          <div>
            <span style={s.label}>WebSocket URL</span>
            <input
              style={s.input}
              value={settings.backendUrl}
              onChange={(e) => updateField('backendUrl', e.target.value)}
              placeholder="ws://localhost:3001"
              onFocus={(e) => { e.currentTarget.style.borderColor = colors.accent; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = colors.border; }}
            />
          </div>
          <div>
            <span style={s.label}>Native Bridge Port</span>
            <input
              style={s.input}
              type="number"
              value={settings.nativeBridgePort ?? ''}
              onChange={(e) =>
                updateField(
                  'nativeBridgePort',
                  e.target.value ? parseInt(e.target.value, 10) : null
                )
              }
              placeholder="Leave empty to disable"
              onFocus={(e) => { e.currentTarget.style.borderColor = colors.accent; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = colors.border; }}
            />
            <div style={{ fontSize: 12, color: colors.textDim, marginTop: 4 }}>
              Port for the native audio bridge app. Leave empty if not using system audio capture.
            </div>
          </div>
        </div>

        {/* Data Retention */}
        <div style={s.section}>
          <div style={s.sectionTitle}>Data Retention</div>
          <div>
            <span style={s.label}>Keep meeting data for</span>
            <div style={s.sliderRow}>
              <input
                type="range"
                min={7}
                max={365}
                step={1}
                value={settings.retentionDays}
                onChange={(e) => updateField('retentionDays', parseInt(e.target.value, 10))}
                style={{
                  ...s.slider,
                  flex: 1,
                  accentColor: colors.accent,
                }}
              />
              <span style={s.sliderValue}>{settings.retentionDays} days</span>
            </div>
          </div>
        </div>

        {/* Save button */}
        <button
          style={s.saveBtn}
          onClick={handleSave}
          onMouseOver={(e) => {
            e.currentTarget.style.boxShadow = '0 6px 24px rgba(124, 92, 252, 0.45)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.boxShadow = '0 4px 16px rgba(124, 92, 252, 0.3)';
          }}
        >
          Save Settings
        </button>

        {/* Toast */}
        {toast && <div style={s.toast}>{toast}</div>}
      </div>
    </div>
  );
}
