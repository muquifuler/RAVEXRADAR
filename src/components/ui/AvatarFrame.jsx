// RUTA COMPLETA: houseoftechno/src/components/ui/AvatarFrame.jsx
// ============================================================================
// Envuelve un avatar redondo con su marco animado PRO.
//   <AvatarFrame frame={getProfileFrame(dj)} avatarUrl={dj.avatar_url}>
//     <div className="artist-avatar-giant">…</div>
//   </AvatarFrame>
// Sin marco (frame = null) devuelve el avatar tal cual.
// El marco escala solo: mide lo mismo que el avatar que envuelve.
// ============================================================================
import React, { useId, useMemo } from 'react';
import { frameLayersHtml } from '../../lib/avatarFrames';

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function AvatarFrame({ frame, avatarUrl = null, lite = false, className = '', children }) {
  const rawId = useId();
  const uid = 'af' + rawId.replace(/[^a-zA-Z0-9]/g, '');
  const frameKey = frame?.key || null;
  const frameColor = frame?.color || null;

  const layers = useMemo(
    () =>
      frameKey
        ? frameLayersHtml({ key: frameKey, color: frameColor }, { lite: lite || reducedMotion(), uid, avatarUrl })
        : null,
    [frameKey, frameColor, lite, uid, avatarUrl]
  );

  if (!layers) return <>{children}</>;

  return (
    <div className={`rr-frame is-on fx-${frameKey}${lite ? ' rr-lite' : ''} ${className}`.trim()}>
      <div className="rrf-layer rrf-under" aria-hidden="true" dangerouslySetInnerHTML={{ __html: layers.under }} />
      <div className="rr-frame-slot">{children}</div>
      {layers.over && (
        <div className="rrf-layer rrf-over" aria-hidden="true" dangerouslySetInnerHTML={{ __html: layers.over }} />
      )}
    </div>
  );
}
