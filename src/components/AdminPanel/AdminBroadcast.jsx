// RUTA COMPLETA: houseoftechno/src/components/AdminPanel/AdminBroadcast.jsx
// ============================================================================
// /admin → "Enviar aviso": escribe un aviso y mándalo a la campanita de todos
// los usuarios de los tipos que elijas. Lo envía la función de Supabase
// admin_send_notification (migración 08), que comprueba que eres admin.
// ============================================================================
import React, { useEffect, useMemo, useState } from 'react';
import { Megaphone, Send, Users, Headphones, Building2, Disc, CheckCircle2 } from 'lucide-react';
import { useRaveStore } from '../../store/useRaveStore';

const ROLES = [
  { key: 'Raver', label: 'Ravers', Icon: Users, color: '#facc15' },
  { key: 'DJ', label: 'DJs', Icon: Headphones, color: '#ff5500' },
  { key: 'Club', label: 'Clubs', Icon: Building2, color: '#06b6d4' },
  { key: 'Promotor', label: 'Promotores', Icon: Disc, color: '#f43f5e' }
];
const MAX_TITLE = 90;
const MAX_BODY = 600;

export const AdminBroadcast = () => {
  const allProfilesAdmin = useRaveStore((s) => s.allProfilesAdmin);
  const adminBroadcasts = useRaveStore((s) => s.adminBroadcasts);
  const adminSendNotification = useRaveStore((s) => s.adminSendNotification);
  const fetchAdminBroadcasts = useRaveStore((s) => s.fetchAdminBroadcasts);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [roles, setRoles] = useState(['Raver', 'DJ', 'Club', 'Promotor']);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null); // { ok, text }

  useEffect(() => {
    fetchAdminBroadcasts();
  }, [fetchAdminBroadcasts]);

  // Cuántos usuarios hay de cada tipo (aproximado: incluye perfiles de prueba)
  const counts = useMemo(() => {
    const c = { Raver: 0, DJ: 0, Club: 0, Promotor: 0 };
    (allProfilesAdmin || []).forEach((p) => {
      const r = c[p.role] !== undefined ? p.role : 'Raver';
      c[r] += 1;
    });
    return c;
  }, [allProfilesAdmin]);
  const approxTotal = roles.reduce((sum, r) => sum + (counts[r] || 0), 0);

  const allOn = roles.length === ROLES.length;
  const toggleRole = (key) =>
    setRoles((prev) => (prev.includes(key) ? prev.filter((r) => r !== key) : [...prev, key]));

  const canSend = title.trim().length >= 3 && roles.length > 0 && !sending;

  const send = async () => {
    if (!canSend) return;
    const who = allOn ? 'TODOS los usuarios' : roles.map((r) => ROLES.find((x) => x.key === r).label).join(', ');
    if (!window.confirm(`¿Enviar este aviso a ${who}?\n\n${title.trim()}`)) return;
    setSending(true);
    setResult(null);
    try {
      const n = await adminSendNotification({ title: title.trim(), body: body.trim(), roles });
      setResult({ ok: true, text: `Aviso enviado a ${n} usuario${n === 1 ? '' : 's'}.` });
      setTitle('');
      setBody('');
    } catch (err) {
      setResult({ ok: false, text: err.message || 'No se pudo enviar el aviso.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="admin-broadcast">
      <div className="admin-broadcast-card">
        <div className="admin-broadcast-head">
          <Megaphone size={18} />
          <div>
            <strong>Enviar un aviso a la campanita</strong>
            <span>Les aparecerá en notificaciones al momento (y al entrar, si no estaban conectados).</span>
          </div>
        </div>

        <label className="admin-broadcast-label">Para quién</label>
        <div className="admin-broadcast-roles">
          <button
            type="button"
            className={`ab-role ${allOn ? 'on' : ''}`}
            onClick={() => setRoles(allOn ? [] : ROLES.map((r) => r.key))}
          >
            Todos
          </button>
          {ROLES.map(({ key, label, Icon, color }) => (
            <button
              type="button"
              key={key}
              className={`ab-role ${roles.includes(key) ? 'on' : ''}`}
              style={{ '--ab-color': color }}
              onClick={() => toggleRole(key)}
            >
              <Icon size={13} /> {label} <em>{counts[key]}</em>
            </button>
          ))}
        </div>

        <label className="admin-broadcast-label" htmlFor="ab-title">
          Título <span>{title.length}/{MAX_TITLE}</span>
        </label>
        <input
          id="ab-title"
          type="text"
          maxLength={MAX_TITLE}
          placeholder="Ej.: ¡Nuevos marcos animados para DJs PRO! 🔥"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <label className="admin-broadcast-label" htmlFor="ab-body">
          Mensaje (opcional) <span>{body.length}/{MAX_BODY}</span>
        </label>
        <textarea
          id="ab-body"
          rows={4}
          maxLength={MAX_BODY}
          placeholder="Cuéntales qué hay de nuevo, un cambio importante, una fiesta destacada…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />

        {(title.trim() || body.trim()) && (
          <div className="admin-broadcast-preview">
            <span className="ab-preview-lbl">Así lo verán</span>
            <div className="notif-item app-notif kind-broadcast">
              <div className="notif-support-body">
                <span className="notif-support-tag"><Megaphone size={12} /> {title.trim() || 'Título del aviso'}</span>
                {body.trim() && <p>{body.trim()}</p>}
              </div>
            </div>
          </div>
        )}

        <div className="admin-broadcast-foot">
          <span>{roles.length ? `≈ ${approxTotal} usuarios` : 'Elige al menos un tipo'}</span>
          <button type="button" disabled={!canSend} onClick={send}>
            <Send size={14} />
            <span>{sending ? 'Enviando…' : 'Enviar aviso'}</span>
          </button>
        </div>

        {result && (
          <p className={`admin-broadcast-result ${result.ok ? 'ok' : 'err'}`}>
            {result.ok && <CheckCircle2 size={14} />} {result.text}
          </p>
        )}
      </div>

      <div className="admin-broadcast-history">
        <strong>Últimos avisos enviados</strong>
        {(adminBroadcasts || []).length === 0 ? (
          <p className="admin-empty">Todavía no has enviado ningún aviso.</p>
        ) : (
          adminBroadcasts.map((b) => (
            <div key={b.id} className="ab-history-item">
              <div>
                <strong>{b.title}</strong>
                {b.body && <p>{b.body}</p>}
              </div>
              <span>
                {(b.roles || []).join(', ')} · {b.sent_count} usuarios ·{' '}
                {new Date(b.created_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
