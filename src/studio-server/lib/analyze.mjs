// studio-server/lib/analyze.mjs
// ----------------------------------------------------------------------------
// Descarga → ffmpeg → análisis (BPM, rejilla, drops y subidas) → caché.
// Como mucho N análisis a la vez (ffmpeg gasta CPU); el resto espera en cola.
// Si dos personas piden la misma canción a la vez, se analiza una sola vez.
// ----------------------------------------------------------------------------
import crypto from 'node:crypto';
import { analyzeBeats } from './beatCore.mjs';
import { decodeForAnalysis } from './ffmpeg.mjs';
import { downloadToTemp, saveStream } from './download.mjs';
import { createCache } from './cache.mjs';

export const ANALYSIS_VERSION = 'v2'; // súbelo si cambia beatCore: invalida la caché
const URL_KEY_TTL = 7 * 24 * 3600 * 1000; // la misma URL se re-comprueba cada semana

export function createAnalyzer(cfg) {
  const cache = createCache(cfg);
  const inflight = new Map();
  let running = 0;
  const queue = [];

  const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 40);
  const urlKey = (url) => `u_${ANALYSIS_VERSION}_${sha(url)}`;
  const fileKey = (hash) => `f_${ANALYSIS_VERSION}_${hash.slice(0, 40)}`;

  function slot() {
    return new Promise((resolve) => {
      const go = () => {
        running += 1;
        resolve(() => {
          running -= 1;
          const next = queue.shift();
          if (next) next();
        });
      };
      if (running < cfg.maxConcurrent) go();
      else if (queue.length >= cfg.maxQueue) resolve(null);
      else queue.push(go);
    });
  }

  async function analyzeFile(saved) {
    const key = fileKey(saved.sha256);
    const hit = await cache.get(key);
    if (hit) return { ...hit, cached: true };
    const release = await slot();
    if (!release) throw Object.assign(new Error('El servidor está ocupado, prueba en un momento'), { code: 'busy', status: 503 });
    try {
      const t0 = Date.now();
      const { samples, sampleRate, fullDuration } = await decodeForAnalysis(saved.file, { maxSeconds: cfg.analyzeSeconds });
      const result = analyzeBeats(samples, sampleRate);
      const out = {
        ...result,
        fullDuration: +fullDuration.toFixed(3),
        analyzedSeconds: +(samples.length / sampleRate).toFixed(1),
        version: ANALYSIS_VERSION,
        ms: Date.now() - t0
      };
      await cache.set(key, out, `file:${saved.sha256}`);
      return out;
    } finally {
      release();
    }
  }

  /** Analiza una canción por URL (con caché por URL y por contenido) */
  function byUrl(url) {
    const key = urlKey(url);
    if (inflight.has(key)) return inflight.get(key);
    const job = (async () => {
      const hit = await cache.get(key);
      if (hit && Date.now() - (hit.at || 0) < URL_KEY_TTL) return { ...hit, cached: true };
      const saved = await downloadToTemp(url, cfg);
      try {
        const out = await analyzeFile(saved);
        const { cached, ...clean } = out;
        await cache.set(key, { ...clean, at: Date.now() }, url);
        return out;
      } finally {
        await saved.cleanup();
      }
    })();
    inflight.set(key, job);
    job.finally(() => inflight.delete(key)).catch(() => {});
    return job;
  }

  /** Analiza un archivo subido desde el móvil/ordenador (stream del cuerpo) */
  async function byUpload(stream, contentType) {
    const saved = await saveStream(stream, cfg.maxUploadMb * 1024 * 1024, cfg, contentType);
    try {
      return await analyzeFile(saved);
    } finally {
      await saved.cleanup();
    }
  }

  return { byUrl, byUpload, stats: () => ({ running, queued: queue.length }) };
}
