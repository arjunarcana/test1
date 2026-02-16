import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { MSG } from '../shared/protocol.ts';

type Status = 'requesting' | 'granted' | 'denied';

function PermissionPage() {
  const [status, setStatus] = useState<Status>('requesting');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
        setStatus('granted');

        // Notify the background / popup that permission was granted
        chrome.runtime.sendMessage({ type: 'MIC_PERMISSION_GRANTED' });

        // Auto-close this tab after a short delay
        setTimeout(() => window.close(), 600);
      } catch (err) {
        setStatus('denied');
        setErrorMsg(err instanceof Error ? err.message : 'Permission denied');
      }
    })();
  }, []);

  return (
    <div style={{
      textAlign: 'center',
      maxWidth: 420,
      padding: 40,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 16,
        background: 'linear-gradient(135deg, #7c5cfc, #a78bfa)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 24, fontWeight: 700, color: '#fff',
        margin: '0 auto 24px',
      }}>M</div>

      {status === 'requesting' && (
        <>
          <h2 style={{ fontSize: 20, marginBottom: 12 }}>Microphone Access</h2>
          <p style={{ color: '#8a8a9a', lineHeight: 1.6 }}>
            Please allow microphone access in the browser prompt above.
            This is needed for live speech transcription.
          </p>
        </>
      )}

      {status === 'granted' && (
        <>
          <h2 style={{ fontSize: 20, marginBottom: 12, color: '#00c853' }}>Permission Granted</h2>
          <p style={{ color: '#8a8a9a', lineHeight: 1.6 }}>
            Microphone access granted. This tab will close automatically.
          </p>
        </>
      )}

      {status === 'denied' && (
        <>
          <h2 style={{ fontSize: 20, marginBottom: 12, color: '#ff1744' }}>Permission Denied</h2>
          <p style={{ color: '#8a8a9a', lineHeight: 1.6, marginBottom: 16 }}>
            {errorMsg || 'Microphone access was denied.'}
          </p>
          <p style={{ color: '#8a8a9a', lineHeight: 1.6 }}>
            Click the camera/mic icon in your address bar to change the permission,
            then reload this page.
          </p>
          <button
            onClick={() => location.reload()}
            style={{
              marginTop: 20, padding: '12px 32px', borderRadius: 10,
              border: 'none', background: '#7c5cfc', color: '#fff',
              fontSize: 15, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Try Again
          </button>
        </>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<PermissionPage />);
