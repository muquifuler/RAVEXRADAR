// src/lib/studio/kit.js
// ----------------------------------------------------------------------------
// Utilidades de dibujo para las plantillas del Estudio (canvas 2D):
// marca, pin, textos que se ajustan solos, imágenes sin "ensuciar" el canvas
// (para poder exportar), acabado de película y reloj de golpes.
// ----------------------------------------------------------------------------

export const C = {
  yellow: '#facc15',
  bg: '#09090b',
  text: '#fafafa',
  muted: '#a1a1aa',
  soft: '#d4d4d8',
  line: '#27272a',
  green: '#22c55e'
};
export const ROLE_COLORS = { DJ: '#ff5500', Club: '#06b6d4', Promotor: '#f43f5e', Raver: '#facc15', Admin: '#facc15' };
export const FONT = 'Syne, "Space Grotesk", system-ui, sans-serif';
export const MONO = 'ui-monospace, "SF Mono", Consolas, "DejaVu Sans Mono", monospace';

// ---------- Matemáticas ----------
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const easeIn = (t) => Math.pow(clamp(t), 3);
export const easeOutBack = (t) => {
  t = clamp(t);
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const rnd = (s) => {
  const x = Math.sin(s * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
/** Aparición entre t0 y t0 + d (0..1) */
export const ap = (t, t0, d = 0.4) => clamp((t - t0) / d);

export const hexRgb = (h) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};
/**
 * Colores derivados del color elegido, para que TODO pegue con él:
 *  · hi  → el mismo color aclarado (titulares y detalles sobre fondo oscuro)
 *  · ink → texto que se lee encima del color (casi negro o blanco, el que más contraste)
 */
export function palette(accent) {
  const rgb = hexRgb(accent) || [250, 204, 21];
  const lin = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
  const ink = (L + 0.05) / 0.05 >= 1.05 / (L + 0.05) ? '#09090b' : '#ffffff';
  const hiRgb = rgb.map((v) => Math.round(v + (255 - v) * 0.38));
  const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  return { accent: hex(rgb), accentRgb: rgb, hi: hex(hiRgb), hiRgb, ink };
}

export const rgba = (hex, a) => {
  const c = hexRgb(hex) || [255, 255, 255];
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
};
export const up = (s) => String(s ?? '').toLocaleUpperCase('es-ES');

// ---------- Reloj musical ----------
/**
 * t = 0 es el primer golpe del vídeo. El golpe `dropBeat` cae en el drop.
 * kick(t) da un pulso que decae en cada golpe (para "bombear" con el bombo).
 */
export function beatClock(bpm = 128, fps = 30) {
  // Pb = un golpe real de la canción. La coreografía va golpe a golpe (step = 1):
  // cada entrada cae en un golpe y el drop en el golpe marcado por la plantilla.
  const Pb = 60 / (Number(bpm) || 128);
  const step = 1;
  const P = Pb * step;
  const SYNC = 0.5 / fps;
  return {
    P,
    Pb,
    step,
    bpm: 60 / Pb,
    beat: (t) => (t + SYNC) / P,
    at: (beat) => beat * P,
    // pulso suave en cada bombo real
    kick: (t, from = 0, tau = 0.07) => ((t + SYNC) < from ? 0 : 0.7 * Math.exp(-(((t + SYNC) % Pb) / tau)))
  };
}

// ---------- Texto ----------
const fontStr = (weight, size, family = FONT) => `${weight} ${Math.round(size)}px ${family}`;

function setLetterSpacing(ctx, px) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`;
}

function measure(ctx, str, weight, size, spacing = 0, family = FONT) {
  ctx.font = fontStr(weight, size, family);
  setLetterSpacing(ctx, spacing);
  return ctx.measureText(str).width;
}

function breakWord(ctx, word, maxW) {
  // primero por guiones bajos / guiones / puntos (DJ_NOMBRE_LARGO → DJ_ / NOMBRE_ / LARGO)
  const seps = word.replace(/([_\-./])/g, '$1\u0000').split('\u0000').filter(Boolean);
  if (seps.length > 1 && seps.every((s) => ctx.measureText(s).width <= maxW)) {
    const out = [];
    let cur = '';
    for (const s of seps) {
      if (cur && ctx.measureText(cur + s).width > maxW) {
        out.push(cur);
        cur = s;
      } else cur += s;
    }
    if (cur) out.push(cur);
    return out;
  }
  const parts = [];
  let cur = '';
  for (const ch of word) {
    if (ctx.measureText(cur + ch).width > maxW && cur) {
      parts.push(cur);
      cur = ch;
    } else cur += ch;
  }
  if (cur) parts.push(cur);
  return parts;
}

function wrap(ctx, text, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w0 of words) {
    const pieces = ctx.measureText(w0).width > maxW ? breakWord(ctx, w0, maxW) : [w0];
    for (const w of pieces) {
      const t = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(t).width > maxW && cur) {
        lines.push(cur);
        cur = w;
      } else cur = t;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Ajusta un texto a un ancho y un máximo de líneas: primero reparte en líneas,
 * luego reduce el tamaño, y si aun así no cabe corta con "…".
 * Devuelve { lines, size, lineH }.
 */
export function fitLines(ctx, text, { maxW, maxLines = 2, size, min = 24, weight = 800, spacing = 0, lineHeight = 1.0, family = FONT } = {}) {
  const str = String(text || '').trim();
  if (!str) return { lines: [], size, lineH: size * lineHeight };
  for (let s = size; s >= min; s -= Math.max(2, Math.round(s * 0.04))) {
    ctx.font = fontStr(weight, s, family);
    setLetterSpacing(ctx, spacing * (s / size));
    const lines = wrap(ctx, str, maxW);
    // no se parte una palabra corta en dos si cabe en una línea con letra más pequeña
    const brokeShortWord = lines.length > 1 && str.split(/[\s_\-./]+/).filter(Boolean).length < lines.length;
    if (lines.length <= maxLines && !brokeShortWord) return { lines, size: s, lineH: s * lineHeight };
  }
  ctx.font = fontStr(weight, min, family);
  setLetterSpacing(ctx, spacing * (min / size));
  const lines = wrap(ctx, str, maxW);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last.trimEnd()}…`;
    return { lines: kept, size: min, lineH: min * lineHeight };
  }
  return { lines, size: min, lineH: min * lineHeight };
}

/** Una sola línea que se encoge (y si no, "…") */
export function fitOne(ctx, text, maxW, size, { min = 20, weight = 800, spacing = 0, family = FONT } = {}) {
  const r = fitLines(ctx, text, { maxW, maxLines: 1, size, min, weight, spacing, family });
  return { text: r.lines[0] || '', size: r.size };
}

export function text(ctx, str, x, y, { size = 40, weight = 700, color = C.text, align = 'center', spacing = 0, alpha = 1, baseline = 'alphabetic', family = FONT, shadow = null } = {}) {
  if (!str) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = fontStr(weight, size, family);
  setLetterSpacing(ctx, spacing);
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (shadow) {
    ctx.fillStyle = shadow.color;
    ctx.fillText(str, x + (shadow.dx ?? 6), y + (shadow.dy ?? 6));
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  ctx.restore();
}

/** Pinta un bloque de líneas ya ajustado. y = línea base de la primera. Devuelve el alto. */
export function drawLines(ctx, fit, x, y, opts = {}) {
  fit.lines.forEach((ln, i) => text(ctx, ln, x, y + i * fit.lineH, { ...opts, size: fit.size }));
  return fit.lines.length * fit.lineH;
}

// ---------- Formas ----------
export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
}

const PIN_PATH = 'M60 106 C44 88 30 72 30 50 A30 30 0 0 1 90 50 C90 72 76 88 60 106 Z M60 37 A13 13 0 1 0 60 63 A13 13 0 1 0 60 37 Z';
let pin2d = null;
let dot2d = null;
/** x, y = punta del pin; h = alto */
export function drawPin(ctx, x, y, h, color = C.yellow, alpha = 1) {
  if (!pin2d) {
    pin2d = new Path2D(PIN_PATH);
    dot2d = new Path2D();
    dot2d.arc(60, 50, 6, 0, Math.PI * 2);
  }
  const s = h / 86;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.translate(-60, -106);
  ctx.fillStyle = color;
  ctx.fill(pin2d, 'evenodd');
  ctx.fill(dot2d);
  ctx.restore();
}

export function ripple(ctx, x, y, w, phase, color, alpha = 1) {
  const p = ((phase % 1) + 1) % 1;
  const s = 0.4 + p * 1.6;
  ctx.save();
  ctx.globalAlpha *= alpha * 0.9 * (1 - p);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(x, y, (w / 2) * s, (w / 6.5) * s, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** RAVEX (blanco) + RADAR (en el color de la plantilla), con pin opcional */
export function brandWord(ctx, x, y, size, { align = 'center', alpha = 1, pin = false, maxW = 900, color = C.yellow } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const m = (sz) => {
    ctx.font = fontStr(800, sz);
    setLetterSpacing(ctx, sz * 0.06);
    return ctx.measureText('RAVEXRADAR').width + (pin ? sz * 1.05 : 0);
  };
  const full = m(size);
  if (full > maxW) {
    size *= maxW / full;
    m(size);
  }
  const w1 = ctx.measureText('RAVEX').width;
  const w2 = ctx.measureText('RADAR').width;
  const pw = pin ? size * 0.8 : 0;
  const gap = pin ? size * 0.25 : 0;
  const total = pw + gap + w1 + w2;
  let x0 = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  if (pin) drawPin(ctx, x0 + pw / 2, y + size * 0.05, size * 1.05, color);
  x0 += pw + gap;
  ctx.fillStyle = C.text;
  ctx.fillText('RAVEX', x0, y);
  ctx.fillStyle = color;
  ctx.fillText('RADAR', x0 + w1, y);
  ctx.restore();
  return total;
}

const gridCache = new Map();
/** Rejilla de puntos tipo mapa (se dibuja una vez y se reutiliza) */
export function dotGrid(ctx, W, H, alpha = 0.08, step = 40) {
  const key = `${W}x${H}|${step}`;
  let layer = gridCache.get(key);
  if (!layer) {
    layer = document.createElement('canvas');
    layer.width = W;
    layer.height = H;
    const g = layer.getContext('2d');
    g.fillStyle = 'rgba(244,244,245,1)';
    for (let y = step; y < H; y += step) for (let x = step / 2; x < W; x += step) g.fillRect(x - 1.5, y - 1.5, 3, 3);
    gridCache.set(key, layer);
  }
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}

export const makeCanvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};

// ---------- Acabado (viñeta + líneas), precalculado por tamaño ----------
const finishCache = {};
export function finish(ctx, W, H, { scan = 0.35, vignette = 0.85 } = {}) {
  const key = `${W}x${H}`;
  if (!finishCache[key]) {
    const s = makeCanvas(W, H);
    const sc = s.getContext('2d');
    sc.fillStyle = 'rgba(0,0,0,0.22)';
    for (let y = 0; y < H; y += 4) sc.fillRect(0, y, W, 1.5);
    const v = makeCanvas(W, H);
    const vc = v.getContext('2d');
    const gr = vc.createRadialGradient(W / 2, H * 0.48, W * 0.35, W / 2, H * 0.48, Math.max(W, H) * 0.62);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,0.7)');
    vc.fillStyle = gr;
    vc.fillRect(0, 0, W, H);
    finishCache[key] = { scan: s, vig: v };
  }
  const f = finishCache[key];
  ctx.save();
  if (scan) {
    ctx.globalAlpha = scan;
    ctx.drawImage(f.scan, 0, 0);
  }
  if (vignette) {
    ctx.globalAlpha = vignette;
    ctx.drawImage(f.vig, 0, 0);
  }
  ctx.restore();
}

/** Desplaza franjas del propio canvas (glitch) */
export function glitch(ctx, canvas, seed, amount = 80, slices = 6) {
  for (let i = 0; i < slices; i++) {
    const y = rnd(seed * 11 + i) * canvas.height;
    const h = 20 + rnd(seed * 5 + i) * 110;
    const o = (rnd(seed * 7 + i) - 0.5) * amount;
    ctx.drawImage(canvas, 0, y, canvas.width, h, o, y, canvas.width, h);
  }
}

export function flash(ctx, W, H, a, color = '255,255,255') {
  if (a <= 0) return;
  ctx.fillStyle = `rgba(${color},${clamp(a)})`;
  ctx.fillRect(0, 0, W, H);
}

/** Cinta inclinada con texto que se desplaza */
export function tape(ctx, W, y, rot, h, bg, fg, str, offset, fromX = 0) {
  ctx.save();
  ctx.translate(W / 2 + fromX, y);
  ctx.rotate(rot);
  ctx.fillStyle = bg;
  ctx.fillRect(-W, -h / 2, W * 2, h);
  ctx.font = fontStr(800, h * 0.5);
  setLetterSpacing(ctx, 3);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = fg;
  const unit = ctx.measureText(str).width || 1;
  let x = -W - (((offset % unit) + unit) % unit);
  while (x < W) {
    ctx.fillText(str, x, 4);
    x += unit;
  }
  ctx.restore();
}

// ---------- Imágenes ----------
/** URL que se puede pintar en canvas sin bloquear la exportación (CORS vía wsrv.nl) */
export function corsUrl(url, w = 1080) {
  if (!url) return null;
  if (/^(data:|blob:)/.test(url)) return url;
  try {
    const u = new URL(url, window.location.href);
    if (u.origin === window.location.origin) return u.href;
  } catch {
    return null;
  }
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=${w}&output=jpg&q=88`;
}

function loadImg(src, cross = true) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cross) img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('img'));
    img.src = src;
  });
}

const imgCache = new Map();
/** Carga una imagen apta para exportar: primero por el proxy, luego directa con CORS. null si no hay forma. */
export function loadImage(url, w = 1080) {
  if (!url) return Promise.resolve(null);
  const key = `${url}|${w}`;
  if (imgCache.has(key)) return imgCache.get(key);
  const p = (async () => {
    const tries = [corsUrl(url, w)];
    if (!/^(data:|blob:)/.test(url)) tries.push(url);
    for (const src of tries) {
      if (!src) continue;
      try {
        return await loadImg(src, true);
      } catch {
        /* siguiente */
      }
    }
    return null;
  })();
  imgCache.set(key, p);
  return p;
}

/** Dibuja tipo "cover" en un rectángulo, con zoom y foco */
export function drawCover(ctx, img, x, y, w, h, { zoom = 1, fx = 0.5, fy = 0.5, dx = 0, dy = 0 } = {}) {
  if (!img) return;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const r = Math.max(w / iw, h / ih) * zoom;
  const dw = iw * r, dh = ih * r;
  ctx.drawImage(img, x + (w - dw) * fx + dx, y + (h - dh) * fy + dy, dw, dh);
}

/** Fondo desenfocado (truco de reducir y ampliar: funciona también en Safari) */
export function blurredCover(img, W, H, { darken = 0.55, tint = null } = {}) {
  const out = makeCanvas(W, H);
  const g = out.getContext('2d');
  g.fillStyle = C.bg;
  g.fillRect(0, 0, W, H);
  if (img) {
    const small = makeCanvas(W / 24, H / 24);
    const sg = small.getContext('2d');
    sg.imageSmoothingQuality = 'high';
    drawCover(sg, img, 0, 0, small.width, small.height);
    const mid = makeCanvas(W / 6, H / 6);
    const mg = mid.getContext('2d');
    mg.imageSmoothingQuality = 'high';
    mg.drawImage(small, 0, 0, mid.width, mid.height);
    g.imageSmoothingQuality = 'high';
    g.drawImage(mid, -40, -40, W + 80, H + 80);
  }
  if (tint) {
    g.fillStyle = rgba(tint, 0.18);
    g.fillRect(0, 0, W, H);
  }
  g.fillStyle = `rgba(9,9,11,${darken})`;
  g.fillRect(0, 0, W, H);
  return out;
}

/** Imagen "contain" escalada a un máximo (para el cartel completo) */
export function containCanvas(img, maxW, maxH) {
  if (!img) return null;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const r = Math.min(maxW / iw, maxH / ih);
  const c = makeCanvas(iw * r, ih * r);
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/** Foto en círculo / cuadrado redondeado con borde de color */
export function drawAvatar(ctx, img, cx, cy, size, { color = C.yellow, ring = 10, round = true, initials = '' } = {}) {
  ctx.save();
  ctx.beginPath();
  if (round) ctx.arc(cx, cy, size / 2 + ring, 0, Math.PI * 2);
  else roundRect(ctx, cx - size / 2 - ring, cy - size / 2 - ring, size + ring * 2, size + ring * 2, size * 0.2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  if (round) ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  else roundRect(ctx, cx - size / 2, cy - size / 2, size, size, size * 0.17);
  ctx.clip();
  ctx.fillStyle = '#18181b';
  ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
  if (img) drawCover(ctx, img, cx - size / 2, cy - size / 2, size, size, { fy: 0.35 });
  else if (initials) text(ctx, up(initials).slice(0, 2), cx, cy + size * 0.13, { size: size * 0.38, weight: 800, color });
  ctx.restore();
}

/** Carga las fuentes de la web antes de dibujar (si no, el canvas usa la del sistema) */
let fontsPromise = null;
export function loadFonts() {
  if (!fontsPromise) {
    fontsPromise = (async () => {
      if (!document.fonts?.load) return;
      try {
        await Promise.race([
          Promise.all([500, 600, 700, 800].map((w) => document.fonts.load(`${w} 100px Syne`))),
          new Promise((r) => setTimeout(r, 2500))
        ]);
      } catch {
        /* sin fuente: se usa la del sistema */
      }
    })();
  }
  return fontsPromise;
}

// ---------- Fechas ----------
const DAYS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const dateParts = (iso) => {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return { day: DAYS[d.getDay()], num: d.getDate(), month: MONTHS[d.getMonth()], monthLong: MONTHS_LONG[d.getMonth()] };
};
export const fmtDate = (iso) => {
  const p = dateParts(iso);
  return p ? `${p.day} ${p.num} ${p.month}` : '';
};
/** "ESTE SÁBADO", "MAÑANA", "HOY"… según la fecha */
export const whenLabel = (iso) => {
  if (!iso) return 'PRÓXIMA FECHA';
  const d = new Date(`${iso}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  if (diff <= 0) return 'HOY';
  if (diff === 1) return 'MAÑANA';
  const names = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
  if (diff < 7) return `ESTE ${names[d.getDay()]}`;
  return fmtDate(iso);
};
export const monthName = (date = new Date()) => MONTHS_LONG[date.getMonth()];
