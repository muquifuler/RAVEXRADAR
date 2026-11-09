// RUTA COMPLETA: houseoftechno/src/components/ui/ShareButton.jsx
// ============================================================================
// Botón redondo "Compartir" de los paneles (al lado de la X de cerrar).
// Móvil: menú de compartir del sistema (Instagram, WhatsApp, TikTok…).
// Ordenador: copia el enlace y avisa con un "Enlace copiado".
// ============================================================================
import React, { useEffect, useRef, useState } from 'react';
import { Share2, Check } from 'lucide-react';
import { buildShareUrl, shareLink } from '../../lib/shareLinks';
import './ShareButton.css';

export function ShareButton({ kind, value, title, text, className = '' }) {
  const [msg, setMsg] = useState('');
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  if (!value) return null;

  const onClick = async (e) => {
    e.stopPropagation();
    const url = buildShareUrl(kind, value);
    const res = await shareLink({ title, text, url });
    if (res === 'copied') setMsg('Enlace copiado');
    else if (res === 'failed') setMsg('No se pudo copiar');
    else return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(''), 2200);
  };

  return (
    <button
      type="button"
      className={`drawer-share ${msg ? 'is-done' : ''} ${className}`.trim()}
      onClick={onClick}
      title="Compartir"
      aria-label="Compartir"
    >
      {msg ? <Check size={17} /> : <Share2 size={17} />}
      {msg && <span className="drawer-share-toast" role="status">{msg}</span>}
    </button>
  );
}