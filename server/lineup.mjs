// lineup.mjs
// ============================================================================
// Saca el LINEUP de los eventos recopilados (Resident Advisor, Ticketmaster,
// Xceed) y lo deja con el mismo formato que el lineup que se crea en la app,
// para que se vea en el panel de la fiesta igual que uno hecho a mano.
//
//   · Si la fuente da los artistas por separado (RA → artists, Ticketmaster →
//     attractions, Xceed → lineup/artists), se usan tal cual.
//   · Si no, se busca en la descripción un bloque tipo "Line up: A, B, C" o
//     "LINEUP" seguido de nombres (también "Room 1: …", horarios "23:00-01:00").
//   · Si un nombre coincide con un DJ registrado en RAVEXRADAR, se enlaza a su
//     perfil (sale como @usuario y su fiesta aparece en su panel).
// ============================================================================

const MAX_SLOTS = 40;

// Palabras que indican que lo que viene NO es un artista
const JUNK_RE =
  /(entradas?|tickets?|ticket|info\b|informaci[oó]n|\btba\b|\btbc\b|y m[aá]s|and more|more to be|por anunciar|special guests?|invitados? especiales?|https?:|www\.|\.com\b|€|\$|\bvip\b|parking|aparcamiento|guardarropa|cloakroom|consumici[oó]n|copa|drink|reservas?|mesa|\+\s?18|mayores de|dress ?code|edad m[ií]nima|apertura|doors|horario|precio|aforo|lista\b|guestlist|descuento|promo\b|venta|ubicaci[oó]n|location|direcci[oó]n|calle\b|sold ?out|agotad)/i;

// Fin de un bloque de lineup (empieza otra sección del texto)
const STOP_RE =
  /^(entradas|tickets?|info|informaci[oó]n|horarios?|apertura|doors|dress ?code|edad|\+18|precio|prices?|venta|ubicaci[oó]n|location|direcci[oó]n|c[oó]mo llegar|how to get|condiciones|t[eé]rminos|terms|reservas?|vip|mesas?|contacto|faq|normas|rules|aviso|important)\b/i;

// Cabecera del lineup
const HEADER_RE = /(?:^|[\n.!?|•·]\s*|\s)(line[\s-]?up|lineup|cartel|artistas|artists|djs?)\s*(?:completo|oficial|:|-|–|—)?\s*[:\-–—]\s*/i;
const HEADER_LINE_RE = /^\s*[^\w\s]*\s*(line[\s-]?up|lineup|cartel|artistas|artists|djs?)\s*(completo|oficial)?\s*[^\w\s]*\s*:?\s*$/i;

// Escenarios / salas al principio de una línea: "Room 1:", "Main Room -", "Sala 2", "Terraza:"
const STAGE_RE =
  /^\s*((?:main|big|small|second|2nd|1st)?\s*(?:room|stage|sala|escenario|area|zona)\s*(?:\d+|[ivx]+|main|principal|club|[a-záéíóú]+)?|terraza|terrace|garden|jard[ií]n|club\s*room|main)\s*[:\-–—]\s*(.*)$/i;

const TIME_RE = /\b([01]?\d|2[0-3])[:.h]([0-5]\d)?\s*(?:h)?\s*[-–—a]\s*([01]?\d|2[0-3])[:.h]([0-5]\d)?\s*h?\b/i;

const pad = (n) => String(n ?? '00').padStart(2, '0');

/** Quita HTML y entidades básicas, conserva saltos de línea. */
export function htmlToText(input = '') {
  return String(input || '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h\d)\s*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const titleCase = (s) =>
  s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (m, sp, ch) => sp + ch.toUpperCase()).trim();

/** Normaliza un nombre para comparar (sin tildes, mayúsculas ni símbolos). */
export const normName = (s = '') =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^@/, '')
    .replace(/[^a-z0-9]/g, '');

/** Limpia un posible nombre de artista. Devuelve { name, set_time } o null. */
function cleanName(raw) {
  let s = String(raw || '').trim();
  if (!s) return null;

  let set_time = '';
  const t = s.match(TIME_RE);
  if (t) {
    set_time = `${pad(t[1])}:${pad(t[2] || '00')} - ${pad(t[3])}:${pad(t[4] || '00')}`;
    s = s.replace(TIME_RE, ' ');
  }

  s = s
    .replace(/^[\s\-–—•·*★☆✦►▶>»|#\d.)]+/, '') // viñetas y numeración
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ') // emojis
    .replace(/\((?:live|dj ?set|hybrid|h[ií]brido|a\/v|av|b2b|all night long|extended|closing|opening|warm ?up|[a-z]{2,3}|\d+h?)\)/gi, ' ')
    .replace(/\b(live|dj set)\s*$/i, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.;:'"“”‘’\-–—]+|[\s,.;:'"“”‘’\-–—]+$/g, '')
    .trim();

  if (!s || s.length < 2 || s.length > 40) return null;
  if (!/\p{L}/u.test(s)) return null;
  if (s.split(/\s+/).length > 6) return null;
  if (JUNK_RE.test(s)) return null;
  if (/^(local\s+)?residents?$|^residentes?(\s+locales?)?$|^djs? residentes?$|^guest$/i.test(s)) return null;
  // Frases (tienen artículos/verbos típicos en minúscula), no nombres
  if (/\b(el|la|los|las|de la|del|en|con|para|por|una?|the|with|for|from|en el|nuestro|vuelve|llega|presenta)\b/.test(s) && s.split(/\s+/).length > 3) return null;

  return { name: s, set_time };
}

/** Separa una línea en varios nombres ("A, B / C y D"). "A b2b B" se queda junto. */
function splitNames(line) {
  return String(line || '')
    .split(/\s*(?:,|\/|\||·|•|;|\n|\s+[-–—]\s+|\s+y\s+|\s+and\s+)\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Lista de nombres (de una API) → slots limpios. */
export function namesToSlots(names = [], stage = 'Main Stage') {
  const out = [];
  for (const n of names || []) {
    const c = cleanName(typeof n === 'string' ? n : n?.name || n?.title || '');
    if (c) out.push({ ...c, stage });
  }
  return mergeSlots(out);
}

/** Une listas de slots quitando repetidos (por nombre). */
export function mergeSlots(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const s of list || []) {
      const k = normName(s.name);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(s);
      if (out.length >= MAX_SLOTS) return out;
    }
  }
  return out;
}

/** Procesa las líneas de un bloque de lineup (con salas y horarios). */
function slotsFromBlockLines(lines) {
  const slots = [];
  let stage = 'Main Stage';
  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (!line) continue;
    const st = line.match(STAGE_RE);
    if (st) {
      stage = titleCase(st[1].replace(/\s+/g, ' '));
      line = st[2] || '';
      if (!line.trim()) continue;
    }
    // Horario al principio o al final de la línea ("23:00 - 01:00 Nombre")
    let lineTime = '';
    const t = line.match(TIME_RE);
    if (t) {
      lineTime = `${pad(t[1])}:${pad(t[2] || '00')} - ${pad(t[3])}:${pad(t[4] || '00')}`;
      line = line.replace(TIME_RE, ' ').trim();
    }
    const parts = splitNames(line);
    for (const part of parts) {
      const c = cleanName(part);
      if (c) slots.push({ ...c, set_time: c.set_time || (parts.length === 1 ? lineTime : ''), stage });
    }
  }
  return slots;
}

/**
 * Busca el lineup dentro de un texto.
 * @returns {{ slots: Array<{name,set_time,stage}>, text: string }}
 *   text = la descripción sin el bloque del lineup
 */
export function extractLineupFromText(input = '') {
  const text = htmlToText(input);
  if (!text) return { slots: [], text: '' };

  const lines = text.split('\n');

  // A) Cabecera sola en una línea ("LINE UP", "Line-up:") y nombres en las siguientes
  for (let i = 0; i < lines.length; i++) {
    if (!HEADER_LINE_RE.test(lines[i])) continue;
    const block = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const l = lines[j].trim();
      if (!l) {
        if (block.length) break;
        continue;
      }
      if (STOP_RE.test(l) || HEADER_LINE_RE.test(l)) break;
      block.push(l);
    }
    const slots = slotsFromBlockLines(block);
    if (slots.length) {
      const rest = [...lines.slice(0, i), ...lines.slice(j)].join('\n');
      return { slots: mergeSlots(slots), text: tidy(rest) };
    }
  }

  // B) Cabecera dentro de una frase: "Line up: A, B y C." (hasta fin de línea o de frase)
  const m = text.match(HEADER_RE);
  if (m) {
    const start = m.index + m[0].length;
    let end = text.indexOf('\n', start);
    if (end === -1) end = text.length;
    let segment = text.slice(start, end);
    // Corta donde empieza otra frase normal ("… Evento en Fabrik.", "Entradas…")
    const cut = segment.search(/\.\s+(?=(?:\p{Lu}\p{Ll}+\s+){0,1}(?:\p{Ll}{2,}\s)|(?:evento|entradas|tickets?|info|apertura|doors|una|un|el|la|los|las|this|the|join|come|ven)\b)/iu);
    if (cut > -1) segment = segment.slice(0, cut);
    const slots = slotsFromBlockLines([segment.replace(/\.\s*$/, '')]);
    if (slots.length) {
      const headerStart = m.index + m[0].search(/line|cartel|artist|dj/i);
      const before = text.slice(0, headerStart).trimEnd();
      const after = text.slice(start + segment.length).replace(/^\s*\.?\s*/, '');
      const rest = before && after ? `${before}\n\n${after}` : before || after;
      return { slots: mergeSlots(slots), text: tidy(rest) };
    }
  }

  return { slots: [], text };
}

const tidy = (s) =>
  s
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s*[.,;:]\s*/, '')
    .trim();

/** Índice de DJs registrados en RAVEXRADAR: nombre normalizado → perfil. */
export async function loadPlatformDjIndex(supabase) {
  const index = new Map();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .eq('role', 'DJ')
      .range(from, from + pageSize - 1);
    if (error) {
      console.warn('⚠️ No se pudieron leer los DJs para enlazar el lineup:', error.message);
      break;
    }
    for (const p of data || []) {
      const k = normName(p.username);
      if (k.length >= 3 && !index.has(k)) index.set(k, p);
    }
    if (!data || data.length < pageSize) break;
  }
  return index;
}

/** Slots limpios → formato de lineup de la app (enlazando DJs registrados). */
export function finalizeLineup(slots = [], djIndex = new Map(), externalId = 'ev') {
  const safeId = String(externalId).replace(/[^a-zA-Z0-9_-]/g, '');
  return (slots || []).slice(0, MAX_SLOTS).map((s, i) => {
    const dj = djIndex.get(normName(s.name));
    const stage = s.stage || 'Main Stage';
    return {
      slot_id: `slot_ext_${safeId}_${i}`,
      dj_id: dj ? dj.id : null,
      name: dj ? dj.username : s.name,
      avatar_url: dj ? dj.avatar_url || null : null,
      set_time: s.set_time || '',
      stage,
      stage_or_genre: stage,
      is_custom: !dj,
      source: 'sync'
    };
  });
}
