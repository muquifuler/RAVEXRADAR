// RUTA COMPLETA: houseoftechno/src/lib/avatarFrames.js
// ============================================================================
// Marcos animados de avatar · ventaja PRO exclusiva de DJs
// ----------------------------------------------------------------------------
// Todo es SVG + CSS generado aquí (sin imágenes). Se usa en dos sitios:
//   · Mapa (mapMarkerEngine.js) → versión "lite": sin animaciones SMIL, menos
//     elementos y se pausa mientras el mapa se mueve.
//   · Panel del DJ / tarjeta de perfil / selector (AvatarFrame.jsx) → completa.
// Rendimiento: lo que gira o escala va en <div> con un SVG quieto dentro (lo
// mueve la tarjeta gráfica sin redibujar). Nada animado lleva filtros de blur.
// El catálogo es cerrado: los usuarios solo eligen una clave y un color.
// Si añades o quitas un marco, actualiza también el CHECK de la base de datos.
// ============================================================================
import './avatarFrames.css';
import { isProUser } from '../constants/proConfig';

// ---------------------------------------------------------------------------
// Colores de la web
// ---------------------------------------------------------------------------
const C = {
  yellow: '#facc15', orange: '#ff5500', cyan: '#06b6d4', rose: '#f43f5e',
  purple: '#a855f7', white: '#f4f4f5'
};
const SOLID = {
  yellow: { label: 'Amarillo', a: C.yellow, b: C.orange },
  orange: { label: 'Naranja', a: C.orange, b: C.yellow },
  cyan: { label: 'Cian', a: C.cyan, b: C.purple },
  rose: { label: 'Rosa', a: C.rose, b: C.purple },
  purple: { label: 'Morado', a: C.purple, b: C.cyan },
  white: { label: 'Blanco', a: C.white, b: '#a1a1aa' }
};
const solid = (...keys) => keys.map((k) => ({ key: k, label: SOLID[k].label, swatch: SOLID[k].a, a: SOLID[k].a, b: SOLID[k].b, c: SOLID[k].a }));
const duo = (key, label, a, b) => ({ key, label, swatch: `linear-gradient(90deg,${a} 50%,${b} 50%)`, a, b, c: a });
const tri = { key: 'tri', label: 'Tricolor', swatch: `conic-gradient(${C.yellow} 0 33%,${C.cyan} 0 66%,${C.rose} 0)`, a: C.yellow, b: C.cyan, c: C.rose };
const mono = (k) => ({ key: k, label: SOLID[k].label, swatch: SOLID[k].a, a: SOLID[k].a, b: SOLID[k].a, c: SOLID[k].a });

export const AVATAR_FRAMES = [
  {
    key: 'crown', name: 'Corona de Fundador', founderOnly: true,
    colors: solid('yellow', 'cyan', 'rose', 'purple', 'white')
  },
  { key: 'radar', name: 'Radar', colors: solid('yellow', 'cyan', 'rose', 'purple', 'orange') },
  { key: 'bolt', name: 'Rayos', colors: solid('yellow', 'cyan', 'purple', 'rose', 'white') },
  { key: 'glitch', name: 'Glitch', colors: [duo('rgb', 'Rosa y cian', C.rose, C.cyan), duo('brand', 'Amarillo y morado', C.yellow, C.purple), duo('acid', 'Naranja y cian', C.orange, C.cyan)] },
  { key: 'neon', name: 'Neón', colors: [duo('club', 'Rosa y cian', '#ff2bd6', '#22d3ee'), duo('brand', 'Amarillo y naranja', C.yellow, C.orange), duo('purple', 'Morado y rosa', C.purple, C.rose), duo('ice', 'Cian y blanco', C.cyan, C.white)] },
  { key: 'eq', name: 'Ecualizador', colors: [duo('fire', 'Naranja y amarillo', C.orange, C.yellow), duo('ice', 'Morado y cian', C.purple, C.cyan), duo('pink', 'Morado y rosa', C.purple, C.rose), duo('mono', 'Blanco', '#a1a1aa', C.white)] },
  { key: 'scope', name: 'Onda sonora', isNew: true, colors: solid('yellow', 'cyan', 'rose', 'purple', 'orange') },
  { key: 'pulse', name: 'Latido 128', isNew: true, colors: solid('rose', 'yellow', 'cyan', 'purple', 'white') },
  { key: 'hazard', name: 'Industrial', isNew: true, colors: solid('yellow', 'orange', 'cyan', 'rose', 'white') },
  { key: 'led', name: 'Anillo LED', isNew: true, colors: solid('yellow', 'cyan', 'rose', 'purple', 'orange') },
  { key: 'tunnel', name: 'Túnel VJ', isNew: true, colors: solid('purple', 'yellow', 'cyan', 'rose', 'orange') },
  { key: 'target', name: 'Mira', isNew: true, colors: solid('yellow', 'cyan', 'rose', 'white', 'orange') },
  { key: 'pin', name: 'Pin RAVEXRADAR', isNew: true, colors: solid('yellow', 'orange', 'cyan', 'rose', 'purple') },
  { key: 'waves', name: 'Ondas', colors: solid('yellow', 'cyan', 'rose', 'purple', 'orange') },
  { key: 'vinyl', name: 'Vinilo', colors: solid('yellow', 'orange', 'cyan', 'rose', 'purple') },
  { key: 'laser', name: 'Láser', colors: [tri, mono('yellow'), mono('cyan'), mono('rose')] },
  { key: 'orbit', name: 'Órbitas', colors: [tri, mono('yellow'), mono('cyan'), mono('rose')] },
  {
    key: 'gold', name: 'Metal PRO',
    colors: [
      { key: 'gold', label: 'Oro', swatch: 'linear-gradient(135deg,#fff3b0,#facc15,#8a6200)' },
      { key: 'silver', label: 'Plata', swatch: 'linear-gradient(135deg,#ffffff,#d4d4d8,#52525b)' },
      { key: 'rose', label: 'Oro rosa', swatch: 'linear-gradient(135deg,#ffe4e6,#fb7185,#9f1239)' }
    ]
  },
  { key: 'seal', name: 'Sello RAVEXRADAR', colors: solid('yellow', 'cyan', 'rose', 'white') }
];

export const AVATAR_FRAME_KEYS = AVATAR_FRAMES.map((f) => f.key);
const BY_KEY = Object.fromEntries(AVATAR_FRAMES.map((f) => [f.key, f]));

/** Devuelve { key, color } válido o null. El color cae al primero si no es válido. */
export function normalizeFrame(key, color) {
  const def = BY_KEY[key];
  if (!def) return null;
  if (!def.colors) return { key, color: null };
  const ok = def.colors.some((c) => c.key === color);
  return { key, color: ok ? color : def.colors[0].key };
}

/** ¿Puede este perfil llevar ese marco? Corona: DJs fundadores. Resto: DJs PRO. */
export function canUseFrame(profile, key) {
  if (!profile || profile.role !== 'DJ' || !BY_KEY[key]) return false;
  if (BY_KEY[key].founderOnly) return Boolean(profile.is_founder);
  return isProUser(profile);
}

/** Marco que se debe MOSTRAR para un perfil (null si no tiene o no puede llevarlo). */
export function getProfileFrame(profile) {
  const fr = profile ? normalizeFrame(profile.avatar_frame, profile.avatar_frame_color) : null;
  return fr && canUseFrame(profile, fr.key) ? fr : null;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const f2 = (n) => +n.toFixed(2);
const safeId = (s) => String(s || 'f').replace(/[^a-zA-Z0-9_-]/g, '');
const escAttr = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Aleatorio con semilla: el mismo marco sale siempre igual (el mapa compara el HTML)
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Coordenadas en el lienzo 200x200 (el avatar es el círculo central de radio 60)
const polar = (r, deg) => {
  const a = (deg * Math.PI) / 180;
  return [f2(100 + r * Math.sin(a)), f2(100 - r * Math.cos(a))];
};
const svg = (inner, cls = '', style = '') =>
  `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"${cls ? ` class="${cls}"` : ''}${style ? ` style="${style}"` : ''}>${inner}</svg>`;
// Capa que gira entera (la mueve la tarjeta gráfica)
const rot = (inner, d, extra = '') => `<div class="rrf-rot${extra}" style="--d:${d}s">${svg(inner)}</div>`;
const ring = (r, col, w, op = 1) => `<circle cx="100" cy="100" r="${r}" fill="none" stroke="${col}" stroke-width="${w}"${op !== 1 ? ` opacity="${op}"` : ''}/>`;
const polyPath = (pts, close = true) => 'M' + pts.map((p) => p.join(' ')).join(' L') + (close ? ' Z' : '');

// Rayo en zigzag desde el borde hacia fuera (dibujado hacia arriba y luego rotado)
function boltPath(R) {
  let x = 100;
  let y = 39;
  const pts = [[x, y]];
  const end = 100 - (92 + R() * 14);
  const steps = 6 + Math.floor(R() * 3);
  for (let i = 1; i <= steps; i++) {
    y = 39 - (39 - end) * (i / steps);
    x = 100 + (R() - 0.5) * 26 * Math.min(1, i / 2);
    pts.push([f2(x), f2(y)]);
  }
  let d = 'M' + pts.map((p) => p.join(' ')).join(' L');
  const bi = 2 + Math.floor(R() * 2);
  const [bx, by] = pts[bi];
  const dir = R() < 0.5 ? -1 : 1;
  d += ` M${bx} ${by} L${f2(bx + dir * (6 + R() * 6))} ${f2(by - 7 - R() * 4)} L${f2(bx + dir * (12 + R() * 8))} ${f2(by - 14 - R() * 6)}`;
  return d;
}

function arcPath(R, a0, span) {
  const n = 10;
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(polar(63 + (R() - 0.5) * 9, a0 + (span * i) / n));
  return polyPath(pts, false);
}

// Onda circular tipo osciloscopio
function scopePath(seed, amp) {
  const R = rng(seed);
  const k1 = 9 + Math.floor(R() * 5);
  const k2 = 17 + Math.floor(R() * 7);
  const p1 = R() * 6.28;
  const p2 = R() * 6.28;
  const pts = [];
  for (let i = 0; i < 144; i++) {
    const t = (i / 144) * Math.PI * 2;
    const r = 67 + amp * (0.62 * Math.sin(k1 * t + p1) + 0.38 * Math.sin(k2 * t + p2));
    pts.push(polar(r, (i / 144) * 360));
  }
  return polyPath(pts);
}

// Electrocardiograma alrededor del aro: 4 latidos por vuelta
function ecgPath() {
  const beat = [[0, 0], [0.36, 0], [0.4, 2.2], [0.44, 0], [0.5, 0], [0.52, -4], [0.555, 17], [0.59, -7], [0.62, 0], [0.74, 0], [0.8, 3.2], [0.86, 0], [1, 0]];
  const pts = [];
  for (let b = 0; b < 4; b++) {
    beat.forEach(([t, dr], i) => {
      if (b > 0 && i === 0) return;
      pts.push(polar(66 + dr, (b + t) * 90));
    });
  }
  return polyPath(pts);
}

// ---------------------------------------------------------------------------
// Dibujo de cada marco → { under, over }
// c = { a, b, c } colores de la variante elegida
// ---------------------------------------------------------------------------
// Corona de neón (lienzo 120x90): 3 picos geométricos + banda, en línea de luz
const CROWN_BODY = 'M14 70 L9 26 L37 49 L60 12 L83 49 L111 26 L106 70 Z';
const CROWN_BAND = 'M14 70 L106 70 L103 83 L17 83 Z';
const CROWN_OUTLINE = 'M17 83 L14 70 L9 26 L37 49 L60 12 L83 49 L111 26 L106 70 L103 83 Z';
const diamond = (x, y, r) => `M${x} ${y - r} L${x + r} ${y} L${x} ${y + r} L${x - r} ${y} Z`;

const RENDER = {
  crown({ id, lite, c }) {
    // Corona de neón ladeada sobre la foto, con el estilo de la web: tubo de luz
    // del color elegido, cristal oscuro dentro y un destello que recorre el borde.
    // Lo animado son capas (las mueve la tarjeta gráfica) y un trazo pequeño.
    const col = c.a;
    const tips = [[9, 26, 5.5], [60, 12, 6.5], [111, 26, 5.5]];
    const tipsD = tips.map(([x, y, r]) => diamond(x, y, r)).join(' ');
    const facets = 'M37 49 L41 70 M83 49 L79 70 M60 12 L60 40';
    const base = `<defs>
        <linearGradient id="cf${id}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${col}" stop-opacity=".42"/>
          <stop offset=".55" stop-color="#0b0b10" stop-opacity=".72"/>
          <stop offset="1" stop-color="#0b0b10" stop-opacity=".88"/>
        </linearGradient>
      </defs>
      <g transform="translate(2.5 3.5)" opacity=".5"><path d="${CROWN_BODY}" fill="#000"/><path d="${CROWN_BAND}" fill="#000"/></g>
      <path d="${CROWN_BODY}" fill="url(#cf${id})"/>
      <path d="${CROWN_BAND}" fill="#0b0b10" fill-opacity=".85"/>
      <path d="${facets}" stroke="${col}" stroke-width="1.2" opacity=".45" stroke-linecap="round"/>
      <path d="${CROWN_OUTLINE} M14 70 L106 70" fill="none" stroke="${col}" stroke-width="3.4" stroke-linejoin="round" opacity=".75"/>
      <path d="${CROWN_OUTLINE} M14 70 L106 70" fill="none" stroke="#ffffff" stroke-width="1.3" stroke-linejoin="round" opacity=".9"/>
      <path d="${tipsD}" fill="${col}" stroke="#ffffff" stroke-width="1.2"/>
      <path d="${diamond(60, 76.5, 5)}" fill="${col}" stroke="#ffffff" stroke-width="1.2"/>
      <circle cx="40" cy="76.5" r="1.8" fill="#ffffff" opacity=".85"/>
      <circle cx="80" cy="76.5" r="1.8" fill="#ffffff" opacity=".85"/>`;
    // Halo de neón (capa aparte que parpadea suave)
    const glow = `<path d="${CROWN_OUTLINE} M14 70 L106 70" fill="none" stroke="${col}" stroke-width="9" stroke-linejoin="round" opacity=".28"/>
      <path d="${tipsD}" fill="${col}" opacity=".35"/>`;
    // Destello que recorre el contorno
    const scan = lite ? '' : `<path class="rrf-crown-scan" d="${CROWN_OUTLINE}" pathLength="100" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="9 91"/>`;
    const crownSvg = (inner) => `<svg viewBox="0 0 120 90" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">${inner}</svg>`;
    const sparkle = (x, y, s, dl) =>
      `<path class="rrf-twinkle" style="--dl:${dl}s" d="M${x} ${y - s} Q${x} ${y} ${x + s} ${y} Q${x} ${y} ${x} ${y + s} Q${x} ${y} ${x - s} ${y} Q${x} ${y} ${x} ${y - s}Z" fill="#ffffff"/>`;
    const ringSvg = `<defs><filter id="cgl${id}" filterUnits="userSpaceOnUse" x="-20" y="-20" width="240" height="240"><feGaussianBlur stdDeviation="5"/></filter></defs>
      <circle cx="100" cy="100" r="63" fill="none" stroke="${col}" stroke-width="9" opacity=".3" filter="url(#cgl${id})"/>
      <circle cx="100" cy="100" r="61.8" fill="none" stroke="${col}" stroke-width="3.2"/>
      <circle cx="100" cy="100" r="61.8" fill="none" stroke="#ffffff" stroke-width="1" opacity=".75"/>
      <circle cx="100" cy="100" r="68" fill="none" stroke="${col}" stroke-width="1" opacity=".35" stroke-dasharray="2 6"/>`;
    return {
      under: svg(ringSvg),
      over: `<div class="rrf-crown"><div class="rrf-crown-bob">
          <div class="rrf-crown-glow">${crownSvg(glow)}</div>
          ${crownSvg(base + scan)}
        </div></div>${lite ? '' : svg(`${sparkle(150, 40, 6, 0)}${sparkle(32, 128, 4.5, -0.9)}${sparkle(166, 142, 4.5, -1.6)}`)}`
    };
  },

  radar({ c }) {
    let bl = '';
    [[150, 62, 0.5], [44, 128, 1.4], [138, 154, 2.0]].forEach(([x, y, t]) => {
      bl += `<circle class="rrf-blip" style="--dl:${f2(-2.6 + t)}s" cx="${x}" cy="${y}" r="3" fill="${c.a}"/>`;
    });
    const inner = `${ring(96, c.a, 1, 0.35).replace('/>', ' stroke-dasharray="2 5"/>')}${ring(80, c.a, 1, 0.25)}
      <path d="M100 2 V18 M100 182 V198 M2 100 H18 M182 100 H198" stroke="${c.a}" stroke-width="1.5" opacity=".5"/>
      ${bl}${ring(62, c.a, 3.5)}`;
    return { under: `<div class="rrf-sweep" style="--fc:${c.a}"></div>${svg(inner)}` };
  },

  bolt({ id, lite, c }) {
    const col = c.a;
    const R = rng(29);
    const K = lite ? 4 : 8;
    let bolts = '';
    let arcs = '';
    // Sin blur en lo animado: el brillo son tres trazos (ancho suave, medio y núcleo blanco)
    const strokes = (d, an) => `<path d="${d}" fill="none" stroke="${col}" stroke-width="9" stroke-linejoin="round" stroke-linecap="round" opacity=".22">${an}</path>
      <path d="${d}" fill="none" stroke="${col}" stroke-width="4.5" stroke-linejoin="round" stroke-linecap="round" opacity=".6">${an}</path>
      <path d="${d}" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">${an}</path>`;
    for (let k = 0; k < K; k++) {
      const a = f2((k * 360) / K + R() * 30);
      const shapes = [0, 1, 2, 3].map(() => boltPath(R));
      const d = f2(1.1 + R() * 1.3);
      const dl = f2(-R() * d);
      const an = lite ? '' : `<animate attributeName="d" values="${shapes.join(';')}" dur="0.24s" calcMode="discrete" repeatCount="indefinite"/>`;
      bolts += `<g transform="rotate(${a} 100 100)"><g class="rrf-zap" style="--d:${d}s;--dl:${dl}s">${strokes(shapes[0], an)}</g></g>`;
    }
    for (let k = 0; k < 3; k++) {
      const shapes = [0, 1, 2].map(() => arcPath(R, k * 120, 55));
      const an = lite ? '' : `<animate attributeName="d" values="${shapes.join(';')}" dur="0.3s" calcMode="discrete" repeatCount="indefinite"/>`;
      arcs += `<path d="${shapes[0]}" fill="none" stroke="${col}" stroke-width="4" opacity=".45">${an}</path><path d="${shapes[0]}" fill="none" stroke="#fff" stroke-width="1.3">${an}</path>`;
    }
    const glow = `<defs><filter id="zg${id}" filterUnits="userSpaceOnUse" x="-40" y="-40" width="280" height="280"><feGaussianBlur stdDeviation="7"/></filter></defs>
      ${ring(64, col, 10, 0.5).replace('/>', ` filter="url(#zg${id})"/>`)}`;
    return {
      under: `${svg(glow, 'rrf-zring')}${svg(bolts)}${rot(arcs, lite ? 4 : 2.2)}${svg(ring(61.5, col, 3))}`
    };
  },

  glitch({ lite, avatarUrl, c }) {
    const R = rng(5);
    const cols = [c.a, c.b, '#ffffff', C.yellow, c.b, c.a];
    let bars = '';
    for (let i = 0; i < (lite ? 3 : 6); i++) {
      const y = f2(20 + R() * 160);
      const h = f2(2 + R() * 6);
      const x = f2(-10 + R() * 60);
      const w = f2(80 + R() * 90);
      bars += `<rect class="rrf-gbar" style="--dl:${f2(-R() * 0.3)}s" x="${x}" y="${y}" width="${w}" height="${h}" fill="${cols[i]}" opacity=".9"/>`;
    }
    const rings = `<circle class="rrf-gx-r" cx="100" cy="100" r="66" fill="none" stroke="${c.a}" stroke-width="6" style="mix-blend-mode:screen"/>
      <circle class="rrf-gx-c" cx="100" cy="100" r="66" fill="none" stroke="${c.b}" stroke-width="6" style="mix-blend-mode:screen"/>
      <circle class="rrf-gx-w" cx="100" cy="100" r="66" fill="none" stroke="#fff" stroke-width="2.4"/>`;
    const slice = avatarUrl ? `<img src="${escAttr(avatarUrl)}" alt="" referrerpolicy="no-referrer" loading="lazy">` : '';
    return {
      under: `<div class="rrf-gh rrf-gh-r" style="background:${c.a}"></div><div class="rrf-gh rrf-gh-c" style="background:${c.b}"></div>${svg(rings)}`,
      over: `<div class="rrf-gs">${slice}</div>${svg(bars)}`
    };
  },

  neon({ c }) {
    const inner = `<circle class="rrf-neon-b" cx="100" cy="100" r="74" fill="none" stroke="${c.b}" stroke-width="2.5"/>
      <circle class="rrf-neon-a" cx="100" cy="100" r="65" fill="none" stroke="${c.a}" stroke-width="5"/>
      ${ring(65, '#fff', 1.4, 0.8)}`;
    return { under: svg(inner, '', `--na:${c.a};--nb:${c.b}`) };
  },

  eq({ id, lite, c }) {
    const N = lite ? 14 : 40;
    const beat = 0.469; // 128 BPM
    let b = '';
    for (let i = 0; i < N; i++) {
      const deg = (i * 360) / N;
      const j = Math.min(i, N - i);
      const low = (1 - Math.cos((deg * Math.PI) / 180)) / 2;
      const H = f2(12 + 18 * low + ((j * 7) % 5));
      const d = [beat / 2, beat, beat * 0.75][j % 3];
      const dl = f2(-((j * 0.061) % d));
      const w = lite ? 8 : 4.6;
      b += `<g transform="rotate(${f2(deg)} 100 100) translate(100 37)"><rect class="rrf-bar" style="--d:${f2(d)}s;--dl:${dl}s" x="${-w / 2}" y="${-H}" width="${w}" height="${H}" rx="${w / 2}" fill="url(#eg${id})"/></g>`;
    }
    const glow = `<defs><filter id="eb${id}" filterUnits="userSpaceOnUse" x="-20" y="-20" width="240" height="240"><feGaussianBlur stdDeviation="5"/></filter></defs>
      ${ring(64, c.a, 8, 0.35).replace('/>', ` filter="url(#eb${id})"/>`)}`;
    const bars = `<defs><linearGradient id="eg${id}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${c.a}"/><stop offset=".65" stop-color="${c.b}"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs>${b}`;
    return {
      under: `${lite ? '' : svg(glow)}${svg(bars)}${svg(`<circle class="rrf-beat-ring" cx="100" cy="100" r="61.5" fill="none" stroke="${c.b}" stroke-width="3"/>`)}`
    };
  },

  // ---------- NUEVOS ----------
  scope({ lite, c }) {
    // Dos ondas tipo osciloscopio que se deforman (panel) y giran en sentidos opuestos
    const A = [1, 2, 3, 4].map((s) => scopePath(s * 7, 6.5));
    const B = [5, 6, 7, 8].map((s) => scopePath(s * 11, 4.5));
    const morph = (arr, dur) => (lite ? '' : `<animate attributeName="d" values="${[...arr, arr[0]].join(';')}" dur="${dur}s" repeatCount="indefinite"/>`);
    const wave = (arr, col, w, dur) => `<path d="${arr[0]}" fill="none" stroke="${col}" stroke-width="${w * 3}" stroke-linejoin="round" opacity=".18">${morph(arr, dur)}</path>
      <path d="${arr[0]}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linejoin="round">${morph(arr, dur)}</path>`;
    return {
      under: `${rot(wave(B, c.b, 1.6, 1.9), 9, ' rev')}${rot(wave(A, c.a, 2.2, 1.3), 6)}${svg(ring(61.5, c.a, 2.5))}`
    };
  },

  pulse({ c }) {
    // Línea de electrocardiograma: un destello recorre el aro y cada pico cae en el beat (128 BPM)
    const d = ecgPath();
    const inner = `<path d="${d}" fill="none" stroke="${c.a}" stroke-width="1.6" stroke-linejoin="round" opacity=".25"/>
      <path class="rrf-ecg" d="${d}" pathLength="1000" fill="none" stroke="${c.a}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="150 850" opacity=".25"/>
      <path class="rrf-ecg" d="${d}" pathLength="1000" fill="none" stroke="${c.a}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="150 850"/>
      <path class="rrf-ecg" d="${d}" pathLength="1000" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="0 132 18 850"/>`;
    return {
      under: `${svg(inner)}${svg(`<circle class="rrf-beat-ring" cx="100" cy="100" r="61.5" fill="none" stroke="${c.a}" stroke-width="3"/>`)}`
    };
  },

  hazard({ lite, c }) {
    // Cinta industrial girando + remaches + dos balizas
    let rivets = '';
    for (const deg of [45, 135, 225, 315]) {
      const [x, y] = polar(86, deg);
      rivets += `<circle cx="${x}" cy="${y}" r="3.2" fill="#27272a" stroke="#52525b" stroke-width="1"/><circle cx="${f2(x - 0.8)}" cy="${f2(y - 0.8)}" r="1" fill="#a1a1aa"/>`;
    }
    const frame = `${ring(78, '#0b0b10', 3)}${ring(78, c.a, 1, 0.7)}${ring(61.5, '#0b0b10', 4)}${ring(61.5, c.a, 2)}${rivets}`;
    const beacons = lite ? '' : `<div class="rrf-beacon" style="--bc:${c.a};left:6%;top:44%"></div><div class="rrf-beacon" style="--bc:${c.a};right:6%;top:44%;animation-delay:-.6s"></div>`;
    return { under: `<div class="rrf-hz" style="--hc:${c.a}"></div>${svg(frame)}${beacons}` };
  },

  led({ lite, c }) {
    const N = 40;
    let dim = '';
    let lit = '';
    let lit2 = '';
    for (let i = 0; i < N; i++) {
      const [x, y] = polar(73, (i * 360) / N);
      dim += `<circle cx="${x}" cy="${y}" r="2.6" fill="${c.a}" opacity=".16"/>`;
      lit += `<circle cx="${x}" cy="${y}" r="5.5" fill="${c.a}" opacity=".28"/><circle cx="${x}" cy="${y}" r="2.8" fill="${c.a}"/><circle cx="${x}" cy="${y}" r="1.2" fill="#fff"/>`;
      lit2 += `<circle cx="${x}" cy="${y}" r="5" fill="${c.b}" opacity=".25"/><circle cx="${x}" cy="${y}" r="2.6" fill="${c.b}"/>`;
    }
    const base = `${ring(84, '#27272a', 1.5)}${dim}${ring(61.5, c.a, 2.5)}`;
    return {
      under: `${svg(base)}<div class="rrf-led" style="--d:1.6s;--n:${N}">${svg(lit)}</div>${lite ? '' : `<div class="rrf-led rrf-led-b" style="--d:3.2s;--n:${N}">${svg(lit2)}</div>`}`
    };
  },

  tunnel({ lite, c }) {
    // Hexágonos que vienen desde fuera y se meten en el avatar (bucle de VJ)
    const hex = (col) => {
      const pts = [0, 60, 120, 180, 240, 300].map((d) => polar(64, d + 30));
      return svg(`<path d="${polyPath(pts)}" fill="none" stroke="${col}" stroke-width="2.6" stroke-linejoin="round"/>`);
    };
    const n = lite ? 3 : 5;
    let out = '';
    for (let i = 0; i < n; i++) out += `<div class="rrf-hex" style="--dl:${f2((-1.876 / n) * i)}s">${hex(i % 2 ? c.b : c.a)}</div>`;
    return { under: `${out}${svg(ring(61.5, c.a, 2.5))}` };
  },

  target({ c }) {
    // Mira tipo HUD: aro de marcas girando + corchetes que "fijan" el objetivo
    let ticks = '';
    for (let i = 0; i < 72; i++) {
      const long = i % 6 === 0;
      const [x1, y1] = polar(84, i * 5);
      const [x2, y2] = polar(long ? 92 : 88, i * 5);
      ticks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c.a}" stroke-width="${long ? 1.6 : 0.9}" opacity="${long ? 0.8 : 0.45}"/>`;
    }
    const arc = (deg) => {
      const [x0, y0] = polar(73, deg - 16);
      const [x1, y1] = polar(73, deg + 16);
      return `<path d="M${x0} ${y0} A73 73 0 0 1 ${x1} ${y1}" fill="none" stroke="${c.a}" stroke-width="3.5" stroke-linecap="round"/>`;
    };
    const brackets = [45, 135, 225, 315].map(arc).join('');
    const cross = `<path d="M100 22 V32 M100 168 V178 M22 100 H32 M168 100 H178" stroke="${c.a}" stroke-width="2" stroke-linecap="round"/>`;
    const [rx, ry] = polar(92, 38);
    return {
      under: `${rot(ticks, 12)}<div class="rrf-lock">${svg(brackets)}</div>${svg(`${cross}${ring(61.5, c.a, 2.5)}<circle class="rrf-rec" cx="${rx}" cy="${ry}" r="3.4" fill="${C.rose}"/>`)}`
    };
  },

  pin({ c }) {
    // El pin del logo dando vueltas alrededor del avatar, con estela
    let trail = '';
    const T = 10;
    for (let k = 0; k < T; k++) {
      const [x0, y0] = polar(76, -6 - 7 * (k + 1));
      const [x1, y1] = polar(76, -6 - 7 * k);
      trail += `<path d="M${x0} ${y0} A76 76 0 0 1 ${x1} ${y1}" fill="none" stroke="${c.a}" stroke-width="${f2(3 * (1 - k / T) + 0.4)}" stroke-linecap="round" opacity="${f2(0.9 * (1 - k / T))}"/>`;
    }
    const s = 0.3;
    const pin = `<g transform="translate(${f2(100 - 60 * s)} ${f2(30 - 106 * s)}) scale(${s})">
      <path d="M60 106 C44 88 30 72 30 50 A30 30 0 0 1 90 50 C90 72 76 88 60 106 Z M60 37 A13 13 0 1 0 60 63 A13 13 0 1 0 60 37 Z" fill="${c.a}" fill-rule="evenodd" stroke="#0b0b10" stroke-width="4"/>
      <circle cx="60" cy="50" r="6" fill="${c.a}"/></g>`;
    const base = `${ring(76, c.a, 1, 0.25).replace('/>', ' stroke-dasharray="2 4"/>')}${ring(61.5, c.a, 3)}`;
    return {
      under: `${svg(base)}${rot(`${trail}<ellipse cx="100" cy="31" rx="8" ry="2.4" fill="none" stroke="${c.a}" stroke-width="1.2" opacity=".6"/>${pin}`, 3.6)}`
    };
  },

  // ---------- RESTO ----------
  waves({ c }) {
    let w = '';
    for (let i = 0; i < 4; i++) w += `<div class="rrf-wv" style="--dl:${f2(-i * 0.469)}s;border-color:${c.a}"></div>`;
    return { under: `${w}${svg(`${ring(62, c.a, 3.5)}${ring(66, c.b, 1, 0.6)}`)}` };
  },

  vinyl({ lite, c }) {
    let g = '';
    for (let r = 64; r <= 94; r += lite ? 4 : 2.2) g += ring(f2(r), '#1d1d24', 0.8);
    const disc = `<circle cx="100" cy="100" r="96" fill="#0c0c0f" stroke="#2a2a33" stroke-width="1.5"/>${g}${ring(74, '#2c2c36', 1.6)}${ring(85, '#2c2c36', 1.6)}`;
    const label = `<circle cx="100" cy="100" r="63" fill="none" stroke="${c.a}" stroke-width="4.5" stroke-dasharray="14 3"/><circle cx="100" cy="11" r="2" fill="${c.a}"/>`;
    return { under: `${svg(disc)}${rot(label, 1.8)}<div class="rrf-vsheen"></div>` };
  },

  laser({ id, c }) {
    // Cada abanico es una capa que gira (sin blur: el brillo es un haz ancho translúcido)
    const fan = (n, spread, col, base, a0, a1, d, dl) => {
      let s = '';
      for (let i = 0; i < n; i++) {
        const ang = base + (i - (n - 1) / 2) * spread;
        const [w1, w2] = [polar(104, ang - 2.6), polar(104, ang + 2.6)];
        const [x1, y1] = polar(104, ang - 0.8);
        const [x2, y2] = polar(104, ang + 0.8);
        s += `<polygon points="100,100 ${w1.join(',')} ${w2.join(',')}" fill="url(#lgw${id}${col.slice(1)})"/><polygon points="100,100 ${x1},${y1} ${x2},${y2}" fill="url(#lg${id}${col.slice(1)})"/>`;
      }
      const grad = `<defs><radialGradient id="lg${id}${col.slice(1)}" cx="100" cy="100" r="104" gradientUnits="userSpaceOnUse"><stop offset=".55" stop-color="${col}"/><stop offset=".8" stop-color="${col}" stop-opacity=".8"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient>
        <radialGradient id="lgw${id}${col.slice(1)}" cx="100" cy="100" r="104" gradientUnits="userSpaceOnUse"><stop offset=".55" stop-color="${col}" stop-opacity=".22"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient></defs>`;
      return `<div class="rrf-fan" style="--a0:${a0}deg;--a1:${a1}deg;--d:${d}s;--dl:${dl}s">${svg(grad + s)}</div>`;
    };
    return {
      under: fan(5, 13, c.a, 0, -40, 40, 1.9, 0) + fan(4, 16, c.b, 180, 35, -35, 2.3, -0.7) + fan(3, 20, c.c, 90, -60, 60, 3.1, -1.3) + svg(ring(61.5, '#fafafa', 2.5))
    };
  },

  orbit({ c }) {
    const comet = (r, col, d, rev) => {
      let s = '';
      const T = 12;
      const len = 80;
      for (let k = 0; k < T; k++) {
        const a0 = -((len * (k + 1)) / T);
        const a1 = -((len * k) / T);
        const [x0, y0] = polar(r, rev ? -a0 : a0);
        const [x1, y1] = polar(r, rev ? -a1 : a1);
        s += `<path d="M${x0} ${y0} A${r} ${r} 0 0 ${rev ? 0 : 1} ${x1} ${y1}" fill="none" stroke="${col}" stroke-width="${f2(3.2 * (1 - k / T) + 0.4)}" stroke-linecap="round" opacity="${f2(1 - k / T)}"/>`;
      }
      const [hx, hy] = polar(r, 0);
      s += `<circle cx="${hx}" cy="${hy}" r="7.5" fill="${col}" opacity=".25"/><circle cx="${hx}" cy="${hy}" r="5" fill="${col}" opacity=".55"/><circle cx="${hx}" cy="${hy}" r="3" fill="#fff"/>`;
      return rot(s, d, rev ? ' rev' : '');
    };
    const tracks = `${ring(70, c.a, 0.8, 0.25)}${ring(81, c.b, 0.8, 0.2)}${ring(92, c.c, 0.8, 0.2)}${ring(61.5, c.a, 3)}`;
    return { under: `${svg(tracks)}${comet(70, c.a, 2.1, false)}${comet(81, c.b, 3.3, true)}${comet(92, c.c, 4.6, false)}` };
  },

  gold({ id, color }) {
    const M = {
      gold: { st: ['#fff3b0', '#facc15', '#8a6200', '#facc15', '#fff3b0', '#a87600'], glow: '#facc15', dark: '#5c4300', star: '#fff8d6' },
      silver: { st: ['#ffffff', '#d4d4d8', '#52525b', '#d4d4d8', '#ffffff', '#71717a'], glow: '#e4e4e7', dark: '#3f3f46', star: '#ffffff' },
      rose: { st: ['#ffe4e6', '#fda4af', '#9f1239', '#fb7185', '#ffe4e6', '#be123c'], glow: '#fb7185', dark: '#4c0519', star: '#fff1f2' }
    }[color] || null;
    const m = M || { st: ['#fff3b0', '#facc15', '#8a6200', '#facc15', '#fff3b0', '#a87600'], glow: '#facc15', dark: '#5c4300', star: '#fff8d6' };
    const offs = [0, 0.22, 0.45, 0.62, 0.8, 1];
    const star = (x, y, s, dl) =>
      `<path class="rrf-twinkle" style="--dl:${dl}s" d="M${x} ${y - s} Q${x} ${y} ${x + s} ${y} Q${x} ${y} ${x} ${y + s} Q${x} ${y} ${x - s} ${y} Q${x} ${y} ${x} ${y - s}Z" fill="${m.star}"/>`;
    const metal = `<defs><linearGradient id="gd${id}" x1="0" y1="0" x2="1" y2="1">${m.st.map((s, i) => `<stop offset="${offs[i]}" stop-color="${s}"/>`).join('')}</linearGradient>
        <filter id="gb${id}" filterUnits="userSpaceOnUse" x="-20" y="-20" width="240" height="240"><feGaussianBlur stdDeviation="5"/></filter></defs>
      ${ring(64, m.glow, 10, 0.3).replace('/>', ` filter="url(#gb${id})"/>`)}
      <circle cx="100" cy="100" r="64" fill="none" stroke="url(#gd${id})" stroke-width="9"/>
      ${ring(59.8, m.dark, 1)}${ring(68.4, m.st[0], 0.8, 0.8)}`;
    return {
      under: `${svg(metal)}<div class="rrf-gshine"></div>${svg(`${star(150, 46, 9, 0)}${star(46, 140, 7, -0.8)}${star(160, 136, 6, -1.5)}${star(52, 54, 5, -1.1)}`)}`
    };
  },

  seal({ id, lite, c }) {
    const band = `${ring(76, '#141418', 20)}${ring(86, c.a, 1, 0.6)}${ring(66, c.a, 1, 0.6)}${ring(61.5, c.a, 3.5)}`;
    const txt = lite
      ? ring(76, c.a, 5).replace('/>', ' stroke-dasharray="10 6"/>')
      : `<path id="tp${id}" d="M100 24 a76 76 0 1 1 -0.01 0" fill="none"/><text font-size="11.5" font-weight="800" letter-spacing="2" fill="${c.a}" font-family="system-ui, sans-serif" dy="4"><textPath href="#tp${id}" textLength="470" lengthAdjust="spacing">RAVEXRADAR ✦ PRO ✦ RAVEXRADAR ✦ PRO ✦</textPath></text>`;
    return { under: `${svg(band)}${rot(txt, 14)}` };
  }
};

/**
 * Capas del marco en HTML.
 * @param {{key:string,color:string|null}} frame
 * @param {{lite?:boolean, uid?:string, avatarUrl?:string|null}} opts
 *   uid: identificador único en la página (los filtros SVG necesitan ids únicos)
 */
export function frameLayersHtml(frame, { lite = false, uid = 'f', avatarUrl = null } = {}) {
  const fr = frame && normalizeFrame(frame.key, frame.color);
  if (!fr) return null;
  const def = BY_KEY[fr.key];
  const c = def.colors?.find((x) => x.key === fr.color) || { a: C.yellow, b: C.orange, c: C.yellow };
  const out = RENDER[fr.key]({ id: safeId(uid), lite, c, color: fr.color, avatarUrl });
  return { under: out.under || '', over: out.over || '' };
}

/** Envuelve el HTML de un avatar con su marco (para los pins del mapa). */
export function frameWrapHtml(frame, innerHtml, opts = {}) {
  const layers = frameLayersHtml(frame, opts);
  if (!layers) return innerHtml;
  return `<div class="rr-frame is-on fx-${frame.key}${opts.lite ? ' rr-lite' : ''}"><div class="rrf-layer rrf-under" aria-hidden="true">${layers.under}</div><div class="rr-frame-slot">${innerHtml}</div>${layers.over ? `<div class="rrf-layer rrf-over" aria-hidden="true">${layers.over}</div>` : ''}</div>`;
}
