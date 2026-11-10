// src/components/TopEventsWidget/FriendsGoingWidget.jsx
// ----------------------------------------------------------------------------
// "Van tus amigos": fiestas próximas a las que tus amigos han marcado "Voy a ir".
// Flota en el mapa debajo (escritorio) o a la derecha (móvil) del Top Trending.
// Solo se pinta si hay sesión y al menos un amigo va a alguna fiesta futura.
// ----------------------------------------------------------------------------
import React, { useMemo, useState } from 'react';
import { Users, ChevronDown, ChevronUp } from 'lucide-react';
import { useRaveStore, evaluateEventTiming } from '../../store/useRaveStore';
import { thumbUrl } from '../Map/mapMarkerEngine';
import './FriendsGoingWidget.css';

const MAX_EVENTS = 8;
const MAX_FACES = 3;
const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function dayLabel(startMs, status) {
  if (status === 'ACTIVE') return 'Ahora';
  const d = new Date(startMs);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const that = new Date(d);
  that.setHours(0, 0, 0, 0);
  const diffDays = Math.round((that - today) / 86400000);
  if (diffDays <= 0) return 'Hoy';
  if (diffDays === 1) return 'Mañana';
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

export const FriendsGoingWidget = () => {
  const user = useRaveStore((s) => s.user);
  const friends = useRaveStore((s) => s.friends);
  const allAttendancesList = useRaveStore((s) => s.allAttendancesList);
  const events = useRaveStore((s) => s.events);
  const selectEvent = useRaveStore((s) => s.selectEvent);
  const [collapsed, setCollapsed] = useState(true);

  const items = useMemo(() => {
    if (!user?.id || !friends?.length || !allAttendancesList?.length || !events?.length) return [];

    // id de amigo → perfil
    const myId = String(user.id);
    const friendById = new Map();
    friends.forEach((f) => {
      if (f.status !== 'accepted') return;
      const mineIsRequester = String(f.requester_id) === myId;
      const otherId = String(mineIsRequester ? f.addressee_id : f.requester_id);
      const profile = (mineIsRequester ? f.addressee : f.requester) || { id: otherId };
      friendById.set(otherId, profile);
    });
    if (!friendById.size) return [];

    // evento → amigos que van
    const byEvent = new Map();
    allAttendancesList.forEach((row) => {
      const p = friendById.get(String(row.user_id));
      if (!p) return;
      const going = row.is_going ?? true;
      if (!going) return;
      if (!byEvent.has(row.event_id)) byEvent.set(row.event_id, []);
      byEvent.get(row.event_id).push({ ...p, squad: Boolean(row.looking_for_squad) });
    });
    if (!byEvent.size) return [];

    const out = [];
    events.forEach((ev) => {
      const list = byEvent.get(ev.id);
      if (!list) return;
      const timing = evaluateEventTiming(ev.start_date, ev.start_time, ev.duration_hours);
      if (timing.status === 'FINISHED') return;
      // Primero los que buscan Rave Squad, luego por nombre
      list.sort((a, b) => Number(b.squad) - Number(a.squad));
      out.push({ ev, friends: list, startMs: timing.startMs, status: timing.status });
    });
    out.sort((a, b) => a.startMs - b.startMs || b.friends.length - a.friends.length);
    return out.slice(0, MAX_EVENTS);
  }, [user?.id, friends, allAttendancesList, events]);

  if (!items.length) return null;

  const totalFriends = new Set(items.flatMap((it) => it.friends.map((f) => String(f.id)))).size;

  return (
    <aside className={`friends-going-widget ${collapsed ? 'is-collapsed' : ''}`}>
      <div
        className="fg-header"
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        onClick={() => setCollapsed(!collapsed)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setCollapsed(!collapsed)}
      >
        <div className="fg-title">
          <Users size={15} className="fg-icon" />
          <strong>Van tus amigos</strong>
          <span className="fg-count" title={`${totalFriends} amigos en ${items.length} fiestas`}>{items.length}</span>
        </div>
        <span className="fg-toggle">
          {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </span>
      </div>

      {!collapsed && (
        <div className="fg-list">
          {items.map(({ ev, friends: goers, startMs, status }) => {
            const faces = goers.slice(0, MAX_FACES);
            const extra = goers.length - faces.length;
            const anySquad = goers.some((g) => g.squad);
            const names = goers.map((g) => g.username).filter(Boolean);
            const who =
              names.length === 1
                ? names[0]
                : names.length === 2
                  ? `${names[0]} y ${names[1]}`
                  : `${names[0]} y ${names.length - 1} más`;

            return (
              <button
                type="button"
                key={ev.id}
                className={`fg-item ${status === 'ACTIVE' ? 'is-live' : ''}`}
                onClick={() => selectEvent(ev)}
                title={names.join(', ')}
              >
                <img
                  src={thumbUrl(ev.image_url) || ev.image_url}
                  data-o={ev.image_url || ''}
                  onError={(e) => {
                    const o = e.currentTarget.dataset.o;
                    if (o && e.currentTarget.src !== o) e.currentTarget.src = o;
                    else if (!e.currentTarget.dataset.f) {
                      e.currentTarget.dataset.f = '1';
                      e.currentTarget.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
                    }
                  }}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="fg-thumb"
                />
                <div className="fg-info">
                  <strong>{ev.name}</strong>
                  <div className="fg-meta">
                    <span className={`fg-day ${status === 'ACTIVE' ? 'is-live' : ''}`}>{dayLabel(startMs, status)}</span>
                    <span className="fg-who">{who}</span>
                  </div>
                </div>
                <div className={`fg-faces ${anySquad ? 'has-squad' : ''}`}>
                  {faces.map((f) => (
                    <span key={f.id} className={`fg-face ${f.squad ? 'is-squad' : ''}`} title={f.squad ? `${f.username} · Rave Squad` : f.username}>
                      {f.avatar_url ? (
                        <img src={f.avatar_url} alt="" loading="lazy" decoding="async" />
                      ) : (
                        <i>{(f.username || '?').charAt(0).toUpperCase()}</i>
                      )}
                    </span>
                  ))}
                  {extra > 0 && <span className="fg-face fg-more">+{extra}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
};

export default FriendsGoingWidget;
