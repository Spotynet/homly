import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Camera } from 'lucide-react';
import { QR_MISMATCH_MSG, acceptScannedQr } from '../utils/homlyQr';

export default function QrCapture({ value, onChange, kind, expectedPayload }) {
  const videoRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const expectedRef = useRef(expectedPayload);
  const lastBadRef = useRef('');
  const [scanning, setScanning] = useState(!value);
  const [camError, setCamError] = useState('');
  const [mismatch, setMismatch] = useState('');

  onChangeRef.current = onChange;
  expectedRef.current = expectedPayload;

  useEffect(() => {
    if (!scanning) return undefined;
    let stream;
    let timer;
    let stopped = false;
    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        if (typeof window.BarcodeDetector !== 'function') {
          setCamError('Este navegador no puede leer QR con la cámara. Usa Chrome o Safari.');
          return;
        }
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const raw = codes[0]?.rawValue;
            if (raw) {
              const accepted = acceptScannedQr(raw, kind, expectedRef.current);
              if (!accepted.ok) {
                if (lastBadRef.current !== raw) {
                  lastBadRef.current = raw;
                  setMismatch(QR_MISMATCH_MSG);
                  toast.error(QR_MISMATCH_MSG);
                }
              } else {
                lastBadRef.current = '';
                setMismatch('');
                onChangeRef.current(accepted.payload);
                setScanning(false);
                return;
              }
            }
          } catch { /* keep scanning */ }
          timer = setTimeout(tick, 280);
        };
        tick();
      } catch {
        setCamError('No se pudo abrir la cámara. Permite el acceso e inténtalo de nuevo.');
      }
    };
    start();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach(t => t.stop());
    };
  }, [scanning, kind]);

  const blockManual = (e) => {
    e.preventDefault();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {scanning && (
        <video
          ref={videoRef}
          muted
          playsInline
          style={{ width: '100%', borderRadius: 12, background: '#111', maxHeight: 220, objectFit: 'cover' }}
        />
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          className={`btn ${scanning ? 'btn-primary' : 'btn-outline'} btn-sm`}
          onClick={() => { setCamError(''); setMismatch(''); setScanning(s => !s); }}
        >
          <Camera size={13} /> {scanning ? 'Cerrar cámara' : value ? 'Volver a escanear' : 'Abrir cámara'}
        </button>
      </div>
      {camError && <div style={{ fontSize: 12, color: 'var(--amber-700)', lineHeight: 1.45 }}>{camError}</div>}
      {mismatch && <div style={{ fontSize: 13, color: 'var(--coral-600)', fontWeight: 700, lineHeight: 1.45 }}>{mismatch}</div>}
      <input
        className="field-input"
        value={value}
        readOnly
        tabIndex={-1}
        onChange={blockManual}
        onKeyDown={blockManual}
        onPaste={blockManual}
        onCut={blockManual}
        onDrop={blockManual}
        placeholder="El código se llena solo al escanear el QR"
        style={{ cursor: 'default', userSelect: 'none', caretColor: 'transparent' }}
      />
    </div>
  );
}
