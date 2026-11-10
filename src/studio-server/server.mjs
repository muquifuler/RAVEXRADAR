// studio-server/server.mjs
// ----------------------------------------------------------------------------
// SERVIDOR DEL ESTUDIO DE RAVEXRADAR (independiente del de recopilar eventos).
// Analiza canciones de cualquier tamaño con ffmpeg: BPM, rejilla de golpes,
// drops y subidas, para que el vídeo del Estudio "rompa" justo con la canción.
//
//   GET  /health            → estado
//   POST /analyze           → { url }  (canción de una fiesta o de un perfil)
//   POST /analyze/upload    → cuerpo = el archivo de audio (subido desde el Estudio)
//
// Arranque:  cd studio-server && npm install && npm start
// Config:    variables de entorno o studio-server/.env (ver .env.example)
// ----------------------------------------------------------------------------
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAnalyzer, ANALYSIS_VERSION } from './lib/analyze.mjs';
import { checkAuth, allowRate } from './lib/auth.mjs';
import { ffmpegVersion } from './lib/ffmpeg.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---------- .env sencillo (sin dependencias) ----------
const envFile = path.join(HERE, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const env = (k, d = '') => (process.env[k] ?? d).toString().trim();
const list = (k, d = '') => env(k, d).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

const SUPABASE_URL = env('SUPABASE_URL');
const supabaseHost = (() => {
  try {
    return new URL(SUPABASE_URL).hostname.toLowerCase();
  } catch {
    return '';
  }
})();

const cfg = {
  port: Number(env('PORT', '8787')),
  allowedOrigins: list('ALLOWED_ORIGINS', 'https://ravexradar.com,https://www.ravexradar.com,http://localhost:5173'),
  supabaseUrl: SUPABASE_URL,
  anonKey: env('VITE_SUPABASE_ANON_KEY'),
  serviceRoleKey: env('SUPABASE_SERVICE_ROLE_KEY'), // opcional: solo para la caché en Supabase
  requireAuth: env('REQUIRE_AUTH', 'true') !== 'false',
  // de dónde se pueden descargar canciones: tu Supabase + previews de Deezer/iTunes
  allowedHosts: [
    ...(supabaseHost ? [supabaseHost] : []),
    ...list('ALLOWED_AUDIO_HOSTS', '.dzcdn.net,.deezer.com,.itunes.apple.com,.mzstatic.com')
  ],
  allowHttp: env('ALLOW_HTTP', 'false') === 'true', // solo para pruebas en local
  allowPrivate: env('ALLOW_PRIVATE_HOSTS', 'false') === 'true', // solo para pruebas en local
  maxDownloadMb: Number(env('MAX_DOWNLOAD_MB', '400')),
  maxUploadMb: Number(env('MAX_UPLOAD_MB', '200')),
  analyzeSeconds: Number(env('ANALYZE_SECONDS', '600')), // se analizan los 10 primeros minutos
  downloadTimeoutMs: Number(env('DOWNLOAD_TIMEOUT_MS', '90000')),
  maxConcurrent: Number(env('MAX_CONCURRENT', '2')),
  maxQueue: Number(env('MAX_QUEUE', '30')),
  rateMax: Number(env('RATE_MAX', '40')), // análisis por usuario…
  rateWindowMs: Number(env('RATE_WINDOW_MIN', '10')) * 60000, // …cada X minutos
  cacheDir: env('CACHE_DIR', path.join(HERE, 'cache')),
  tmpDir: env('TMP_DIR', '')
};

if (cfg.requireAuth && (!cfg.supabaseUrl || !cfg.anonKey)) {
  console.error('Falta SUPABASE_URL y VITE_SUPABASE_ANON_KEY (o pon REQUIRE_AUTH=false solo para pruebas).');
  process.exit(1);
}

const analyzer = createAnalyzer(cfg);

// ---------- utilidades HTTP ----------
function cors(req, res) {
  const origin = (req.headers.origin || '').toLowerCase();
  // La propia web (https://ravexradar.com → /api) siempre está permitida
  let sameOrigin = false;
  try {
    sameOrigin = Boolean(origin) && new URL(origin).host === String(req.headers.host || '').toLowerCase();
  } catch {}
  const allowed = !origin || sameOrigin || cfg.allowedOrigins.includes('*') || cfg.allowedOrigins.includes(origin);
  if (origin && allowed) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  return allowed;
}

function send(res, status, body) {
  if (res.headersSent) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req, max = 16 * 1024) {
  let s = '';
  for await (const c of req) {
    s += c;
    if (s.length > max) throw Object.assign(new Error('Petición demasiado grande'), { code: 'bad_request', status: 413 });
  }
  try {
    return JSON.parse(s || '{}');
  } catch {
    throw Object.assign(new Error('JSON no válido'), { code: 'bad_request', status: 400 });
  }
}

const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

// ---------- rutas ----------
const server = http.createServer(async (req, res) => {
  const okOrigin = cors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(okOrigin ? 204 : 403);
    return res.end();
  }
  if (!okOrigin) return send(res, 403, { error: 'Origen no permitido', code: 'origin' });
  const url = new URL(req.url, 'http://x');
  url.pathname = url.pathname.replace(/^\/api(?=\/|$)/, '') || '/';

  try {
    if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/')) {
      return send(res, 200, { ok: true, version: ANALYSIS_VERSION, ffmpeg: await ffmpegVersion(), ...analyzer.stats() });
    }

    if (req.method === 'POST' && (url.pathname === '/analyze' || url.pathname === '/analyze/upload')) {
      const { userId } = await checkAuth(req, cfg);
      const who = userId || clientIp(req);
      if (!allowRate(who, cfg.rateMax, cfg.rateWindowMs)) {
        return send(res, 429, { error: 'Demasiados análisis seguidos, espera unos minutos', code: 'rate' });
      }
      let result;
      if (url.pathname === '/analyze') {
        const body = await readJson(req);
        if (!body.url || typeof body.url !== 'string') return send(res, 400, { error: 'Falta la URL de la canción', code: 'bad_request' });
        result = await analyzer.byUrl(body.url.trim());
      } else {
        const declared = Number(req.headers['content-length'] || 0);
        if (declared > cfg.maxUploadMb * 1048576) return send(res, 413, { error: `La canción pesa más de ${cfg.maxUploadMb} MB`, code: 'size' });
        result = await analyzer.byUpload(req, req.headers['content-type'] || '');
      }
      return send(res, 200, result);
    }

    return send(res, 404, { error: 'No existe', code: 'not_found' });
  } catch (err) {
    const status = err.status || (err.code === 'format' ? 422 : 500);
    if (status >= 500) console.error('[studio]', err.code || '', err.message);
    return send(res, status, { error: err.message || 'Error', code: err.code || 'error' });
  }
});

server.requestTimeout = 5 * 60 * 1000;

// Un fallo raro de una librería no debe tumbar el servidor entero
process.on('unhandledRejection', (err) => console.error('[studio] promesa sin capturar', err));
process.on('uncaughtException', (err) => console.error('[studio] excepción sin capturar', err));
server.listen(cfg.port, () => {
  console.log(`[studio] escuchando en :${cfg.port} · auth=${cfg.requireAuth} · caché Supabase=${Boolean(cfg.serviceRoleKey)}`);
  console.log(`[studio] orígenes: ${cfg.allowedOrigins.join(', ')}`);
  console.log(`[studio] descargas permitidas de: ${cfg.allowedHosts.join(', ')}`);
});
