// RUTA COMPLETA: houseoftechno/src/components/ui/AvatarFramePicker.jsx
// ============================================================================
// Selector de marco animado (Editar perfil → pestaña "Marco PRO", solo DJs).
// Vista previa en grande (panel) y en pequeño (pin del mapa) con tu foto,
// rejilla con los 12 marcos y elección de color en los que tienen variantes.
// Sin PRO se pueden probar, pero no se guardan.
// Los DJs fundadores ven además la Corona de Fundador (gratis, sin PRO).
// ============================================================================
import React from 'react';
import { Crown, Disc, Lock, Check, Ban } from 'lucide-react';
import { AvatarFrame } from './AvatarFrame';
import { AVATAR_FRAMES, normalizeFrame } from '../../lib/avatarFrames';
import { PRO_PRICE_LABEL } from '../../constants/proConfig';
import './AvatarFramePicker.css';

function AvatarDisc({ url, size }) {
  return (
    <div className={`afp-av afp-av-${size}`}>
      {url ? <img src={url} alt="" referrerPolicy="no-referrer" /> : <Disc size={size === 'lg' ? 34 : 16} className="icon-neon" />}
    </div>
  );
}

export function AvatarFramePicker({ value, onChange, avatarUrl, isPro, isFounder = false, onUpgrade }) {
  const frames = AVATAR_FRAMES.filter((f) => !f.founderOnly || isFounder);
  const current = normalizeFrame(value?.key, value?.color);
  const currentDef = current ? AVATAR_FRAMES.find((f) => f.key === current.key) : null;
  // Lo elegido se puede guardar: corona (fundador) o cualquiera con PRO
  const canSave = !currentDef || (currentDef.founderOnly ? isFounder : isPro);

  const pick = (key) => {
    if (!key) return onChange({ key: null, color: null });
    // Al cambiar de marco se conserva el color si el nuevo también lo tiene
    const next = normalizeFrame(key, current?.key === key ? current.color : value?.color);
    onChange(next);
  };

  return (
    <div className="afp">
      <div className="afp-head">
        <h4><Crown size={15} /> Marco animado del avatar</h4>
        <p>Exclusivo para DJs PRO. Se ve alrededor de tu foto en tu pin del mapa y al abrir tu panel.</p>
      </div>

      {isFounder && (
        <div className="afp-founder">
          <Crown size={15} />
          <div>
            <strong>Eres DJ Fundador 👑</strong>
            <span>La Corona de Fundador es solo para los 100 primeros DJs y es gratis para ti, sin PRO.</span>
          </div>
        </div>
      )}

      {!isPro && (
        <div className={`afp-lock${canSave ? ' is-soft' : ''}`}>
          <Lock size={15} />
          <div>
            <strong>{isFounder ? 'El resto de marcos son PRO' : 'Pruébalos todo lo que quieras'}</strong>
            <span>
              {canSave
                ? 'Puedes probarlos todos; para guardar uno que no sea la Corona necesitas RAVEXRADAR PRO.'
                : 'Este marco no se guardará: para que lo vean los demás necesitas RAVEXRADAR PRO.'}
            </span>
          </div>
          <button type="button" onClick={onUpgrade}>Hazte PRO · {PRO_PRICE_LABEL}</button>
        </div>
      )}

      <div className="afp-preview">
        <div className="afp-stage afp-stage-panel">
          <span className="afp-stage-lbl">Tu panel</span>
          <AvatarFrame frame={current} avatarUrl={avatarUrl}>
            <AvatarDisc url={avatarUrl} size="lg" />
          </AvatarFrame>
          <span className="afp-stage-name">{currentDef ? currentDef.name : 'Sin marco'}</span>
        </div>
        <div className="afp-stage afp-stage-map">
          <span className="afp-stage-lbl">Mapa</span>
          <AvatarFrame frame={current} avatarUrl={avatarUrl} lite>
            <AvatarDisc url={avatarUrl} size="sm" />
          </AvatarFrame>
        </div>
      </div>

      {currentDef?.colors && (
        <div className="afp-colors">
          <span className="afp-colors-lbl">Color</span>
          {currentDef.colors.map((c) => (
            <button
              type="button"
              key={c.key}
              className={`afp-chip ${current.color === c.key ? 'on' : ''}`}
              onClick={() => onChange({ key: current.key, color: c.key })}
            >
              <i style={{ background: c.swatch }} />
              {c.label}
              {current.color === c.key && <Check size={12} />}
            </button>
          ))}
        </div>
      )}

      <div className="afp-grid" role="listbox" aria-label="Marcos de avatar">
        <button
          type="button"
          role="option"
          aria-selected={!current}
          className={`afp-opt ${!current ? 'on' : ''}`}
          onClick={() => pick(null)}
        >
          <span className="afp-thumb afp-thumb-none">
            <AvatarDisc url={avatarUrl} size="xs" />
            <Ban size={14} className="afp-none-icon" />
          </span>
          <span className="afp-name">Sin marco</span>
        </button>

        {frames.map((f) => {
          const on = current?.key === f.key;
          const thumbFrame = normalizeFrame(f.key, on ? current.color : null);
          return (
            <button
              type="button"
              role="option"
              aria-selected={on}
              key={f.key}
              className={`afp-opt ${on ? 'on' : 'rrf-paused'}${f.founderOnly ? ' is-founder' : ''}`}
              onClick={() => pick(f.key)}
              title={f.name}
            >
              <span className="afp-thumb">
                <AvatarFrame frame={thumbFrame} avatarUrl={avatarUrl} lite>
                  <AvatarDisc url={avatarUrl} size="xs" />
                </AvatarFrame>
              </span>
              <span className="afp-name">{f.name}</span>
              {f.founderOnly && <span className="afp-founder-tag">Fundador</span>}
              {f.colors && (
                <span className="afp-dots" aria-hidden="true">
                  {f.colors.map((c) => <i key={c.key} style={{ background: c.swatch }} />)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="afp-foot">
        Los cambios se aplican al pulsar <strong>Guardar Perfil</strong>. En el mapa el marco va en versión ligera y se pausa mientras mueves el mapa.
      </p>
    </div>
  );
}
