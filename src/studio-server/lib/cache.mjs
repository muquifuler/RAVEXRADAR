// studio-server/lib/cache.mjs
// ----------------------------------------------------------------------------
// Caché de análisis: cada canción se analiza UNA vez.
//  1) memoria (rápido),  2) disco (CACHE_DIR),  3) Supabase (tabla
//  studio_audio_analysis, si hay SUPABASE_SERVICE_ROLE_KEY): sobrevive a reinicios
//  y a servidores sin disco persistente.
// ----------------------------------------------------------------------------
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function createCache(cfg) {
  const mem = new Map();
  const MAX_MEM = 300;
  let diskReady = null;

  const remember = (key, value) => {
    mem.delete(key);
    mem.set(key, value);
    if (mem.size > MAX_MEM) mem.delete(mem.keys().next().value);
  };

  const diskFile = (key) => path.join(cfg.cacheDir, `${key}.json`);
  const ensureDisk = () => {
    if (!cfg.cacheDir) return Promise.resolve(false);
    if (!diskReady) diskReady = mkdir(cfg.cacheDir, { recursive: true }).then(() => true, () => false);
    return diskReady;
  };

  const sb = cfg.supabaseUrl && cfg.serviceRoleKey
    ? {
        url: `${cfg.supabaseUrl.replace(/\/$/, '')}/rest/v1/studio_audio_analysis`,
        headers: {
          apikey: cfg.serviceRoleKey,
          Authorization: `Bearer ${cfg.serviceRoleKey}`,
          'Content-Type': 'application/json'
        }
      }
    : null;

  async function get(key) {
    if (mem.has(key)) return mem.get(key);
    if (await ensureDisk()) {
      try {
        const v = JSON.parse(await readFile(diskFile(key), 'utf8'));
        remember(key, v);
        return v;
      } catch {
        /* no está en disco */
      }
    }
    if (sb) {
      try {
        const r = await fetch(`${sb.url}?key=eq.${encodeURIComponent(key)}&select=result`, { headers: sb.headers });
        if (r.ok) {
          const rows = await r.json();
          if (rows?.[0]?.result) {
            remember(key, rows[0].result);
            return rows[0].result;
          }
        }
      } catch {
        /* Supabase no disponible: se analiza otra vez */
      }
    }
    return null;
  }

  async function set(key, value, source = '') {
    remember(key, value);
    if (await ensureDisk()) writeFile(diskFile(key), JSON.stringify(value)).catch(() => {});
    if (sb) {
      fetch(sb.url, {
        method: 'POST',
        headers: { ...sb.headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ key, source: String(source).slice(0, 1000), result: value })
      }).catch(() => {});
    }
  }

  return { get, set };
}
