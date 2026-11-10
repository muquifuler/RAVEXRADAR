// src/components/SupportModal/SupportModal.jsx
import React, { useState, useEffect } from 'react';
import { X, LifeBuoy, Send, CheckCircle2, Mail } from 'lucide-react';
import { useRaveStore } from '../../store/useRaveStore';
import './SupportModal.css';

export const SupportModal = () => {
  const { isSupportOpen, setModal, user, authEmail, sendSupportTicket } = useRaveStore();

  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isSupportOpen) {
      setEmail(authEmail || '');
      setSubject('');
      setMessage('');
      setSentSuccess(false);
      setErrorMsg('');
    }
  }, [isSupportOpen, authEmail]);

  if (!isSupportOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return setModal('isAuthOpen', true);
    setErrorMsg('');
    setIsSending(true);
    try {
      await sendSupportTicket({ email, subject, message });
      setSentSuccess(true);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card support-modal-card">
        <button className="modal-close" onClick={() => setModal('isSupportOpen', false)}>
          <X size={18} />
        </button>

        <div className="support-header modal-icon-header">
          <LifeBuoy size={22} className="icon-neon" />
          <div>
            <h2 className="modal-title">Contacto y Soporte</h2>
            <p className="modal-subtitle" style={{ marginBottom: 0 }}>
              ¿Tienes alguna duda, incidencia o propuesta? Recibirás nuestra respuesta directamente en tu campanita de notificaciones.
            </p>
          </div>
        </div>

        {sentSuccess ? (
          <div className="support-success-box">
            <CheckCircle2 size={36} style={{ color: '#22c55e' }} />
            <strong>¡Mensaje enviado al equipo de RaveRadar!</strong>
            <p>Te contestaremos lo antes posible y te aparecerá un aviso en tu campanita de notificaciones.</p>
            <button type="button" className="btn-neon-full" onClick={() => setModal('isSupportOpen', false)}>
              Entendido
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="support-form">
            {errorMsg && <div className="add-event-error">⚠️ {errorMsg}</div>}

            <div className="support-email-wrap">
              <Mail size={15} className="icon-neon" />
              <input
                type="email"
                required
                placeholder="Tu correo de contacto..."
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <input
              type="text"
              className="pro-input"
              required
              placeholder="Asunto (ej. Duda con evento, Verificación DJ, Bug...)"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />

            <textarea
              rows="4"
              className="pro-input"
              required
              placeholder="Explica tu consulta con detalle..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />

            <button type="submit" className="btn-neon-full" disabled={isSending}>
              <Send size={15} />
              <span>{isSending ? 'Enviando consulta...' : 'Enviar Mensaje a Soporte'}</span>
            </button>
          </form>
        )}

        <p className="legal-mini-links">
          <a href="/privacidad.html" target="_blank" rel="noopener">Privacidad</a> ·{' '}
          <a href="/condiciones.html" target="_blank" rel="noopener">Condiciones del servicio</a>
        </p>
      </div>
    </div>
  );
};
