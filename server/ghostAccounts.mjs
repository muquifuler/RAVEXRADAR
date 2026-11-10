// server/ghostAccounts.mjs
// ----------------------------------------------------------------------------
// Clubs y promotoras que traen las fiestas importadas (RA, Ticketmaster, Xceed)
// y que todavía no están en RAVEXRADAR → se crea un perfil "fantasma" (sin
// contraseña, nadie puede entrar) para que salgan como badge en la fiesta.
//  · Se reutiliza si ya existe (por nombre normalizado), y si el club ya tiene
//    cuenta real en la web se enlaza a esa.
//  · Cualquiera puede reclamarlo desde su panel; el admin decide si fusiona.
// Requiere la migración 10 (columnas is_ghost / ghost_key / ghost_source).
// ----------------------------------------------------------------------------

export const GHOST_EMAIL_DOMAIN = 'ghost.ravexradar.invalid';
const MAX_NEW_GHOSTS_PER_RUN = 400;

// Nombres que NO son un club/promotora real (relleno de las APIs)
const GENERIC_NAMES = new Set([
  'club',
  'ra electronic',
  'ticketmaster electronic',
  'xceed spain clubbing',
  'tba',
  'tbc',
  'tba venue',
  'secret location',
  'secret',
  'location tba',
  'por anunciar',
  'ubicacion secreta',
  'various',
  'varios',
  'online',
  'live nation',
  'ticketmaster'
]);

export const normKey = (s) =>
  (s || '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export function isUsableName(name, city) {
  const k = normKey(name);
  if (!k || k.length < 2) return false;
  if (GENERIC_NAMES.has(k)) return false;
  if (k === `club ${normKey(city)}`) return false; // "Club Madrid" de relleno
  return true;
}

const slugify = (s) => normKey(s).replace(/ /g, '-').slice(0, 40) || 'perfil';

function shortHash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36).slice(0, 6);
}

/** Índices { Club: Map(key → perfil), Promotor: Map(key → perfil) } */
async function loadVenueProfiles(supabase) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, role, city, avatar_url, is_ghost, ghost_key')
    .in('role', ['Club', 'Promotor']);
  if (error) {
    console.warn('⚠️ No se pudieron leer clubs/promotoras (¿falta la migración 10?):', error.message);
    return null;
  }
  const idx = { Club: new Map(), Promotor: new Map() };
  for (const p of data || []) {
    const map = idx[p.role];
    const keys = [normKey(p.username)];
    if (p.ghost_key) keys.push(p.ghost_key.split(':').slice(1).join(':'));
    for (const k of keys) {
      if (!k) continue;
      const cur = map.get(k);
      // Si hay cuenta real y fantasma con el mismo nombre, gana la real
      if (!cur || (cur.is_ghost && !p.is_ghost)) map.set(k, p);
    }
  }
  return idx;
}

async function findAuthUserIdByEmail(supabase, email) {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return null;
    const found = (data?.users || []).find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (found) return found.id;
    if ((data?.users || []).length < 1000) return null;
  }
  return null;
}

async function createGhostProfile(supabase, role, info) {
  const key = `${role}:${normKey(info.name)}`;
  const email = `${role === 'Club' ? 'club' : 'promo'}-${slugify(info.name)}-${shortHash(key)}@${GHOST_EMAIL_DOMAIN}`;

  let id = null;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { ghost: true, name: info.name }
  });
  if (!error) id = data?.user?.id || null;
  else if (/already|registered|exists/i.test(error.message || '')) id = await findAuthUserIdByEmail(supabase, email);
  if (!id) {
    console.warn(`⚠️ No se pudo crear el perfil fantasma de "${info.name}":`, error?.message);
    return null;
  }

  const base = {
    role,
    city: info.city || null,
    lat: info.lat ?? null,
    lng: info.lng ?? null,
    street_address: info.street || '',
    is_ghost: true,
    ghost_key: key,
    ghost_source: info.source || null,
    onboarding_completed: true
  };
  const candidates = [info.name, info.city ? `${info.name} (${info.city})` : null, `${info.name} ${id.slice(0, 4)}`].filter(Boolean);
  for (const username of candidates) {
    const { error: upErr } = await supabase.from('profiles').upsert({ id, username, ...base }, { onConflict: 'id' });
    if (!upErr) return { id, username, role, avatar_url: null, is_ghost: true };
    if (!/duplicate|unique/i.test(upErr.message || '')) {
      console.warn(`⚠️ Perfil fantasma "${info.name}":`, upErr.message);
      break;
    }
  }
  return null;
}

/**
 * Enlaza cada fiesta con su club (venue_id) y su(s) promotora(s) (promoters_list),
 * creando los perfiles fantasma que falten. Modifica los eventos "in place".
 * Usa los campos temporales: _exact_coords, _venue_street, _promoters (se borran aquí).
 */
export async function linkVenueAccounts(supabase, events, cityCoords = {}) {
  const idx = await loadVenueProfiles(supabase);
  const cleanup = () =>
    events.forEach((ev) => {
      delete ev._exact_coords;
      delete ev._venue_street;
      delete ev._promoters;
    });
  if (!idx) {
    cleanup();
    return { created: 0, linkedVenues: 0, linkedPromoters: 0 };
  }

  // 1) Datos de cada club/promotora (una vez cada uno; mejor con coordenadas exactas)
  const wanted = { Club: new Map(), Promotor: new Map() };
  for (const ev of events) {
    const source = String(ev.external_id || '').split('_')[0];
    if (isUsableName(ev.venue_name, ev.city)) {
      const k = normKey(ev.venue_name);
      const cur = wanted.Club.get(k);
      if (!cur || (!cur.exact && ev._exact_coords)) {
        wanted.Club.set(k, {
          name: String(ev.venue_name).trim().slice(0, 60),
          city: ev.city,
          lat: ev.lat,
          lng: ev.lng,
          exact: Boolean(ev._exact_coords),
          street: ev._venue_street || cur?.street || '',
          source
        });
      } else if (!cur.street && ev._venue_street) cur.street = ev._venue_street;
    }
    for (const pname of ev._promoters || []) {
      if (!isUsableName(pname, ev.city)) continue;
      if (normKey(pname) === normKey(ev.venue_name)) continue; // es el propio club
      const k = normKey(pname);
      if (!wanted.Promotor.has(k)) {
        const base = cityCoords[ev.city] || { lat: ev.lat, lng: ev.lng };
        wanted.Promotor.set(k, {
          name: String(pname).trim().slice(0, 60),
          city: ev.city,
          lat: Number((base.lat + (Math.random() - 0.5) * 0.02).toFixed(6)),
          lng: Number((base.lng + (Math.random() - 0.5) * 0.02).toFixed(6)),
          source
        });
      }
    }
  }

  // 2) Crear los que no existen (con tope por sincronización)
  let created = 0;
  for (const role of ['Club', 'Promotor']) {
    for (const [k, info] of wanted[role]) {
      if (idx[role].has(k)) continue;
      // Si ya existe con el otro rol (p. ej. club que también organiza), se reutiliza
      const other = idx[role === 'Club' ? 'Promotor' : 'Club'].get(k);
      if (other && !other.is_ghost) {
        idx[role].set(k, other);
        continue;
      }
      if (created >= MAX_NEW_GHOSTS_PER_RUN) continue;
      const p = await createGhostProfile(supabase, role, info);
      if (p) {
        idx[role].set(k, p);
        created += 1;
      }
    }
  }

  // 3) Enlazar cada fiesta
  let linkedVenues = 0;
  let linkedPromoters = 0;
  for (const ev of events) {
    const club = isUsableName(ev.venue_name, ev.city) ? idx.Club.get(normKey(ev.venue_name)) : null;
    // Siempre se envían los dos campos (en un upsert por lotes, lo que falta iría a null)
    ev.venue_id = club ? club.id : null;
    if (club) linkedVenues += 1;
    const proms = [];
    for (const pname of ev._promoters || []) {
      const k = normKey(pname);
      if (!isUsableName(pname, ev.city) || k === normKey(ev.venue_name)) continue;
      const p = idx.Promotor.get(k) || idx.Club.get(k);
      if (p && !proms.some((x) => x.id === p.id)) proms.push({ id: p.id, username: p.username, avatar_url: p.avatar_url || null });
    }
    ev.promoters_list = proms;
    if (proms.length) linkedPromoters += 1;
  }

  cleanup();
  console.log(
    `🏢 Clubs/promotoras: ${created} perfiles fantasma nuevos · ${linkedVenues} fiestas con club enlazado · ${linkedPromoters} con promotora enlazada.`
  );
  return { created, linkedVenues, linkedPromoters };
}
