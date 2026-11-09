// studio-server/lib/beatCore.mjs
// ----------------------------------------------------------------------------
// Núcleo del análisis de una canción (BPM, rejilla de golpes, drops y subidas).
// COPIA EXACTA de src/lib/studio/beatCore.js (la web lo usa como plan B).
// Si cambias uno, copia el otro para que den el mismo resultado.
// ----------------------------------------------------------------------------
export function analyzeBeats(x, SR) {
  const duration = x.length / SR;
  const biquad = (f0, q = Math.SQRT1_2) => {
    const w = (2 * Math.PI * f0) / SR;
    const c = Math.cos(w);
    const s = Math.sin(w);
    const a = s / (2 * q);
    const a0 = 1 + a;
    return [(1 - c) / 2 / a0, (1 - c) / a0, (1 - c) / 2 / a0, (-2 * c) / a0, (1 - a) / a0];
  };
  const runFilter = (src, [b0, b1, b2, a1, a2], reverse) => {
    const y = new Float32Array(src.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    const n = src.length;
    for (let k = 0; k < n; k++) {
      const i = reverse ? n - 1 - k : k;
      const xi = src[i];
      const yi = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = xi; y2 = y1; y1 = yi; y[i] = yi;
    }
    return y;
  };
  const filtfilt = (src, coeffs, passes = 2) => {
    let y = src;
    for (let p = 0; p < passes; p++) {
      y = runFilter(y, coeffs, false);
      y = runFilter(y, coeffs, true);
    }
    return y;
  };
  const rmsEnvelope = (src, win, hop) => {
    const cs = new Float64Array(src.length + 1);
    for (let i = 0; i < src.length; i++) cs[i + 1] = cs[i] + src[i] * src[i];
    const out = new Float32Array(Math.max(1, Math.floor(src.length / hop)));
    for (let j = 0; j < out.length; j++) {
      const c = j * hop;
      const a = Math.max(0, c - (win >> 1));
      const b = Math.min(src.length, c + (win >> 1) + 1);
      out[j] = Math.sqrt((cs[b] - cs[a]) / Math.max(1, b - a));
    }
    return out;
  };
  const onset = (e) => {
    const o = new Float32Array(e.length);
    for (let i = 1; i < e.length; i++) o[i] = Math.max(0, e[i] - e[i - 1]);
    return o;
  };
  const mean = (arr, i0, i1) => {
    i0 = Math.max(0, Math.floor(i0));
    i1 = Math.min(arr.length, Math.floor(i1));
    let s = 0;
    for (let i = i0; i < i1; i++) s += arr[i];
    return i1 > i0 ? s / (i1 - i0) : 0;
  };

  if (duration < 4) return { duration, bpm: 128, beatPeriod: 60 / 128, phase: 0, drops: [], suggestedDrop: null, curve: [] };

  const lo = filtfilt(x, biquad(100));

  // 1) Tramo más fuerte (hasta 60 s) para medir el tempo
  const loSec = rmsEnvelope(lo, SR, SR);
  const win = Math.max(2, Math.min(60, Math.floor(duration) - 1));
  let A = 0, best = -1;
  for (let s = 0; s + win <= loSec.length; s++) {
    const m = mean(loSec, s, s + win);
    if (m > best) { best = m; A = s; }
  }
  const B = A + win;

  // 2) Tempo por autocorrelación del ataque del bombo
  const hop = Math.max(1, Math.round(SR / 501));
  const fr = SR / hop;
  const e = rmsEnvelope(lo, hop * 4, hop);
  const o = onset(e);
  const seg = o.slice(Math.floor(A * fr), Math.floor(B * fr));
  const m0 = mean(seg, 0, seg.length);
  for (let i = 0; i < seg.length; i++) seg[i] -= m0;
  const maxLag = Math.ceil(((8 * 60) / 110) * fr) + 2;
  const ac = new Float64Array(maxLag);
  for (let L = 0; L < maxLag; L++) {
    let s = 0;
    for (let i = 0; i + L < seg.length; i++) s += seg[i] * seg[i + L];
    ac[L] = s;
  }
  const acAt = (l) => {
    const i = Math.floor(l), f = l - i;
    return i + 1 < ac.length ? ac[i] * (1 - f) + ac[i + 1] * f : 0;
  };
  const score = (bpm) => {
    const lag = (60 / bpm) * fr;
    return acAt(lag) + acAt(2 * lag) + acAt(4 * lag) + acAt(8 * lag);
  };
  let bpm = 128, bs = -Infinity;
  for (let b = 110; b <= 190; b += 0.05) { const s = score(b); if (s > bs) { bs = s; bpm = b; } }
  for (let b = bpm - 0.1; b <= bpm + 0.1; b += 0.005) { const s = score(b); if (s > bs) { bs = s; bpm = b; } }
  bpm = Math.abs(bpm - Math.round(bpm)) < 0.15 ? Math.round(bpm) : Math.round(bpm * 20) / 20;
  const P = 60 / bpm;

  // 3) Fase de la rejilla (dónde cae el bombo dentro de cada golpe)
  const BINS = 400;
  const hist = new Float64Array(BINS);
  for (let i = Math.floor(A * fr); i < Math.min(o.length, B * fr); i++) {
    const t = i / fr;
    hist[Math.floor(((t % P) / P) * BINS) % BINS] += o[i];
  }
  const sig = (0.008 / P) * BINS;
  let phase = 0, pbest = -1;
  for (let k = 0; k < BINS; k++) {
    let s = 0;
    for (let d = -Math.ceil(3 * sig); d <= Math.ceil(3 * sig); d++) {
      s += hist[(k + d + BINS) % BINS] * Math.exp(-(d * d) / (2 * sig * sig));
    }
    if (s > pbest) { pbest = s; phase = (k / BINS) * P; }
  }
  const eSorted = Array.from(e).sort((a, b) => a - b);
  const eRef = eSorted[Math.floor(eSorted.length * 0.95)] || 1;

  // 4) Candidatos a drop: bombo fuerte justo después de un tramo sin graves
  const eSlow = rmsEnvelope(lo, Math.round(SR * 0.1), Math.round(SR * 0.01)); // 100 valores/s
  const sorted = Array.from(eSlow).sort((a, b) => a - b);
  const ref = sorted[Math.floor(sorted.length * 0.95)] || 1;
  const at = (t0, t1) => mean(eSlow, t0 * 100, t1 * 100) / ref;
  const drops = [];
  const thr = 0.25 * eRef;
  for (let i = Math.ceil(4 * fr); i < e.length - 3 * fr; i++) {
    if (!(e[i - 1] < thr && e[i] >= thr)) continue;
    const tb = i / fr;
    if (drops.length && tb - drops[drops.length - 1].time < 8 * P) continue;
    const lead = at(tb - 4, tb - 0.05), after = at(tb + 0.05, tb + 0.6), sustained = at(tb + 0.05, tb + 3);
    if (lead < 0.3 && after > 0.45 && sustained > 0.45) {
      let bd = 0;
      while (bd < 90 && tb - bd - 0.5 > 0 && at(tb - bd - 0.5, tb - bd) < 0.3) bd += 0.5;
      // se ajusta a la rejilla de golpes
      const snapped = phase + Math.round((tb - phase) / P) * P;
      drops.push({ time: +snapped.toFixed(3), breakdownSeconds: bd, strength: +(sustained * Math.min(bd, 16)).toFixed(2) });
    }
  }
  // 4b) "Subidas": golpes en los que los graves entran de golpe aunque no haya
  //     un breakdown largo (previews de 30 s, temas sin parón). Así casi
  //     cualquier canción tiene un momento fuerte en el que hacer "romper" el vídeo.
  const rises = [];
  const firstBeat = phase + Math.ceil((3 - phase) / P) * P;
  for (let tb = firstBeat; tb < duration - 2.5; tb += P) {
    const before = at(tb - 3, tb - 0.05);
    const after = at(tb + 0.05, tb + 2.5);
    rises.push({ time: tb, jump: after - before, after });
  }
  rises.sort((a, b) => b.jump - a.jump);
  const picked = [];
  for (const r of rises) {
    if (picked.length >= 5) break;
    const good = r.jump > 0.15 && r.after > 0.4;
    if (!good && picked.length) break; // si ninguna es clara, solo la mejor
    if (picked.some((q) => Math.abs(q.time - r.time) < 6)) continue;
    if (drops.some((d) => Math.abs(d.time - r.time) < 4)) continue;
    picked.push(r);
  }
  drops.forEach((d) => (d.kind = 'drop'));
  picked.forEach((r) =>
    drops.push({ time: +r.time.toFixed(3), breakdownSeconds: 0, strength: +Math.max(0.05, r.jump * 4).toFixed(2), kind: 'subida' })
  );
  drops.sort((a, b) => a.time - b.time);

  const real = drops.filter((d) => d.kind === 'drop');
  const ranked = real.filter((d) => d.time > 20).sort((a, b) => b.strength - a.strength);
  const strongest = (list) => list.slice().sort((a, b) => b.strength - a.strength)[0] || null;
  const suggested = ranked[0] || strongest(real) || strongest(drops);

  // 5) Curva de energía (2 valores/s) para dibujar la forma de la canción
  const curve = [];
  for (let t = 0; t < duration; t += 0.5) curve.push(+Math.min(1, at(t, t + 0.5)).toFixed(3));

  if (suggested) phase = suggested.time % P;
  return {
    duration: +duration.toFixed(3),
    bpm,
    beatPeriod: +P.toFixed(5),
    phase: +phase.toFixed(4),
    drops,
    suggestedDrop: suggested ? suggested.time : null,
    curve
  };
}

