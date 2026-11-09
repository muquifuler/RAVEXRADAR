// src/components/ui/CollabRequestModal.jsx
// Modal "Pedir colaboración" entre DJs. En escritorio, ventana centrada; en móvil, hoja inferior
// (lo hace mobile.css con las clases modal-overlay / modal-card).
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Handshake, Send, Calendar, Info } from 'lucide-react';
import { EmojiPicker } from './EmojiPicker';
import './CollabRequestModal.css';

const COLLAB_TYPES = [
  { id: 'b2b', label: 'B2B', emoji: '🎧' },
  { id: 'joint', label: 'Sesión conjunta', emoji: '🔊' },
  { id: 'production', label: 'Producción / remix', emoji: '🎛️' },
  { id: 'gig', label: 'Fecha en mi fiesta', emoji: '📅' },
  { id: 'other', label: 'Otra idea', emoji: '💡' }
];

const formatDate = (iso) => {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
};

export const CollabRequestModal = ({ targetUser, onClose, onSend }) => {
  const [type, setType] = useState('b2b');
  const [date, setDate] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const msgRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !isSending && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, isSending]);

  const chosen = COLLAB_TYPES.find((t) => t.id === type) || COLLAB_TYPES[0];
  const today = new Date().toISOString().slice(0, 10);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim() || isSending) return;
    setIsSending(true);
    setError('');
    // El primer mensaje del chat lleva el tipo y la fecha arriba, y tu texto debajo
    const header = `${chosen.emoji} ${chosen.label}${date ? ` · 📅 ${formatDate(date)}` : ''}`;
    try {
      await onSend(`${header}\n\n${message.trim()}`);
      onClose();
    } catch (err) {
      setError(err?.message || 'No se pudo enviar. Inténtalo de nuevo.');
      setIsSending(false);
    }
  };

  return createPortal(
    <div className="modal-overlay collab-request-overlay" onClick={() => !isSending && onClose()}>
      <form className="modal-card collab-request-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <button type="button" className="modal-close" onClick={onClose} disabled={isSending} aria-label="Cerrar">
          <X size={18} />
        </button>

        <div className="modal-icon-header collab-request-header">
          <Handshake size={24} className="icon-neon" />
          <div>
            <h2 className="modal-title">Pedir colaboración</h2>
            <p className="modal-subtitle">
              A <strong>@{targetUser?.username}</strong>. Se abrirá un chat de colaboración entre los dos.
            </p>
          </div>
        </div>

        {error && <div className="add-event-error">{error}</div>}

        <div className="collab-request-field">
          <span className="mini-field-label">¿Qué propones?</span>
          <div className="collab-request-types">
            {COLLAB_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`collab-request-type ${type === t.id ? 'active' : ''}`}
                onClick={() => setType(t.id)}
                aria-pressed={type === t.id}
              >
                <span aria-hidden="true">{t.emoji}</span> {t.label}
              </button>
            ))}
          </div>
        </div>

        <label className="collab-request-field">
          <span className="mini-field-label">
            <Calendar size={12} /> Fecha propuesta <em>(opcional)</em>
          </span>
          <input type="date" className="pro-input" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        <div className="collab-request-field">
          <span className="mini-field-label">Tu mensaje</span>
          <div className="rich-textarea-wrap">
            <textarea
              ref={msgRef}
              rows="5"
              required
              className="pro-input"
              placeholder="Cuéntale tu idea: estilo, duración del set, dónde y por qué encajáis…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <EmojiPicker targetRef={msgRef} value={message} onChange={setMessage} />
          </div>
        </div>

        <p className="collab-request-note">
          <Info size={13} /> No podrás enviarle más mensajes hasta que te conteste.
        </p>

        <div className="collab-request-actions">
          <button type="button" className="btn-secondary-outline" onClick={onClose} disabled={isSending}>
            Cancelar
          </button>
          <button type="submit" className="btn-neon-full collab-request-send" disabled={isSending || !message.trim()}>
            <Send size={15} />
            <span>{isSending ? 'Enviando…' : 'Enviar propuesta'}</span>
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
};