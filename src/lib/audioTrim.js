// src/lib/audioTrim.js
// ----------------------------------------------------------------------------
// Recortar un audio en el navegador para que quepa en el límite del plan,
// SIN librerías y SIN servidor:
//  · MP3 → se corta por frames (sin recomprimir: misma calidad, instantáneo).
//  · WAV → se corta el PCM (sin recomprimir).
//  · Otros (m4a, flac, ogg…) → se decodifica y se guarda como WAV 16 bits.
// El tamaño final es proporcional a la duración elegida, por eso el editor
// limita la selección a lo que cabe.
// ----------------------------------------------------------------------------

const MP3_BITRATES = {
  // [versión MPEG1][layer III] y [MPEG2/2.5][layer III] en kbps
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
};
const MP3_RATES = {
  3: [44100, 48000, 32000], // MPEG1
  2: [22050, 24000, 16000], // MPEG2
  0: [11025, 12000, 8000] // MPEG2.5
};

function id3v2Size(u8) {
  if (u8.length > 10 && u8[0] === 0x49 && u8[1] === 0x44 && u8[2] === 0x33) {
    const size = ((u8[6] & 0x7f) << 21) | ((u8[7] & 0x7f) << 14) | ((u8[8] & 0x7f) << 7) | (u8[9] & 0x7f);
    const footer = u8[5] & 0x10 ? 10 : 0;
    return 10 + size + footer;
  }
  return 0;
}

function readMp3Header(u8, i) {
  if (i + 4 > u8.length) return null;
  if (u8[i] !== 0xff || (u8[i + 1] & 0xe0) !== 0xe0) return null;
  const verBits = (u8[i + 1] >> 3) & 3; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
  const layerBits = (u8[i + 1] >> 1) & 3; // 1 = Layer III
  if (verBits === 1 || layerBits !== 1) return null;
  const brIdx = (u8[i + 2] >> 4) & 15;
  const srIdx = (u8[i + 2] >> 2) & 3;
  if (brIdx === 0 || brIdx === 15 || srIdx === 3) return null;
  const pad = (u8[i + 2] >> 1) & 1;
  const isV1 = verBits === 3;
  const bitrate = MP3_BITRATES[isV1 ? 1 : 2][brIdx] * 1000;
  const sampleRate = MP3_RATES[verBits][srIdx];
  const samples = isV1 ? 1152 : 576;
  const length = Math.floor(((isV1 ? 144 : 72) * bitrate) / sampleRate) + pad;
  if (length < 24) return null;
  return { length, samples, sampleRate };
}

/** Lista de frames de un MP3: [{ offset, length, time, dur }] */
export function parseMp3Frames(arrayBuffer) {
  const u8 = new Uint8Array(arrayBuffer);
  let i = id3v2Size(u8);
  let end = u8.length;
  if (end > 128 && u8[end - 128] === 0x54 && u8[end - 127] === 0x41 && u8[end - 126] === 0x47) end -= 128; // ID3v1 'TAG'
  const frames = [];
  let time = 0;
  let misses = 0;
  while (i < end - 4) {
    const h = readMp3Header(u8, i);
    // Exigimos que el siguiente frame también sea válido (evita falsos positivos)
    if (h && i + h.length <= end && (i + h.length >= end - 4 || readMp3Header(u8, i + h.length))) {
      const dur = h.samples / h.sampleRate;
      frames.push({ offset: i, length: h.length, time, dur });
      time += dur;
      i += h.length;
      misses = 0;
    } else {
      i += 1;
      if (++misses > 65536 && frames.length === 0) break; // no parece un MP3
    }
  }
  // El primer frame puede ser una cabecera Xing/Info/VBRI (no es audio): fuera,
  // si no, el reproductor calcularía mal la duración del recorte.
  if (frames.length) {
    const f = frames[0];
    const slice = u8.subarray(f.offset, f.offset + Math.min(f.length, 200));
    const txt = String.fromCharCode(...slice);
    if (/Xing|Info|VBRI/.test(txt)) {
      frames.shift();
      const shift = f.dur;
      frames.forEach((fr) => (fr.time -= shift));
    }
  }
  return frames;
}

/** Info de un WAV PCM: { dataOffset, dataLength, byteRate, blockAlign } o null */
export function parseWav(arrayBuffer) {
  const dv = new DataView(arrayBuffer);
  if (dv.byteLength < 44) return null;
  const tag = (o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let p = 12;
  let fmt = null;
  while (p + 8 <= dv.byteLength) {
    const id = tag(p);
    const size = dv.getUint32(p + 4, true);
    if (id === 'fmt ') {
      fmt = {
        format: dv.getUint16(p + 8, true),
        channels: dv.getUint16(p + 10, true),
        sampleRate: dv.getUint32(p + 12, true),
        byteRate: dv.getUint32(p + 16, true),
        blockAlign: dv.getUint16(p + 20, true),
        bits: dv.getUint16(p + 22, true),
        raw: new Uint8Array(arrayBuffer, p + 8, size)
      };
    } else if (id === 'data' && fmt) {
      const dataLength = Math.min(size, dv.byteLength - (p + 8));
      return { ...fmt, dataOffset: p + 8, dataLength };
    }
    p += 8 + size + (size & 1);
  }
  return null;
}

function wavHeader(fmtRaw, dataBytes) {
  const header = new ArrayBuffer(12 + 8 + fmtRaw.length + 8);
  const dv = new DataView(header);
  const u8 = new Uint8Array(header);
  const w = (o, s) => [...s].forEach((c, k) => dv.setUint8(o + k, c.charCodeAt(0)));
  w(0, 'RIFF');
  dv.setUint32(4, header.byteLength - 8 + dataBytes, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  dv.setUint32(16, fmtRaw.length, true);
  u8.set(fmtRaw, 20);
  const p = 20 + fmtRaw.length;
  w(p, 'data');
  dv.setUint32(p + 4, dataBytes, true);
  return u8;
}

function pcm16FmtRaw(channels, sampleRate) {
  const raw = new Uint8Array(16);
  const dv = new DataView(raw.buffer);
  dv.setUint16(0, 1, true); // PCM
  dv.setUint16(2, channels, true);
  dv.setUint32(4, sampleRate, true);
  dv.setUint32(8, sampleRate * channels * 2, true);
  dv.setUint16(12, channels * 2, true);
  dv.setUint16(14, 16, true);
  return raw;
}

/**
 * Analiza el archivo y devuelve un "plan" con el que el editor sabe cuánto
 * pesa cualquier selección y cómo cortarla.
 */
export async function analyzeAudioFile(file) {
  const buf = await file.arrayBuffer();
  const name = (file.name || '').toLowerCase();
  const isMp3 = /\.mp3$/.test(name) || file.type === 'audio/mpeg' || file.type === 'audio/mp3';

  if (isMp3) {
    const frames = parseMp3Frames(buf);
    if (frames.length > 10) {
      const prefix = new Float64Array(frames.length + 1);
      frames.forEach((f, k) => (prefix[k + 1] = prefix[k] + f.length));
      const last = frames[frames.length - 1];
      return { kind: 'mp3', buf, frames, prefix, duration: last.time + last.dur };
    }
  }
  const wav = parseWav(buf);
  if (wav && wav.byteRate > 0) {
    return { kind: 'wav', buf, wav, duration: wav.dataLength / wav.byteRate };
  }
  return { kind: 'decode', buf, duration: null }; // se completa al decodificar
}

const frameIndexAt = (frames, t) => {
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].time <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
};

/** Bytes que ocuparía el recorte [start, end] (segundos) */
export function estimateBytes(plan, start, end) {
  const s = Math.max(0, Math.min(start, end));
  const e = Math.max(s, end);
  if (plan.kind === 'mp3') {
    const a = frameIndexAt(plan.frames, s);
    const b = frameIndexAt(plan.frames, Math.max(s, e - 1e-6));
    return plan.prefix[b + 1] - plan.prefix[a];
  }
  if (plan.kind === 'wav') {
    const ba = plan.wav.blockAlign;
    return 44 + Math.round(((e - s) * plan.wav.byteRate) / ba) * ba;
  }
  const ch = plan.audioBuffer?.numberOfChannels || 2;
  const sr = plan.audioBuffer?.sampleRate || 48000;
  return 44 + Math.round((e - s) * sr) * ch * 2;
}

/** Fin máximo (segundos) para que [start, fin] no pase de maxBytes */
export function maxEndFor(plan, start, maxBytes) {
  const dur = plan.duration;
  if (estimateBytes(plan, start, dur) <= maxBytes) return dur;
  let lo = start;
  let hi = dur;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (estimateBytes(plan, start, mid) <= maxBytes) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Inicio mínimo para que [inicio, end] no pase de maxBytes */
export function minStartFor(plan, end, maxBytes) {
  if (estimateBytes(plan, 0, end) <= maxBytes) return 0;
  let lo = 0;
  let hi = end;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (estimateBytes(plan, mid, end) <= maxBytes) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Corta y devuelve un File nuevo */
export function cutAudio(plan, start, end, originalName = 'audio') {
  const base = originalName.replace(/\.[^.]+$/, '') || 'audio';
  if (plan.kind === 'mp3') {
    const a = frameIndexAt(plan.frames, start);
    const b = frameIndexAt(plan.frames, Math.max(start, end - 1e-6));
    const from = plan.frames[a].offset;
    const to = plan.frames[b].offset + plan.frames[b].length;
    return new File([plan.buf.slice(from, to)], `${base}-recorte.mp3`, { type: 'audio/mpeg' });
  }
  if (plan.kind === 'wav') {
    const { dataOffset, byteRate, blockAlign, dataLength, raw } = plan.wav;
    const from = dataOffset + Math.floor((start * byteRate) / blockAlign) * blockAlign;
    const to = Math.min(dataOffset + dataLength, dataOffset + Math.floor((end * byteRate) / blockAlign) * blockAlign);
    const data = new Uint8Array(plan.buf, from, Math.max(0, to - from));
    return new File([wavHeader(raw, data.length), data], `${base}-recorte.wav`, { type: 'audio/wav' });
  }
  // Decodificado → WAV 16 bits con un fundido corto para que no "pegue" el corte
  const ab = plan.audioBuffer;
  const sr = ab.sampleRate;
  const ch = ab.numberOfChannels;
  const i0 = Math.max(0, Math.floor(start * sr));
  const i1 = Math.min(ab.length, Math.floor(end * sr));
  const n = Math.max(0, i1 - i0);
  const out = new Int16Array(n * ch);
  const fade = Math.min(Math.floor(sr * 0.02), Math.floor(n / 2));
  const chans = Array.from({ length: ch }, (_, c) => ab.getChannelData(c));
  for (let k = 0; k < n; k++) {
    const g = k < fade ? k / fade : k > n - fade ? (n - k) / fade : 1;
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i0 + k] * g));
      out[k * ch + c] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
  }
  const raw = pcm16FmtRaw(ch, sr);
  return new File([wavHeader(raw, out.byteLength), out.buffer], `${base}-recorte.wav`, { type: 'audio/wav' });
}

/** Picos para dibujar la onda (0..1) */
export function computePeaks(audioBuffer, buckets = 600) {
  const ch = audioBuffer.numberOfChannels;
  const len = audioBuffer.length;
  const step = Math.max(1, Math.floor(len / buckets));
  const data = Array.from({ length: Math.min(ch, 2) }, (_, c) => audioBuffer.getChannelData(c));
  const peaks = new Float32Array(buckets);
  for (let b = 0; b < buckets; b++) {
    const from = b * step;
    const to = Math.min(len, from + step);
    let m = 0;
    // Saltamos muestras: suficiente para la forma y mucho más rápido
    const stride = Math.max(1, Math.floor((to - from) / 400));
    for (let k = from; k < to; k += stride) {
      for (const d of data) {
        const v = Math.abs(d[k]);
        if (v > m) m = v;
      }
    }
    peaks[b] = m;
  }
  let max = 0;
  for (const p of peaks) if (p > max) max = p;
  if (max > 0) for (let b = 0; b < buckets; b++) peaks[b] /= max;
  return peaks;
}

export const formatTime = (s) => {
  if (!Number.isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};

export const formatMb = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
