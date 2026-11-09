// src/components/Map/mapMarkerEngine.js
// ============================================================================
// Motor de marcadores de alto rendimiento para RaveMap.
//
// Qué hace y por qué va rápido:
//  1. CLUSTERING propio (sin dependencias): a zoom bajo agrupa los pins cercanos
//     en una sola burbuja. Se calcula una vez por nivel de zoom y se cachea.
//  2. VIEWPORT CULLING: solo existen en el DOM los marcadores que caen dentro de
//     la pantalla (+ un margen). Fuera de pantalla = 0 nodos.
//  3. DIFF INCREMENTAL: nunca se hace clearLayers(). Cada marcador tiene una
//     clave estable; si su HTML no cambia, no se toca. Seleccionar un evento
//     solo actualiza 2 marcadores (el anterior y el nuevo), no miles.
//  4. Círculos de Secret Location en CANVAS (no SVG) y solo a zoom cercano.
//  5. Mientras el mapa se mueve añade la clase html.map-is-moving para que el
//     CSS quite el blur de los paneles flotantes y pause animaciones.
// ============================================================================
import L from 'leaflet';
import { isEventLockedSecret } from '../../store/useRaveStore';
import { getProfileFrame, frameWrapHtml } from '../../lib/avatarFrames';

// ---------------------------------------------------------------------------
// Ajustes (puedes tocarlos sin miedo)
// ---------------------------------------------------------------------------
export const MAP_PERF = {
  // Radios de agrupación en píxeles. Se usa el primero; si en pantalla hay más
  // pins que el presupuesto, se pasa al siguiente (agrupación más agresiva).
  CLUSTER_RADIUS_STEPS: [56, 80, 112],
  CLUSTER_UNTIL_ZOOM: 14,       // hasta este zoom se agrupa; desde el 15 se ven todos sueltos
  MAX_MARKERS_DESKTOP: 220,     // presupuesto de pins en pantalla (escritorio)
  MAX_MARKERS_MOBILE: 120,      // presupuesto de pins en pantalla (móvil)
  VIEWPORT_PAD: 0.2,            // margen fuera de pantalla que también se pinta (20%)
  SECRET_CIRCLE_MIN_ZOOM: 10,   // los círculos de secret location solo se dibujan de cerca
  // Miniaturas para los pins. 'wsrv' = servicio gratuito wsrv.nl (CDN) que reduce
  // cualquier imagen a ~96px en WebP: un flyer de 300 KB pasa a ~4 KB. Si falla,
  // el pin carga la imagen original. null = siempre la original.
  THUMB_PROXY: 'wsrv',
  PREFETCH_MAX: 60,             // imágenes que se precargan de la vista inicial
  // Miniaturas de Supabase Storage (Image Transformations, requiere plan Pro de Supabase).
  // Si lo activas, los pins cargan una miniatura de 96px en vez del flyer original.
  USE_SUPABASE_THUMBNAILS: false,
  THUMB_SIZE: 96
};

const DEFAULT_LAT = 40.4168;
const DEFAULT_LNG = -3.7038;
const FALLBACK_EVENT_IMG =
  'https://images.unsplash.com/photo-1574169208507-84376144848b?auto=format&fit=crop&w=200&q=80';

const LAYERS = ['clubs', 'promoters', 'djs', 'events'];

const LUCIDE_LOCK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e9d5ff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
const LUCIDE_HEADPHONES_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#ff5500" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/></svg>`;
const LUCIDE_BUILDING_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>`;
const LUCIDE_DISC_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="2"/></svg>`;
const LUCIDE_USERS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
const LUCIDE_FLAME_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`;

const CLUSTER_ICON_BY_LAYER = {
  djs: LUCIDE_HEADPHONES_SVG,
  clubs: LUCIDE_BUILDING_SVG,
  promoters: LUCIDE_DISC_SVG
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC_MAP[c]);

// Igual que el original (`dj.lat || 40.4168`): valor vacío/0 → coordenada por defecto
const coordOr = (v, fallback) => {
  const n = Number(v);
  return v && Number.isFinite(n) ? n : fallback;
};

export function thumbUrl(url) {
  if (!url) return url;
  if (MAP_PERF.THUMB_PROXY === 'wsrv' && /^https?:\/\//i.test(url)) {
    const s = MAP_PERF.THUMB_SIZE;
    return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=${s}&h=${s}&fit=cover&a=attention&output=webp&q=72`;
  }
  if (!MAP_PERF.USE_SUPABASE_THUMBNAILS) return url;
  const publicPath = '/storage/v1/object/public/';
  if (!url.includes(publicPath)) return url;
  const sep = url.includes('?') ? '&' : '?';
  const s = MAP_PERF.THUMB_SIZE;
  return `${url.replace(publicPath, '/storage/v1/render/image/public/')}${sep}width=${s}&height=${s}&resize=cover&quality=70`;
}

// La imagen se decodifica fuera del hilo principal (decoding="async"). Mientras
// llega, el propio <img> enseña un fondo fijo de "cargando" (cero animaciones);
// al cargar se quita. Si la miniatura falla, se intenta la imagen original.
const imgTag = (src, alt, cls, extra = '') => {
  const thumb = thumbUrl(src);
  const fallback = thumb !== src ? ` data-o="${esc(src)}"` : '';
  return `<img src="${esc(thumb)}"${fallback} alt="${esc(alt)}" class="${cls} pin-img" decoding="async" draggable="false" onload="this.classList.add('is-loaded')" onerror="if(this.dataset.o){this.src=this.dataset.o;this.removeAttribute('data-o')}else if(!this.classList.contains('is-failed')){this.classList.add('is-failed');this.alt='';this.src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}"${extra} />`;
};

// Precarga (descarga + decodifica) imágenes en segundo plano, sin tocar el mapa
const prefetched = new Set();
export function prefetchImage(url) {
  const u = thumbUrl(url);
  if (!u || prefetched.has(u) || typeof Image === 'undefined') return;
  prefetched.add(u);
  const img = new Image();
  img.decoding = 'async';
  img.src = u;
  if (img.decode) img.decode().catch(() => {});
}

const tierOf = (count) => (count < 10 ? 's' : count < 100 ? 'm' : 'l');

// ---------------------------------------------------------------------------
// Construcción de "items" (1 item = 1 pin potencial). Se recalcula solo cuando
// cambian los datos de esa capa, no al mover el mapa ni al seleccionar.
// ---------------------------------------------------------------------------
function buildEventItems(events, myAttendingEventIds, user, mySquadEventIds) {
  const groups = new Map();
  const keyByEventId = new Map();
  // Fiestas a las que voy / en las que busco Rave Squad (pin verde)
  const goingSet = new Set((myAttendingEventIds || []).map(String));
  const squadSet = new Set((mySquadEventIds || []).map(String));

  for (const ev of events || []) {
    const locked = isEventLockedSecret(ev, myAttendingEventIds || [], user);
    // Igual que antes: los eventos de un club registrado se ven dentro del pin del club
    if (ev.linked_club_id && !locked) continue;

    const baseLat = Number(ev.lat);
    const baseLng = Number(ev.lng);
    const lat = locked ? Number(ev.secret_lat) || baseLat + 0.007 : baseLat;
    const lng = locked ? Number(ev.secret_lng) || baseLng + 0.007 : baseLng;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue; // antes rompía Leaflet

    const coordKey = `${lat.toFixed(4)}_${lng.toFixed(4)}`;
    let g = groups.get(coordKey);
    if (!g) {
      g = { lat, lng, group: [], allLocked: true, bestRank: null, attendees: 0, hasPro: false, mine: null };
      groups.set(coordKey, g);
    }
    g.group.push(ev);
    if (!locked) g.allLocked = false;
    if (ev.trending_rank && (!g.bestRank || ev.trending_rank < g.bestRank)) g.bestRank = ev.trending_rank;
    g.attendees += ev.attendees_count || 0;
    if (ev.creator?.is_pro) g.hasPro = true;
    if (squadSet.has(String(ev.id))) g.mine = 'squad';
    else if (!g.mine && goingSet.has(String(ev.id))) g.mine = 'going';
    keyByEventId.set(String(ev.id), `ev:${coordKey}`);
  }

  const items = [];
  for (const [coordKey, g] of groups) {
    const first = g.group[0];
    items.push({
      layer: 'events',
      key: `ev:${coordKey}`,
      lat: g.lat,
      lng: g.lng,
      group: g.group,
      count: g.group.length,
      locked: g.allLocked,
      bestRank: g.bestRank,
      isPro: g.hasPro,
      mine: g.mine,
      img: first.image_url || FALLBACK_EVENT_IMG,
      name: first.name || '',
      // Prioridad dentro de un cluster: trending primero, luego fiestas de cuentas PRO,
      // luego asistentes. La de más prioridad es la portada del grupo.
      // (El pin de una fiesta NO cambia de aspecto por ser PRO.)
      // Las fiestas a las que vas van siempre primero (portada del grupo)
      priority: (g.mine ? 2e8 : 0) + (g.bestRank ? (10 - g.bestRank) * 1e7 : 0) + (g.hasPro ? 5e6 : 0) + g.attendees
    });
  }
  return { items, keyByEventId };
}

function buildProfileItems(list, layer, prefix) {
  return (list || []).map((p) => ({
    layer,
    key: `${prefix}:${p.id}`,
    lat: coordOr(p.lat, DEFAULT_LAT),
    lng: coordOr(p.lng, DEFAULT_LNG),
    data: p,
    count: 1,
    isPro: Boolean(p.is_pro),
    // Cuentas PRO primero: son el punto de referencia del grupo al agrupar
    priority:
      (p.is_pro ? 1e12 : 0) +
      (layer === 'djs'
        ? Number(p.hype_score) || 0
        : (p.events_count || 0) * 1e5 + (p.total_attendees_count || 0))
  }));
}

// ---------------------------------------------------------------------------
// Clustering greedy en espacio de píxeles (estable al hacer pan, porque usa
// coordenadas absolutas del zoom y no la posición de la pantalla).
// ---------------------------------------------------------------------------
function clusterItems(map, items, zoom, pinnedKey, radius) {
  if (zoom > MAP_PERF.CLUSTER_UNTIL_ZOOM || items.length < 2) {
    return items.map((item) => ({ type: 'single', item }));
  }

  const R = radius;
  const R2 = R * R;
  const pts = new Array(items.length);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const p = map.project([it.lat, it.lng], zoom);
    pts[i] = { it, x: p.x, y: p.y, used: false };
  }
  pts.sort((a, b) => b.it.priority - a.it.priority);

  const grid = new Map();
  for (const p of pts) {
    const k = `${Math.floor(p.x / R)}|${Math.floor(p.y / R)}`;
    const cell = grid.get(k);
    if (cell) cell.push(p);
    else grid.set(k, [p]);
  }

  const out = [];
  for (const p of pts) {
    if (p.used) continue;
    p.used = true;

    // El elemento seleccionado nunca se esconde dentro de un cluster
    if (p.it.key === pinnedKey) {
      out.push({ type: 'single', item: p.it });
      continue;
    }

    const cx = Math.floor(p.x / R);
    const cy = Math.floor(p.y / R);
    const members = [p];
    let sx = p.x;
    let sy = p.y;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cell = grid.get(`${cx + dx}|${cy + dy}`);
        if (!cell) continue;
        for (const q of cell) {
          if (q.used || q.it.key === pinnedKey) continue;
          const ddx = q.x - p.x;
          const ddy = q.y - p.y;
          if (ddx * ddx + ddy * ddy <= R2) {
            q.used = true;
            members.push(q);
            sx += q.x;
            sy += q.y;
          }
        }
      }
    }

    if (members.length === 1) {
      out.push({ type: 'single', item: p.it });
    } else {
      const center = map.unproject([sx / members.length, sy / members.length], zoom);
      out.push({
        type: 'cluster',
        key: `${p.it.key}@z${zoom}r${R}`,
        lat: center.lat,
        lng: center.lng,
        items: members.map((m) => m.it) // members[0] = el de más prioridad
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// HTML de los pins (mismas clases que antes → el CSS existente sigue valiendo)
// ---------------------------------------------------------------------------
function eventSingleHtml(it, selected) {
  const cls = [
    'marker-pin-square',
    selected ? 'marker-active' : '',
    it.bestRank ? 'marker-trending' : '',
    it.locked ? 'marker-secret' : '',
    it.mine ? 'marker-attending' : '',
    it.mine === 'squad' ? 'marker-squad' : ''
  ]
    .filter(Boolean)
    .join(' ');
  const trending = it.bestRank
    ? `<span class="trending-map-badge">${LUCIDE_FLAME_SVG}#${it.bestRank}</span>`
    : '';
  const count = it.count > 1 ? `<span class="cluster-badge">+${it.count}</span>` : '';
  // Voy a ir = pin verde (sin icono). Buscando Rave Squad = además icono de grupo abajo a la izquierda
  const mine = it.mine === 'squad'
    ? `<span class="mine-map-badge is-squad" title="Vas y buscas Rave Squad">${LUCIDE_USERS_SVG}</span>`
    : '';
  const inner = it.locked
    ? `<span class="secret-lock-emoji">${LUCIDE_LOCK_SVG}</span>`
    : imgTag(it.img, it.name, 'event-marker-img');
  return `<div class="${cls}">${trending}${count}${mine}<span class="marker-pulse-square"></span><div class="marker-core-square">${inner}</div></div>`;
}

function djSingleHtml(it, selected) {
  const dj = it.data;
  const avatar = dj.avatar_url
    ? imgTag(dj.avatar_url, dj.username, 'dj-marker-img', ' referrerpolicy="no-referrer"')
    : `<span class="dj-marker-fallback">${LUCIDE_HEADPHONES_SVG}</span>`;
    // DJ PRO con marco animado: el avatar va dentro del marco (versión ligera para el mapa)
  const frame = getProfileFrame(dj);
  const avatarBox = `<div class="dj-pin-avatar">${avatar}</div>`;
  const pin = frame
    ? frameWrapHtml(frame, avatarBox, { lite: true, uid: `m${dj.id}`, avatarUrl: dj.avatar_url })
    : avatarBox;
  return `<div class="dj-pin-wrap ${selected ? 'dj-pin-active' : ''}${it.isPro ? ' is-pro-pin' : ''}${frame ? ' has-frame' : ''}">${pin}<span class="dj-pin-label">@${esc(dj.username)}</span></div>`;
}

function venueSingleHtml(it, selected, kind) {
  const p = it.data;
  const isClub = kind === 'clubs';
  const hosted = p.events_count || 0;
  const badge = hosted > 0 ? `<span class="cluster-badge">+${hosted}</span>` : '';
  const avatar = p.avatar_url
    ? imgTag(p.avatar_url, p.username, 'event-marker-img', ' referrerpolicy="no-referrer"')
    : `<span class="dj-marker-fallback">${isClub ? LUCIDE_BUILDING_SVG : LUCIDE_DISC_SVG}</span>`;
  return `<div class="club-pin-wrap ${selected ? 'club-pin-active' : ''}${it.isPro ? ' is-pro-pin' : ''}"><div class="marker-pin-square ${isClub ? 'marker-club' : 'marker-promoter'} ${selected ? 'marker-active' : ''}">${badge}<span class="marker-pulse-square"></span><div class="marker-core-square">${avatar}</div></div><span class="${isClub ? 'club-pin-label' : 'promoter-pin-label'}">@${esc(p.username)}</span></div>`;
}

function eventClusterHtml(node, total) {
  const top = node.items[0];
  let bestRank = null;
  for (const it of node.items) {
    if (it.bestRank && (!bestRank || it.bestRank < bestRank)) bestRank = it.bestRank;
  }
  const cover = top.locked
    ? `<span class="secret-lock-emoji">${LUCIDE_LOCK_SVG}</span>`
    : imgTag(top.img, top.name, 'event-marker-img');
  const trending = bestRank
    ? `<span class="trending-map-badge">${LUCIDE_FLAME_SVG}#${bestRank}</span>`
    : '';
  const mine = node.items.find((it) => it.mine)?.mine || null;
  const hasSquad = node.items.some((it) => it.mine === 'squad');
  const mineBadge = hasSquad ? `<span class="mine-map-badge is-squad">${LUCIDE_USERS_SVG}</span>` : '';
  return `<div class="map-cluster map-cluster--events tier-${tierOf(total)}${bestRank ? ' has-trending' : ''}${mine ? ' has-mine' : ''}">${trending}${mineBadge}<div class="map-cluster-cover">${cover}</div><span class="map-cluster-count">${total}</span></div>`;
}

function profileClusterHtml(layer, total) {
  return `<div class="map-cluster map-cluster--${layer} tier-${tierOf(total)}"><div class="map-cluster-bubble">${CLUSTER_ICON_BY_LAYER[layer]}<span class="map-cluster-num">${total}</span></div></div>`;
}

const CLUSTER_SIZE = {
  events: { s: 52, m: 54, l: 58 },
  other: { s: 40, m: 46, l: 52 }
};

// ---------------------------------------------------------------------------
// Motor
// ---------------------------------------------------------------------------
export class MapMarkerEngine {
  constructor(map, handlers = {}) {
    this.map = map;
    this.handlers = handlers;

    this.markerLayer = L.layerGroup().addTo(map);
    this.circleLayer = L.layerGroup().addTo(map);
    this.circleRenderer = L.canvas({ padding: 0.5 });

    this.live = new Map(); // key -> { marker, sig, lat, lng, z }
    this.liveCircles = new Map(); // key -> { circle, item }
    this.clicks = new Map(); // key -> fn

    this.items = { events: [], djs: [], clubs: [], promoters: [] };
    this.eventKeyById = new Map();
    this.inputs = {};
    this.layers = { events: true, djs: true, clubs: true, promoters: true };
    this.selection = { eventId: null, djId: null, clubId: null, promoterId: null };
    this.clusterCache = new Map();
    this.radiusStepByZoom = new Map(); // memoria del radio elegido por zoom (evita parpadeos)
    this.raf = 0;
    this.destroyed = false;

    this._root = typeof document !== 'undefined' ? document.documentElement : null;
    this._onMoveStart = () => this._root?.classList.add('map-is-moving');
    this._onMoveEnd = () => {
      this._root?.classList.remove('map-is-moving');
      this.render();
    };
    map.on('movestart', this._onMoveStart);
    map.on('moveend', this._onMoveEnd);
  }

  setHandlers(handlers) {
    this.handlers = handlers || {};
  }

  setData({ events, djs, clubs, promoters, myAttendingEventIds, myAcceptedInviteEventIds, mySquadEventIds, user }) {
    const prev = this.inputs;
    if (
      events !== prev.events ||
      myAttendingEventIds !== prev.myAttendingEventIds ||
      mySquadEventIds !== prev.mySquadEventIds ||
      myAcceptedInviteEventIds !== prev.myAcceptedInviteEventIds ||
      user !== prev.user
    ) {
      const r = buildEventItems(events, myAttendingEventIds, user, mySquadEventIds);
      this.items.events = r.items;
      this.eventKeyById = r.keyByEventId;
    }
    if (djs !== prev.djs) this.items.djs = buildProfileItems(djs, 'djs', 'dj');
    if (clubs !== prev.clubs) this.items.clubs = buildProfileItems(clubs, 'clubs', 'club');
    if (promoters !== prev.promoters) this.items.promoters = buildProfileItems(promoters, 'promoters', 'prom');

    this.inputs = { events, djs, clubs, promoters, myAttendingEventIds, myAcceptedInviteEventIds, mySquadEventIds, user };
    this.schedule();
  }

  /**
   * Precarga en segundo plano las imágenes de los pins que se verán en una vista
   * (p. ej. a donde vuela la cámara al entrar), para que aparezcan ya cargadas.
   */
  prefetchView(center, zoom) {
    const map = this.map;
    if (!map || !center) return;
    const size = map.getSize();
    if (!size.x || !size.y) return;
    const c = map.project(center, zoom);
    const half = size.divideBy(2);
    const bounds = L.latLngBounds(map.unproject(c.subtract(half), zoom), map.unproject(c.add(half), zoom)).pad(0.15);
    const urls = [];
    for (const layer of LAYERS) {
      if (!this.layers[layer]) continue;
      for (const it of this.items[layer]) {
        if (!bounds.contains([it.lat, it.lng])) continue;
        const url = layer === 'events' ? (!it.locked ? it.img : null) : it.data?.avatar_url;
        if (url) urls.push({ url, p: it.priority || 0 });
      }
    }
    urls.sort((a, b) => b.p - a.p);
    urls.slice(0, MAP_PERF.PREFETCH_MAX).forEach((u) => prefetchImage(u.url));
  }

  setLayers(layers) {
    this.layers = { ...this.layers, ...(layers || {}) };
    this.schedule();
  }

  setSelection(selection) {
    this.selection = { ...this.selection, ...selection };
    this.schedule();
  }

  schedule() {
    if (this.raf || this.destroyed) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.render();
    });
  }

  _selectedKeys() {
    const s = this.selection;
    return {
      events: s.eventId != null ? this.eventKeyById.get(String(s.eventId)) || null : null,
      djs: s.djId != null ? `dj:${s.djId}` : null,
      clubs: s.clubId != null ? `club:${s.clubId}` : null,
      promoters: s.promoterId != null ? `prom:${s.promoterId}` : null
    };
  }

  _clusters(layer, zoom, pinned, radius) {
    const items = this.items[layer];
    const cacheKey = `${layer}|${zoom}|${radius}`;
    const c = this.clusterCache.get(cacheKey);
    if (c && c.items === items && c.pinned === pinned) return c.nodes;
    const nodes = clusterItems(this.map, items, zoom, pinned, radius);
    this.clusterCache.set(cacheKey, { items, pinned, nodes });
    return nodes;
  }

  // Nodos (pins sueltos o clusters) que caen en pantalla con un radio dado
  _visibleNodes(zoom, radius, sel, inView) {
    const out = [];
    for (const layer of LAYERS) {
      if (!this.layers[layer]) continue;
      for (const node of this._clusters(layer, zoom, sel[layer], radius)) {
        const lat = node.type === 'single' ? node.item.lat : node.lat;
        const lng = node.type === 'single' ? node.item.lng : node.lng;
        if (inView(lat, lng)) out.push({ layer, node });
      }
    }
    return out;
  }

  _budget() {
    const mobile = typeof window !== 'undefined' && window.innerWidth <= 768;
    return mobile ? MAP_PERF.MAX_MARKERS_MOBILE : MAP_PERF.MAX_MARKERS_DESKTOP;
  }

  render() {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    if (this.destroyed) return;
    const map = this.map;

    const zoom = Math.round(map.getZoom());
    const b = map.getBounds().pad(MAP_PERF.VIEWPORT_PAD);
    const S = b.getSouth();
    const N = b.getNorth();
    const W = b.getWest();
    const E = b.getEast();
    const inView = (lat, lng) => lat >= S && lat <= N && lng >= W && lng <= E;

    const sel = this._selectedKeys();
    const steps = MAP_PERF.CLUSTER_RADIUS_STEPS;
    const budget = this._budget();

    // Elegir el radio: el recordado para este zoom; más agresivo si nos pasamos
    // del presupuesto, menos si sobra mucho hueco.
    let step = Math.min(this.radiusStepByZoom.get(zoom) ?? 0, steps.length - 1);
    let visible = this._visibleNodes(zoom, steps[step], sel, inView);
    if (zoom <= MAP_PERF.CLUSTER_UNTIL_ZOOM) {
      while (visible.length > budget && step < steps.length - 1) {
        step += 1;
        visible = this._visibleNodes(zoom, steps[step], sel, inView);
      }
      while (step > 0 && visible.length < budget * 0.45) {
        const finer = this._visibleNodes(zoom, steps[step - 1], sel, inView);
        if (finer.length > budget) break;
        step -= 1;
        visible = finer;
      }
      this.radiusStepByZoom.set(zoom, step);
    }

    const nextMarkers = new Map();
    const nextCircles = new Map();
    for (const { layer, node } of visible) {
      if (node.type === 'single') {
        const it = node.item;
        nextMarkers.set(it.key, this._singleEntry(it, it.key === sel[layer]));
        if (layer === 'events' && it.locked && zoom >= MAP_PERF.SECRET_CIRCLE_MIN_ZOOM) {
          nextCircles.set(it.key, it);
        }
      } else {
        nextMarkers.set(node.key, this._clusterEntry(layer, node));
      }
    }

    this._syncMarkers(nextMarkers);
    this._syncCircles(nextCircles);
  }

  _singleEntry(it, selected) {
    const h = this.handlers;
    let html;
    let size;
    let anchor;
    let className = 'custom-rave-marker';
    let onClick;
    // Los perfiles PRO (DJ, club, promotor) quedan por encima de los demás
    let z = selected ? 1000 : it.isPro && it.layer !== 'events' ? 150 : 0;

    if (it.layer === 'events') {
      html = eventSingleHtml(it, selected);
      size = [44, 44];
      anchor = [22, 22];
      if (!selected && it.bestRank) z = 600 - it.bestRank;
      onClick = () => h.onSelectEventGroup?.(it.group, 0);
    } else if (it.layer === 'djs') {
      html = djSingleHtml(it, selected);
      size = [44, 52];
      anchor = [22, 26];
      className = 'custom-dj-marker';
      onClick = () => h.onSelectDj?.(it.data);
    } else {
      html = venueSingleHtml(it, selected, it.layer);
      size = [48, 56];
      anchor = [24, 24];
      onClick = () =>
        it.layer === 'clubs' ? h.onSelectClub?.(it.data) : h.onSelectPromoter?.(it.data);
    }

    return { key: it.key, lat: it.lat, lng: it.lng, html, sig: html, size, anchor, className, z, onClick };
  }

  _clusterEntry(layer, node) {
    let total = 0;
    for (const it of node.items) total += it.count || 1;
    const tier = tierOf(total);
    const isEvents = layer === 'events';
    const px = (isEvents ? CLUSTER_SIZE.events : CLUSTER_SIZE.other)[tier];
    const html = isEvents ? eventClusterHtml(node, total) : profileClusterHtml(layer, total);

    return {
      key: node.key,
      lat: node.lat,
      lng: node.lng,
      html,
      sig: html,
      size: [px, px],
      anchor: [px / 2, px / 2],
      className: 'map-cluster-icon',
      z: 300 + Math.min(total, 299),
      onClick: () => this._zoomIntoCluster(node)
    };
  }

  // Al pulsar un grupo:
  //  · Fiestas → acerca hasta el zoom en el que ya no se agrupa y ABRE la fiesta
  //    de la portada del grupo (la que el usuario está viendo en el icono).
  //  · DJs / clubs / promotores → acerca hasta verlos sueltos, sin abrir ninguno.
  _zoomIntoCluster(node) {
    const map = this.map;
    const unclusterZoom = MAP_PERF.CLUSTER_UNTIL_ZOOM + 1;
    const targetZoom = Math.max(Math.round(map.getZoom()) + 1, unclusterZoom);

    if (node.items[0]?.layer === 'events') {
      const top = node.items[0];
      map.flyTo([top.lat, top.lng], targetZoom, { duration: 0.8 });
      // selectEventGroup también hace su propio flyTo al mismo punto (inocuo).
      // Si no hay sesión, abre el login; el mapa igualmente se queda acercado.
      this.handlers.onSelectEventGroup?.(top.group, 0);
      return;
    }

    const bounds = L.latLngBounds(node.items.map((it) => [it.lat, it.lng]));
    map.flyTo(bounds.getCenter(), targetZoom, { duration: 0.7 });
  }

  _syncMarkers(next) {
    const layer = this.markerLayer;

    for (const [key, rec] of this.live) {
      if (!next.has(key)) {
        layer.removeLayer(rec.marker);
        this.live.delete(key);
      }
    }

    for (const [key, e] of next) {
      const rec = this.live.get(key);
      if (!rec) {
        const marker = L.marker([e.lat, e.lng], {
          icon: L.divIcon({ className: e.className, html: e.html, iconSize: e.size, iconAnchor: e.anchor }),
          zIndexOffset: e.z,
          keyboard: false
        });
        marker.on('click', () => this.clicks.get(key)?.());
        layer.addLayer(marker);
        this.live.set(key, { marker, sig: e.sig, lat: e.lat, lng: e.lng, z: e.z });
      } else {
        if (rec.sig !== e.sig) {
          rec.marker.setIcon(
            L.divIcon({ className: e.className, html: e.html, iconSize: e.size, iconAnchor: e.anchor })
          );
          rec.sig = e.sig;
        }
        if (rec.lat !== e.lat || rec.lng !== e.lng) {
          rec.marker.setLatLng([e.lat, e.lng]);
          rec.lat = e.lat;
          rec.lng = e.lng;
        }
        if (rec.z !== e.z) {
          rec.marker.setZIndexOffset(e.z);
          rec.z = e.z;
        }
      }
      this.clicks.set(key, e.onClick);
    }

    for (const key of this.clicks.keys()) {
      if (!next.has(key)) this.clicks.delete(key);
    }
  }

  _syncCircles(next) {
    for (const [key, rec] of this.liveCircles) {
      if (!next.has(key)) {
        this.circleLayer.removeLayer(rec.circle);
        this.liveCircles.delete(key);
      }
    }
    for (const [key, it] of next) {
      const rec = this.liveCircles.get(key);
      if (rec) {
        rec.item = it;
        continue;
      }
      const entry = { item: it, circle: null };
      entry.circle = L.circle([it.lat, it.lng], {
        renderer: this.circleRenderer,
        color: '#a855f7',
        fillColor: '#a855f7',
        fillOpacity: 0.2,
        radius: 1200,
        dashArray: '6, 6'
      }).on('click', () => this.handlers.onSelectEventGroup?.(entry.item.group, 0));
      this.circleLayer.addLayer(entry.circle);
      this.liveCircles.set(key, entry);
    }
  }

  destroy() {
    this.destroyed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.map.off('movestart', this._onMoveStart);
    this.map.off('moveend', this._onMoveEnd);
    this._root?.classList.remove('map-is-moving');
    this.markerLayer.clearLayers();
    this.circleLayer.clearLayers();
    this.map.removeLayer(this.markerLayer);
    this.map.removeLayer(this.circleLayer);
    this.live.clear();
    this.liveCircles.clear();
    this.clicks.clear();
  }
}
