// src/components/ui/GhostClaim.jsx
// ----------------------------------------------------------------------------
// Perfiles "fantasma" (clubs y promotoras creados automáticamente con las
// fiestas importadas):
//  · <GhostPill>         → pastilla "Sin reclamar" en lugar de "Oficial".
//  · <GhostClaimBanner>  → aviso + botón "¿Es tuyo? Reclámalo" dentro del panel.
//  · El formulario pide email de contacto y un mensaje; llega al panel de admin.
// ----------------------------------------------------------------------------
import React, { useState } from 'react';
import { Ghost, Send, X, CheckCircle2, Mail } from 'lucide-react';
import { useRaveStore } from '../../store/useRaveStore';
import './GhostClaim.css';

export const isGhostProfile = (p) => Boolean(p?.is_ghost);

export const GhostPill = () => (
  <span className="ghost-pill" title="Creado automáticamente con la información pública de sus fiestas">
    <Ghost size={11} /> Sin reclamar
  </span>
);

const ROLE_LABEL = { Club: 'este club', Promotor: 'esta promotora' };

export const GhostClaimBanner = ({ profile }) => {
  const user = useRaveStore((s) => s.user);
  const authEmail = useRaveStore((s) => s.authEmail);
  const setModal = useRaveStore((s) => s.setModal);
  const submitGhostClaim = useRaveStore((s) => s.submitGhostClaim);

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  if (!isGhostProfile(profile)) return null;
  const what = ROLE_LABEL[profile.role] || 'este perfil';

  const start = () => {
    if (!user) {
      setModal('isAuthOpen', true);
      return;
    }
    setEmail((e) => e || authEmail || '');
    setError('');
    setOpen(true);
  };

  const send = async (e) => {
    e.preventDefault();
    setError('');
    if (message.trim().length < 10) {
      setError('Cuéntanos un poco más (mínimo 10 caracteres).');
      return;
    }
    setSending(true);
    try {
      await submitGhostClaim({ ghost: profile, email, message });
      setSent(true);
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="ghost-claim-banner">
      <div className="ghost-claim-top">
        <span className="ghost-claim-icon">
          <Ghost size={18} />
        </span>
        <div className="ghost-claim-copy">
          <strong>Perfil sin reclamar</strong>
          <span>
            Lo hemos creado con la información pública de sus fiestas. ¿Gestionas {what}? Reclámalo y lo pasamos a tu
            cuenta con todas sus fiestas.
          </span>
        </div>
      </div>

      {sent ? (
        <p className="ghost-claim-sent">
          <CheckCircle2 size={15} /> Reclamación enviada. Te avisaremos en la campana cuando la revisemos.
        </p>
      ) : !open ? (
        <button type="button" className="ghost-claim-btn" onClick={start}>
          ¿Es tuyo? Reclámalo
        </button>
      ) : (
        <form className="ghost-claim-form" onSubmit={send}>
          <div className="ghost-claim-form-head">
            <strong>Reclamar @{profile.username}</strong>
            <button type="button" className="ghost-claim-x" onClick={() => setOpen(false)} title="Cancelar">
              <X size={15} />
            </button>
          </div>
          <p className="ghost-claim-note">
            Si lo aprobamos, <b>tu cuenta (@{user?.username})</b> pasará a ser {what}: su nombre, su ubicación en el mapa y
            sus fiestas.
          </p>
          <label className="ghost-claim-field">
            <span>
              <Mail size={11} /> Email de contacto
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com (mejor si es del dominio del club)"
            />
          </label>
          <label className="ghost-claim-field">
            <span>Mensaje</span>
            <textarea
              rows="4"
              required
              maxLength={1500}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Quién eres y cómo podemos comprobarlo (web oficial, Instagram del club, CIF…)"
            />
          </label>
          {error && <p className="ghost-claim-error">{error}</p>}
          <button type="submit" className="ghost-claim-btn" disabled={sending}>
            <Send size={14} /> {sending ? 'Enviando…' : 'Enviar reclamación'}
          </button>
        </form>
      )}
    </div>
  );
};

export default GhostClaimBanner;
