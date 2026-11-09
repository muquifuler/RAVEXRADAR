// src/lib/studio/beatAnalysis.js
// ----------------------------------------------------------------------------
// Análisis de una canción: BPM, rejilla de golpes, drops y subidas.
//  1) Lo hace el SERVIDOR DEL ESTUDIO (studio-server, con ffmpeg): sirve para
//     canciones de cualquier tamaño y formato, y guarda el resultado en caché.
//     Dirección en VITE_STUDIO_API_URL.
//  2) Si el servidor no está configurado o no responde, plan B en el navegador
//     (solo canciones pequeñas): OfflineAudioContext + Web Worker.
// ----------------------------------------------------------------------------
import { parseMp3Frames } from '../audioTrim';
import { supabase } from '../supabaseClient';
import { analyzeBeats } from './beatCore';

const STUDIO_API = String(import.meta.env?.VITE_STUDIO_API_URL || '').replace(/\/+$/, '');

export { analyzeBeats };

const ANALYSIS_RATE = 11025;
const MAX_ANALYZE_SECONDS = 360; // 6 min: suficiente para encontrar el drop
const MAX_DECODE_BYTES = 24 * 1024 * 1024; // archivos no-MP3 más grandes: sin análisis

// ---------------------------------------------------------------------------
// Worker (empaquetado por Vite). Si no arranca o tarda demasiado, se analiza
// en el hilo principal con una COPIA de los datos (la original se transfiere).
// ---------------------------------------------------------------------------
let worker = null;
let workerBroken = false;
let reqId = 0;
const pending = new Map();

function getWorker() {
  if (workerBroken || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./beatWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const p = pending.get(e.data?.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.error) p.reject(new Error(e.data.error));
      else p.resolve(e.data.result);
    };
    worker.onerror = (ev) => {
      console.warn('[estudio] el worker de análisis no funciona, se usa el hilo principal', ev?.message || ev);
      workerBroken = true;
      pending.forEach((p) => p.reject(new Error('worker')));
      pending.clear();
      worker = null;
    };
    return worker;
  } catch (err) {
    console.warn('[estudio] sin worker de análisis', err);
    workerBroken = true;
    return null;
  }
}

function runAnalysis(x, sr) {
  const w = getWorker();
  if (!w) return Promise.resolve(analyzeBeats(x, sr));
  const id = ++reqId;
  const copy = x.slice(); // la copia viaja al worker; x se queda para el plan B
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error('timeout'));
      }
    }, 25000);
    w.postMessage({ id, x: copy, sr }, [copy.buffer]);
  }).catch((err) => {
    console.warn('[estudio] análisis en el hilo principal:', err?.message || err);
    return analyzeBeats(x, sr);
  });
}

// ---------------------------------------------------------------------------
// Decodificación a baja resolución (mono)
// ---------------------------------------------------------------------------
async function decodeLowRate(arrayBuffer) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  let audio;
  for (const rate of [ANALYSIS_RATE, 22050, 44100]) {
    try {
      const ctx = new OAC(1, 1, rate);
      audio = await new Promise((res, rej) => {
        const p = ctx.decodeAudioData(arrayBuffer.slice(0), res, rej);
        if (p && p.then) p.then(res, rej);
      });
      break;
    } catch {
      audio = null;
    }
  }
  if (!audio) throw new Error('No se pudo leer el audio');
  const sr = audio.sampleRate;
  const len = Math.min(audio.length, Math.floor(MAX_ANALYZE_SECONDS * sr));
  // mezcla a mono y, si hace falta, baja la frecuencia a ~11 kHz (promediando)
  const factor = Math.max(1, Math.round(sr / ANALYSIS_RATE));
  const outLen = Math.floor(len / factor);
  const out = new Float32Array(outLen);
  const chans = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
  const div = factor * chans.length;
  for (let i = 0; i < outLen; i++) {
    let s = 0;
    const j0 = i * factor;
    for (let k = 0; k < factor; k++) for (const ch of chans) s += ch[j0 + k];
    out[i] = s / div;
  }
  return { x: out, sr: sr / factor };
}

const cache = new Map();

const fail = (code, msg) => Object.assign(new Error(msg), { code });

/** Descarga con un segundo intento sin caché (a veces la caché guarda una
 *  copia sin permisos CORS de cuando sonó en otra parte de la web). */
async function download(url) {
  const tries = [
    () => fetch(url, { mode: 'cors' }),
    () => fetch(url + (url.includes('?') ? '&' : '?') + 'studio=1', { mode: 'cors', cache: 'reload' })
  ];
  let last = null;
  for (const go of tries) {
    try {
      const res = await go();
      if (res.ok) return res;
      last = fail('download', `HTTP ${res.status}`);
    } catch (err) {
      last = fail('download', err?.message || 'sin permiso para leer el archivo');
    }
  }
  throw last;
}

// ---------------------------------------------------------------------------
// Servidor del estudio
// ---------------------------------------------------------------------------
async function analyzeOnServer(source) {
  let token = '';
  try {
    const { data } = await supabase.auth.getSession();
    token = data?.session?.access_token || '';
  } catch {
    /* sin sesión: el servidor dirá si hace falta */
  }
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const isFile = typeof source !== 'string';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), isFile ? 240000 : 150000);
  let res;
  try {
    res = isFile
      ? await fetch(`${STUDIO_API}/analyze/upload`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': source.type || 'application/octet-stream' },
          body: source,
          signal: ctrl.signal
        })
      : await fetch(`${STUDIO_API}/analyze`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: source }),
          signal: ctrl.signal
        });
  } catch (err) {
    throw fail('server', err?.name === 'AbortError' ? 'el servidor tardó demasiado' : 'no se pudo conectar con el servidor del estudio');
  } finally {
    clearTimeout(timer);
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* respuesta vacía */
  }
  if (!res.ok || !body || body.error) throw fail(body?.code || 'server', body?.error || `HTTP ${res.status}`);
  return { ...body, source: 'server' };
}

/**
 * Analiza una canción (URL o File). Devuelve { bpm, beatPeriod, phase, drops,
 * suggestedDrop, curve, duration, source } o lanza un error con .code
 * ('download' | 'format' | 'size' | 'server' | 'auth' | 'rate' …).
 */
export function analyzeTrack(source, key = null) {
  const cacheKey = key || (typeof source === 'string' ? source : `${source?.name}:${source?.size}`);
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const job = (async () => {
    if (!STUDIO_API) return analyzeInBrowser(source);
    try {
      return await analyzeOnServer(source);
    } catch (err) {
      // el archivo no se puede leer o es enorme: el navegador tampoco podrá
      if (err.code === 'format' || err.code === 'size') throw err;
      console.warn('[estudio] servidor no disponible, se analiza en el navegador:', err.code, err.message);
      try {
        return await analyzeInBrowser(source);
      } catch (err2) {
        // servidor caído + canción grande → el aviso útil es el del servidor
        if (err.code === 'server' && err2.code !== 'size') throw err2;
        throw err;
      }
    }
  })();
  cache.set(cacheKey, job);
  job.catch((err) => {
    console.warn('[estudio] no se pudo analizar la canción:', err?.code || '', err?.message || err, typeof source === 'string' ? source : '');
    cache.delete(cacheKey);
  });
  return job;
}

/** Plan B: en el navegador (canciones pequeñas) */
async function analyzeInBrowser(source) {
  let buf;
  let isMp3 = false;
  if (typeof source === 'string') {
    const res = await download(source);
    const type = res.headers.get('content-type') || '';
    buf = await res.arrayBuffer();
    isMp3 = /mpeg|mp3/i.test(type) || /\.mp3(\?|$)/i.test(source);
  } else {
    buf = await source.arrayBuffer();
    isMp3 = /mpeg|mp3/i.test(source.type) || /\.mp3$/i.test(source.name || '');
  }
  // MP3 largos: solo los primeros minutos (mismo origen de tiempo que el archivo entero)
  if (isMp3 || buf.byteLength > MAX_DECODE_BYTES) {
    const frames = parseMp3Frames(buf);
    if (frames.length > 10) {
      const lastAllowed = frames.findIndex((f) => f.time > MAX_ANALYZE_SECONDS);
      if (lastAllowed > 0) {
        const end = frames[lastAllowed].offset;
        buf = buf.slice(0, end);
      }
    } else if (buf.byteLength > MAX_DECODE_BYTES) {
      throw fail('size', 'demasiado grande para analizarla en el navegador');
    }
  }
  let dec;
  try {
    dec = await decodeLowRate(buf);
  } catch (err) {
    throw fail('format', err?.message || 'formato no soportado');
  }
  const result = await runAnalysis(dec.x, dec.sr);
  return { ...result, source: 'browser' };
}

