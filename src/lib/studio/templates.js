// src/lib/studio/templates.js
// ----------------------------------------------------------------------------
// Plantillas animadas del Estudio. Cada una:
//   · roles         → quién la ve ('all' = todos)
//   · source        → de dónde salen la fiesta o las fiestas (se eligen solas)
//   · music         → de dónde sale la canción por defecto ('event' | 'profile')
//   · dropBeat      → golpe del vídeo en el que cae el drop de la canción
//   · beats(S)      → duración en golpes
//   · fields        → lo que se puede retocar en el formulario
//   · autofill()    → rellena los textos con la info del usuario y la fiesta
//   · prepare()     → carga imágenes una vez (fondo, cartel, foto)
//   · render(g,t,R) → dibuja el instante t (determinista: vista previa = vídeo)
// Formatos: story 1080×1920 y post 1080×1350.
// ----------------------------------------------------------------------------
import {
  C, ROLE_COLORS, MONO, clamp, lerp, easeOut, easeIn, easeOutBack, rnd, ap, up,
  fitLines, fitOne, text, drawLines, roundRect, drawPin, ripple, brandWord, dotGrid,
  finish, glitch, flash, tape, loadImage, blurredCover, containCanvas, drawAvatar,
  drawCover, makeCanvas, fmtDate, whenLabel, dateParts, monthName, rgba, palette
} from './kit';

const W = 1080;
const TAIL = 0.8; // segundos de cola después del último golpe

// ---------- Utilidades comunes ----------
const handleOf = (user) => (user?.username ? `@${String(user.username).replace(/^@/, '')}` : '');
/** Nombre para mostrar: sin el sufijo automático "_abc" del registro y con espacios */
export const displayName = (user) => {
  let n = String(user?.username || '').trim();
  const suffix = user?.id ? `_${String(user.id).slice(0, 3)}` : '';
  if (suffix && n.toLowerCase().endsWith(suffix.toLowerCase()) && n.length > suffix.length + 1) n = n.slice(0, -suffix.length);
  return n.replace(/_+/g, ' ').trim();
};
const roleWord = (role) => ({ DJ: 'DJ', Club: 'CLUB', Promotor: 'PROMOTOR', Raver: 'RAVER' }[role] || 'RAVER');
const placeOf = (ev) => [ev?.venue_name || ev?.venue_profile?.username, ev?.city].filter(Boolean).join(' · ');
const lineupNames = (ev) =>
  (Array.isArray(ev?.lineup) ? ev.lineup : [])
    .map((s) => s?.name)
    .filter(Boolean)
    .slice(0, 10);

function frame(R) {
  const post = R.post;
  return {
    H: R.H,
    F: post ? 0.8 : 1, // escala de letra
    top: post ? 90 : 250, // zona segura (en story, arriba y abajo tapa la interfaz de Instagram)
    bottom: post ? R.H - 90 : 1640,
    get mid() {
      return (this.top + this.bottom) / 2;
    }
  };
}

const bgCache = new Map();
/** Fondo de marca: negro + brillo del color + rejilla (cacheado por tamaño y color) */
function bgBase(g, R, alpha = 1) {
  const key = `${R.H}|${R.accent}|${alpha}`;
  let layer = bgCache.get(key);
  if (!layer) {
    layer = makeCanvas(W, R.H);
    const c = layer.getContext('2d');
    c.fillStyle = C.bg;
    c.fillRect(0, 0, W, R.H);
    const gr = c.createRadialGradient(540, R.H * 0.47, 0, 540, R.H * 0.47, 780);
    gr.addColorStop(0, rgba(R.accent, 0.12 * alpha));
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gr;
    c.fillRect(0, 0, W, R.H);
    dotGrid(c, W, R.H, 0.08 * alpha);
    if (bgCache.size > 12) bgCache.clear();
    bgCache.set(key, layer);
  }
  g.drawImage(layer, 0, 0);
}

/** "BÚSCAME EN" + RAVEXRADAR + @usuario */
function signOff(g, R, a, { label = 'BÚSCAME EN', handle = '', y = null } = {}) {
  if (a <= 0) return;
  const L = frame(R);
  const yy = y ?? L.bottom - 110 * L.F;
  text(g, label, 540, yy, { size: 34 * L.F, weight: 700, color: C.soft, spacing: 8, alpha: a });
  brandWord(g, 540, yy + 76 * L.F, 66 * L.F, { pin: true, alpha: a, maxW: 760, color: R.accent });
  if (handle) {
    const h = fitOne(g, handle, 900, 38 * L.F, { min: 24, weight: 700 });
    text(g, h.text, 540, yy + 132 * L.F, { size: h.size, weight: 700, color: R.accent, alpha: a });
  }
}

/** Botón "VOY A IR" como en la web, con pulso al ritmo */
function goingButton(g, cx, cy, w, h, b, a, { label = '✓  VOY A IR', color = C.green, hi = null, k = 0 } = {}) {
  if (a <= 0) return;
  g.save();
  g.translate(cx, cy);
  const s = a * (1 + k * 0.05);
  g.scale(s, s);
  for (let i = 0; i < 2; i++) {
    const p = (b / 2 + i / 2) % 1;
    g.strokeStyle = rgba(color, 0.7 * (1 - p));
    g.lineWidth = 4;
    roundRect(g, -w / 2 - p * 36, -h / 2 - p * 18, w + p * 72, h + p * 36, h * 0.3);
    g.stroke();
  }
  g.fillStyle = rgba(color, 0.22);
  roundRect(g, -w / 2, -h / 2, w, h, h * 0.28);
  g.fill();
  g.strokeStyle = color;
  g.lineWidth = 3;
  g.stroke();
  text(g, label, 0, h * 0.16, { size: h * 0.42, weight: 800, color: hi || palette(color).hi, spacing: 3 });
  g.restore();
}

/** Palabras grandes que entran una por golpe */
function beatWords(g, R, words, b, fromBeat, { y, size = 180, gap = 1, colorEvery = 1, k = 0, spacing = 1 } = {}) {
  const L = frame(R);
  words.forEach((w, i) => {
    const a = easeOut(ap(b, fromBeat + i * gap, 0.5));
    if (a <= 0) return;
    const fit = fitOne(g, w, 960, size * L.F, { min: 60 });
    g.save();
    g.translate(540, y + i * fit.size * 0.95);
    const s = lerp(1.25, 1, a) * (1 + k * 0.025);
    g.scale(s, s);
    g.globalAlpha = a;
    text(g, fit.text, 0, 0, {
      size: fit.size,
      weight: 800,
      spacing,
      color: i % 2 === colorEvery ? R.accent : C.text,
      shadow: { color: rgba(R.accent, 0.85), dx: 7, dy: 7 }
    });
    g.restore();
  });
}

/** Tarjeta de fiesta (como la hoja de evento de la web). Calcula su alto según los textos. */
function cardLayout(g, R, S) {
  const L = frame(R);
  const tFit = fitLines(g, up(S.event), { maxW: 820, maxLines: 3, size: 66 * L.F, min: 38 });
  const place = S.place ? fitOne(g, up(S.place), 760, 34 * L.F, { min: 20, weight: 700 }) : null;
  const pad = 40 * L.F;
  const pillH = 54 * L.F;
  const titleBase = pad + pillH + 26 * L.F + tFit.size * 0.8;
  const titleBottom = titleBase + (tFit.lines.length - 1) * tFit.lineH + tFit.size * 0.22;
  const placeBase = place ? titleBottom + 48 * L.F : null;
  const btnTop = (place ? placeBase + 14 * L.F : titleBottom) + 30 * L.F;
  const btnH = 92 * L.F;
  return { tFit, place, pad, pillH, titleBase, placeBase, btnTop, btnH, h: btnTop + btnH + 34 * L.F };
}

function eventCard(g, R, S, y, a, b, k, lay = null) {
  if (a <= 0) return 0;
  const L = frame(R);
  const x = 90, w = 900;
  const C0 = lay || cardLayout(g, R, S);
  const h = C0.h;
  g.save();
  g.globalAlpha = clamp(a);
  g.translate(540, y + h / 2);
  g.scale(a, a);
  g.translate(-540, -(y + h / 2));
  g.fillStyle = 'rgba(14,14,18,0.94)';
  roundRect(g, x, y, w, h, 36);
  g.fill();
  g.strokeStyle = C.line;
  g.lineWidth = 2;
  g.stroke();
  if (S.date) {
    const ds = 30 * L.F;
    const df = fitOne(g, up(S.date), 460, ds, { min: 18 });
    g.font = `800 ${df.size}px Syne, sans-serif`;
    const dw = g.measureText(df.text).width + 40;
    g.fillStyle = R.accent;
    roundRect(g, x + 40, y + C0.pad, dw, C0.pillH, 12);
    g.fill();
    text(g, df.text, x + 40 + dw / 2, y + C0.pad + C0.pillH * 0.7, { size: df.size, weight: 800, color: R.ink });
  }
  if (S.set) {
    const st = fitOne(g, up(S.set), 340, 32 * L.F, { min: 20, weight: 700 });
    text(g, st.text, x + w - 40, y + C0.pad + C0.pillH * 0.7, { size: st.size, weight: 700, color: C.soft, align: 'right' });
  }
  drawLines(g, C0.tFit, x + 40, y + C0.titleBase, { weight: 800, color: R.hi, align: 'left' });
  if (C0.place) {
    drawPin(g, x + 60, y + C0.placeBase + 8, 38 * L.F, R.accent);
    text(g, C0.place.text, x + 92, y + C0.placeBase, { size: C0.place.size, weight: 700, color: C.soft, align: 'left' });
  }
  goingButton(g, 540, y + C0.btnTop + C0.btnH / 2, 820, C0.btnH, b, 1, { k, color: R.accent, hi: R.hi });
  g.restore();
  return h;
}

/** Radar: anillos, barrido y puntos de fiestas */
function radar(g, R, t, cx, cy, radius, { alpha = 1, color = null } = {}) {
  color = color || R.accent;
  g.save();
  g.globalAlpha *= alpha;
  g.strokeStyle = rgba(color, 0.22);
  g.lineWidth = 2;
  for (const f of [0.26, 0.52, 0.78, 1]) {
    g.beginPath();
    g.arc(cx, cy, radius * f, 0, Math.PI * 2);
    g.stroke();
  }
  g.strokeStyle = rgba(color, 0.12);
  g.beginPath();
  g.moveTo(cx - radius, cy);
  g.lineTo(cx + radius, cy);
  g.moveTo(cx, cy - radius);
  g.lineTo(cx, cy + radius);
  g.stroke();
  const ang = 2 * Math.PI * 0.28 * t - Math.PI / 2; // una vuelta cada ~3,5 s, sin acelerar
  if (g.createConicGradient) {
    const cg = g.createConicGradient(ang - 1.1, cx, cy);
    cg.addColorStop(0, rgba(color, 0));
    cg.addColorStop(1.1 / (2 * Math.PI), rgba(color, 0.3));
    cg.addColorStop(1.1 / (2 * Math.PI) + 0.0001, rgba(color, 0));
    cg.addColorStop(1, rgba(color, 0));
    g.fillStyle = cg;
    g.beginPath();
    g.arc(cx, cy, radius, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = rgba(color, 0.9);
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(cx, cy);
  g.lineTo(cx + Math.cos(ang) * radius, cy + Math.sin(ang) * radius);
  g.stroke();
  for (let i = 0; i < 20; i++) {
    const th = rnd(i * 7.3) * Math.PI * 2;
    const rr = radius * (0.15 + rnd(i * 3.1) * 0.8);
    if (t < 0.2 + rnd(i * 9.7) * 3) continue;
    let diff = (ang - th) % (2 * Math.PI);
    if (diff < 0) diff += 2 * Math.PI;
    const a = 0.25 + 0.75 * Math.pow(1 - diff / (2 * Math.PI), 3);
    g.fillStyle = rgba(color, a);
    g.beginPath();
    g.arc(cx + Math.cos(th) * rr, cy + Math.sin(th) * rr, 7, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

const outlineCache = new Map();
/** Nombre en contorno repetido de fondo (se dibuja una vez; luego solo se desplaza) */
function outlineBackdrop(g, R, str, size, offset, { alpha = 0.2, rowStep = null } = {}) {
  const step = rowStep || size * 0.92;
  const key = `${str}|${size}|${R.accent}|${alpha}`;
  let layer = outlineCache.get(key);
  if (!layer) {
    layer = makeCanvas(W, step * 2);
    const c = layer.getContext('2d');
    c.font = `800 ${size}px Syne, "Space Grotesk", system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.strokeStyle = rgba(R.accent, alpha);
    c.lineWidth = 3;
    c.strokeText(`${str} ${str} ${str}`, 540 - 120, step * 0.85);
    c.strokeText(`${str} ${str} ${str}`, 540 + 120, step * 1.85);
    if (outlineCache.size > 20) outlineCache.clear();
    outlineCache.set(key, layer);
  }
  const off = ((offset % (step * 2)) + step * 2) % (step * 2);
  for (let y = -step * 2 - off; y < R.H; y += step * 2) g.drawImage(layer, 0, y);
}

function typeLine(g, str, t0, t, x, y, { size = 34, color = C.soft, cursor = true } = {}) {
  const n = Math.floor(clamp((t - t0) * 26, 0, str.length));
  if (n <= 0) return;
  const c = cursor && Math.floor(t * 4) % 2 ? '_' : ' ';
  text(g, str.slice(0, n) + c, x, y, { size, weight: 700, color, align: 'left', family: MONO, spacing: 1 });
}

function flicker(g, R, t, b, from, to) {
  if (b <= from || b >= to) return;
  const u = (b - from) / (to - from);
  const f = Math.floor(b * 4); // cambia 4 veces por paso, no en cada fotograma
  if (rnd(f * 1.7) > 0.5) flash(g, W, R.H, 0.05 + 0.1 * u);
}

/** Imágenes de una fiesta: fondo desenfocado + cartel completo */
const SHADOW_PAD = 70;
/** Cartel con su sombra ya dibujada (la sombra en cada fotograma es lo más caro) */
function withShadow(cv) {
  if (!cv) return null;
  const out = makeCanvas(cv.width + SHADOW_PAD * 2, cv.height + SHADOW_PAD * 2);
  const g = out.getContext('2d');
  g.shadowColor = 'rgba(0,0,0,0.6)';
  g.shadowBlur = 60;
  g.drawImage(cv, SHADOW_PAD, SHADOW_PAD);
  return out;
}

async function eventAssets(S, R) {
  const img = await loadImage(S.image, 1080);
  const flyer = containCanvas(img, 900, R.post ? 760 : 1120);
  return {
    img,
    bg: blurredCover(img, W, R.H, { darken: 0.5, tint: R.accent }),
    flyer,
    flyerFx: withShadow(flyer)
  };
}

function drawFlyer(g, R, A, cx, cy, s, k, bi) {
  if (!A.flyer) {
    // sin cartel: un pin grande en un recuadro
    const w = 700 * s, h = (R.post ? 600 : 860) * s;
    g.fillStyle = 'rgba(17,17,22,0.9)';
    roundRect(g, cx - w / 2, cy - h / 2, w, h, 40);
    g.fill();
    drawPin(g, cx, cy + 120 * s, 260 * s, R.accent);
    return;
  }
  const sh = k * 4;
  const x = cx + (rnd(bi) - 0.5) * sh, y = cy + (rnd(bi * 3) - 0.5) * sh;
  const src = A.flyerFx || A.flyer;
  const fw = src.width * s, fh = src.height * s;
  g.drawImage(src, x - fw / 2, y - fh / 2, fw, fh);
}

/**
 * Entrada común hasta el drop (golpe 8) para las plantillas de lista: la tensión
 * sube (barra de carga, zoom lento, anillos) y en el drop la imagen "rompe" y
 * aparece el contenido. Así la canción y el vídeo rompen a la vez.
 */
function buildIntro(g, R, t, b, { line = '', kicker = '', words = [], sub = '' } = {}) {
  const L = frame(R);
  const D = 8;
  const u = clamp(b / D);
  bgBase(g, R);
  for (let i = 0; i < 3; i++) ripple(g, 540, L.bottom - 260 * L.F, 560, b / 2 + i / 3, R.accent, 0.5 + 0.5 * u);
  if (line) typeLine(g, `> ${line}`, 0.3, t, 110, L.top + 40, { size: 34 * L.F });
  g.save();
  const z = 1 + 0.06 * u * u; // zoom lento hacia el drop
  g.translate(540, L.mid);
  g.scale(z, z);
  g.translate(-540, -L.mid);
  const ws = words.filter(Boolean).slice(0, 4);
  if (kicker) {
    const kf = fitOne(g, up(kicker), 940, 40 * L.F, { min: 22, weight: 700, spacing: 10 });
    const ky = L.mid - 140 * L.F - (ws.length > 2 ? 160 : 190) * L.F * 0.85 - 40 * L.F;
    text(g, kf.text, 540, ky, { size: kf.size, weight: 700, color: R.accent, spacing: 10, alpha: ap(b, 1, 0.8) });
  }
  const gap = ws.length > 2 ? 1 : 1.5;
  beatWords(g, R, ws, b, 2, { y: L.mid - 140 * L.F, size: ws.length > 2 ? 160 : 190, gap });
  if (sub) {
    const sf = fitLines(g, up(sub), { maxW: 900, maxLines: 2, size: 46 * L.F, min: 24, weight: 700 });
    const sy = L.mid - 140 * L.F + ws.length * 165 * L.F + 30 * L.F;
    drawLines(g, sf, 540, sy, { weight: 700, color: C.soft, alpha: ap(b, 2 + ws.length * gap, 0.8) });
  }
  g.restore();
  // barra de carga hasta el drop
  g.fillStyle = rgba(C.text, 0.12);
  roundRect(g, 140, L.bottom - 70 * L.F, 800, 10, 5);
  g.fill();
  g.fillStyle = R.accent;
  roundRect(g, 140, L.bottom - 70 * L.F, Math.max(10, 800 * u), 10, 5);
  g.fill();
  flicker(g, R, t, b, 7, 8);
  finish(g, W, R.H);
}

// ---------- Fuentes de datos (fiestas) ----------
const firstOr = (list, fallback = null) => (list && list.length ? list[0] : fallback);

function evText(ev, user) {
  if (!ev) {
    return {
      event: 'NOMBRE DE LA FIESTA',
      date: 'SÁB 14 DIC',
      when: 'ESTE SÁBADO',
      place: `SALA · ${up(user?.city || 'MADRID')}`,
      image: '',
      lineup: 'DJ 1\nDJ 2\nDJ 3'
    };
  }
  return {
    event: ev.name || '',
    date: fmtDate(ev.start_date),
    when: whenLabel(ev.start_date),
    place: placeOf(ev),
    image: ev.image_url || '',
    lineup: lineupNames(ev).join('\n')
  };
}

// ============================================================================
// PLANTILLAS
// ============================================================================

// ---------- 1. VOY A IR (todos) ----------
const GOING = {
  id: 'going',
  name: 'Voy a ir',
  desc: 'Anuncia a qué fiesta vas',
  icon: 'Radio',
  roles: 'all',
  source: 'going',
  music: 'event',
  dropBeat: 8,
  beats: () => 28,
  fields: [
    { key: 'kicker', label: 'Titular', max: 26 },
    { key: 'event', label: 'Fiesta', max: 70 },
    { key: 'date', label: 'Fecha', max: 22 },
    { key: 'place', label: 'Sala y ciudad', max: 60 },
    { key: 'cta', label: 'Pregunta final', max: 30 },
    { key: 'handle', label: 'Tu usuario', max: 32 }
  ],
  autofill: (c, ev) => ({ kicker: 'VOY A IR', cta: '¿TE VIENES?', handle: handleOf(c.user), ...evText(ev, c.user) }),
  prepare: eventAssets,
  render(g, t, R) {
    const { clock, S, A } = R;
    const L = frame(R);
    const b = clock.beat(t);
    const k = clock.kick(t, clock.at(8));
    if (b < 8) {
      bgBase(g, R);
      const drop = easeOutBack(ap(t, 0.2, 0.8));
      for (let i = 0; i < 3; i++) ripple(g, 540, L.mid + 260 * L.F, 180, b / 2 + i / 3, R.accent, ap(t, 0.5, 0.3));
      drawPin(g, 540, lerp(-200, L.mid + 260 * L.F, drop), 190 * L.F, R.accent);
      typeLine(g, '> NUEVO PLAN EN EL MAPA', 0.3, t, 110, L.top + 40, { size: 34 * L.F });
      beatWords(g, R, up(S.kicker).split(/\s+/).slice(0, 4), b, 2, { y: L.top + 280 * L.F, size: 190, k: 0 });
      text(g, up(S.when), 540, L.mid + 420 * L.F, { size: 46 * L.F, weight: 700, color: C.soft, spacing: 8, alpha: ap(b, 5, 0.5) });
      flicker(g, R, t, b, 7, 8);
    } else if (b < 20) {
      const lb = b - 8, bi = Math.floor(b), td = t - clock.at(8);
      g.drawImage(A.bg, 0, 0);
      dotGrid(g, W, R.H, 0.05);
      const s = (R.post ? 0.72 : 0.84) + td * 0.01 + k * 0.03;
      drawFlyer(g, R, A, 540, L.mid + 120 * L.F, s, k, bi);
      if (lb % 8 < 0.15 && lb > 1 && rnd(bi * 3.1) > 0.4) glitch(g, R.canvas, bi, 40, 4);
      // nombre arriba
      const slam = easeOut(td / 0.35);
      const nf = fitLines(g, up(S.event), { maxW: 960, maxLines: 3, size: 110 * L.F, min: 56 });
      g.save();
      g.translate(540, L.top + nf.size * 0.8);
      const sc = lerp(1.3, 1, slam);
      g.scale(sc, sc);
      g.globalAlpha = clamp(td / 0.12);
      drawLines(g, nf, 0, 0, { weight: 800, shadow: { color: R.accent, dx: 6, dy: 6 } });
      g.restore();
      const info = [up(S.date), up(S.place)].filter(Boolean).join('  ·  ');
      const inf = fitOne(g, info, 960, 38 * L.F, { min: 22, weight: 700, spacing: 3 });
      const infoY = L.top + nf.size * 0.8 + (nf.lines.length - 1) * nf.lineH + 70 * L.F;
      text(g, inf.text, 540, infoY, { size: inf.size, weight: 700, color: C.soft, spacing: 3, alpha: ap(lb, 1) });
      // sello "VOY A IR"
      const st = easeOutBack(ap(lb, 2, 0.7));
      if (st > 0) {
        g.save();
        g.translate(540, L.bottom - 70 * L.F);
        g.rotate(-0.06);
        g.scale(st * (1 + k * 0.04), st * (1 + k * 0.04));
        g.fillStyle = R.accent;
        roundRect(g, -300, -62, 600, 124, 30);
        g.fill();
        const sf = fitOne(g, `✓ ${up(S.kicker)}`, 540, 62, { min: 30, spacing: 3 });
        text(g, sf.text, 0, 22, { size: sf.size, weight: 800, color: R.ink, spacing: 3 });
        g.restore();
      }
      const fl = Math.floor(lb) % 4 === 0 ? Math.max(0, 1 - (lb % 1) / 0.5) : 0;
      if (fl > 0) flash(g, W, R.H, Math.floor(lb) === 0 ? 0.8 * fl : 0.14 * fl, Math.floor(lb) === 0 ? '255,255,255' : R.accentRgb.join(','));
    } else {
      const lb = b - 20;
      bgBase(g, R);
      if (A.flyer) {
        g.save();
        g.globalAlpha = 0.25;
        const fw = A.flyer.width * 0.5, fh = A.flyer.height * 0.5;
        g.drawImage(A.flyer, 540 - fw / 2, L.top, fw, fh);
        g.restore();
        const gr = g.createLinearGradient(0, L.top + 200, 0, L.top + 700);
        gr.addColorStop(0, 'rgba(9,9,11,0)');
        gr.addColorStop(1, 'rgba(9,9,11,1)');
        g.fillStyle = gr;
        g.fillRect(0, L.top + 200, W, R.H);
      }
      flash(g, W, R.H, 0.8 * Math.max(0, 1 - (t - clock.at(20)) / 0.6) ** 2);
      const q = fitOne(g, up(S.cta), 960, 150 * L.F, { min: 60 });
      text(g, q.text, 540, L.mid - 40 * L.F, { size: q.size, weight: 800, alpha: ap(lb, 0, 0.8), shadow: { color: R.accent, dx: 6, dy: 6 } });
      goingButton(g, 540, L.mid + 120 * L.F, 620, 130 * L.F, b, easeOutBack(ap(lb, 1, 0.8)), { k: k * 0.6, color: R.accent, hi: R.hi });
      signOff(g, R, ap(lb, 2.5, 1), { handle: S.handle });
    }
    finish(g, W, R.H);
  }
};

// ---------- 2. BUSCO RAVE SQUAD (Raver, DJ) ----------
const SQUAD = {
  id: 'squad',
  name: 'Busco Rave Squad',
  desc: 'Encuentra gente para ir',
  icon: 'Users',
  roles: ['Raver', 'DJ'],
  source: 'squad',
  music: 'event',
  dropBeat: 8,
  beats: () => 28,
  fields: [
    { key: 'kicker', label: 'Titular', max: 26 },
    { key: 'event', label: 'Fiesta', max: 70 },
    { key: 'date', label: 'Fecha', max: 22 },
    { key: 'place', label: 'Sala y ciudad', max: 60 },
    { key: 'cta', label: 'Mensaje', max: 60 },
    { key: 'handle', label: 'Tu usuario', max: 32 }
  ],
  autofill: (c, ev) => ({
    kicker: 'BUSCO RAVE SQUAD',
    cta: 'Voy solo/a y busco gente con la que ir',
    handle: handleOf(c.user),
    avatar: c.user?.avatar_url || '',
    ...evText(ev, c.user)
  }),
  async prepare(S, R) {
    const [ev, avatar] = await Promise.all([eventAssets(S, R), loadImage(S.avatar, 600)]);
    return { ...ev, avatar };
  },
  render(g, t, R) {
    const { clock, S, A } = R;
    const L = frame(R);
    const b = clock.beat(t);
    const k = clock.kick(t, clock.at(8));
    if (b < 8) {
      bgBase(g, R);
      const cy = L.mid - 40 * L.F;
      radar(g, R, t, 540, cy, 420 * L.F);
      typeLine(g, '> BUSCANDO RAVE SQUAD', 0.3, t, 110, L.top + 40, { size: 34 * L.F });
      if (b >= 3) {
        const a = easeOutBack(ap(b, 3, 0.8));
        const bx = 540 + 220 * L.F, by = cy - 150 * L.F;
        for (let i = 0; i < 2; i++) {
          const p = (b / 2 + i * 0.5) % 1;
          g.strokeStyle = rgba(R.accent, 0.9 * (1 - p));
          g.lineWidth = 3;
          g.beginPath();
          g.arc(bx, by, 40 + p * 90, 0, Math.PI * 2);
          g.stroke();
        }
        g.save();
        g.translate(bx, by);
        g.scale(a, a);
        drawAvatar(g, A.avatar, 0, 0, 110, { color: R.accent, ring: 6, initials: S.handle.replace('@', '') });
        g.restore();
      }
      beatWords(g, R, ['¿TE', 'VIENES?'], b, 5, { y: L.bottom - 230 * L.F, size: 170 });
      flicker(g, R, t, b, 7, 8);
    } else if (b < 20) {
      const lb = b - 8, td = t - clock.at(8);
      g.drawImage(A.bg, 0, 0);
      dotGrid(g, W, R.H, 0.05);
      flash(g, W, R.H, lb < 0.6 ? 0.8 * (1 - lb / 0.6) : 0);
      // cintas
      tape(g, W, L.top + 70 * L.F, 0.06, 96 * L.F, R.accent, C.bg, `  ${up(S.kicker)}  •`, td * 110, lerp(-W * 1.3, 0, easeOut(lb / 1)));
      tape(g, W, L.bottom - 40 * L.F, -0.05, 86 * L.F, '#fafafa', C.bg, `  ${up(S.date)}  •  ${up(S.event)}  •`, -td * 100, lerp(W * 1.3, 0, easeOut((lb - 1.5) / 1)));
      const lay = cardLayout(g, R, { ...S, set: '' });
      const cardY = L.bottom - 120 * L.F - lay.h;
      const flyTop = L.top + 150 * L.F;
      if (A.flyer) {
        const room = Math.max(120, cardY - 30 - flyTop);
        const s = Math.min(1, room / A.flyer.height, 760 / A.flyer.width) * (1 + k * 0.03);
        drawFlyer(g, R, A, 540, flyTop + (A.flyer.height * s) / 2, s, k, Math.floor(b));
      }
      eventCard(g, R, { ...S, set: '' }, cardY, easeOutBack(ap(lb, 0.5, 0.9)), b, k, lay);
    } else {
      const lb = b - 20;
      bgBase(g, R);
      flash(g, W, R.H, 0.8 * Math.max(0, 1 - (t - clock.at(20)) / 0.6) ** 2);
      const a = easeOutBack(ap(lb, 0, 0.8));
      g.save();
      g.translate(540, L.top + 260 * L.F);
      g.scale(a * (1 + k * 0.04), a * (1 + k * 0.04));
      drawAvatar(g, A.avatar, 0, 0, 300 * L.F, { color: R.accent, ring: 12, initials: S.handle.replace('@', '') });
      g.restore();
      const msg = fitLines(g, S.cta, { maxW: 900, maxLines: 3, size: 60 * L.F, min: 34, weight: 700, lineHeight: 1.2 });
      const msgH = drawLines(g, msg, 540, L.top + 520 * L.F, { weight: 700, alpha: ap(lb, 1, 0.8) });
      const ea = ap(lb, 2, 0.8);
      if (ea > 0 && S.event) {
        const ey = L.top + 520 * L.F + msgH + 50 * L.F;
        text(g, 'PARA', 540, ey, { size: 30 * L.F, weight: 700, color: C.muted, spacing: 8, alpha: ea });
        const ef = fitLines(g, up(S.event), { maxW: 940, maxLines: 2, size: 74 * L.F, min: 40 });
        drawLines(g, ef, 540, ey + ef.size * 1.05, { weight: 800, color: R.hi, alpha: ea });
        const df = fitOne(g, [up(S.date), up(S.place)].filter(Boolean).join('  ·  '), 960, 34 * L.F, { min: 20, weight: 700, spacing: 2 });
        text(g, df.text, 540, ey + ef.size * 1.05 + (ef.lines.length - 1) * ef.lineH + 58 * L.F, { size: df.size, weight: 700, color: C.soft, spacing: 2, alpha: ea });
      }
      signOff(g, R, ap(lb, 3.5, 1), { label: 'ESCRÍBEME EN', handle: S.handle });
    }
    finish(g, W, R.H);
  }
};

// ---------- 3/5. LISTA DE FIESTAS: mis planes (todos) y agenda (DJ, club, promotor) ----------
function listTemplate({ id, name, desc, icon, roles, source, music, kicker, title, outroLabel = 'TODAS MIS FECHAS EN' }) {
  return {
    id,
    name,
    desc,
    icon,
    roles,
    source,
    music,
    multi: true,
    dropBeat: 8,
    beats: (S) => 8 + Math.max(3, Math.min(6, parseRows(S.list).length)) * 2 + 8,
    fields: [
      { key: 'kicker', label: 'Titular pequeño', max: 30 },
      { key: 'title', label: 'Titular grande', max: 30 },
      { key: 'list', label: 'Fiestas (una por línea: fecha | fiesta | sala)', type: 'textarea', rows: 6 },
      { key: 'handle', label: 'Tu usuario', max: 32 }
    ],
    autofill: (c, _ev, list) => ({
      kicker,
      title: typeof title === 'function' ? title(c) : title,
      list: (list || []).length
        ? list.slice(0, 6).map((e) => [fmtDate(e.start_date), e.name, placeOf(e)].join(' | ')).join('\n')
        : 'SÁB 6 DIC | Nombre de la fiesta | Sala · Madrid\nSÁB 13 DIC | Otra fiesta | Sala · Madrid',
      handle: handleOf(c.user),
      avatar: c.user?.avatar_url || '',
      image: (list || []).find((e) => e.image_url)?.image_url || ''
    }),
    async prepare(S, R) {
      const [img, avatar] = await Promise.all([loadImage(S.image, 720), loadImage(S.avatar, 400)]);
      return { bg: blurredCover(img, W, R.H, { darken: 0.7, tint: R.accent }), avatar };
    },
    render(g, t, R) {
      const { clock, S, A } = R;
      const L = frame(R);
      const b = clock.beat(t);
      const k = clock.kick(t, clock.at(8));
      const rows = parseRows(S.list).slice(0, R.post ? 4 : 6);
      if (b < 8) return buildIntro(g, R, t, b, { line: 'CARGANDO FECHAS', kicker: S.kicker, words: up(S.title).split(/\s+/), sub: `${rows.length} ${rows.length === 1 ? 'FIESTA' : 'FIESTAS'}` });
      g.drawImage(A.bg, 0, 0);
      dotGrid(g, W, R.H, 0.06);
      // cabecera
      const headA = ap(t, 0.2, 0.5);
      if (A.avatar || S.handle) {
        g.save();
        g.globalAlpha = headA;
        drawAvatar(g, A.avatar, 140, L.top + 40 * L.F, 90 * L.F, { color: R.accent, ring: 5, initials: S.handle.replace('@', '') });
        g.restore();
        const h = fitOne(g, S.handle, 760, 36 * L.F, { min: 22, weight: 700 });
        text(g, h.text, 210, L.top + 52 * L.F, { size: h.size, weight: 700, color: C.soft, align: 'left', alpha: headA });
      }
      text(g, up(S.kicker), 90, L.top + 170 * L.F, { size: 32 * L.F, weight: 700, color: R.accent, spacing: 10, align: 'left', alpha: ap(b, 1, 0.8) });
      const tf = fitLines(g, up(S.title), { maxW: 900, maxLines: 2, size: 128 * L.F, min: 56 });
      g.save();
      const ta = easeOut(ap(b, 2.5, 0.9));
      g.globalAlpha = ta;
      g.translate(90, L.top + 200 * L.F + tf.size * 0.95);
      const ts = lerp(1.15, 1, ta) * (1 + k * 0.02);
      g.scale(ts, ts);
      drawLines(g, tf, 0, 0, { weight: 800, align: 'left', shadow: { color: R.accent, dx: 6, dy: 6 } });
      g.restore();
      flicker(g, R, t, b, 7, 8);
      if (b >= 8 && b < 8.6) flash(g, W, R.H, 0.7 * (1 - (b - 8) / 0.6));
      // filas: una cada 1,5 pasos desde el drop
      const listTop = L.top + 200 * L.F + tf.size * 0.95 + (tf.lines.length - 1) * tf.lineH + 70 * L.F;
      const avail = L.bottom - 190 * L.F - listTop;
      const rowH = Math.min(196 * L.F, (avail - (rows.length - 1) * 16) / Math.max(1, rows.length));
      const used = rows.length * rowH + (rows.length - 1) * 16;
      const listY0 = listTop + Math.max(0, (avail - used) * 0.35);
      rows.forEach((r, i) => {
        const a = easeOut(ap(b, 8 + i * 2, 0.6));
        if (a <= 0) return;
        const y = listY0 + i * (rowH + 16);
        const isNew = b - (8 + i * 2) < 1;
        g.save();
        g.globalAlpha = a;
        g.translate(lerp(80, 0, a), 0);
        g.fillStyle = 'rgba(17,17,22,0.88)';
        roundRect(g, 70, y, 940, rowH, 24);
        g.fill();
        g.strokeStyle = i === 0 ? R.accent : C.line;
        g.lineWidth = 2;
        g.stroke();
        // fecha
        const box = rowH - 24;
        g.fillStyle = R.accent;
        roundRect(g, 82, y + 12, box, box, 18);
        g.fill();
        const dp = r.date.split(/\s+/);
        const d1 = fitOne(g, dp[0] || '', box - 16, box * 0.2, { min: 12 });
        const d2 = fitOne(g, dp.slice(1).join(' '), box - 14, box * 0.28, { min: 12 });
        text(g, d1.text, 82 + box / 2, y + 12 + box * 0.36, { size: d1.size, weight: 800, color: R.ink });
        text(g, d2.text, 82 + box / 2, y + 12 + box * 0.76, { size: d2.size, weight: 800, color: R.ink });
        // nombre (hasta 2 líneas) + sala
        const nx = 82 + box + 26, nw = 1010 - 30 - nx;
        const placeH = r.place ? Math.min(30 * L.F, rowH * 0.2) : 0;
        const nf = fitLines(g, up(r.name), { maxW: nw, maxLines: rowH > 120 ? 2 : 1, size: Math.min(46 * L.F, rowH * 0.3), min: 20, lineHeight: 1.05 });
        const blockH = nf.lines.length * nf.lineH + (r.place ? placeH * 1.6 : 0);
        const ny = y + (rowH - blockH) / 2 + nf.size * 0.82;
        g.save();
        if (isNew) {
          g.translate(nx, ny);
          g.scale(1 + k * 0.03, 1 + k * 0.03);
          g.translate(-nx, -ny);
        }
        drawLines(g, nf, nx, ny, { weight: 800, align: 'left' });
        g.restore();
        if (r.place) {
          const pf = fitOne(g, up(r.place), nw - 40, placeH, { min: 14, weight: 600 });
          const py = ny + (nf.lines.length - 1) * nf.lineH + placeH * 1.5;
          drawPin(g, nx + 12, py + 4, placeH * 0.95, R.accent);
          text(g, pf.text, nx + 34, py, { size: pf.size, weight: 600, color: C.muted, align: 'left' });
        }
        g.restore();
      });
      const endB = 8 + rows.length * 2;
      signOff(g, R, ap(b, endB + 1, 1), { label: outroLabel, handle: '', y: L.bottom - 70 * L.F });
      finish(g, W, R.H);
    }
  };
}

function parseRows(txt) {
  return String(txt || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [date = '', name = '', place = ''] = l.split('|').map((s) => s.trim());
      return { date: up(date), name, place };
    });
}

const PLANS = listTemplate({
  id: 'plans',
  name: 'Mis próximas fiestas',
  desc: 'Tus planes de las próximas semanas',
  icon: 'CalendarHeart',
  roles: 'all',
  source: 'going-list',
  music: 'event',
  kicker: 'MIS PRÓXIMOS PLANES',
  title: 'ME VERÁS EN'
});

const AGENDA = listTemplate({
  id: 'agenda',
  name: 'Agenda',
  desc: 'Tus próximas fechas en una story',
  icon: 'CalendarDays',
  roles: ['DJ', 'Club', 'Promotor'],
  source: 'work-list',
  music: 'profile',
  kicker: 'PRÓXIMAS FECHAS',
  title: () => `AGENDA ${up(monthName())}`
});

// ---------- 4. PRÓXIMO BOLO (DJ) ----------
const NEXT_GIG = {
  id: 'next-gig',
  name: 'Próximo bolo',
  desc: 'Anuncia dónde pinchas',
  icon: 'Headphones',
  roles: ['DJ'],
  source: 'lineup',
  music: 'event',
  dropBeat: 8,
  beats: () => 28,
  fields: [
    { key: 'when', label: 'Cuándo (grande)', max: 24 },
    { key: 'event', label: 'Fiesta', max: 70 },
    { key: 'date', label: 'Fecha', max: 22 },
    { key: 'place', label: 'Sala y ciudad', max: 60 },
    { key: 'set', label: 'Tu set', max: 24 },
    { key: 'handle', label: 'Tu usuario', max: 32 }
  ],
  autofill: (c, ev) => {
    const slot = (Array.isArray(ev?.lineup) ? ev.lineup : []).find(
      (s) => (s.dj_id && String(s.dj_id) === String(c.user?.id)) || (s.name && s.name.trim().toLowerCase() === String(c.user?.username || '').trim().toLowerCase())
    );
    return {
      ...evText(ev, c.user),
      set: slot?.set_time ? `SET ${String(slot.set_time).slice(0, 5)}` : '',
      handle: handleOf(c.user),
      name: displayName(c.user),
      avatar: c.user?.avatar_url || ''
    };
  },
  async prepare(S, R) {
    const [ev, avatar] = await Promise.all([eventAssets(S, R), loadImage(S.avatar, 1080)]);
    const photo = avatar || ev.img;
    return { ...ev, photo, photoBg: photo ? blurredCover(photo, W, R.H, { darken: 0.35, tint: R.accent }) : ev.bg };
  },
  render(g, t, R) {
    const { clock, S, A } = R;
    const L = frame(R);
    const b = clock.beat(t);
    const k = clock.kick(t, clock.at(8));
    // fondo: tu foto (o el cartel) a pantalla completa con zoom lento
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, R.H);
    if (A.photo) {
      g.save();
      g.globalAlpha = 0.9;
      drawCover(g, A.photo, 0, 0, W, R.H, { zoom: 1.04 + 0.04 * (t / 14) + k * 0.03, fy: 0.3 });
      g.restore();
    } else g.drawImage(A.bg, 0, 0);
    const gr = g.createLinearGradient(0, 0, 0, R.H);
    gr.addColorStop(0, 'rgba(9,9,11,0.75)');
    gr.addColorStop(0.35, 'rgba(9,9,11,0.15)');
    gr.addColorStop(0.6, 'rgba(9,9,11,0.35)');
    gr.addColorStop(1, 'rgba(9,9,11,0.92)');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, R.H);
    if (b < 8) {
      g.fillStyle = `rgba(9,9,11,${0.55 - 0.15 * clamp(b / 8)})`;
      g.fillRect(0, 0, W, R.H);
    }
    const nm = fitOne(g, up(S.name), 900, 44 * L.F, { min: 24, spacing: 10 });
    text(g, nm.text, 540, L.top + 20, { size: nm.size, weight: 800, color: C.soft, spacing: 10, alpha: ap(t, 0.2) });
    // "ESTE SÁBADO" palabra a palabra
    const words = up(S.when).split(/\s+/).slice(0, 3);
    beatWords(g, R, words, b, 1, { y: L.top + 200 * L.F, size: 190, gap: 1.5, k });
    if (b >= 8 && b < 8.6) flash(g, W, R.H, 0.6 * (1 - (b - 8) / 0.6));
    const lay = cardLayout(g, R, S);
    const signY = L.bottom - (R.post ? 120 : 110) * L.F;
    const cardY = signY - 90 * L.F - lay.h;
    eventCard(g, R, S, cardY, easeOutBack(ap(b, 8, 0.9)), b, k, lay);
    signOff(g, R, easeOut(ap(b, 13, 1)), { handle: S.handle, y: signY });
    finish(g, W, R.H, { scan: 0 });
  }
};

// ---------- 6. BOOKINGS ABIERTOS (DJ) ----------
const BOOKING = {
  id: 'booking',
  name: 'Bookings abiertos',
  desc: 'Para que te contraten',
  icon: 'Megaphone',
  roles: ['DJ'],
  source: 'profile',
  music: 'profile',
  dropBeat: 8,
  beats: () => 28,
  fields: [
    { key: 'kicker', label: 'Titular', max: 26 },
    { key: 'name', label: 'Tu nombre artístico', max: 40 },
    { key: 'genre', label: 'Estilo', max: 30 },
    { key: 'bpm', label: 'BPM', max: 12 },
    { key: 'base', label: 'Base / viajes', max: 44 },
    { key: 'handle', label: 'Tu usuario', max: 32 }
  ],
  autofill: (c) => ({
    kicker: 'BOOKINGS OPEN',
    name: displayName(c.user) || 'TU NOMBRE',
    genre: c.user?.favorite_subgenre || 'Hard Techno',
    bpm: c.user?.favorite_bpm ? `${c.user.favorite_bpm} BPM` : '',
    base: `${c.user?.city || 'Madrid'}${c.user?.willing_to_travel === false ? '' : ' · disponible para viajar'}`,
    handle: handleOf(c.user),
    avatar: c.user?.avatar_url || ''
  }),
  async prepare(S, R) {
    const avatar = await loadImage(S.avatar, 1080);
    return { avatar, bg: blurredCover(avatar, W, R.H, { darken: 0.62, tint: R.accent }) };
  },
  render(g, t, R) {
    const { clock, S, A } = R;
    const L = frame(R);
    const b = clock.beat(t);
    const k = clock.kick(t, clock.at(8));
    const td = t - clock.at(8);
    if (b < 8) {
      bgBase(g, R);
      for (let i = 0; i < 4; i++) ripple(g, 540, L.mid + 120 * L.F, 520, b / 4 + i / 4, R.accent, 0.8);
      typeLine(g, '> AGENDA ABIERTA', 0.3, t, 110, L.top + 40, { size: 34 * L.F });
      beatWords(g, R, up(S.kicker).split(/\s+/).slice(0, 3), b, 2, { y: L.mid - 120 * L.F, size: 200, gap: 1.5 });
      flicker(g, R, t, b, 7, 8);
    } else {
      const lb = b - 8;
      g.drawImage(A.bg, 0, 0);
      dotGrid(g, W, R.H, 0.05);
      // nombre en contorno de fondo
      outlineBackdrop(g, R, up(S.name), 220 * L.F, lb * 22, { alpha: 0.18 });
      const size = (R.post ? 420 : 560) * (1 + k * 0.025);
      const pa = easeOutBack(ap(lb, 0, 0.8));
      g.save();
      g.translate(540, L.top + (R.post ? 330 : 470));
      g.scale(pa, pa);
      drawAvatar(g, A.avatar, 0, 0, size, { color: R.accent, ring: 14, round: true, initials: S.name });
      g.restore();
      // nombre
      const slam = easeOut(td / 0.35);
      const nf = fitLines(g, up(S.name), { maxW: 960, maxLines: 2, size: 150 * L.F, min: 60 });
      const ny = L.top + (R.post ? 330 : 470) + size / 2 + 40 + nf.size * 0.85;
      g.save();
      g.translate(540, ny);
      g.scale(lerp(1.3, 1, slam), lerp(1.3, 1, slam));
      g.globalAlpha = clamp(td / 0.12);
      drawLines(g, nf, 0, 0, { weight: 800, shadow: { color: R.accent, dx: 7, dy: 7 } });
      g.restore();
      // etiquetas
      const chips = [roleWord('DJ'), up(S.genre), up(S.bpm)].filter(Boolean);
      let cy = ny + (nf.lines.length - 1) * nf.lineH + 60 * L.F;
      const ca = easeOut(ap(lb, 2, 0.9));
      if (ca > 0) {
        g.save();
        g.globalAlpha = ca;
        g.font = `800 ${38 * L.F}px Syne, sans-serif`;
        const ws = chips.map((c) => g.measureText(c).width + 44);
        const total = ws.reduce((a, b2) => a + b2, 0) + (chips.length - 1) * 12;
        let x = 540 - Math.min(total, 980) / 2;
        chips.forEach((c, i) => {
          g.fillStyle = i === 0 ? R.accent : 'rgba(9,9,11,0.72)';
          roundRect(g, x, cy, ws[i], 64 * L.F, 12);
          g.fill();
          text(g, c, x + ws[i] / 2, cy + 46 * L.F, { size: 38 * L.F, weight: 800, color: i === 0 ? R.ink : C.text });
          x += ws[i] + 12;
        });
        g.restore();
      }
      const bf = fitOne(g, up(S.base), 960, 36 * L.F, { min: 20, weight: 700, spacing: 3 });
      text(g, bf.text, 540, cy + 130 * L.F, { size: bf.size, weight: 700, color: C.soft, spacing: 3, alpha: ap(lb, 3.5, 1) });
      if (lb >= 6) tape(g, W, L.top + 40 * L.F, 0.05, 92 * L.F, '#fafafa', C.bg, `  ${up(S.kicker)}  •  ${up(S.name)}  •`, td * 110, lerp(-W * 1.3, 0, easeOut((lb - 6) / 1)));
      const fl = Math.floor(lb) % 4 === 0 ? Math.max(0, 1 - (lb % 1) / 0.5) : 0;
      if (fl > 0) flash(g, W, R.H, Math.floor(lb) === 0 ? 0.8 * fl : 0.14 * fl, Math.floor(lb) === 0 ? '255,255,255' : R.accentRgb.join(','));
      signOff(g, R, ap(lb, 12, 1), { label: 'ESCRÍBEME EN', handle: S.handle, y: L.bottom - 90 * L.F });
    }
    finish(g, W, R.H);
  }
};

// ---------- 7. ENCUÉNTRAME EN EL MAPA (DJ, club, promotor) ----------
const ROLE_WORDS = {
  DJ: ['NUEVO', 'ARTISTA', 'EN EL', 'MAPA'],
  Club: ['NUEVA', 'SALA', 'EN EL', 'MAPA'],
  Promotor: ['NUEVO', 'COLECTIVO', 'EN EL', 'MAPA'],
  Raver: ['NUEVO', 'RAVER', 'EN EL', 'MAPA']
};
const ON_MAP = {
  id: 'on-the-map',
  name: 'Encuéntrame en el mapa',
  desc: 'El radar te encuentra y apareces en el drop',
  icon: 'Radar',
  roles: ['DJ', 'Club', 'Promotor'],
  source: 'profile',
  music: 'profile',
  dropBeat: 16,
  beats: () => 40,
  fields: [
    { key: 'words', label: 'Palabras antes del drop (separadas por |)', max: 60 },
    { key: 'name', label: 'Nombre', max: 40 },
    { key: 'genre', label: 'Estilo', max: 30 },
    { key: 'tagline', label: 'Frase de la cinta', max: 40 },
    { key: 'handle', label: 'Tu usuario', max: 32 }
  ],
  autofill: (c) => ({
    words: (ROLE_WORDS[c.user?.role] || ROLE_WORDS.DJ).join(' | '),
    name: displayName(c.user) || 'TU NOMBRE',
    genre: c.user?.favorite_subgenre || 'Techno',
    tagline: 'YA ESTOY EN RAVEXRADAR',
    handle: handleOf(c.user),
    avatar: c.user?.avatar_url || '',
    role: c.user?.role || 'DJ',
    city: c.user?.city || ''
  }),
  async prepare(S, R) {
    const img = await loadImage(S.avatar, 1080);
    let photo = null, duo = null, bw = null;
    if (img) {
      const S2 = 1080;
      photo = makeCanvas(S2, S2);
      const pg = photo.getContext('2d');
      drawCover(pg, img, 0, 0, S2, S2, { fy: 0.35 });
      // duotono del color del rol (una sola vez)
      duo = makeCanvas(S2, S2);
      const dg = duo.getContext('2d');
      dg.drawImage(photo, 0, 0);
      bw = makeCanvas(S2, S2);
      const bg2 = bw.getContext('2d');
      try {
        const d = dg.getImageData(0, 0, S2, S2);
        const px = d.data;
        const bd = bg2.createImageData(S2, S2);
        const bpx = bd.data;
        const ac = R.accentRgb;
        for (let i = 0; i < px.length; i += 4) {
          const Lm = clamp(((0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255 - 0.05) / 0.85);
          let gv = clamp((Lm - 0.02) / 0.9);
          gv = 8 + gv * gv * (3 - 2 * gv) * 247;
          bpx[i] = bpx[i + 1] = bpx[i + 2] = gv;
          bpx[i + 3] = 255;
          const [a, c, u] = Lm < 0.55 ? [[9, 9, 11], ac, Lm / 0.55] : [ac, R.hiRgb, (Lm - 0.55) / 0.45];
          px[i] = lerp(a[0], c[0], u);
          px[i + 1] = lerp(a[1], c[1], u);
          px[i + 2] = lerp(a[2], c[2], u);
        }
        dg.putImageData(d, 0, 0);
        bg2.putImageData(bd, 0, 0);
      } catch {
        duo = photo;
        bw = photo;
      }
      for (const cv of [photo, duo, bw]) {
        const gg = cv.getContext('2d');
        gg.globalCompositeOperation = 'destination-in';
        const gr = gg.createLinearGradient(0, 0, 0, S2);
        gr.addColorStop(0, 'rgba(0,0,0,0)');
        gr.addColorStop(0.17, 'rgba(0,0,0,1)');
        gr.addColorStop(0.8, 'rgba(0,0,0,1)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        gg.fillStyle = gr;
        gg.fillRect(0, 0, S2, S2);
        gg.globalCompositeOperation = 'source-over';
      }
    }
    return { photo, duo, bw };
  },
  render(g, t, R) {
    const { clock, S, A } = R;
    const L = frame(R);
    const b = clock.beat(t);
    const k = clock.kick(t, clock.at(16));
    const words = String(S.words || '').split('|').map((w) => up(w.trim())).filter(Boolean).slice(0, 4);
    const RCY = L.mid - 40 * L.F;
    if (b < 16) {
      bgBase(g, R);
      const z = easeIn((b - 13.6) / 2.4);
      g.save();
      const blip = { x: 540 + 240 * L.F, y: RCY - 160 * L.F };
      const fx = lerp(540, blip.x, Math.min(1, z * 1.6)), fy = lerp(RCY, blip.y, Math.min(1, z * 1.6));
      g.translate(540, RCY);
      g.scale(1 + z * 9, 1 + z * 9);
      g.translate(-fx, -fy);
      radar(g, R, t, 540, RCY, 500 * L.F);
      if (b >= 6) {
        for (let i = 0; i < 2; i++) {
          const p = (b + i * 0.5) % 1;
          g.strokeStyle = rgba(R.accent, 0.9 * (1 - p));
          g.lineWidth = 3;
          g.beginPath();
          g.arc(blip.x, blip.y, 14 + p * 70, 0, Math.PI * 2);
          g.stroke();
        }
        const pop = easeOut((b - 6) / 0.5);
        g.fillStyle = R.accent;
        g.beginPath();
        g.arc(blip.x, blip.y, 16 * pop, 0, Math.PI * 2);
        g.fill();
      }
      const drop = easeOut((t - 0.15) / 0.45);
      if (t > 0.15) {
        for (let i = 0; i < 3; i++) ripple(g, 540, RCY + 4, 120, t / 1.8 + i / 3, R.hi, drop);
        drawPin(g, 540, RCY + lerp(-260, 0, drop), 150, R.hi, clamp((t - 0.15) / 0.2));
      }
      g.restore();
      const hud = 1 - clamp(z * 2.2);
      brandWord(g, 540, L.top + 30, 64 * L.F, { alpha: clamp((t - 0.3) / 0.5) * hud, color: R.accent });
      text(g, 'EL MAPA DEL TECHNO', 540, L.top + 85 * L.F, { size: 28 * L.F, weight: 600, color: C.muted, spacing: 8, alpha: clamp((t - 0.6) / 0.5) * hud });
      g.save();
      g.globalAlpha = hud;
      typeLine(g, '> ESCANEANDO EL MAPA', 0.4, t, 110, L.bottom - 90 * L.F, { size: 32 * L.F, cursor: b < 6 });
      if (b >= 6) typeLine(g, `> SEÑAL DETECTADA: ${roleWord(S.role)}`, clock.at(6), t, 110, L.bottom - 40 * L.F, { size: 32 * L.F, color: R.accent });
      g.restore();
      if (b >= 12 && words.length) {
        const wi = Math.min(words.length - 1, Math.floor(b - 12));
        const lb = b - 12 - wi;
        const s = lerp(1.35, 1, easeOut(lb / 0.25));
        g.save();
        g.translate(540, RCY + 60);
        g.scale(s, s);
        g.fillStyle = 'rgba(9,9,11,0.55)';
        g.fillRect(-560, -150, 1120, 190);
        const wf = fitOne(g, words[wi], 960, 170 * L.F, { min: 60 });
        text(g, wf.text, 0, 0, { size: wf.size, weight: 800, color: wi === words.length - 1 ? R.hi : C.text, shadow: { color: R.accent, dx: 6, dy: 6 } });
        g.restore();
      }
      flicker(g, R, t, b, 14, 16);
    } else if (b < 32) {
      const lb = b - 16, bi = Math.floor(b), td = t - clock.at(16), ph = lb % 1;
      g.fillStyle = C.bg;
      g.fillRect(0, 0, W, R.H);
      outlineBackdrop(g, R, up(S.name), 250 * L.F, Math.floor(lb) * 26 + easeOut(ph / 0.3) * 26, { alpha: 0.22, rowStep: 230 * L.F });
      const photoCy = L.mid + 20 * L.F;
      if (A.photo) {
        const sz = (R.post ? 840 : 1080) * (1.02 + td * 0.01 + k * 0.05);
        const sh = k * 6;
        const img = Math.floor(lb) % 4 === 0 ? A.photo : A.duo || A.photo;
        g.drawImage(img, 540 - sz / 2 + (rnd(bi * 1.3) - 0.5) * sh, photoCy - sz / 2 + (rnd(bi * 2.9) - 0.5) * sh, sz, sz);
      } else {
        g.save();
        g.translate(540, photoCy);
        g.scale(1 + k * 0.05, 1 + k * 0.05);
        drawPin(g, 0, 200, 420, R.accent);
        g.restore();
      }
      if (ph < 0.22 && rnd(bi * 3.1) > 0.45) glitch(g, R.canvas, bi, 90, 7);
      const fl = Math.floor(lb) % 4 === 0 ? Math.max(0, 1 - ph / 0.35) : 0;
      if (fl > 0) flash(g, W, R.H, Math.floor(lb) === 0 ? 0.8 * fl : 0.16 * fl, Math.floor(lb) === 0 ? '255,255,255' : R.accentRgb.join(','));
      const slam = easeOut(td / 0.3);
      const nf = fitLines(g, up(S.name), { maxW: 1000, maxLines: 3, size: 300 * L.F, min: 56, spacing: -4 });
      g.save();
      g.translate(540, L.top + nf.size * 0.75);
      const sc = lerp(1.35, 1, slam) * (1 + k * 0.025);
      g.scale(sc, sc);
      g.globalAlpha = clamp(td / 0.1);
      drawLines(g, nf, -k * 6, 0, { weight: 800, spacing: -4, shadow: { color: R.accent, dx: 8 + k * 14, dy: 6 } });
      g.restore();
      const tagY = L.top + nf.size * 0.75 + (nf.lines.length - 1) * nf.lineH + 50 * L.F;
      if (lb >= 4) {
        const a = easeOut((lb - 4) / 0.6);
        g.save();
        g.globalAlpha = a;
        g.translate(lerp(-60, 0, a), 0);
        const badge = roleWord(S.role);
        const genre = fitOne(g, up(S.genre), 640, 40 * L.F, { min: 22 });
        g.font = `800 ${40 * L.F}px Syne, sans-serif`;
        const dw = g.measureText(badge).width + 44;
        g.font = `800 ${genre.size}px Syne, sans-serif`;
        const gw = g.measureText(genre.text).width + 44;
        const x0 = 540 - (dw + 12 + gw) / 2;
        g.fillStyle = R.accent;
        roundRect(g, x0, tagY, dw, 66 * L.F, 12);
        g.fill();
        g.fillStyle = 'rgba(9,9,11,0.72)';
        roundRect(g, x0 + dw + 12, tagY, gw, 66 * L.F, 12);
        g.fill();
        text(g, badge, x0 + dw / 2, tagY + 48 * L.F, { size: 40 * L.F, weight: 800 });
        text(g, genre.text, x0 + dw + 12 + gw / 2, tagY + 48 * L.F, { size: genre.size, weight: 800 });
        g.restore();
      }
      if (lb >= 8) tape(g, W, L.bottom - 230 * L.F, 0.07, 92 * L.F, R.accent, R.ink, `  ${up(S.name)}  •  ${up(S.genre)}  •`, td * 180 + Math.floor(lb) * 30, lerp(-W * 1.3, 0, easeOut((lb - 8) / 0.5)));
      if (lb >= 12) tape(g, W, L.bottom - 110 * L.F, -0.06, 110 * L.F, '#fafafa', C.bg, `  ${up(S.tagline)}  •`, -(td * 220 + Math.floor(lb) * 36), lerp(W * 1.3, 0, easeOut((lb - 12) / 0.5)));
    } else {
      const lb = b - 32, td = t - clock.at(32);
      const kk = clock.kick(t, clock.at(16), 0.06) * clamp(1 - td / 2.5);
      g.fillStyle = C.bg;
      g.fillRect(0, 0, W, R.H);
      if (A.photo) {
        const sz = (R.post ? 760 : 1080) * (1.06 + td * 0.022 + kk * 0.02);
        g.drawImage(A.bw || A.photo, 540 - sz / 2, L.top + (R.post ? 330 : 600) - sz / 2, sz, sz);
      }
      const gr = g.createLinearGradient(0, L.mid, 0, L.bottom);
      gr.addColorStop(0, 'rgba(9,9,11,0)');
      gr.addColorStop(1, 'rgba(9,9,11,0.96)');
      g.fillStyle = gr;
      g.fillRect(0, L.mid, W, R.H);
      flash(g, W, R.H, 0.95 * Math.max(0, 1 - td / 0.45) ** 2);
      const nf = fitLines(g, up(S.name), { maxW: 980, maxLines: 2, size: 190 * L.F, min: 64 });
      const ny = L.bottom - 330 * L.F - (nf.lines.length - 1) * nf.lineH + (1 - easeOut(ap(lb, 1, 0.6))) * 40;
      drawLines(g, nf, 540, ny, { weight: 800, alpha: ap(lb, 1, 0.6) });
      signOff(g, R, ap(lb, 2.5, 0.6), { label: 'YA FORMA PARTE DE', handle: S.handle, y: L.bottom - 230 * L.F });
    }
    finish(g, W, R.H);
  }
};

// ---------- 8. ANUNCIO DE FIESTA (club, promotor) ----------
const EVENT_PROMO = {
  id: 'event',
  name: 'Anuncio de fiesta',
  desc: 'Fecha, sala, cartel y lineup',
  icon: 'Flame',
  roles: ['Club', 'Promotor'],
  source: 'hosted',
  music: 'event',
  dropBeat: 16,
  beats: () => 46,
  fields: [
    { key: 'event', label: 'Fiesta', max: 70 },
    { key: 'date', label: 'Fecha', max: 22 },
    { key: 'time', label: 'Hora', max: 16 },
    { key: 'venue', label: 'Sala', max: 50 },
    { key: 'city', label: 'Ciudad', max: 30 },
    { key: 'lineup', label: 'Lineup (uno por línea)', type: 'textarea', rows: 5 },
    { key: 'cta', label: 'Frase final', max: 36 }
  ],
  autofill: (c, ev) => ({
    ...evText(ev, c.user),
    time: ev?.start_time ? `${String(ev.start_time).slice(0, 5)}H` : '',
    venue: ev?.venue_name || c.user?.username || '',
    city: ev?.city || c.user?.city || '',
    cta: 'BÚSCALA EN EL MAPA',
    handle: handleOf(c.user)
  }),
  prepare: eventAssets,
  render(g, t, R) {
    const { clock, S, A } = R;
    const L = frame(R);
    const b = clock.beat(t);
    const k = clock.kick(t, clock.at(16));
    const dateWords = up(S.date).split(/\s+/).slice(0, 3);
    const names = String(S.lineup || '').split(/\r?\n/).map((s) => up(s.trim())).filter(Boolean).slice(0, R.post ? 6 : 8);
    if (b < 16) {
      bgBase(g, R);
      g.save();
      g.strokeStyle = 'rgba(244,244,245,0.07)';
      g.lineWidth = 10;
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        g.moveTo(-100, 300 + i * 290 + rnd(i) * 120);
        g.lineTo(W + 100, 200 + i * 310 - rnd(i + 9) * 160);
        g.stroke();
      }
      g.restore();
      const drop = easeOutBack(ap(t, 0.15, 0.5));
      const px = 820, py = L.mid + 140 * L.F;
      for (let i = 0; i < 3; i++) ripple(g, px, py, 170, b / 2 + i / 3, R.accent, ap(t, 0.5, 0.3));
      drawPin(g, px, lerp(-200, py, drop), 180 * L.F, R.accent);
      typeLine(g, '> NUEVA FIESTA EN EL MAPA', 0.3, t, 110, L.top + 40, { size: 34 * L.F });
      dateWords.forEach((w, i) => {
        const ai = easeOut((b - (4 + i * 0.75)) / 0.4);
        if (ai <= 0) return;
        g.save();
        g.translate(110, L.top + 260 * L.F + i * 150 * L.F);
        g.scale(lerp(1.4, 1, ai), lerp(1.4, 1, ai));
        g.globalAlpha = ai;
        text(g, w, 0, 0, { size: 150 * L.F, weight: 800, color: i === 1 ? R.accent : C.text, align: 'left' });
        g.restore();
      });
      if (S.time) text(g, S.time, 116, L.top + 260 * L.F + dateWords.length * 150 * L.F - 40, { size: 42 * L.F, weight: 700, color: C.soft, align: 'left', spacing: 3, alpha: ap(b, 6.5, 0.5) });
      if (b >= 8 && (S.venue || S.city)) {
        const a = easeOut((b - 8) / 0.5);
        g.save();
        g.globalAlpha = a;
        g.translate(lerp(60, 0, a), 0);
        const vy = L.bottom - 340 * L.F;
        drawPin(g, 130, vy + 10, 60 * L.F, R.accent);
        const vf = fitOne(g, up(S.venue || S.city), 800, 56 * L.F, { min: 28 });
        text(g, vf.text, 180, vy, { size: vf.size, weight: 800, align: 'left' });
        if (S.venue && S.city) text(g, up(S.city), 182, vy + 58 * L.F, { size: 34 * L.F, weight: 600, color: C.muted, align: 'left', spacing: 6 });
        g.restore();
      }
      if (b >= 12) {
        const lb = b - 12;
        g.fillStyle = 'rgba(9,9,11,0.82)';
        g.fillRect(0, L.bottom - 200 * L.F, W, 170 * L.F);
        const label = up(S.event);
        const reveal = clamp(lb / 3);
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@%';
        let txt = '';
        for (let i = 0; i < label.length; i++) txt += i / label.length < reveal || label[i] === ' ' ? label[i] : chars[Math.floor(rnd(i * 13 + Math.floor(t * 20)) * chars.length)];
        const ff = fitOne(g, label, 940, 80 * L.F, { min: 30 });
        text(g, txt.slice(0, ff.text.length), 540, L.bottom - 90 * L.F, { size: ff.size, weight: 800 });
      }
      flicker(g, R, t, b, 14, 16);
    } else if (b < 26) {
      const lb = b - 16, bi = Math.floor(b), td = t - clock.at(16);
      g.drawImage(A.bg, 0, 0);
      dotGrid(g, W, R.H, 0.05);
      drawFlyer(g, R, A, 540, L.mid + 150 * L.F, (R.post ? 0.68 : 0.82) + td * 0.012 + k * 0.035, k, bi);
      if (lb % 4 < 0.2 && rnd(bi * 3.1) > 0.4) glitch(g, R.canvas, bi, 70, 6);
      const slam = easeOut(td / 0.3);
      const nf = fitLines(g, up(S.event), { maxW: 980, maxLines: 3, size: 120 * L.F, min: 56 });
      g.save();
      g.translate(540, L.top + nf.size * 0.7);
      g.scale(lerp(1.3, 1, slam), lerp(1.3, 1, slam));
      g.globalAlpha = clamp(td / 0.1);
      drawLines(g, nf, 0, 0, { weight: 800, shadow: { color: R.accent, dx: 6, dy: 6 } });
      g.restore();
      const info = fitOne(g, [up(S.date), up(S.city)].filter(Boolean).join('  ·  '), 960, 40 * L.F, { min: 22, weight: 700, spacing: 4 });
      text(g, info.text, 540, L.top + nf.size * 0.7 + (nf.lines.length - 1) * nf.lineH + 70 * L.F, { size: info.size, weight: 700, color: C.soft, spacing: 4, alpha: ap(lb, 1, 0.5) });
      const fl = Math.floor(lb) % 4 === 0 ? Math.max(0, 1 - (lb % 1) / 0.5) : 0;
      if (fl > 0) flash(g, W, R.H, Math.floor(lb) === 0 ? 0.8 * fl : 0.15 * fl, Math.floor(lb) === 0 ? '255,255,255' : R.accentRgb.join(','));
    } else if (b < 38) {
      const lb = b - 26;
      g.drawImage(A.bg, 0, 0);
      g.fillStyle = 'rgba(9,9,11,0.55)';
      g.fillRect(0, 0, W, R.H);
      dotGrid(g, W, R.H, 0.06);
      text(g, 'LINEUP', 540, L.top + 60 * L.F, { size: 64 * L.F, weight: 800, color: R.accent, spacing: 18, alpha: ap(lb, 0, 0.3) });
      const n = Math.max(1, names.length);
      const per = Math.max(1, Math.min(1.5, 9 / n));
      const rowH = Math.min(140 * L.F, (L.bottom - L.top - 320 * L.F) / n);
      const top = L.mid - (n * rowH) / 2 + rowH * 0.7;
      (names.length ? names : ['LINEUP POR ANUNCIAR']).forEach((name, i) => {
        const a = easeOut((lb - 0.5 - i * per) / 0.35);
        if (a <= 0) return;
        const isNew = lb - 0.5 - i * per < 1;
        g.save();
        g.translate(540, top + i * rowH);
        g.scale(lerp(1.5, 1, a) * (isNew ? 1 + k * 0.04 : 1), lerp(1.5, 1, a) * (isNew ? 1 + k * 0.04 : 1));
        g.globalAlpha = a;
        const nf = fitOne(g, name, 960, rowH * 0.78, { min: 30 });
        text(g, nf.text, 0, 0, { size: nf.size, weight: 800, shadow: { color: rgba(R.accent, 0.9), dx: 5, dy: 5 } });
        g.restore();
      });
      if (S.venue) {
        const vf = fitOne(g, `${up(S.venue)}${S.city ? ` · ${up(S.city)}` : ''}`, 960, 36 * L.F, { min: 20, weight: 700, spacing: 4 });
        text(g, vf.text, 540, L.bottom - 60 * L.F, { size: vf.size, weight: 700, color: C.soft, spacing: 4, alpha: ap(lb, 2) });
      }
      if (lb % 4 < 0.15) flash(g, W, R.H, 0.25 * (1 - (lb % 4) / 0.15), R.accentRgb.join(','));
    } else {
      const lb = b - 38;
      bgBase(g, R);
      flash(g, W, R.H, 0.9 * Math.max(0, 1 - (t - clock.at(38)) / 0.4) ** 2);
      text(g, '¿VAS?', 540, L.mid - 120 * L.F, { size: 150 * L.F, weight: 800, alpha: ap(lb, 0.5, 0.4) });
      goingButton(g, 540, L.mid + 30 * L.F, 600, 130 * L.F, b, easeOutBack(ap(lb, 1.5, 0.5)), { label: 'VOY A IR', color: R.accent, hi: R.hi, k: k * 0.6 });
      const cf = fitOne(g, up(S.cta), 960, 40 * L.F, { min: 22, weight: 700, spacing: 8 });
      text(g, cf.text, 540, L.mid + 220 * L.F, { size: cf.size, weight: 700, color: C.muted, spacing: 8, alpha: ap(lb, 3) });
      brandWord(g, 540, L.mid + 340 * L.F, 76 * L.F, { pin: true, alpha: ap(lb, 4), maxW: 900, color: R.accent });
      text(g, 'ravexradar.com', 540, L.mid + 420 * L.F, { size: 36 * L.F, weight: 600, color: C.soft, spacing: 2, alpha: ap(lb, 5) });
    }
    finish(g, W, R.H);
  }
};

// ---------- 9. LINEUP (DJ, club, promotor) ----------
const LINEUP = {
  id: 'lineup',
  name: 'Lineup',
  desc: 'Los artistas uno a uno, al ritmo',
  icon: 'ListMusic',
  roles: ['DJ', 'Club', 'Promotor'],
  source: 'work',
  music: 'event',
  dropBeat: 8,
  beats: (S) => 8 + Math.max(2, Math.min(8, String(S.lineup || '').split(/\n/).filter((s) => s.trim()).length)) * 2 + 8,
  fields: [
    { key: 'event', label: 'Fiesta', max: 70 },
    { key: 'date', label: 'Fecha', max: 22 },
    { key: 'place', label: 'Sala y ciudad', max: 60 },
    { key: 'lineup', label: 'Lineup (uno por línea)', type: 'textarea', rows: 6 },
    { key: 'handle', label: 'Tu usuario', max: 32 }
  ],
  autofill: (c, ev) => ({ ...evText(ev, c.user), handle: handleOf(c.user), me: String(c.user?.username || '').toLowerCase() }),
  // (en el lineup se respeta el nombre tal cual aparece en la fiesta)
  prepare: eventAssets,
  render(g, t, R) {
    const { clock, S, A } = R;
    const L = frame(R);
    const b = clock.beat(t);
    const k = clock.kick(t, clock.at(8));
    const names = String(S.lineup || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, R.post ? 6 : 8);
    if (b < 8) return buildIntro(g, R, t, b, { line: 'CARGANDO LINEUP', kicker: S.date, words: ['LINEUP'], sub: S.event });
    g.drawImage(A.bg, 0, 0);
    g.fillStyle = 'rgba(9,9,11,0.5)';
    g.fillRect(0, 0, W, R.H);
    dotGrid(g, W, R.H, 0.06);
    // cabecera: LINEUP letra a letra y la fiesta
    const word = 'LINEUP';
    g.font = `800 ${150 * L.F}px Syne, sans-serif`;
    const ww = g.measureText(word).width;
    let x = 540 - ww / 2;
    [...word].forEach((ch, i) => {
      const a = easeOut(ap(b, 0.5 + i * 0.6, 0.7));
      const cw = g.measureText(ch).width;
      if (a > 0) text(g, ch, x + cw / 2, L.top + 140 * L.F + (1 - a) * -60, { size: 150 * L.F, weight: 800, color: i % 2 ? C.text : R.accent, alpha: a });
      x += cw;
    });
    const ef = fitLines(g, up(S.event), { maxW: 940, maxLines: 2, size: 58 * L.F, min: 30 });
    drawLines(g, ef, 540, L.top + 230 * L.F, { weight: 800, color: C.soft, alpha: ap(b, 4.5, 0.9) });
    const info = [up(S.date), up(S.place)].filter(Boolean).join('  ·  ');
    const inf = fitOne(g, info, 960, 34 * L.F, { min: 20, weight: 700, spacing: 3 });
    text(g, inf.text, 540, L.top + 230 * L.F + (ef.lines.length - 1) * ef.lineH + 60 * L.F, { size: inf.size, weight: 700, color: R.accent, spacing: 3, alpha: ap(b, 5.5, 0.9) });
    flicker(g, R, t, b, 7, 8);
    if (b >= 8 && b < 8.6) flash(g, W, R.H, 0.75 * (1 - (b - 8) / 0.6));
    const listTop = L.top + 230 * L.F + (ef.lines.length - 1) * ef.lineH + 160 * L.F;
    const n = Math.max(1, names.length);
    const rowH = Math.min(150 * L.F, (L.bottom - 200 * L.F - listTop) / n);
    names.forEach((name, i) => {
      const a = easeOut(ap(b, 8 + i * 2, 0.6));
      if (a <= 0) return;
      const isNew = b - (8 + i * 2) < 1;
      const isMe = S.me && name.toLowerCase() === S.me;
      g.save();
      g.translate(540, listTop + i * rowH + rowH * 0.75);
      const s = lerp(1.25, 1, a) * (isNew ? 1 + k * 0.03 : 1);
      g.scale(s, s);
      g.globalAlpha = a;
      let nf = fitLines(g, up(name), { maxW: 960, maxLines: 1, size: rowH * 0.8, min: 46 });
      if (nf.lines[0]?.endsWith('…')) nf = fitLines(g, up(name), { maxW: 960, maxLines: 2, size: rowH * 0.42, min: 24 });
      drawLines(g, nf, 0, -(nf.lines.length - 1) * nf.lineH * 0.5, { weight: 800, color: isMe ? R.hi : C.text, shadow: { color: rgba(R.accent, 0.9), dx: 5, dy: 5 } });
      g.restore();
    });
    const endB = 8 + names.length * 2;
    signOff(g, R, ap(b, endB + 1, 1), { label: 'TODA LA INFO EN', handle: S.handle, y: L.bottom - 110 * L.F });
    finish(g, W, R.H);
  }
};

// ============================================================================
// MÁS PLANTILLAS (lote 2)
// Todas siguen el mismo esquema tranquilo: 8 pasos de entrada, drop en el 8,
// bloque principal hasta el 20 y cierre. Un paso ≈ 0,9 s (medio tiempo).
// ============================================================================
const daysUntil = (iso) => {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((d - today) / 86400000));
};

/** Cierre común: frase grande + botón opcional + firma */
function outroBlock(g, R, t, b, from, { title = '', button = null, label = 'BÚSCAME EN', handle = '' } = {}) {
  const { clock } = R;
  const L = frame(R);
  const lb = b - from;
  bgBase(g, R);
  flash(g, W, R.H, 0.75 * Math.max(0, 1 - (t - clock.at(from)) / 0.6) ** 2);
  if (title) {
    const q = fitLines(g, up(title), { maxW: 960, maxLines: 2, size: 140 * L.F, min: 56 });
    const ty = L.mid - (button ? 60 : 0) * L.F - (q.lines.length - 1) * q.lineH;
    g.save();
    const a = easeOut(ap(lb, 0, 0.8));
    g.globalAlpha = a;
    g.translate(540, ty);
    g.scale(lerp(1.15, 1, a), lerp(1.15, 1, a));
    drawLines(g, q, 0, 0, { weight: 800, shadow: { color: R.accent, dx: 6, dy: 6 } });
    g.restore();
  }
  if (button) goingButton(g, 540, L.mid + 110 * L.F, 620, 130 * L.F, b, easeOutBack(ap(lb, 1, 0.8)), { label: button, color: R.accent, hi: R.hi, k: clock.kick(t, clock.at(from)) * 0.5 });
  signOff(g, R, ap(lb, 2, 1), { label, handle });
}

/** Confeti lento (caída suave, determinista) */
function confetti(g, R, t, t0, n = 40) {
  const td = t - t0;
  if (td <= 0) return;
  for (let i = 0; i < n; i++) {
    const x = rnd(i * 4.1) * W + Math.sin(td * 0.8 + i) * 30;
    const y = -60 + ((rnd(i * 2.3) * R.H * 0.6 + td * (90 + rnd(i) * 80)) % (R.H + 120));
    g.save();
    g.translate(x, y);
    g.rotate(td * (0.6 + rnd(i * 7) * 1.2) + i);
    g.fillStyle = [R.accent, R.hi, '#fafafa'][i % 3];
    g.globalAlpha = 0.85 * clamp(td / 0.6);
    g.fillRect(-9, -4, 18, 8);
    g.restore();
  }
}

// ---------- 10. CUENTA ATRÁS (todos) ----------
const COUNTDOWN = {
  id: 'countdown',
  name: 'Cuenta atrás',
  desc: 'Los días que faltan para la fiesta',
  icon: 'Timer',
  roles: 'all',
  source: 'countdown',
  music: 'event',
  dropBeat: 8,
  beats: () => 28,
  fields: [
    { key: 'kicker', label: 'Encima del número', max: 20 },
    { key: 'days', label: 'Días que faltan', max: 3 },
    { key: 'event', label: 'Fiesta', max: 70 },
    { key: 'date', label: 'Fecha', max: 22 },
    { key: 'place', label: 'Sala y ciudad', max: 60 },
    { key: 'cta', label: 'Frase final', max: 30 },
    { key: 'handle', label: 'Tu usuario', max: 32 }
  ],
  autofill: (c, ev) => {
    const d = daysUntil(ev?.start_date);
    return {
      kicker: d === 0 ? 'ES' : 'FALTAN',
      days: d == null ? '3' : String(d),
      cta: '¿TE VIENES?',
      handle: handleOf(c.user),
      ...evText(ev, c.user)
    };
  },
  prepare: eventAssets,
  render(g, t, R) {
    const { clock, S, A } = R;
    const L = frame(R);
    const b = clock.beat(t);
    const k = clock.kick(t, clock.at(8));
    const n = parseInt(S.days, 10);
    const today = n === 0;
    const unit = today ? '' : n === 1 ? 'DÍA' : 'DÍAS';
    const bigText = (num) => (today ? 'HOY' : String(num));
    if (b < 8) {
      bgBase(g, R);
      typeLine(g, '> CUENTA ATRÁS ACTIVADA', 0.3, t, 110, L.top + 40, { size: 34 * L.F });
      const cy = L.mid - 20 * L.F;
      const rad = 330 * L.F;
      // anillo que se completa hasta el drop
      g.save();
      g.lineWidth = 14;
      g.strokeStyle = rgba(R.accent, 0.18);
      g.beginPath();
      g.arc(540, cy, rad, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = R.accent;
      g.lineCap = 'round';
      g.beginPath();
      g.arc(540, cy, rad, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(b / 8), false);
      g.stroke();
      g.restore();
      text(g, up(S.kicker), 540, cy - 170 * L.F, { size: 48 * L.F, weight: 700, color: C.soft, spacing: 12, alpha: ap(b, 1, 0.8) });
      if (Number.isFinite(n) && b >= 1) {
        // el número baja de uno en uno, un cambio por paso
        const shown = n + Math.max(0, 6 - Math.floor(b - 1));
        const pop = easeOut(((b - 1) % 1) / 0.5);
        const f = fitOne(g, bigText(shown), 600, 300 * L.F, { min: 120 });
        g.save();
        g.translate(540, cy + f.size * 0.33);
        g.scale(lerp(1.12, 1, pop), lerp(1.12, 1, pop));
        g.globalAlpha = 0.6 + 0.4 * pop;
        text(g, f.text, 0, 0, { size: f.size, weight: 800, color: shown === n ? R.hi : C.text });
        g.restore();
      }
      text(g, unit, 540, cy + 190 * L.F, { size: 56 * L.F, weight: 800, color: R.accent, spacing: 14, alpha: ap(b, 2, 0.8) });
      text(g, up(S.when), 540, L.bottom - 60 * L.F, { size: 40 * L.F, weight: 700, color: C.soft, spacing: 8, alpha: ap(b, 4, 0.8) });
      flicker(g, R, t, b, 7, 8);
    } else if (b < 20) {
      const lb = b - 8, td = t - clock.at(8);
      g.drawImage(A.bg, 0, 0);
      dotGrid(g, W, R.H, 0.05);
      flash(g, W, R.H, lb < 0.6 ? 0.8 * (1 - lb / 0.6) : 0);
      // número grande arriba
      const head = today ? 'ES HOY' : `${up(S.kicker)} ${S.days} ${unit}`;
      const hf = fitOne(g, head, 980, 130 * L.F, { min: 56 });
      const slam = easeOut(td / 0.35);
      g.save();
      g.translate(540, L.top + hf.size * 0.85);
      g.scale(lerp(1.3, 1, slam) * (1 + k * 0.02), lerp(1.3, 1, slam) * (1 + k * 0.02));
      g.globalAlpha = clamp(td / 0.12);
      text(g, hf.text, 0, 0, { size: hf.size, weight: 800, color: R.hi, shadow: { color: R.accent, dx: 6, dy: 6 } });
      g.restore();
      const lay = cardLayout(g, R, { ...S, set: '' });
      const cardY = L.bottom - 40 * L.F - lay.h;
      const flyTop = L.top + hf.size * 1.25;
      if (A.flyer) {
        const room = Math.max(120, cardY - 30 - flyTop);
        const s = Math.min(1, room / A.flyer.height, 760 / A.flyer.width) * (1 + k * 0.02 + td * 0.004);
        drawFlyer(g, R, A, 540, flyTop + (A.flyer.height * s) / 2, s, k, Math.floor(b));
      }
      eventCard(g, R, { ...S, set: '' }, cardY, easeOutBack(ap(lb, 1, 0.9)), b, k, lay);
    } else {
      outroBlock(g, R, t, b, 20, { title: S.cta, button: '✓  VOY A IR', handle: S.handle });
    }
    finish(g, W, R.H);
  }
};

// ---------- 11. ESTE FINDE EN MI CIUDAD (todos) ----------
const WEEKEND = listTemplate({
  id: 'weekend',
  name: 'Este finde en tu ciudad',
  desc: 'Las fiestas más top del finde',
  icon: 'CalendarRange',
  roles: 'all',
  source: 'weekend',
  music: 'event',
  kicker: 'ESTE FINDE EN',
  title: (c) => up(c?.user?.city || 'TU CIUDAD'),
  outroLabel: 'TODAS LAS FIESTAS EN'
});

// ---------- 12. ESTO O AQUELLO (todos) ----------
const THIS_OR_THAT = {
  id: 'this-or-that',
  name: 'Esto o aquello',
  desc: 'Dos fiestas, que voten tus seguidores',
  icon: 'Scale',
  roles: 'all',
  source: 'pair',
  music: 'event',
  multi: true,
  dropBeat: 8,
  beats: () => 28,
  posterBeat: () => 16,
  fields: [
    { key: 'a_event', label: 'Fiesta A', max: 60 },
    { key: 'a_info', label: 'Fecha y sala A', max: 50 },
    { key: 'b_event', label: 'Fiesta B', max: 60 },
    { key: 'b_info', label: 'Fecha y sala B', max: 50 },
    { key: 'question', label: 'Pregunta', max: 30 },
    { key: 'handle', label: 'Tu usuario', max: 32 }
  ],
  autofill: (c, _ev, list) => {
    const [a, bb] = list || [];
    const info = (e, fb) => (e ? [fmtDate(e.start_date), e.venue_name || e.city].filter(Boolean).join(' · ') : fb);
    return {
      a_event: a?.name || 'FIESTA A',
      a_info: info(a, 'SÁB · SALA'),
      b_event: bb?.name || 'FIESTA B',
      b_info: info(bb, 'SÁB · SALA'),
      question: '¿A CUÁL VAMOS?',
      handle: handleOf(c.user),
      image: a?.image_url || '',
      image2: bb?.image_url || ''
    };
  },
  async prepare(S, R) {
    const [i1, i2] = await Promise.all([loadImage(S.image, 1080), loadImage(S.image2, 1080)]);
    const half = (img) => {
      const cv = makeCanvas(W, Math.round(R.H / 2));
      const c = cv.getContext('2d');
      c.fillStyle = '#111116';
      c.fillRect(0, 0, W, cv.height);
      if (img) drawCover(c, img, 0, 0, W, cv.height, { fy: 0.4 });
      c.fillStyle = 'rgba(9,9,11,0.45)';
      c.fillRect(0, 0, W, cv.height);
      return cv;
    };
    return { top: half(i1), bot: half(i2) };
  },
  render(g, t, R) {
    const { clock, S, A } = R;
    const L = frame(R);
    const b = clock.beat(t);
    const k = clock.kick(t, clock.at(8));
    const halfH = R.H / 2;
    const drawHalves = (alpha, la, lb2) => {
      g.save();
      g.globalAlpha = alpha;
      g.drawImage(A.top, lerp(-W, 0, la), 0);
      g.drawImage(A.bot, lerp(W, 0, lb2), halfH);
      g.restore();
    };
    const label = (str, info, y, a, tag) => {
      if (a <= 0) return;
      const nf = fitLines(g, up(str), { maxW: 900, maxLines: 2, size: 92 * L.F, min: 44 });
      g.save();
      g.globalAlpha = a;
      g.fillStyle = R.accent;
      roundRect(g, 90, y - nf.size * 0.95 - 70 * L.F, 74 * L.F, 58 * L.F, 12);
      g.fill();
      text(g, tag, 90 + 37 * L.F, y - nf.size * 0.95 - 26 * L.F, { size: 40 * L.F, weight: 800, color: R.ink });
      drawLines(g, nf, 90, y, { weight: 800, align: 'left', shadow: { color: 'rgba(0,0,0,0.6)', dx: 4, dy: 4 } });
      const inf = fitOne(g, up(info), 900, 36 * L.F, { min: 20, weight: 700, spacing: 2 });
      text(g, inf.text, 92, y + (nf.lines.length - 1) * nf.lineH + 56 * L.F, { size: inf.size, weight: 700, color: C.soft, align: 'left', spacing: 2 });
      g.restore();
    };
    if (b < 8) {
      bgBase(g, R);
      typeLine(g, '> DILEMA DEL FINDE', 0.3, t, 110, L.top + 40, { size: 34 * L.F });
      beatWords(g, R, ['ESTO', 'O', 'AQUELLO'], b, 1.5, { y: L.mid - 200 * L.F, size: 200, gap: 1.5 });
      flicker(g, R, t, b, 7, 8);
    } else if (b < 20) {
      const lb = b - 8;
      g.fillStyle = C.bg;
      g.fillRect(0, 0, W, R.H);
      drawHalves(1, easeOut(lb / 0.9), easeOut((lb - 0.6) / 0.9));
      flash(g, W, R.H, lb < 0.6 ? 0.7 * (1 - lb / 0.6) : 0);
      label(S.a_event, S.a_info, Math.max(L.top + 200 * L.F, halfH - 230 * L.F), ap(lb, 1, 0.8), 'A');
      label(S.b_event, S.b_info, Math.min(L.bottom - 170 * L.F, halfH + 330 * L.F), ap(lb, 2, 0.8), 'B');
      // franja central + VS
      g.fillStyle = C.bg;
      g.fillRect(0, halfH - 6, W, 12);
      const vs = easeOutBack(ap(lb, 3, 0.8));
      if (vs > 0) {
        g.save();
        g.translate(540, halfH);
        g.scale(vs * (1 + k * 0.04), vs * (1 + k * 0.04));
        g.fillStyle = R.accent;
        g.beginPath();
        g.arc(0, 0, 110 * L.F, 0, Math.PI * 2);
        g.fill();
        text(g, 'VS', 0, 34 * L.F, { size: 96 * L.F, weight: 800, color: R.ink });
        g.restore();
      }
    } else {
      const lb = b - 20;
      g.fillStyle = C.bg;
      g.fillRect(0, 0, W, R.H);
      drawHalves(0.3, 1, 1);
      flash(g, W, R.H, 0.6 * Math.max(0, 1 - (t - clock.at(20)) / 0.6) ** 2);
      const q = fitLines(g, up(S.question), { maxW: 960, maxLines: 2, size: 130 * L.F, min: 56 });
      const qy = L.top + 220 * L.F;
      drawLines(g, q, 540, qy, { weight: 800, alpha: easeOut(ap(lb, 0, 0.8)), shadow: { color: R.accent, dx: 6, dy: 6 } });
      // hueco para la encuesta de Instagram
      const ha = ap(lb, 1, 0.8);
      if (ha > 0 && !R.post) {
        const by = qy + (q.lines.length - 1) * q.lineH + 120 * L.F;
        g.save();
        g.globalAlpha = ha;
        g.setLineDash([18, 14]);
        g.strokeStyle = rgba(C.text, 0.6);
        g.lineWidth = 4;
        roundRect(g, 160, by, 760, 300, 36);
        g.stroke();
        g.setLineDash([]);
        text(g, 'PON AQUÍ LA ENCUESTA', 540, by + 165, { size: 36, weight: 700, color: C.soft, spacing: 4 });
        g.restore();
      }
      signOff(g, R, ap(lb, 2, 1), { label: 'ENCUÉNTRALAS EN', handle: S.handle });
    }
    finish(g, W, R.H);
  }
};

// ---------- 13. RAVE PASS (raver) ----------
function passCard(g, R, S, A, t, cx, cy, sc, rows, rowsA) {
  const w = 860, h = 1180;
  g.save();
  g.translate(cx, cy);
  g.scale(sc, sc);
  g.translate(-w / 2, -h / 2);
  g.fillStyle = '#121217';
  roundRect(g, 0, 0, w, h, 46);
  g.fill();
  g.save();
  roundRect(g, 0, 0, w, h, 46);
  g.clip();
  // cabecera
  g.fillStyle = R.accent;
  g.fillRect(0, 0, w, 120);
  text(g, 'RAVEXRADAR', 48, 80, { size: 44, weight: 800, color: R.ink, align: 'left', spacing: 1 });
  text(g, 'RAVE PASS', w - 48, 80, { size: 40, weight: 800, color: R.ink, align: 'right', spacing: 4 });
  // brillo holográfico que cruza despacio
  const p = ((t * 0.22) % 1.6) - 0.3;
  const gr = g.createLinearGradient(w * p - 300, 0, w * p + 300, h);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.09)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.restore();
  // foto
  drawAvatar(g, A.avatar, w / 2, 360, 360, { color: R.accent, ring: 10, round: false, initials: S.name });
  // nombre
  const nf = fitLines(g, up(S.name), { maxW: 760, maxLines: 2, size: 92, min: 44 });
  drawLines(g, nf, w / 2, 650, { weight: 800 });
  let y = 650 + (nf.lines.length - 1) * nf.lineH + 90;
  rows.forEach(([lab, val], i) => {
    const a = rowsA(i);
    if (a <= 0 || !val) return;
    g.save();
    g.globalAlpha = a;
    g.translate(lerp(30, 0, a), 0);
    text(g, lab, 70, y, { size: 26, weight: 700, color: C.muted, align: 'left', spacing: 6 });
    const vf = fitOne(g, up(val), 520, 40, { min: 22 });
    text(g, vf.text, w - 70, y, { size: vf.size, weight: 800, color: i === 0 ? R.accent : C.text, align: 'right' });
    g.strokeStyle = C.line;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(70, y + 26);
    g.lineTo(w - 70, y + 26);
    g.stroke();
    g.restore();
    y += 76;
  });
  // código de barras
  g.fillStyle = C.text;
  let bx = 70;
  for (let i = 0; bx < w - 70; i++) {
    const bw = 3 + Math.floor(rnd(i * 3.7 + 1) * 9);
    if (i % 2 === 0) g.fillRect(bx, h - 120, bw, 70);
    bx += bw + 3;
  }
  g.save();
  roundRect(g, 0, 0, w, h, 46);
  g.clip();
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  g.restore();
  g.strokeStyle = rgba(R.accent, 0.8);
  g.lineWidth = 4;
  roundRect(g, 0, 0, w, h, 46);
  g.stroke();
  g.restore();
}

const RAVE_PASS = {
  id: 'rave-pass',
  name: 'Rave Pass',
  desc: 'Tu carné de raver con tus datos',
  icon: 'BadgeCheck',
  roles: ['Raver'],
  source: 'raver',
  music: 'profile',
  dropBeat: 8,
  beats: () => 28,
  fields: [
    { key: 'name', label: 'Nombre', max: 40 },
    { key: 'city', label: 'Ciudad', max: 30 },
    { key: 'genre', label: 'Estilo', max: 30 },
    { key: 'bpm', label: 'BPM', max: 12 },
    { key: 'stat', label: 'Dato extra', max: 30 },
    { key: 'cta', label: 'Frase final', max: 30 },
    { key: 'handle', label: 'Tu usuario', max: 32 }
  ],
  autofill: (c, _ev, list) => ({
    name: displayName(c.user) || 'TU NOMBRE',
    city: c.user?.city || '',
    genre: c.user?.favorite_subgenre || 'Techno',
    bpm: c.user?.favorite_bpm ? `${c.user.favorite_bpm}` : '',
    stat: (list || []).length ? `${list.length} ${list.length === 1 ? 'FIESTA' : 'FIESTAS'} A LA VISTA` : 'SIEMPRE EN PISTA',
    cta: 'NOS VEMOS EN LA PISTA',
    handle: handleOf(c.user),
    avatar: c.user?.avatar_url || ''
  }),
  async prepare(S) {
    return { avatar: await loadImage(S.avatar, 720) };
  },
  render(g, t, R) {
    const { clock, S, A } = R;
    const L = frame(R);
    const b = clock.beat(t);
    const k = clock.kick(t, clock.at(8));
    const rows = [['CIUDAD', S.city], ['ESTILO', S.genre], ['BPM', S.bpm], ['STATUS', S.stat]].filter((r) => r[1]);
    const fitSc = Math.min(1, (L.bottom - L.top - 60) / 1180) * (R.post ? 1 : 0.95);
    if (b < 8) {
      bgBase(g, R);
      typeLine(g, '> GENERANDO TU RAVE PASS', 0.3, t, 110, L.top + 40, { size: 34 * L.F });
      // líneas de escaneo y contorno que se dibuja
      const pr = clamp(b / 7);
      g.save();
      g.translate(540, L.mid + 20);
      g.scale(fitSc, fitSc);
      g.strokeStyle = R.accent;
      g.lineWidth = 5;
      g.setLineDash([pr * 4100, 5000]);
      roundRect(g, -430, -590, 860, 1180, 46);
      g.stroke();
      g.setLineDash([]);
      const sy = -590 + ((b * 0.5) % 1) * 1180;
      g.fillStyle = rgba(R.accent, 0.25);
      g.fillRect(-430, sy, 860, 6);
      g.restore();
      beatWords(g, R, ['VERIFICANDO', 'RAVER'], b, 3, { y: L.mid - 40 * L.F, size: 140, gap: 2 });
      flicker(g, R, t, b, 7, 8);
    } else if (b < 20) {
      const lb = b - 8, td = t - clock.at(8);
      bgBase(g, R);
      outlineBackdrop(g, R, 'RAVER', 220 * L.F, lb * 20, { alpha: 0.12 });
      flash(g, W, R.H, lb < 0.6 ? 0.8 * (1 - lb / 0.6) : 0);
      const pop = easeOutBack(ap(td, 0, 0.6));
      const sway = Math.sin(td * 0.9) * 0.02;
      g.save();
      g.translate(540, L.mid + 20);
      g.rotate(sway);
      g.translate(-540, -(L.mid + 20));
      passCard(g, R, S, A, t, 540, L.mid + 20, fitSc * pop * (1 + k * 0.012), rows, (i) => easeOut(ap(lb, 1.2 + i, 0.8)));
      g.restore();
      // sello
      const st = easeOutBack(ap(lb, 4.5, 0.8));
      if (st > 0) {
        g.save();
        g.translate(720, L.mid - 330 * fitSc);
        g.rotate(-0.16);
        g.scale(st, st);
        g.strokeStyle = R.hi;
        g.lineWidth = 8;
        roundRect(g, -200, -62, 400, 124, 20);
        g.stroke();
        text(g, '✓ VERIFIED', 0, 20, { size: 56, weight: 800, color: R.hi, spacing: 3 });
        g.restore();
      }
    } else {
      outroBlock(g, R, t, b, 20, { title: S.cta, handle: S.handle, label: 'ENCUÉNTRAME EN' });
    }
    finish(g, W, R.H);
  }
};

// ---------- 14. MI TOP DJS (todos) ----------
const topCount = (S) => Math.max(1, Math.min(5, String(S.list || '').split(/\n/).filter((s) => s.trim()).length));
const TOP_DJS = {
  id: 'top-djs',
  name: 'Mi top DJs',
  desc: 'Tu ranking del 5 al 1',
  icon: 'Trophy',
  roles: 'all',
  source: 'raver',
  music: 'event',
  multi: true,
  dropBeat: 8,
  beats: (S) => 8 + topCount(S) * 2 + 7,
  posterBeat: (S) => 8 + topCount(S) * 2 + 0.2,
  fields: [
    { key: 'title', label: 'Titular', max: 26 },
    { key: 'list', label: 'Tu ranking (el nº 1 arriba, uno por línea)', type: 'textarea', rows: 5 },
    { key: 'cta', label: 'Frase final', max: 30 },
    { key: 'handle', label: 'Tu usuario', max: 32 }
  ],
  autofill: (c, _ev, list) => {
    const count = new Map();
    (list || []).forEach((e) => lineupNames(e).forEach((n) => count.set(n, (count.get(n) || 0) + 1)));
    const names = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n).slice(0, 5);
    while (names.length < 5) names.push(`DJ ${names.length + 1}`);
    return { title: 'MI TOP 5 DJS', list: names.join('\n'), cta: '¿Y EL TUYO?', handle: handleOf(c.user) };
  },
  prepare: async () => ({}),
  render(g, t, R) {
    const { clock, S } = R;
    const L = frame(R);
    const b = clock.beat(t);
    const k = clock.kick(t, clock.at(8));
    const names = String(S.list || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, 5);
    const n = topCount(S);
    const endB = 8 + n * 2;
    if (b < 8) return buildIntro(g, R, t, b, { line: 'MI RANKING', kicker: 'DEL 5 AL 1', words: up(S.title).split(/\s+/) });
    if (b < endB + 1) {
      bgBase(g, R);
      typeLine(g, '> MI RANKING', 0.3, t, 110, L.top + 40, { size: 34 * L.F });
      const tf = fitLines(g, up(S.title), { maxW: 940, maxLines: 2, size: 130 * L.F, min: 56 });
      const ta = easeOut(ap(b, 1, 1));
      g.save();
      g.globalAlpha = ta;
      g.translate(540, L.top + 120 * L.F + tf.size * 0.8);
      g.scale(lerp(1.2, 1, ta), lerp(1.2, 1, ta));
      drawLines(g, tf, 0, 0, { weight: 800, shadow: { color: R.accent, dx: 6, dy: 6 } });
      g.restore();
      text(g, 'CUENTA ATRÁS DEL 5 AL 1', 540, L.top + 120 * L.F + tf.size * 0.8 + (tf.lines.length - 1) * tf.lineH + 70 * L.F, { size: 32 * L.F, weight: 700, color: C.soft, spacing: 6, alpha: ap(b, 3, 0.8) * (b < 8 ? 1 : 0) });
      flicker(g, R, t, b, 7, 8);
      if (b >= 8 && b < 8.6) flash(g, W, R.H, 0.6 * (1 - (b - 8) / 0.6));
      // filas: el nº 1 arriba; se revelan de abajo arriba (del último al 1)
      const listTop = L.top + 120 * L.F + tf.size * 0.8 + (tf.lines.length - 1) * tf.lineH + 70 * L.F;
      const avail = L.bottom - 60 * L.F - listTop;
      const rowH = Math.min(220 * L.F, avail / n);
      names.forEach((name, i) => {
        const order = n - 1 - i; // el último sale primero
        const t0 = 8 + order * 2;
        const a = easeOut(ap(b, t0, 0.8));
        if (a <= 0) return;
        const y = listTop + i * rowH;
        const isTop = i === 0;
        g.save();
        g.globalAlpha = a;
        g.translate(lerp(-80, 0, a), 0);
        g.fillStyle = isTop ? rgba(R.accent, 0.16) : 'rgba(17,17,22,0.85)';
        roundRect(g, 70, y + 8, 940, rowH - 16, 26);
        g.fill();
        g.strokeStyle = isTop ? R.accent : C.line;
        g.lineWidth = isTop ? 4 : 2;
        g.stroke();
        const ns = Math.min(rowH * 0.62, 120 * L.F);
        text(g, `#${i + 1}`, 110, y + rowH / 2 + ns * 0.35, { size: ns, weight: 800, color: isTop ? R.hi : R.accent, align: 'left' });
        const nx = 110 + ns * 1.55;
        let nf = fitLines(g, up(name), { maxW: 980 - nx, maxLines: 1, size: Math.min(rowH * 0.42, 84 * L.F), min: 30 });
        if (nf.lines[0]?.endsWith('…')) nf = fitLines(g, up(name), { maxW: 980 - nx, maxLines: 2, size: Math.min(rowH * 0.3, 56 * L.F), min: 22 });
        const isNew = b - t0 < 1;
        const ny = y + rowH / 2 - ((nf.lines.length - 1) * nf.lineH) / 2 + nf.size * 0.33;
        g.save();
        if (isNew) {
          g.translate(nx, ny);
          g.scale(1 + k * 0.03, 1 + k * 0.03);
          g.translate(-nx, -ny);
        }
        drawLines(g, nf, nx, ny, { weight: 800, align: 'left' });
        g.restore();
        g.restore();
      });
      // el nº 1 se celebra
      if (b >= endB - 2) confetti(g, R, t, clock.at(endB - 2), 30);
    } else {
      outroBlock(g, R, t, b, endB + 1, { title: S.cta, handle: S.handle, label: 'CUÉNTAMELO EN' });
    }
    finish(g, W, R.H);
  }
};

// ---------- 15. NUEVA SESIÓN (DJ) ----------
function vinyl(g, cx, cy, r, ang, A, R, S) {
  g.save();
  g.translate(cx, cy);
  g.fillStyle = '#0b0b0e';
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.05)';
  g.lineWidth = 2;
  for (let i = 0.42; i < 0.98; i += 0.035) {
    g.beginPath();
    g.arc(0, 0, r * i, 0, Math.PI * 2);
    g.stroke();
  }
  // reflejo fijo (no gira: así se nota el giro de la etiqueta)
  const gr = g.createLinearGradient(-r, -r, r, r);
  gr.addColorStop(0.35, 'rgba(255,255,255,0)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.10)');
  gr.addColorStop(0.65, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fill();
  g.rotate(ang);
  drawAvatar(g, A.avatar, 0, 0, r * 0.72, { color: R.accent, ring: 8, initials: S.name });
  g.fillStyle = R.accent;
  g.beginPath();
  g.arc(r * 0.3, 0, 10, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = C.bg;
  g.beginPath();
  g.arc(0, 0, 12, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function eqBars(g, R, t, y, h, a, clock) {
  if (a <= 0) return;
  const n = 28, gap = 8, bw = (940 - gap * (n - 1)) / n;
  const beatI = Math.floor((t + 0.5 / 30) / clock.Pb);
  const k = clock.kick(t, 0, 0.18);
  g.save();
  g.globalAlpha = a;
  for (let i = 0; i < n; i++) {
    const base = 0.25 + 0.55 * rnd(i * 3.3 + beatI * 0.71);
    const bass = i < 6 ? k * 0.6 : k * 0.25;
    const hh = h * clamp(base * 0.7 + bass);
    g.fillStyle = i % 5 === 0 ? R.hi : R.accent;
    roundRect(g, 70 + i * (bw + gap), y - hh, bw, hh, 4);
    g.fill();
  }
  g.restore();
}

const NEW_SET = {
  id: 'new-set',
  name: 'Nueva sesión',
  desc: 'Presenta tu set o tu tema',
  icon: 'Disc3',
  roles: ['DJ'],
  source: 'profile',
  music: 'profile',
  dropBeat: 8,
  beats: () => 28,
  fields: [
    { key: 'kicker', label: 'Titular', max: 24 },
    { key: 'title', label: 'Nombre del set o tema', max: 50 },
    { key: 'name', label: 'Tu nombre artístico', max: 40 },
    { key: 'genre', label: 'Estilo', max: 30 },
    { key: 'cta', label: 'Frase final', max: 34 },
    { key: 'handle', label: 'Tu usuario', max: 32 }
  ],
  autofill: (c) => {
    const tr = (Array.isArray(c.user?.dj_media) ? c.user.dj_media : []).find((m) => m?.type === 'track' && m.title);
    return {
      kicker: 'NUEVA SESIÓN',
      title: tr?.title || `${up(monthName())} ${new Date().getFullYear()} MIX`,
      name: displayName(c.user) || 'TU NOMBRE',
      genre: c.user?.favorite_subgenre || 'Techno',
      cta: 'DALE AL PLAY EN MI PERFIL',
      handle: handleOf(c.user),
      avatar: c.user?.avatar_url || ''
    };
  },
  async prepare(S, R) {
    const avatar = await loadImage(S.avatar, 1080);
    return { avatar, bg: blurredCover(avatar, W, R.H, { darken: 0.7, tint: R.accent }) };
  },
  render(g, t, R) {
    const { clock, S, A } = R;
    const L = frame(R);
    const b = clock.beat(t);
    const k = clock.kick(t, clock.at(8));
    const ang = t * Math.PI * 2 * 0.3; // giro tranquilo y constante
    const vr = (R.post ? 300 : 380) * (1 + k * 0.015);
    if (b < 20) {
      if (b < 8) bgBase(g, R);
      else {
        g.drawImage(A.bg, 0, 0);
        dotGrid(g, W, R.H, 0.05);
      }
      const vy = lerp(R.H + vr, L.mid + 40 * L.F, easeOut(ap(t, 0.2, 1.4)));
      vinyl(g, 540, vy, vr, ang, A, R, S);
      // brazo
      const armA = easeOut(ap(b, 2.5, 1));
      g.save();
      g.translate(540 + vr + 40, vy - vr - 10);
      g.rotate(lerp(-0.5, 0.32, armA));
      g.strokeStyle = '#d4d4d8';
      g.lineWidth = 12;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(-40, vr * 1.05);
      g.stroke();
      g.fillStyle = '#d4d4d8';
      g.fillRect(-62, vr * 1.05 - 8, 40, 46);
      g.beginPath();
      g.arc(0, 0, 28, 0, Math.PI * 2);
      g.fill();
      g.restore();
      if (b < 8) {
        typeLine(g, '> CARGANDO SESIÓN', 0.3, t, 110, L.top + 40, { size: 34 * L.F });
        beatWords(g, R, up(S.kicker).split(/\s+/).slice(0, 2), b, 3, { y: L.top + 230 * L.F, size: 170, gap: 1.5 });
        flicker(g, R, t, b, 7, 8);
      } else {
        const lb = b - 8, td = t - clock.at(8);
        flash(g, W, R.H, lb < 0.6 ? 0.7 * (1 - lb / 0.6) : 0);
        const slam = easeOut(td / 0.35);
        const tf = fitLines(g, up(S.title), { maxW: 960, maxLines: 2, size: 110 * L.F, min: 50 });
        g.save();
        g.translate(540, L.top + tf.size * 0.8);
        g.scale(lerp(1.3, 1, slam), lerp(1.3, 1, slam));
        g.globalAlpha = clamp(td / 0.12);
        drawLines(g, tf, 0, 0, { weight: 800, shadow: { color: R.accent, dx: 6, dy: 6 } });
        g.restore();
        const info = [up(S.name), up(S.genre)].filter(Boolean).join('  ·  ');
        const inf = fitOne(g, info, 960, 40 * L.F, { min: 22, weight: 700, spacing: 3 });
        text(g, inf.text, 540, L.top + tf.size * 0.8 + (tf.lines.length - 1) * tf.lineH + 70 * L.F, { size: inf.size, weight: 700, color: C.soft, spacing: 3, alpha: ap(lb, 1, 0.9) });
        eqBars(g, R, t, L.bottom - 40 * L.F, 150 * L.F, ap(lb, 1.5, 1), clock);
        if (lb >= 5) tape(g, W, L.bottom - 250 * L.F, -0.05, 86 * L.F, '#fafafa', C.bg, `  ${up(S.kicker)}  •  ${up(S.name)}  •`, td * 100, lerp(W * 1.3, 0, easeOut((lb - 5) / 1)));
      }
    } else {
      outroBlock(g, R, t, b, 20, { title: S.cta, handle: S.handle, label: 'ESCÚCHALA EN' });
    }
    finish(g, W, R.H);
  }
};

// ---------- 16. GRACIAS (todos) ----------
const THANKS = {
  id: 'thanks',
  name: 'Gracias por venir',
  desc: 'Para después de la fiesta',
  icon: 'Heart',
  roles: 'all',
  source: 'recent',
  music: 'event',
  dropBeat: 8,
  beats: () => 28,
  fields: [
    { key: 'kicker', label: 'Titular', max: 20 },
    { key: 'city', label: 'A quién (ciudad, sala…)', max: 30 },
    { key: 'event', label: 'Fiesta', max: 70 },
    { key: 'date', label: 'Fecha', max: 22 },
    { key: 'msg', label: 'Mensaje', max: 70 },
    { key: 'cta', label: 'Frase final', max: 30 },
    { key: 'handle', label: 'Tu usuario', max: 32 }
  ],
  autofill: (c, ev) => ({
    ...evText(ev, c.user),
    kicker: 'GRACIAS',
    city: ev?.city || c.user?.city || 'FAMILIA',
    msg: c.user?.role === 'Raver' ? 'Qué noche. La repetiría mil veces.' : 'Gracias a todos los que estuvisteis. Increíble energía.',
    cta: 'NOS VEMOS EN LA PRÓXIMA',
    handle: handleOf(c.user)
  }),
  prepare: eventAssets,
  render(g, t, R) {
    const { clock, S, A } = R;
    const L = frame(R);
    const b = clock.beat(t);
    const k = clock.kick(t, clock.at(8));
    if (b < 8) {
      bgBase(g, R);
      typeLine(g, '> RECUERDOS GUARDADOS', 0.3, t, 110, L.top + 40, { size: 34 * L.F });
      // GRACIAS letra a letra (tranquilo)
      const word = up(S.kicker);
      const wf = fitOne(g, word, 960, 200 * L.F, { min: 80, spacing: 4 });
      g.font = `800 ${wf.size}px Syne, sans-serif`;
      const chars = [...wf.text];
      const ww = g.measureText(wf.text).width;
      let x = 540 - ww / 2;
      chars.forEach((ch, i) => {
        const a = easeOut(ap(b, 1 + i * (3 / Math.max(1, chars.length)), 0.8));
        const cw = g.measureText(ch).width;
        if (a > 0) text(g, ch, x + cw / 2, L.mid - 60 * L.F + (1 - a) * 50, { size: wf.size, weight: 800, color: i % 2 ? C.text : R.accent, alpha: a });
        x += cw;
      });
      const cf = fitOne(g, up(S.city), 960, 130 * L.F, { min: 50 });
      text(g, cf.text, 540, L.mid + 120 * L.F, { size: cf.size, weight: 800, color: R.hi, alpha: ap(b, 5, 0.9), shadow: { color: R.accent, dx: 5, dy: 5 } });
      flicker(g, R, t, b, 7, 8);
    } else if (b < 20) {
      const lb = b - 8, td = t - clock.at(8);
      g.drawImage(A.bg, 0, 0);
      dotGrid(g, W, R.H, 0.05);
      flash(g, W, R.H, lb < 0.6 ? 0.7 * (1 - lb / 0.6) : 0);
      // polaroid
      const pw = R.post ? 520 : 680;
      const img = A.img;
      const ph = pw * 1.0;
      const pa = easeOutBack(ap(td, 0, 0.9));
      const cy = L.top + (R.post ? 400 : 560) * L.F;
      g.save();
      g.translate(540, cy);
      g.rotate(-0.05 + Math.sin(td * 0.7) * 0.012);
      g.scale(pa, pa);
      g.shadowColor = 'rgba(0,0,0,0.5)';
      g.shadowBlur = 40;
      g.fillStyle = '#f4f4f5';
      g.fillRect(-pw / 2 - 30, -ph / 2 - 30, pw + 60, ph + 170);
      g.shadowBlur = 0;
      g.fillStyle = '#111';
      g.fillRect(-pw / 2, -ph / 2, pw, ph);
      if (img) drawCover(g, img, -pw / 2, -ph / 2, pw, ph, { zoom: 1.02 + td * 0.006, fy: 0.35 });
      else drawPin(g, 0, ph * 0.25, pw * 0.45, R.accent);
      const ef = fitOne(g, up(S.event), pw, 52, { min: 24 });
      text(g, ef.text, 0, ph / 2 + 70, { size: ef.size, weight: 800, color: C.bg });
      text(g, up(S.date), 0, ph / 2 + 118, { size: 30, weight: 700, color: '#52525b', spacing: 4 });
      // cinta adhesiva
      g.fillStyle = rgba(R.accent, 0.85);
      g.rotate(0.12);
      g.fillRect(-90, -ph / 2 - 60, 180, 56);
      g.restore();
      const msg = fitLines(g, S.msg, { maxW: 920, maxLines: 3, size: 54 * L.F, min: 30, weight: 700, lineHeight: 1.2 });
      const my = cy + (ph / 2 + 150) + 60 * L.F + msg.size;
      drawLines(g, msg, 540, Math.min(my, L.bottom - (msg.lines.length - 1) * msg.lineH - 40), { weight: 700, alpha: ap(lb, 2, 1) });
      confetti(g, R, t, clock.at(8.5), 28);
    } else {
      outroBlock(g, R, t, b, 20, { title: S.cta, handle: S.handle });
    }
    finish(g, W, R.H);
  }
};

// ---------- 17. HORARIOS (DJ, club, promotor) ----------
function parseTimes(txt) {
  return String(txt || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [time = '', name = ''] = l.includes('|') ? l.split('|').map((s) => s.trim()) : ['', l];
      const m = /^(\d{1,2}[:.]\d{2})\s*[-–]?\s*(\d{1,2}[:.]\d{2})?/.exec(time);
      return { from: m ? m[1].replace('.', ':') : up(time), to: m?.[2] ? m[2].replace('.', ':') : '', name };
    });
}
const TIMETABLE = {
  id: 'timetable',
  name: 'Horarios',
  desc: 'Quién pincha a qué hora',
  icon: 'Clock',
  roles: ['DJ', 'Club', 'Promotor'],
  source: 'work',
  music: 'event',
  dropBeat: 8,
  beats: (S) => 8 + Math.max(2, Math.min(8, parseTimes(S.times).length)) * 2 + 8,
  fields: [
    { key: 'event', label: 'Fiesta', max: 70 },
    { key: 'date', label: 'Fecha', max: 22 },
    { key: 'place', label: 'Sala y ciudad', max: 60 },
    { key: 'times', label: 'Horarios (23:00 - 01:00 | Nombre)', type: 'textarea', rows: 6 },
    { key: 'handle', label: 'Tu usuario', max: 32 }
  ],
  autofill: (c, ev) => {
    const slots = (Array.isArray(ev?.lineup) ? ev.lineup : []).filter((s) => s?.name);
    const key = (s) => {
      const m = /^(\d{1,2}):(\d{2})/.exec(String(s.set_time || ''));
      if (!m) return 99 * 60;
      const h = Number(m[1]);
      return (h < 12 ? h + 24 : h) * 60 + Number(m[2]); // la noche sigue después de las 00:00
    };
    const allTimed = slots.length && slots.every((s) => s.set_time);
    const times = slots.length
      ? (allTimed ? [...slots].sort((a, b) => key(a) - key(b)) : slots).map((s) => (s.set_time ? `${String(s.set_time).trim()} | ${s.name}` : s.name)).join('\n')
      : '23:00 - 01:00 | DJ 1\n01:00 - 03:00 | DJ 2\n03:00 - 06:00 | DJ 3';
    return { ...evText(ev, c.user), times, handle: handleOf(c.user), me: String(c.user?.username || '').toLowerCase() };
  },
  prepare: eventAssets,
  render(g, t, R) {
    const { clock, S, A } = R;
    const L = frame(R);
    const b = clock.beat(t);
    const k = clock.kick(t, clock.at(8));
    const rows = parseTimes(S.times).slice(0, R.post ? 6 : 8);
    if (b < 8) return buildIntro(g, R, t, b, { line: 'CARGANDO HORARIOS', kicker: S.date, words: ['HORARIOS'], sub: S.event });
    g.drawImage(A.bg, 0, 0);
    g.fillStyle = 'rgba(9,9,11,0.6)';
    g.fillRect(0, 0, W, R.H);
    dotGrid(g, W, R.H, 0.06);
    const hf = fitOne(g, 'HORARIOS', 960, 140 * L.F, { min: 60, spacing: 6 });
    const ha = easeOut(ap(b, 1, 1));
    text(g, hf.text, 540, L.top + 120 * L.F + (1 - ha) * 30, { size: hf.size, weight: 800, color: R.accent, spacing: 6, alpha: ha });
    const ef = fitLines(g, up(S.event), { maxW: 940, maxLines: 2, size: 56 * L.F, min: 30 });
    drawLines(g, ef, 540, L.top + 210 * L.F, { weight: 800, alpha: ap(b, 2.5, 0.9) });
    const info = [up(S.date), up(S.place)].filter(Boolean).join('  ·  ');
    const inf = fitOne(g, info, 960, 32 * L.F, { min: 20, weight: 700, spacing: 3 });
    const infY = L.top + 210 * L.F + (ef.lines.length - 1) * ef.lineH + 56 * L.F;
    text(g, inf.text, 540, infY, { size: inf.size, weight: 700, color: C.soft, spacing: 3, alpha: ap(b, 3.5, 0.9) });
    flicker(g, R, t, b, 7, 8);
    if (b >= 8 && b < 8.6) flash(g, W, R.H, 0.6 * (1 - (b - 8) / 0.6));
    // línea de tiempo
    const top = infY + 80 * L.F;
    const bottom = L.bottom - 170 * L.F;
    const n = Math.max(1, rows.length);
    const rowH = Math.min(170 * L.F, (bottom - top) / n);
    const lx = 300;
    const grow = easeOut(ap(b, 4.5, 3));
    g.strokeStyle = rgba(R.accent, 0.5);
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(lx, top);
    g.lineTo(lx, top + (n * rowH) * grow);
    g.stroke();
    rows.forEach((r, i) => {
      const t0 = 8 + i * 2;
      const a = easeOut(ap(b, t0, 0.6));
      const cy = top + i * rowH + rowH / 2;
      // punto (se ve antes, apagado)
      g.fillStyle = a > 0 ? R.accent : rgba(C.text, 0.25 * grow);
      g.beginPath();
      g.arc(lx, cy, (a > 0 ? 14 : 9) * (a > 0 && b - t0 < 1 ? 1 + k * 0.3 : 1), 0, Math.PI * 2);
      g.fill();
      if (a <= 0) return;
      const isMe = S.me && r.name.toLowerCase() === S.me;
      g.save();
      g.globalAlpha = a;
      g.translate(lerp(40, 0, a), 0);
      const tf = fitOne(g, r.from, 190, Math.min(54 * L.F, rowH * 0.42), { min: 22 });
      text(g, tf.text, lx - 36, cy + tf.size * 0.2, { size: tf.size, weight: 800, color: C.text, align: 'right' });
      if (r.to) text(g, r.to, lx - 36, cy + tf.size * 0.2 + tf.size * 0.85, { size: tf.size * 0.55, weight: 700, color: C.muted, align: 'right' });
      let nf = fitLines(g, up(r.name), { maxW: 1010 - lx - 40, maxLines: 1, size: Math.min(72 * L.F, rowH * 0.5), min: 30 });
      if (nf.lines[0]?.endsWith('…')) nf = fitLines(g, up(r.name), { maxW: 1010 - lx - 40, maxLines: 2, size: Math.min(46 * L.F, rowH * 0.32), min: 20 });
      drawLines(g, nf, lx + 40, cy - ((nf.lines.length - 1) * nf.lineH) / 2 + nf.size * 0.33, { weight: 800, align: 'left', color: isMe ? R.hi : C.text });
      g.restore();
    });
    const endB = 8 + rows.length * 2;
    signOff(g, R, ap(b, endB + 1, 1), { label: 'TODA LA INFO EN', handle: S.handle, y: L.bottom - 110 * L.F });
    finish(g, W, R.H);
  }
};

// ---------- 18. ÚLTIMAS ENTRADAS (club, promotor) ----------
const LAST_TICKETS = {
  id: 'last-tickets',
  name: 'Últimas entradas',
  desc: 'Aforo casi lleno o sold out',
  icon: 'Ticket',
  roles: ['Club', 'Promotor'],
  source: 'hosted',
  music: 'event',
  dropBeat: 8,
  beats: () => 28,
  fields: [
    { key: 'kicker', label: 'Titular (ÚLTIMAS ENTRADAS / SOLD OUT)', max: 24 },
    { key: 'pct', label: 'Aforo vendido (%)', max: 3 },
    { key: 'event', label: 'Fiesta', max: 70 },
    { key: 'date', label: 'Fecha', max: 22 },
    { key: 'place', label: 'Sala y ciudad', max: 60 },
    { key: 'cta', label: 'Frase final', max: 30 },
    { key: 'handle', label: 'Tu usuario', max: 32 }
  ],
  autofill: (c, ev) => ({ ...evText(ev, c.user), kicker: 'ÚLTIMAS ENTRADAS', pct: '92', cta: 'ENTRADAS EN LA BIO', handle: handleOf(c.user) }),
  prepare: eventAssets,
  render(g, t, R) {
    const { clock, S, A } = R;
    const L = frame(R);
    const b = clock.beat(t);
    const k = clock.kick(t, clock.at(8));
    const pct = clamp((parseInt(S.pct, 10) || 0) / 100);
    const sold = pct >= 1;
    const bar = (y, fill, a) => {
      g.save();
      g.globalAlpha = a;
      text(g, 'AFORO', 90, y - 24, { size: 34 * L.F, weight: 700, color: C.soft, spacing: 8, align: 'left' });
      text(g, `${Math.round(fill * 100)}%`, 990, y - 24, { size: 50 * L.F, weight: 800, color: fill > 0.85 ? R.hi : C.text, align: 'right' });
      g.fillStyle = 'rgba(255,255,255,0.08)';
      roundRect(g, 90, y, 900, 46 * L.F, 23 * L.F);
      g.fill();
      g.fillStyle = R.accent;
      roundRect(g, 90, y, Math.max(46 * L.F, 900 * fill), 46 * L.F, 23 * L.F);
      g.fill();
      g.restore();
    };
    if (b < 8) {
      g.drawImage(A.bg, 0, 0);
      g.fillStyle = 'rgba(9,9,11,0.55)';
      g.fillRect(0, 0, W, R.H);
      typeLine(g, '> COMPROBANDO AFORO', 0.3, t, 110, L.top + 40, { size: 34 * L.F });
      const ef = fitLines(g, up(S.event), { maxW: 940, maxLines: 3, size: 110 * L.F, min: 50 });
      drawLines(g, ef, 540, L.top + 220 * L.F, { weight: 800, alpha: ap(b, 1, 1), shadow: { color: R.accent, dx: 5, dy: 5 } });
      const inf = fitOne(g, [up(S.date), up(S.place)].filter(Boolean).join('  ·  '), 960, 34 * L.F, { min: 20, weight: 700, spacing: 3 });
      text(g, inf.text, 540, L.top + 220 * L.F + (ef.lines.length - 1) * ef.lineH + 80 * L.F, { size: inf.size, weight: 700, color: C.soft, spacing: 3, alpha: ap(b, 2, 1) });
      // la barra se llena despacio hasta el drop
      const fill = pct * easeOut(ap(b, 2.5, 5));
      bar(L.mid + 200 * L.F, fill, ap(b, 2, 0.8));
      flicker(g, R, t, b, 7, 8);
    } else if (b < 20) {
      const lb = b - 8, td = t - clock.at(8);
      g.drawImage(A.bg, 0, 0);
      dotGrid(g, W, R.H, 0.05);
      flash(g, W, R.H, lb < 0.6 ? 0.8 * (1 - lb / 0.6) : 0);
      drawFlyer(g, R, A, 540, L.mid - 40 * L.F, (R.post ? 0.62 : 0.74) + td * 0.008 + k * 0.02, k, Math.floor(b));
      // sello
      const st = easeOutBack(ap(td, 0, 0.6));
      g.save();
      g.translate(540, L.top + 120 * L.F);
      g.rotate(-0.07);
      g.scale(st * (1 + k * 0.025), st * (1 + k * 0.025));
      const kf = fitOne(g, up(S.kicker), 860, 96 * L.F, { min: 44 });
      g.font = `800 ${kf.size}px Syne, sans-serif`;
      const kw = g.measureText(kf.text).width + 80;
      g.fillStyle = sold ? '#fafafa' : R.accent;
      roundRect(g, -kw / 2, -kf.size * 0.85, kw, kf.size * 1.3, 18);
      g.fill();
      text(g, kf.text, 0, kf.size * 0.12, { size: kf.size, weight: 800, color: sold ? C.bg : R.ink });
      g.restore();
      // tarjeta inferior con la barra
      const cy = L.bottom - 230 * L.F;
      const ca = easeOut(ap(lb, 1.5, 0.9));
      g.save();
      g.globalAlpha = ca;
      g.fillStyle = 'rgba(14,14,18,0.94)';
      roundRect(g, 60, cy - 80 * L.F, 960, 230 * L.F, 30);
      g.fill();
      g.restore();
      bar(cy + 30 * L.F, pct, ca);
      if (lb >= 4) tape(g, W, L.top + 290 * L.F, 0.05, 80 * L.F, R.accent, R.ink, sold ? '  SOLD OUT  •  GRACIAS  •' : '  QUEDAN POCAS  •  NO TE QUEDES FUERA  •', td * 100, lerp(-W * 1.3, 0, easeOut((lb - 4) / 1)));
    } else {
      outroBlock(g, R, t, b, 20, { title: S.cta, handle: S.handle, label: 'TODA LA INFO EN' });
    }
    finish(g, W, R.H);
  }
};

// ---------- 19. REVELACIÓN DEL CARTEL (club, promotor) ----------
const SCRAMBLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&';
const LINEUP_REVEAL = {
  id: 'lineup-reveal',
  name: 'Revelación del cartel',
  desc: 'Los nombres se descifran uno a uno',
  icon: 'EyeOff',
  roles: ['Club', 'Promotor'],
  source: 'work',
  music: 'event',
  dropBeat: 8,
  beats: (S) => 8 + Math.max(2, Math.min(8, String(S.lineup || '').split(/\n/).filter((s) => s.trim()).length)) * 2 + 8,
  fields: [
    { key: 'kicker', label: 'Fase', max: 30 },
    { key: 'event', label: 'Fiesta', max: 70 },
    { key: 'date', label: 'Fecha', max: 22 },
    { key: 'place', label: 'Sala y ciudad', max: 60 },
    { key: 'lineup', label: 'Lineup (uno por línea)', type: 'textarea', rows: 6 },
    { key: 'more', label: 'Frase final', max: 30 },
    { key: 'handle', label: 'Tu usuario', max: 32 }
  ],
  autofill: (c, ev) => ({ ...evText(ev, c.user), kicker: 'PRIMERAS CONFIRMACIONES', more: 'Y MÁS POR ANUNCIAR', handle: handleOf(c.user) }),
  prepare: eventAssets,
  render(g, t, R) {
    const { clock, S, A } = R;
    const L = frame(R);
    const b = clock.beat(t);
    const k = clock.kick(t, clock.at(8));
    const names = String(S.lineup || '').split(/\r?\n/).map((s) => up(s.trim())).filter(Boolean).slice(0, R.post ? 6 : 8);
    const n = Math.max(1, names.length);
    if (b < 8) return buildIntro(g, R, t, b, { line: 'DESCIFRANDO CARTEL', kicker: S.kicker, words: ['NUEVO', 'CARTEL'], sub: S.event });
    g.drawImage(A.bg, 0, 0);
    g.fillStyle = 'rgba(9,9,11,0.7)';
    g.fillRect(0, 0, W, R.H);
    dotGrid(g, W, R.H, 0.06);
    typeLine(g, '> DESCIFRANDO CARTEL', 0.3, t, 110, L.top + 40, { size: 34 * L.F });
    const kf = fitOne(g, up(S.kicker), 960, 40 * L.F, { min: 22, weight: 700, spacing: 8 });
    text(g, kf.text, 540, L.top + 140 * L.F, { size: kf.size, weight: 700, color: R.accent, spacing: 8, alpha: ap(b, 1, 0.9) });
    const ef = fitLines(g, up(S.event), { maxW: 960, maxLines: 2, size: 80 * L.F, min: 36 });
    drawLines(g, ef, 540, L.top + 240 * L.F, { weight: 800, alpha: ap(b, 2, 0.9), shadow: { color: R.accent, dx: 5, dy: 5 } });
    const info = [up(S.date), up(S.place)].filter(Boolean).join('  ·  ');
    const inf = fitOne(g, info, 960, 32 * L.F, { min: 20, weight: 700, spacing: 3 });
    const infY = L.top + 240 * L.F + (ef.lines.length - 1) * ef.lineH + 60 * L.F;
    text(g, inf.text, 540, infY, { size: inf.size, weight: 700, color: C.soft, spacing: 3, alpha: ap(b, 3, 0.9) });
    flicker(g, R, t, b, 7, 8);
    if (b >= 8 && b < 8.6) flash(g, W, R.H, 0.6 * (1 - (b - 8) / 0.6));
    const top = infY + 70 * L.F;
    const rowH = Math.min(150 * L.F, (L.bottom - 210 * L.F - top) / n);
    names.forEach((name, i) => {
      const y = top + i * rowH;
      const barA = easeOut(ap(b, 3.5 + i * 0.4, 0.8)); // las barras tapadas aparecen antes del drop
      if (barA <= 0) return;
      const t0 = 8 + i * 2;
      const rev = clamp((b - t0) / 1.2); // descifrado en ~0,8 s
      const fit = fitOne(g, name, 920, rowH * 0.62, { min: 26 });
      g.font = `800 ${fit.size}px Syne, sans-serif`;
      const tw = Math.min(920, g.measureText(fit.text).width);
      g.save();
      g.globalAlpha = barA;
      if (rev < 1) {
        g.fillStyle = 'rgba(244,244,245,0.92)';
        const bw = (rev > 0 ? lerp(tw + 40, 0, easeIn(rev)) : tw + 40);
        roundRect(g, 540 - bw / 2, y + rowH * 0.18, bw, rowH * 0.64, 10);
        g.fill();
      }
      if (rev > 0) {
        const chars = [...fit.text];
        const out = chars.map((ch, j) => (ch === ' ' || j / chars.length < rev ? ch : SCRAMBLE[Math.floor(rnd(j * 13 + Math.floor(t * 10)) * SCRAMBLE.length)])).join('');
        const s = rev >= 1 && b - t0 < 1.6 ? 1 + k * 0.03 : 1;
        g.translate(540, y + rowH * 0.5 + fit.size * 0.33);
        g.scale(s, s);
        const of = rev >= 1 ? { text: out, size: fit.size } : fitOne(g, out, 920, fit.size, { min: 14 });
        text(g, of.text, 0, 0, { size: of.size, weight: 800, color: rev >= 1 ? C.text : R.accent, shadow: rev >= 1 ? { color: rgba(R.accent, 0.9), dx: 5, dy: 5 } : null });
      }
      g.restore();
    });
    const endB = 8 + names.length * 2;
    const mf = fitOne(g, up(S.more), 960, 46 * L.F, { min: 22, weight: 800, spacing: 4 });
    text(g, mf.text, 540, L.bottom - 190 * L.F, { size: mf.size, weight: 800, color: R.hi, spacing: 4, alpha: ap(b, endB + 0.5, 0.9) });
    signOff(g, R, ap(b, endB + 1.5, 1), { label: 'TODA LA INFO EN', handle: S.handle, y: L.bottom - 110 * L.F });
    finish(g, W, R.H);
  }
};

export const TEMPLATES = [
  // para todos
  GOING, COUNTDOWN, PLANS, WEEKEND, THIS_OR_THAT, TOP_DJS, THANKS,
  // raver
  SQUAD, RAVE_PASS,
  // DJ
  NEXT_GIG, NEW_SET, BOOKING,
  // DJ, club y promotor
  AGENDA, LINEUP, TIMETABLE, ON_MAP,
  // club y promotor
  EVENT_PROMO, LINEUP_REVEAL, LAST_TICKETS
];

export const templatesFor = (role) => {
  if (role === 'Admin') return TEMPLATES; // el admin puede usar todo el estudio
  const r = role || 'Raver';
  return TEMPLATES.filter((t) => t.roles === 'all' || t.roles.includes(r));
};

export const accentFor = (role) => ROLE_COLORS[role] || ROLE_COLORS.Raver;

/** Duración del vídeo en segundos para una plantilla y unos datos */
export const durationOf = (tpl, S, P) => tpl.beats(S) * P + TAIL;

export { W as STUDIO_W, dateParts };
