// src/mobileSheetGestures.js
// ============================================================================
// Gestos de "bottom sheet" para móvil (≤ 768px), sin tocar los componentes.
//
// Desde la zona del asa (la barrita gris de arriba) de cualquier panel:
//   · Arrastrar ARRIBA  → el panel pasa a pantalla completa.
//   · Arrastrar ABAJO   → si estaba a pantalla completa, vuelve a su tamaño;
//                         si no, se cierra (pulsando su propio botón de cerrar,
//                         así se ejecuta exactamente la misma lógica que la X).
//   · Un arrastre largo hacia abajo desde pantalla completa también cierra.
//
// Paneles soportados: drawers (Evento / DJ / Club / Promotor), todos los
// modales (.modal-card) y el chat social.
//
// Uso: en src/main.jsx →  import { initMobileSheetGestures } from './mobileSheetGestures'
//                          initMobileSheetGestures();
// ============================================================================

const MOBILE_QUERY = '(max-width: 768px)';
const HANDLE_ZONE_PX = 46;        // alto de la zona "agarrable" desde el borde superior
const AXIS_LOCK_PX = 8;           // movimiento mínimo para decidir vertical/horizontal
const EXPAND_THRESHOLD_PX = 70;   // cuánto subir para pasar a pantalla completa
const COLLAPSE_RATIO = 0.22;      // fracción del alto que hay que bajar para cerrar / reducir
const CLOSE_FROM_FULL_RATIO = 0.5;
const FLICK_VELOCITY = 0.55;      // px/ms: un gesto rápido cuenta aunque sea corto
const ANIM_MS = 260;

const SHEETS = [
  {
    // Drawers: se arrastra el contenedor en cascada; se cierra el drawer visible
    hit: '.event-drawer-shell, .artist-drawer-shell, .club-drawer-shell',
    container: (hitEl) => hitEl.closest('.drawers-cascade-dock'),
    closeButton: (hitEl) => hitEl.querySelector('.drawer-close'),
    heightProp: 'height'
  },
  {
    hit: '.social-dock-popup',
    container: (hitEl) => hitEl,
    closeButton: (hitEl) => hitEl.querySelector('.dock-close'),
    heightProp: 'height'
  },
  {
    hit: '.modal-card',
    container: (hitEl) => hitEl,
    // Solo la X propia del modal (no la de modales anidados)
    closeButton: (hitEl) =>
      Array.from(hitEl.querySelectorAll('.modal-close')).find((b) => b.closest('.modal-card') === hitEl) || null,
    heightProp: 'maxHeight'
  }
];

// Elementos que reciben el toque ellos mismos. Los <video> de fondo (sin controles,
// como el de la cabecera del evento) NO cuentan: desde ellos sí se puede arrastrar.
const INTERACTIVE =
  'button, a, input, textarea, select, label, [role="button"], video[controls], audio[controls], iframe';

let drag = null;

function findSheet(target) {
  for (const def of SHEETS) {
    const hitEl = target.closest?.(def.hit);
    if (hitEl) return { def, hitEl, el: def.container(hitEl) };
  }
  return null;
}

function isFull(el) {
  return el.dataset.mSheet === 'full';
}

// El contenedor de drawers no se desmonta nunca: cuando se queda vacío
// (todos los drawers cerrados, por gesto o por la X) vuelve a tamaño normal.
const watchedDocks = new WeakSet();
function watchDockEmpty(el) {
  if (!el.classList.contains('drawers-cascade-dock') || watchedDocks.has(el)) return;
  watchedDocks.add(el);
  new MutationObserver(() => {
    if (el.childElementCount === 0) setFull(el, false);
  }).observe(el, { childList: true });
}

function setFull(el, full) {
  if (full) {
    el.dataset.mSheet = 'full';
    watchDockEmpty(el);
  } else {
    delete el.dataset.mSheet;
  }
}

// Con !important: el CSS móvil usa max-height !important en los modales
const setStyle = (el, prop, value) => el.style.setProperty(prop, value, 'important');

function clearInline(el) {
  ['transition', 'transform', 'height', 'max-height'].forEach((p) => el.style.removeProperty(p));
}

function setHeight(el, def, px) {
  if (px == null) {
    el.style.removeProperty('height');
    el.style.removeProperty('max-height');
    return;
  }
  setStyle(el, 'height', `${px}px`);
  if (def.heightProp === 'maxHeight') setStyle(el, 'max-height', `${px}px`);
}

function animate(el, apply, done) {
  const ease = 'cubic-bezier(0.2, 0.9, 0.3, 1)';
  setStyle(el, 'transition', `transform ${ANIM_MS}ms ${ease}, height ${ANIM_MS}ms ${ease}, max-height ${ANIM_MS}ms ${ease}`);
  apply();
  window.setTimeout(() => done?.(), ANIM_MS);
}

function onTouchStart(e) {
  if (drag || e.touches.length !== 1) return;
  if (!window.matchMedia(MOBILE_QUERY).matches) return;

  const touch = e.touches[0];
  const target = e.target;
  if (target.closest?.(INTERACTIVE)) return;

  const sheet = findSheet(target);
  if (!sheet || !sheet.el) return;

  // Solo desde la franja superior del panel (donde está el asa)
  const rect = sheet.hitEl.getBoundingClientRect();
  if (touch.clientY - rect.top > HANDLE_ZONE_PX) return;

  drag = {
    ...sheet,
    startX: touch.clientX,
    startY: touch.clientY,
    startT: performance.now(),
    startH: sheet.el.getBoundingClientRect().height,
    wasFull: isFull(sheet.el),
    axis: null,
    dy: 0,
    lastY: touch.clientY,
    lastT: performance.now(),
    velocity: 0
  };
}

function onTouchMove(e) {
  if (!drag) return;
  const touch = e.touches[0];
  const dx = touch.clientX - drag.startX;
  const dy = touch.clientY - drag.startY;

  if (!drag.axis) {
    if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
    drag.axis = Math.abs(dy) > Math.abs(dx) ? 'y' : 'x';
    if (drag.axis === 'x') {
      drag = null; // gesto horizontal: lo gestiona el carrusel de drawers
      return;
    }
    setStyle(drag.el, 'transition', 'none');
  }

  e.preventDefault(); // estamos arrastrando el panel: que no haga scroll la página

  const now = performance.now();
  drag.velocity = (touch.clientY - drag.lastY) / Math.max(1, now - drag.lastT);
  drag.lastY = touch.clientY;
  drag.lastT = now;
  drag.dy = dy;

  const el = drag.el;
  if (dy < 0) {
    // Hacia arriba: el panel crece hasta el alto de la pantalla
    if (drag.wasFull) {
      setStyle(el, 'transform', `translateY(${dy * 0.15}px)`); // pequeño rebote
    } else {
      el.style.removeProperty('transform');
      setHeight(el, drag.def, Math.min(window.innerHeight, drag.startH - dy));
    }
  } else {
    // Hacia abajo: el panel baja con el dedo
    setHeight(el, drag.def, null);
    setStyle(el, 'transform', `translateY(${dy}px)`);
  }
}

function onTouchEnd() {
  if (!drag) return;
  const { el, def, hitEl, dy, velocity, wasFull, startH, axis } = drag;
  drag = null;
  if (axis !== 'y') return;

  const flickUp = velocity < -FLICK_VELOCITY;
  const flickDown = velocity > FLICK_VELOCITY;

  // ↑ Expandir a pantalla completa
  if (dy < 0) {
    if (!wasFull && (-dy > EXPAND_THRESHOLD_PX || flickUp)) {
      animate(
        el,
        () => {
          el.style.removeProperty('transform');
          setHeight(el, def, window.innerHeight);
        },
        () => {
          setFull(el, true); // el CSS [data-m-sheet="full"] toma el relevo (100dvh)
          clearInline(el);
        }
      );
    } else {
      animate(el, () => {
        el.style.removeProperty('transform');
        setHeight(el, def, startH);
      }, () => clearInline(el));
    }
    return;
  }

  // ↓ Reducir o cerrar
  const closeBtn = def.closeButton(hitEl);
  const farEnough = dy > startH * (wasFull ? CLOSE_FROM_FULL_RATIO : COLLAPSE_RATIO);
  const shouldClose = closeBtn && (wasFull ? dy > startH * CLOSE_FROM_FULL_RATIO : farEnough || flickDown);
  const shouldShrink = wasFull && !shouldClose && (farEnough || flickDown || dy > startH * COLLAPSE_RATIO);

  if (shouldClose) {
    animate(el, () => setStyle(el, 'transform', `translateY(${startH}px)`), () => {
      closeBtn.click();
      // El drawer-dock no se desmonta: lo dejamos limpio para el próximo panel
      setFull(el, false);
      clearInline(el);
    });
    return;
  }

  if (shouldShrink) {
    // Quitamos el estado full y animamos desde la posición actual a su tamaño normal
    setFull(el, false);
    animate(el, () => el.style.removeProperty('transform'), () => clearInline(el));
    return;
  }

  // Volver a donde estaba
  animate(el, () => el.style.removeProperty('transform'), () => clearInline(el));
}

let initialized = false;

export function initMobileSheetGestures() {
  if (initialized || typeof document === 'undefined') return;
  initialized = true;
  document.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchmove', onTouchMove, { passive: false });
  document.addEventListener('touchend', onTouchEnd, { passive: true });
  document.addEventListener('touchcancel', onTouchEnd, { passive: true });
}