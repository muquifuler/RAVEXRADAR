// RUTA COMPLETA: houseoftechno/src/lib/shareLinks.js
// ============================================================================
// Enlaces para compartir paneles (fiesta, DJ, club, promotor).
//   https://tu-web.com/?fiesta=<id>     https://tu-web.com/?dj=<usuario>
//   https://tu-web.com/?club=<usuario>  https://tu-web.com/?promotor=<usuario>
// Al abrir el enlace, App.jsx abre ese panel en el mapa.
// En el móvil sale el menú de compartir del sistema (Instagram, WhatsApp…);
// en el ordenador se copia el enlace.
// ============================================================================

export const SHARE_KINDS = ['fiesta', 'dj', 'club', 'promotor'];

/** Enlace público de un panel. Para perfiles se usa el nombre de usuario (más bonito). */
export function buildShareUrl(kind, value) {
  const url = new URL(window.location.origin + '/');
  url.searchParams.set(kind, String(value));
  return url.toString();
}

/**
 * Comparte o copia el enlace.
 * @returns {'shared'|'copied'|'cancelled'|'failed'}
 */
export async function shareLink({ title, text, url }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      // Si falla el menú del sistema, se copia el enlace
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    // Navegadores antiguos o sin permiso de portapapeles
    try {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok ? 'copied' : 'failed';
    } catch {
      return 'failed';
    }
  }
}

/** Lee de la URL actual qué panel hay que abrir: { kind, value } o null. */
export function readSharedTarget() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  for (const kind of SHARE_KINDS) {
    const value = params.get(kind);
    if (value) return { kind, value };
  }
  return null;
}

/** Quita el parámetro del enlace de la barra de direcciones (sin recargar). */
export function clearSharedParam() {
  const url = new URL(window.location.href);
  SHARE_KINDS.forEach((k) => url.searchParams.delete(k));
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}

const sameName = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
const findProfile = (list, value) =>
  (list || []).find((p) => sameName(p.username, value)) ||
  (list || []).find((p) => String(p.id) === String(value)) ||
  null;

/**
 * Intenta abrir el panel del enlace con los datos ya cargados.
 * @returns {boolean} true si lo ha abierto
 */
export function openSharedTarget(target, state) {
  if (!target) return false;
  const { kind, value } = target;
  if (kind === 'fiesta') {
    const ev = (state.events || []).find((e) => String(e.id) === String(value));
    if (!ev) return false;
    state.selectEvent(ev);
    return true;
  }
  if (kind === 'dj') {
    const dj = findProfile(state.djs, value);
    if (!dj) return false;
    state.selectDj(dj);
    return true;
  }
  if (kind === 'club') {
    const club = findProfile(state.clubs, value);
    if (!club) return false;
    state.selectClub(club);
    return true;
  }
  if (kind === 'promotor') {
    const prom = findProfile(state.promoters, value);
    if (!prom) return false;
    state.selectPromoter(prom);
    return true;
  }
  return false;
}