// src/lib/chatTime.js
// Horas de los mensajes y separadores de día al estilo WhatsApp: Hoy, Ayer, Lunes… y fecha.

const localeFor = (lang) => (lang === 'en' ? 'en-GB' : 'es-ES');
const toDate = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** "21:43" */
export const formatMsgTime = (iso, lang = 'es') => {
  const d = toDate(iso);
  return d ? d.toLocaleTimeString(localeFor(lang), { hour: '2-digit', minute: '2-digit' }) : '';
};

/** "Hoy", "Ayer", "Lunes" (última semana), "12 de octubre" o "12 de octubre de 2025" */
export const formatDayLabel = (iso, lang = 'es', now = new Date()) => {
  const d = toDate(iso);
  if (!d) return '';
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (days === 0) return lang === 'en' ? 'Today' : 'Hoy';
  if (days === 1) return lang === 'en' ? 'Yesterday' : 'Ayer';
  if (days > 1 && days < 7) {
    const w = d.toLocaleDateString(localeFor(lang), { weekday: 'long' });
    return w.charAt(0).toUpperCase() + w.slice(1);
  }
  return d.toLocaleDateString(localeFor(lang), {
    day: 'numeric',
    month: 'long',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {})
  });
};

/**
 * Convierte la lista de mensajes en una línea de tiempo con separadores de día.
 * `grouped` = mismo autor que el mensaje anterior, mismo día y menos de 5 minutos de diferencia
 * (se oculta su avatar y su nombre, como hace WhatsApp).
 */
export const buildChatTimeline = (messages = [], lang = 'es') => {
  const out = [];
  let lastDayKey = null;
  let prev = null;
  messages.forEach((m) => {
    const d = toDate(m.created_at);
    const dayKey = d ? startOfDay(d).getTime() : lastDayKey;
    if (d && dayKey !== lastDayKey) {
      out.push({ type: 'day', key: `day_${dayKey}`, label: formatDayLabel(m.created_at, lang) });
      lastDayKey = dayKey;
      prev = null;
    }
    const prevDate = prev ? toDate(prev.created_at) : null;
    const grouped = Boolean(
      prev &&
        String(prev.sender_id) === String(m.sender_id) &&
        d &&
        prevDate &&
        d - prevDate < 5 * 60 * 1000
    );
    out.push({ type: 'msg', key: m.id, msg: m, grouped });
    prev = m;
  });
  return out;
};