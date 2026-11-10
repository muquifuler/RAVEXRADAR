// src/lib/djOwnEvents.js
// Eventos propios del DJ (fiestas que no están en el mapa), guardados en
// profiles.dj_private_events (jsonb). Ver supabase/migrations/09_dj_eventos_propios.sql
export const MAX_OWN_EVENTS = 60;

export const toIsoDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const normText = (s) =>
  (s || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export const newOwnEventId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/** Limpia y valida la lista: quita las pasadas, recorta textos y ordena por fecha. */
export function sanitizeOwnEvents(list) {
  const todayIso = toIsoDate(new Date());
  return (Array.isArray(list) ? list : [])
    .filter((e) => e && /^\d{4}-\d{2}-\d{2}$/.test(e.date || '') && e.date >= todayIso && (e.name || '').trim())
    .map((e) => ({
      id: String(e.id || newOwnEventId()),
      date: e.date,
      name: String(e.name).trim().slice(0, 80),
      venue: String(e.venue || '').trim().slice(0, 80),
      street: String(e.street || '').trim().slice(0, 120),
      city: String(e.city || '').trim().slice(0, 60),
      club_id: e.club_id || null
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, MAX_OWN_EVENTS);
}
