// studio-server/lib/ffmpeg.mjs
// ----------------------------------------------------------------------------
// Decodifica cualquier audio (mp3, m4a/aac, wav, flac, ogg…) con ffmpeg a mono
// 11 025 Hz en float32, que es lo que necesita el análisis.
// Usa FFMPEG_PATH, si no el binario de "ffmpeg-static" y si no el ffmpeg del PATH.
// ----------------------------------------------------------------------------
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let cached = null;

export function ffmpegPath() {
  if (cached) return cached;
  if (process.env.FFMPEG_PATH) return (cached = process.env.FFMPEG_PATH);
  try {
    cached = require('ffmpeg-static');
  } catch {
    /* sin paquete */
  }
  if (!cached) cached = 'ffmpeg';
  return cached;
}

export const ANALYSIS_RATE = 11025;

/**
 * Lee como mucho `maxSeconds` del archivo y devuelve
 * { samples: Float32Array, sampleRate, fullDuration }.
 */
export function decodeForAnalysis(file, { maxSeconds = 600, timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const args = [
      '-hide_banner', '-nostats', '-nostdin',
      '-t', String(maxSeconds),
      '-i', file,
      '-vn', '-ac', '1', '-ar', String(ANALYSIS_RATE),
      '-f', 'f32le', 'pipe:1'
    ];
    const ff = spawn(ffmpegPath(), args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    let bytes = 0;
    let err = '';
    const maxBytes = Math.ceil(maxSeconds * ANALYSIS_RATE * 4) + 65536;
    const timer = setTimeout(() => {
      ff.kill('SIGKILL');
      reject(Object.assign(new Error('ffmpeg tardó demasiado'), { code: 'timeout' }));
    }, timeoutMs);
    ff.stdout.on('data', (c) => {
      bytes += c.length;
      if (bytes <= maxBytes) chunks.push(c);
    });
    ff.stderr.on('data', (c) => {
      if (err.length < 20000) err += c.toString();
    });
    ff.on('error', (e) => {
      clearTimeout(timer);
      reject(Object.assign(new Error(`No se pudo ejecutar ffmpeg (${e.message}). Instala ffmpeg o "ffmpeg-static".`), { code: 'ffmpeg' }));
    });
    ff.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        return reject(Object.assign(new Error('ffmpeg no pudo leer el audio: ' + err.split('\n').filter(Boolean).slice(-3).join(' | ')), { code: 'format' }));
      }
      const buf = Buffer.concat(chunks);
      const n = Math.floor(buf.length / 4);
      if (n < ANALYSIS_RATE) return reject(Object.assign(new Error('El audio está vacío o es demasiado corto'), { code: 'format' }));
      // copia alineada a Float32Array
      const samples = new Float32Array(n);
      for (let i = 0; i < n; i++) samples[i] = buf.readFloatLE(i * 4);
      const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(err);
      const fullDuration = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : n / ANALYSIS_RATE;
      resolve({ samples, sampleRate: ANALYSIS_RATE, fullDuration });
    });
  });
}

/** Versión de ffmpeg (para /health) */
export function ffmpegVersion() {
  return new Promise((resolve) => {
    try {
      const ff = spawn(ffmpegPath(), ['-version']);
      let out = '';
      ff.stdout.on('data', (c) => (out += c));
      ff.on('error', () => resolve(null));
      ff.on('close', () => resolve(out.split('\n')[0] || null));
    } catch {
      resolve(null);
    }
  });
}
