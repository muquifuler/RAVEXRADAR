// studio-server/lib/download.mjs
// ----------------------------------------------------------------------------
// Descarga segura de la canción a un archivo temporal:
//  · solo dominios permitidos (tu Supabase Storage + los de previews de música),
//  · nada de IPs privadas ni localhost (salvo que lo permitas para pruebas),
//  · límite de tamaño y de tiempo, y redirecciones revisadas una a una.
// ----------------------------------------------------------------------------
import { createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import dns from 'node:dns';
import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';

const fail = (code, msg, status = 400) => Object.assign(new Error(msg), { code, status });

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 10 || a === 127 || a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  const v = ip.toLowerCase();
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:127.') || v.startsWith('::ffff:10.') || v.startsWith('::ffff:192.168.');
}

const hostAllowed = (host, allowed) => allowed.some((h) => host === h || (h.startsWith('.') && host.endsWith(h)));

async function checkUrl(raw, cfg) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw fail('bad_url', 'La dirección de la canción no es válida');
  }
  const host = u.hostname.toLowerCase();
  if (!hostAllowed(host, cfg.allowedHosts)) throw fail('host_not_allowed', `No se permite descargar de ${host}`);
  if (u.protocol !== 'https:' && !(cfg.allowHttp && u.protocol === 'http:')) throw fail('bad_url', 'Solo se aceptan direcciones https');
  if (!cfg.allowPrivate) {
    const addrs = await lookup(host, { all: true }).catch(() => []);
    if (!addrs.length) throw fail('download', `No se encuentra ${host}`, 502);
    if (addrs.some((a) => isPrivateIp(a.address))) throw fail('host_not_allowed', 'Dirección no permitida');
  }
  return u;
}

/** lookup que además impide conectar a IPs privadas (protege también contra DNS rebinding) */
function safeLookup(cfg) {
  return (hostname, options, cb) => {
    dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
      if (err) return cb(err);
      const list = Array.isArray(addrs) ? addrs : [{ address: addrs, family: options?.family || 4 }];
      if (!cfg.allowPrivate && list.some((a) => isPrivateIp(a.address))) {
        return cb(fail('host_not_allowed', 'Dirección no permitida'));
      }
      if (options?.all) return cb(null, list);
      return cb(null, list[0].address, list[0].family);
    });
  };
}

/** GET con http/https de Node (sin seguir redirecciones solo) */
function httpGet(u, cfg) {
  return new Promise((resolve, reject) => {
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.get(u, {
      headers: { 'user-agent': 'RAVEXRADAR-Studio/1.0', accept: 'audio/*,*/*;q=0.5' },
      lookup: safeLookup(cfg),
      timeout: cfg.downloadTimeoutMs
    }, resolve);
    req.on('timeout', () => req.destroy(new Error('tiempo agotado')));
    req.on('error', (err) => reject(err.code === 'host_not_allowed' ? err : fail('download', `No se pudo descargar la canción (${err.message})`, 502)));
  });
}

/** Descarga `url` a un temporal. Devuelve { file, bytes, contentType, sha256, cleanup() } */
export async function downloadToTemp(url, cfg) {
  let current = await checkUrl(url, cfg);
  let res = null;
  for (let hop = 0; hop < 5; hop++) {
    res = await httpGet(current, cfg);
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      res.resume();
      current = await checkUrl(new URL(res.headers.location, current).toString(), cfg);
      continue;
    }
    break;
  }
  if (!res || res.statusCode < 200 || res.statusCode >= 300) {
    res?.resume();
    throw fail('download', `No se pudo descargar la canción (HTTP ${res?.statusCode ?? '?'})`, 502);
  }
  const max = cfg.maxDownloadMb * 1024 * 1024;
  const declared = Number(res.headers['content-length'] || 0);
  if (declared > max) {
    res.destroy();
    throw fail('size', `La canción pesa más de ${cfg.maxDownloadMb} MB`, 413);
  }
  // si la descarga se queda colgada a mitad, se corta
  res.setTimeout(cfg.downloadTimeoutMs, () => res.destroy(new Error('tiempo agotado')));
  return saveStream(res, max, cfg, res.headers['content-type'] || '');
}

/** Guarda un stream (descarga o subida) en un temporal con límite de tamaño */
export async function saveStream(stream, maxBytes, cfg, contentType = '') {
  const file = path.join(cfg.tmpDir || os.tmpdir(), `rx-audio-${crypto.randomUUID()}`);
  let bytes = 0;
  const hash = crypto.createHash('sha256');
  const cleanup = () => unlink(file).catch(() => {});
  try {
    await pipeline(
      stream,
      async function* (source) {
        for await (const chunk of source) {
          bytes += chunk.length;
          if (bytes > maxBytes) throw fail('size', `La canción pesa más de ${Math.round(maxBytes / 1048576)} MB`, 413);
          hash.update(chunk);
          yield chunk;
        }
      },
      createWriteStream(file)
    );
  } catch (err) {
    await cleanup();
    if (err.code === 'size') throw err;
    throw fail('download', `No se pudo leer la canción (${err.message})`, 502);
  }
  if (bytes < 1024) {
    await cleanup();
    throw fail('format', 'El archivo está vacío', 400);
  }
  return { file, bytes, contentType, sha256: hash.digest('hex'), cleanup };
}
