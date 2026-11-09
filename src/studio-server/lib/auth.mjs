// studio-server/lib/auth.mjs
// ----------------------------------------------------------------------------
// Solo usuarios con sesión en RAVEXRADAR pueden pedir análisis: la web manda
// el token de Supabase y aquí se comprueba con Supabase Auth (se recuerda 10 min).
// También un límite de peticiones por usuario/IP para que nadie lo sature.
// ----------------------------------------------------------------------------
const tokens = new Map(); // token -> { userId, exp }
const hits = new Map(); // quien -> [timestamps]

export async function checkAuth(req, cfg) {
  if (!cfg.requireAuth) return { userId: null };
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token) throw Object.assign(new Error('Inicia sesión para usar el estudio'), { code: 'auth', status: 401 });
  const known = tokens.get(token);
  if (known && known.exp > Date.now()) return { userId: known.userId };
  let user = null;
  try {
    const r = await fetch(`${cfg.supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
      headers: { apikey: cfg.anonKey, Authorization: `Bearer ${token}` }
    });
    if (r.ok) user = await r.json();
  } catch {
    throw Object.assign(new Error('No se pudo comprobar la sesión'), { code: 'auth', status: 503 });
  }
  if (!user?.id) throw Object.assign(new Error('Sesión caducada: vuelve a entrar'), { code: 'auth', status: 401 });
  tokens.set(token, { userId: user.id, exp: Date.now() + 10 * 60 * 1000 });
  if (tokens.size > 5000) tokens.delete(tokens.keys().next().value);
  return { userId: user.id };
}

/** true si `who` puede hacer otra petición (máx. `max` cada `windowMs`) */
export function allowRate(who, max, windowMs) {
  const now = Date.now();
  const list = (hits.get(who) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    hits.set(who, list);
    return false;
  }
  list.push(now);
  hits.set(who, list);
  if (hits.size > 20000) hits.delete(hits.keys().next().value);
  return true;
}
