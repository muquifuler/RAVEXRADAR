// src/components/ui/EmojiPicker.jsx
// Botón de emojis para cualquier input o textarea: inserta el emoji donde está el cursor.
// Uso: <EmojiPicker targetRef={miRef} value={texto} onChange={setTexto} />
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Smile } from 'lucide-react';
import './EmojiPicker.css';

const GROUPS = [
  { id: 'fiesta', label: 'Fiesta', emojis: ['🎧', '🎶', '🎵', '🔊', '🎛️', '💿', '📀', '🪩', '🕺', '💃', '🔥', '⚡', '💥', '✨', '🌙', '🌃', '🌅', '🍾', '🥂', '🍻', '🍹', '🎉', '🎊', '🖤', '💛', '🧡', '❤️‍🔥', '🚀', '👽', '🤖', '👾', '💫'] },
  { id: 'caras', label: 'Caras', emojis: ['😀', '😁', '😂', '🤣', '😅', '😊', '😍', '🥰', '😘', '😎', '🤩', '🥳', '😏', '😜', '🤪', '🫠', '🙃', '😴', '🥱', '😮‍💨', '🤯', '😱', '😭', '😤', '😈', '💀', '🤔', '🫣', '😬', '🙄', '🤫', '🥲'] },
  { id: 'gestos', label: 'Gestos', emojis: ['👍', '👎', '👏', '🙌', '🤘', '🤙', '✌️', '🤞', '👊', '✊', '🫶', '💪', '🙏', '👋', '👀', '🫡', '🤝', '🫵', '👉', '👆', '🕶️', '👟', '🧢', '💅'] },
  { id: 'simbolos', label: 'Símbolos', emojis: ['✅', '❌', '⚠️', '📍', '📅', '⏰', '🎟️', '🔒', '🔓', '📢', '💬', '📸', '🎥', '🎤', '🆕', '🔝', '💯', '⭐', '🌍', '🇪🇸', '➡️', '⬆️', '🔁', '❗'] }
];

const RECENT_KEY = 'rr_recent_emojis';
const readRecent = () => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(v) ? v.slice(0, 24) : [];
  } catch {
    return [];
  }
};
const saveRecent = (list) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 24)));
  } catch {
    /* navegador sin almacenamiento: no pasa nada */
  }
};

const isTouchDevice = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

export const EmojiPicker = ({ targetRef, value = '', onChange, placement = 'top', className = '' }) => {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState(readRecent);
  const [tab, setTab] = useState(() => (readRecent().length ? 'recent' : 'fiesta'));
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const panelRef = useRef(null);
  // Si nunca has puesto el cursor en el campo, el emoji va al final (no al principio)
  const touchedRef = useRef(false);

  useEffect(() => {
    const el = targetRef?.current;
    if (!el) return undefined;
    const mark = () => { touchedRef.current = true; };
    el.addEventListener('focus', mark);
    return () => el.removeEventListener('focus', mark);
  }, [targetRef]);

  // Panel en posición fija calculada desde el botón: así nunca lo recorta un panel con overflow
  const place = () => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8));
    const spaceAbove = r.top;
    const goUp = placement === 'top' ? spaceAbove > 300 : window.innerHeight - r.bottom < 300;
    setPos(goUp ? { left, width, bottom: window.innerHeight - r.top + 8 } : { left, width, top: r.bottom + 8 });
  };

  useLayoutEffect(() => {
    if (open) place();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (panelRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    const onMove = () => place();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const insert = (emoji) => {
    const el = targetRef?.current;
    const text = value || '';
    const useCursor = touchedRef.current && typeof el?.selectionStart === 'number';
    const start = useCursor ? el.selectionStart : text.length;
    const end = useCursor ? el.selectionEnd : text.length;
    touchedRef.current = true;
    onChange(text.slice(0, start) + emoji + text.slice(end));

    const caret = start + emoji.length;
    requestAnimationFrame(() => {
      if (!el) return;
      // En móvil no enfocamos: abriría el teclado encima del selector
      if (!isTouchDevice()) el.focus();
      try {
        el.setSelectionRange(caret, caret);
      } catch {
        /* algunos tipos de input no admiten selección */
      }
    });

    const next = [emoji, ...recent.filter((e) => e !== emoji)].slice(0, 24);
    setRecent(next);
    saveRecent(next);
  };

  const tabs = [...(recent.length ? [{ id: 'recent', label: 'Recientes', emojis: recent }] : []), ...GROUPS];
  const current = tabs.find((g) => g.id === tab) || tabs[0];

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`emoji-picker-btn ${open ? 'is-open' : ''} ${className}`}
        onClick={() => setOpen((o) => !o)}
        aria-label="Insertar emoji"
        aria-expanded={open}
        title="Emojis"
      >
        <Smile size={17} />
      </button>

      {open && pos &&
        createPortal(
          <div
            ref={panelRef}
            className="emoji-picker-panel"
            style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}
            role="dialog"
            aria-label="Elegir emoji"
          >
            <div className="emoji-picker-tabs">
              {tabs.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={g.id === current.id ? 'active' : ''}
                  onClick={() => setTab(g.id)}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <div className="emoji-picker-grid">
              {current.emojis.map((e) => (
                <button key={e} type="button" className="emoji-picker-item" onClick={() => insert(e)} aria-label={e}>
                  {e}
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}
    </>
  );
};