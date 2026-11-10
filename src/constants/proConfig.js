// src/constants/proConfig.js
// ============================================================================
// RAVEXRADAR PRO · 4,99 €/mes (IVA incluido)
//
// Todo lo que aparece en la lista de ventajas está aplicado en el código:
//   · Límites de cantidad  → checkUserActionLimit()  (store + componentes)
//   · Límites de tamaño    → checkFileSizeLimit()    (todas las subidas)
//   · Pin destacado        → mapMarkerEngine.js      (corona + prioridad al agrupar)
//   · Marco animado (DJ)   → lib/avatarFrames.js     (mapa, panel y Editar perfil)
//   · Insignia PRO         → ArtistDrawer / ClubDrawer / PromoterDrawer
// Si añades una ventaja nueva, añádela aquí Y aplícala; si no, no la anuncies.
// ============================================================================

// Interruptor general del sistema PRO
export const PRO_FEATURES_ENABLED = true;

export const PRO_PRICE_LABEL = '4,99 €/mes';
export const PRO_PRICE_NOTE = 'IVA incluido · Cancela cuando quieras';

// El cobro va por Stripe Checkout (Edge Function create-checkout-session) y
// quien activa/desactiva PRO es el webhook de Stripe (Edge Function stripe-webhook).
// Margen tras la fecha de fin de periodo por si un webhook llega tarde.
const PRO_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

export const PLAN_LIMITS = {
  FREE: {
    maxActiveEvents: 5,        // Club / Promotor: fiestas activas publicadas
    maxStagesPerEvent: 2,      // Club / Promotor: escenarios por fiesta
    maxDjMediaItems: 4,        // DJ: sesiones + canciones + fotos en su galería
    maxGalleryPhotos: 4,       // Club / Promotor: fotos de la galería
    maxPrivateGroups: 2,       // Todos: grupos de chat privados creados
    maxSecondarySubgenres: 2   // DJ / Club / Promotor: subgéneros extra en el perfil
  },
  PRO: {
    maxActiveEvents: 30,
    maxStagesPerEvent: 10,
    maxDjMediaItems: 30,
    maxGalleryPhotos: 30,
    maxPrivateGroups: 20,
    maxSecondarySubgenres: 5
  }
};

// Tamaño máximo por archivo (MB). Lo que más cuesta en Supabase es SERVIR
// archivos (egress), por eso los vídeos tienen tope también en PRO.
export const FILE_SIZE_LIMITS_MB = {
  FREE: { image: 5, audio: 15, video: 30 },
  PRO: { image: 10, audio: 40, video: 100 }
};

// PRO = is_pro activo y, si tiene fecha de fin (suscripción de Stripe), no caducada.
// Un PRO dado a mano desde /admin no tiene fecha y no caduca.
export const isProUser = (user) => {
  if (!user?.is_pro) return false;
  if (!user.pro_until) return true;
  return new Date(user.pro_until).getTime() + PRO_GRACE_MS > Date.now();
};

export function getPlanLimits(user) {
  return PRO_FEATURES_ENABLED && isProUser(user) ? PLAN_LIMITS.PRO : PLAN_LIMITS.FREE;
}

export function getLimitValue(user, limitKey) {
  return getPlanLimits(user)[limitKey] ?? Infinity;
}

// Comprueba si un usuario puede realizar una acción de cantidad
export function checkUserActionLimit(user, limitKey, currentCount) {
  const isPro = PRO_FEATURES_ENABLED && isProUser(user);
  const maxAllowed = getLimitValue(user, limitKey);

  if (currentCount >= maxAllowed) {
    return {
      allowed: false,
      requiresPro: PRO_FEATURES_ENABLED && !isPro,
      message: isPro || !PRO_FEATURES_ENABLED
        ? `Has alcanzado el límite máximo permitido (${maxAllowed}).`
        : `Has alcanzado el límite de la cuenta gratuita (${maxAllowed}). Con PRO llegas a ${PLAN_LIMITS.PRO[limitKey]}.`
    };
  }
  return { allowed: true, requiresPro: false };
}

// Tipo de archivo a partir del File o del tipo de media de la app
export function fileKindOf(file, hint) {
  if (hint === 'video' || hint === 'audio' || hint === 'image') return hint;
  if (hint === 'track') return 'audio';
  if (hint === 'photo') return 'image';
  const mime = file?.type || '';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'image';
}

// Comprueba el tamaño de un archivo antes de subirlo
export function checkFileSizeLimit(user, file, hint) {
  if (!file) return { allowed: true, requiresPro: false };
  const kind = fileKindOf(file, hint);
  const isPro = PRO_FEATURES_ENABLED && isProUser(user);
  const maxMb = (isPro ? FILE_SIZE_LIMITS_MB.PRO : FILE_SIZE_LIMITS_MB.FREE)[kind];
  const sizeMb = file.size / (1024 * 1024);
  if (sizeMb <= maxMb) return { allowed: true, requiresPro: false };

  const kindLabel = { image: 'La imagen', audio: 'El audio', video: 'El vídeo' }[kind];
  const proMax = FILE_SIZE_LIMITS_MB.PRO[kind];
  const canUpgrade = PRO_FEATURES_ENABLED && !isPro && sizeMb <= proMax;
  return {
    allowed: false,
    requiresPro: canUpgrade,
    message: canUpgrade
      ? `${kindLabel} pesa ${sizeMb.toFixed(1)} MB y el máximo gratuito es ${maxMb} MB. Con PRO puedes subir hasta ${proMax} MB.`
      : `${kindLabel} pesa ${sizeMb.toFixed(1)} MB y el máximo es ${maxMb} MB. Comprímelo y vuelve a intentarlo.`
  };
}

// ---------------------------------------------------------------------------
// Lista de ventajas por tipo de usuario (lo que ve cada uno en el modal PRO).
// Cada fila: qué es, valor gratis → valor PRO. Todo está aplicado en el código.
// ---------------------------------------------------------------------------
const F = PLAN_LIMITS.FREE;
const P = PLAN_LIMITS.PRO;
const MB_F = FILE_SIZE_LIMITS_MB.FREE;
const MB_P = FILE_SIZE_LIMITS_MB.PRO;

const ROW_GROUPS = { label: 'Grupos de chat privados', free: `${F.maxPrivateGroups}`, pro: `${P.maxPrivateGroups}` };
const ROW_SUBGENRES = { label: 'Subgéneros en tu perfil', free: `${F.maxSecondarySubgenres}`, pro: `${P.maxSecondarySubgenres}` };
const ROW_BADGE = { label: 'Insignia PRO en tu panel', free: '—', pro: '✓' };

export const PRO_BENEFITS_BY_ROLE = {
  DJ: {
    headline: 'Haz que te encuentren los que contratan',
    rows: [
            { label: 'Marco animado para tu foto: rayos, neón, glitch, LED… (18 diseños con colores, en el mapa y en tu panel)', free: '—', pro: '✓' },
      { label: 'Pin destacado en el mapa (por encima de los pins de al lado)', free: '—', pro: '✓' },
      ROW_BADGE,
      { label: 'Sesiones, canciones y fotos en tu galería', free: `${F.maxDjMediaItems}`, pro: `${P.maxDjMediaItems}` },
      { label: 'Tamaño máx. por vídeo / audio', free: `${MB_F.video} / ${MB_F.audio} MB`, pro: `${MB_P.video} / ${MB_P.audio} MB` },
      ROW_SUBGENRES,
      ROW_GROUPS
    ]
  },
  Club: {
    headline: 'Llena la sala desde el mapa',
    rows: [
      { label: 'Fiestas activas publicadas', free: `${F.maxActiveEvents}`, pro: `${P.maxActiveEvents}` },
      { label: 'Escenarios por fiesta', free: `${F.maxStagesPerEvent}`, pro: `${P.maxStagesPerEvent}` },
            { label: 'Tu sala destacada en el mapa (por encima de los pins de al lado)', free: '—', pro: '✓' },
      ROW_BADGE,
      { label: 'Fotos en la galería de la sala', free: `${F.maxGalleryPhotos}`, pro: `${P.maxGalleryPhotos}` },
      { label: 'Tamaño máx. por vídeo / flyer', free: `${MB_F.video} / ${MB_F.image} MB`, pro: `${MB_P.video} / ${MB_P.image} MB` },
      ROW_SUBGENRES,
      ROW_GROUPS
    ]
  },
  Promotor: {
    headline: 'Más fiestas, más alcance',
    rows: [
      { label: 'Fiestas activas publicadas', free: `${F.maxActiveEvents}`, pro: `${P.maxActiveEvents}` },
      { label: 'Escenarios por fiesta', free: `${F.maxStagesPerEvent}`, pro: `${P.maxStagesPerEvent}` },
      { label: 'Tu colectivo destacado en el mapa (por encima de los pins de al lado)', free: '—', pro: '✓' },
      { label: 'Tus fiestas salen de portada al agruparse en el mapa', free: '—', pro: '✓' },
      ROW_BADGE,
      { label: 'Fotos en tu galería', free: `${F.maxGalleryPhotos}`, pro: `${P.maxGalleryPhotos}` },
      { label: 'Tamaño máx. por vídeo / flyer', free: `${MB_F.video} / ${MB_F.image} MB`, pro: `${MB_P.video} / ${MB_P.image} MB` },
      ROW_SUBGENRES,
      ROW_GROUPS
    ]
  },
  Raver: {
    headline: 'Organiza a tu crew',
    rows: [
      ROW_GROUPS,
      { label: 'Tamaño máx. de tu foto de perfil', free: `${MB_F.image} MB`, pro: `${MB_P.image} MB` }
    ]
  }
};

export function getProBenefitsForUser(user) {
  const role = user?.is_admin || user?.role === 'Admin' ? 'Club' : user?.role;
  return PRO_BENEFITS_BY_ROLE[role] || PRO_BENEFITS_BY_ROLE.Raver;
}
