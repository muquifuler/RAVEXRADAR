// src/components/ui/MyMediaManager.jsx
// Lista de lo que has subido (sesiones, canciones, fotos y vídeo oficial) en "Editar perfil":
// miniatura, tipo, título en dos líneas como máximo y borrar con confirmación.
import React, { useEffect, useState } from 'react';
import { Film, Music, Image as ImageIcon, Play, CheckCircle2 } from 'lucide-react';
import { OwnerDeleteButton } from './OwnerDeleteButton';
import './MyMediaManager.css';

const TYPE_INFO = {
  video: { label: 'Sesión', color: '#ff5500', Icon: Film },
  track: { label: 'Canción', color: '#facc15', Icon: Music },
  photo: { label: 'Foto', color: '#06b6d4', Icon: ImageIcon }
};
const NEW_MS = 8000;

const isRecent = (iso) => {
  const t = iso ? Date.parse(iso) : NaN;
  return !Number.isNaN(t) && Date.now() - t < NEW_MS;
};

export const MyMediaManager = ({
  items = [],
  uploading = false,
  onDelete,
  typeLabels = {},
  emptyText = 'Aún no has subido nada.'
}) => {
  // Re-render a los 8 s para quitar la marca de "Subido"
  const [, setTick] = useState(0);
  const hasRecent = items.some((m) => isRecent(m.created_at));
  useEffect(() => {
    if (!hasRecent) return undefined;
    const t = setTimeout(() => setTick((n) => n + 1), NEW_MS);
    return () => clearTimeout(t);
  }, [hasRecent]);

  if (!uploading && items.length === 0) {
    return <p className="mm-empty">{emptyText}</p>;
  }

  return (
    <div className="mm-list">
      {uploading && (
        <div className="mm-card is-uploading" role="status" aria-live="polite">
          <div className="mm-thumb">
            <span className="mm-spinner" aria-hidden="true" />
          </div>
          <div className="mm-info">
            <strong>Subiendo archivo…</strong>
            <small>No cierres esta ventana</small>
          </div>
        </div>
      )}

      {items.map((m) => {
        const info = { ...(TYPE_INFO[m.type] || TYPE_INFO.photo) };
        if (typeLabels[m.type]) info.label = typeLabels[m.type];
        const fresh = isRecent(m.created_at);
        const date = m.created_at
          ? new Date(m.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
          : null;

        return (
          <div key={m.id} className={`mm-card ${fresh ? 'is-new' : ''}`} style={{ '--mm-accent': info.color }}>
            <div className="mm-thumb">
              {m.type === 'photo' && <img src={m.url} alt="" loading="lazy" />}
              {m.type === 'video' && (
                <>
                  <video src={`${m.url}#t=0.5`} preload="metadata" muted playsInline />
                  <span className="mm-thumb-play" aria-hidden="true">
                    <Play size={14} />
                  </span>
                </>
              )}
              {m.type === 'track' && <Music size={22} />}
            </div>

            <div className="mm-info">
              <div className="mm-meta">
                <span className="mm-pill">
                  <info.Icon size={10} /> {info.label}
                </span>
                {fresh ? (
                  <span className="mm-new">
                    <CheckCircle2 size={11} /> Subido
                  </span>
                ) : (
                  date && <small>{date}</small>
                )}
              </div>
              <strong title={m.title}>{m.title || info.label}</strong>
            </div>

            <OwnerDeleteButton className="is-inline" label="Borrar" onDelete={() => onDelete(m)} />
          </div>
        );
      })}
    </div>
  );
};