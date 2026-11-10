// src/lib/mediaSync.js
// Coordinación de vídeos/audios entre los paneles y el visor ampliado (lightbox):
// - Al ampliar un vídeo se para todo lo que suena en los paneles (vídeos, canciones,
//   música del DJ/club/promotor y audio del evento).
// - El vídeo ampliado empieza en el segundo exacto por el que iba el del panel.
// - Al cerrar el visor, el vídeo del panel se queda en el segundo por el que iba el ampliado.

export const MEDIA_TAKEOVER_EVENT = 'raveradar:media-takeover';

const isInsideLightbox = (el) => Boolean(el.closest && el.closest('.lightbox-overlay'));

// Vídeos de fondo decorativos (mudos + autoplay + loop, p. ej. la cabecera del evento): no se tocan
const isDecorative = (el) => el.muted && el.loop && el.autoplay;

const sameSrc = (el, url) =>
  Boolean(url) && (el.getAttribute('src') === url || el.currentSrc === url || el.src === url);

/** Avisa a los paneles para que paren su música/vídeos y pausa los <video>/<audio> visibles. */
export const announceMediaTakeover = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(MEDIA_TAKEOVER_EVENT));
  window.dispatchEvent(new CustomEvent('raveradar:mute-event-audio'));
  document.querySelectorAll('video, audio').forEach((el) => {
    if (isInsideLightbox(el) || isDecorative(el)) return;
    if (!el.paused) el.pause();
  });
};

/** Devuelve { url: segundo } de los vídeos de los paneles que ya se habían empezado a ver. */
export const captureInlineVideoTimes = () => {
  const times = {};
  if (typeof document === 'undefined') return times;
  document.querySelectorAll('video').forEach((el) => {
    if (isInsideLightbox(el) || isDecorative(el)) return;
    const url = el.getAttribute('src');
    if (url && el.currentTime > 0) times[url] = Math.max(times[url] || 0, el.currentTime);
  });
  return times;
};

/** Deja los vídeos del panel con ese mismo archivo en el segundo indicado (pausados). */
export const syncInlineVideoTime = (url, seconds) => {
  if (typeof document === 'undefined' || !url || !(seconds >= 0)) return;
  document.querySelectorAll('video').forEach((el) => {
    if (isInsideLightbox(el) || !sameSrc(el, url)) return;
    try {
      if (!el.paused) el.pause();
      el.currentTime = seconds;
    } catch {
      /* el vídeo aún no tiene metadatos: no pasa nada */
    }
  });
};

// ---------------------------------------------------------------------------
// Al abrir el Estudio o cualquier ventana (colaboraciones, perfil, ranking,
// soporte, chat, PRO, crear fiesta, gestionar fiestas…) se para la música de
// fondo de los paneles (fiesta, DJ, club, promotor) para que no se mezcle.
// No se tocan los paneles de fiesta/DJ/club/promotor entre sí: cada uno ya
// gestiona su propia música al abrirse.
// ---------------------------------------------------------------------------
const PANEL_OPEN = [
  (s) => s.isStudioOpen,
  (s) => s.isCollabOpen,
  (s) => s.isManageEventsOpen,
  (s) => s.isRankingOpen,
  (s) => s.isSupportOpen,
  (s) => s.isProModalOpen,
  (s) => s.isAddEventOpen,
  (s) => s.isProfileOpen,
  (s) => s.isSocialDockOpen,
  (s) => s.isAuthOpen,
  (s) => s.isOnboardingOpen,
  (s) => Boolean(s.inspectedUser),
  (s) => Boolean(s.attendeesModalFilter)
];

let guardInstalled = false;

export function installPanelAudioGuard(store) {
  if (guardInstalled || typeof window === 'undefined') return;
  guardInstalled = true;
  let prev = PANEL_OPEN.map((f) => Boolean(f(store.getState())));
  store.subscribe(() => {
    const state = store.getState();
    const now = PANEL_OPEN.map((f) => Boolean(f(state)));
    const opened = now.some((v, i) => v && !prev[i]);
    prev = now;
    if (opened) announceMediaTakeover();
  });
}
