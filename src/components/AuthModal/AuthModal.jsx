// src/components/AuthModal/AuthModal.jsx
import React, { useState } from 'react';
import { X, Zap } from 'lucide-react';
import { useRaveStore } from '../../store/useRaveStore';
import { translations } from '../../i18n/translations';
import './AuthModal.css';

export const AuthModal = () => {
  const { lang, isAuthOpen, setModal, signInWithProvider } = useRaveStore();
  const [errorMsg, setErrorMsg] = useState('');
  const t = translations[lang];

  if (!isAuthOpen) return null;

  const handleGoogleLogin = async () => {
    setErrorMsg('');
    try {
      await signInWithProvider('google');
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card auth-pro-card">
        <button className="modal-close" onClick={() => setModal('isAuthOpen', false)}>
          <X size={18} />
        </button>

        <div className="auth-badge-top">
          <Zap size={18} className="icon-neon" />
          <span>RAVEX<strong>RADAR</strong></span>
        </div>

        <h2 className="modal-title">{t.authTitle}</h2>
        <p className="modal-subtitle">{t.authSubtitle}</p>

        {errorMsg && <div className="auth-error-box">{errorMsg}</div>}

        <button type="button" onClick={handleGoogleLogin} className="google-official-btn">
          <svg className="google-svg-icon" viewBox="0 0 24 24" width="20" height="20">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
            />
          </svg>
          <span>{t.googleContinue}</span>
        </button>

        <p className="auth-footer-text">{t.authFooter}</p>
        <p className="legal-mini-links">
          Al continuar aceptas las <a href="/condiciones.html" target="_blank" rel="noopener">Condiciones</a> y la{' '}
          <a href="/privacidad.html" target="_blank" rel="noopener">Política de privacidad</a>.
        </p>
      </div>
    </div>
  );
};