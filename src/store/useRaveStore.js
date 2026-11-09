// src/store/useRaveStore.js
import { create } from 'zustand';
import { supabase } from '../lib/supabaseClient';
import { captureInlineVideoTimes } from '../lib/mediaSync';
import { canUseFrame } from '../lib/avatarFrames';
import { sanitizeOwnEvents } from '../lib/djOwnEvents';
import { SPAIN_LOCATIONS } from '../constants/spainLocations';
import { checkUserActionLimit, checkFileSizeLimit, getLimitValue, isProUser } from '../constants/proConfig';

let activeRealtimeChannel = null;
let notificationsChannel = null;

export const MAX_EVENTS_PER_USER = 5;

function detectBrowserLanguage() {
  if (typeof navigator !== 'undefined') {
    const rawLang = (navigator.language || navigator.userLanguage || '').toLowerCase();
    if (rawLang.startsWith('es')) return 'es';
  }
  return 'en';
}

export function evaluateEventTiming(startDate, startTime = '23:00', durationHours = 12) {
  if (!startDate) return { status: 'UPCOMING', startMs: Date.now() + 86400000 };
  const normalizedTime = (startTime || '23:00').slice(0, 5);
  const startMs = new Date(`${startDate}T${normalizedTime}:00`).getTime();
  const durationMs = (Number(durationHours) || 12) * 60 * 60 * 1000;
  const endMs = startMs + durationMs;
  const nowMs = Date.now();

  if (nowMs >= startMs && nowMs < endMs) return { status: 'ACTIVE', startMs, endMs };
  if (startMs > nowMs) return { status: 'UPCOMING', startMs, endMs };
  return { status: 'FINISHED', startMs, endMs };
}

export function generateOffsetSecretCoords(lat, lng) {
  const angle = Math.random() * Math.PI * 2;
  const distanceDeg = 0.0065 + Math.random() * 0.0035;
  return {
    lat: Number((lat + Math.cos(angle) * distanceDeg).toFixed(5)),
    lng: Number((lng + Math.sin(angle) * distanceDeg).toFixed(5))
  };
}

// Devuelve true solo si el evento es Secret Location y el usuario NO va a ir, NO tiene invitación aceptada NI está en su Lineup
export function isEventLockedSecret(ev, myAttendingEventIds = [], explicitUser = null) {
  if (!ev?.is_secret_location) return false;

  const storeState = useRaveStore.getState?.() || {};
  const acceptedInviteIds = storeState.myAcceptedInviteEventIds || [];

  // 1. Desbloqueado si marcó "Voy a ir" / "Busco Rave Squad" O si ya fue aceptado en la lista de invitación
  const isAttendingOrAccepted =
    myAttendingEventIds.includes(ev.id) ||
    acceptedInviteIds.includes(ev.id) ||
    (Array.isArray(ev.all_event_ids) &&
      ev.all_event_ids.some((id) => myAttendingEventIds.includes(id) || acceptedInviteIds.includes(id)));
  if (isAttendingOrAccepted) return false;

  // 2. Desbloqueado si el usuario logueado está en el Lineup de este evento (o es quien lo creó/anfitrión)
  const currentUser = explicitUser || storeState.user;
  if (currentUser) {
    if (ev.created_by && String(ev.created_by) === String(currentUser.id)) return false;
    if (ev.venue_id && String(ev.venue_id) === String(currentUser.id)) return false;

    const lineupArr = Array.isArray(ev.lineup) ? ev.lineup : [];
    const isInLineup = lineupArr.some(
      (slot) =>
        (slot.dj_id && String(slot.dj_id) === String(currentUser.id)) ||
        (slot.name &&
          currentUser.username &&
          slot.name.replace('@', '').trim().toLowerCase() ===
            currentUser.username.replace('@', '').trim().toLowerCase())
    );
    if (isInLineup) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// FILTRADO OPTIMIZADO
// Antes: por cada club/promotor se recorrían TODOS los eventos (O(eventos × clubs))
// y por cada evento se buscaba su club con .find (O(eventos × clubs) otra vez).
// Ahora: índices en Map → una sola pasada por eventos. Mismo resultado exacto.
// ---------------------------------------------------------------------------
const SEARCH_DEBOUNCE_MS = 160;

// ---------------------------------------------------------------------------
// ACCESO SIN CUENTA
// Sin sesión se puede: navegar el mapa, filtrar/buscar y abrir el panel básico
// de cualquier evento, DJ, club o promotor.
// Requiere sesión: "ver más" (descripción/bio completa, chat del evento, media,
// info ampliada, galería, asistentes), el ranking y cualquier acción.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// LÍMITES PRO: si se supera un límite, se abre el modal PRO (si mejorar ayuda)
// y se lanza un error con el mensaje, que el formulario muestra al usuario.
// ---------------------------------------------------------------------------
function assertActionAllowed(get, user, limitKey, currentCount) {
  const r = checkUserActionLimit(user, limitKey, currentCount);
  if (r.allowed) return;
  if (r.requiresPro) get().triggerProLimit(r.message);
  throw new Error(r.message);
}

// Bucket de media según el plan. El servidor limita el tamaño por bucket:
// event-media → 30 MB (gratis) · event-media-pro → 100 MB y solo PRO (SQL 03)
const mediaBucketFor = (user) => (isProUser(user) ? 'event-media-pro' : 'event-media');

function assertFileAllowed(get, user, file, hint) {
  const r = checkFileSizeLimit(user, file, hint);
  if (r.allowed) return;
  if (r.requiresPro) get().triggerProLimit(r.message);
  throw new Error(r.message);
}

const LOGIN_REQUIRED_MODALS = new Set([
  'isRankingOpen',
  'isProfileOpen',
  'isAddEventOpen',
  'isCollabOpen',
  'isManageEventsOpen',
  'isSupportOpen',
  'isSocialDockOpen',
  'isStudioOpen'
]);
let searchDebounceTimer = null;

// Carga no bloqueante de paneles: cada selección incrementa su contador y las
// respuestas que lleguen tarde (porque el usuario ya pulsó otra cosa o cerró) se descartan.
let djSelectSeq = 0;
let eventSelectSeq = 0;

function computeFilteredState(state, nextGenre, nextTime, nextQuery) {
  const {
    events, allAttendancesList, djs, clubs, promoters, myAttendingEventIds,
    selectedClub, selectedPromoter
  } = state;
  const clubsList = clubs || [];
  const promotersList = promoters || [];
  const todayStr = new Date().toISOString().split('T')[0];
  const todayMs = new Date(todayStr + 'T00:00:00').getTime();
  const genreLc = nextGenre.toLowerCase();
  const queryLc = nextQuery.toLowerCase();
  const hasQuery = Boolean(nextQuery.trim());

  // Asistentes por evento
  const attCountByEventId = {};
  (allAttendancesList || []).forEach((row) => {
    if (row.is_going ?? row.status === 'going' ?? true) {
      attCountByEventId[row.event_id] = (attCountByEventId[row.event_id] || 0) + 1;
    }
  });

  // Índices de clubs: id → club y username normalizado → club (el primero, como .find)
  const clubById = new Map();
  const clubByUsername = new Map();
  const clubIdsByUsername = new Map();
  clubsList.forEach((c) => {
    const idKey = String(c.id);
    if (!clubById.has(idKey)) clubById.set(idKey, c);
    const u = c.username?.trim().toLowerCase();
    if (u !== undefined) {
      if (!clubByUsername.has(u)) clubByUsername.set(u, c);
      if (!clubIdsByUsername.has(u)) clubIdsByUsername.set(u, []);
      clubIdsByUsername.get(u).push(idKey);
    }
  });

  // Agrupar eventos futuros por nombre
  const allFutureGrouped = new Map();
  events.forEach((ev) => {
    const timing = evaluateEventTiming(ev.start_date, ev.start_time, ev.duration_hours);
    if (timing.status === 'FINISHED') return;

    const normalizedNameKey = ev.name.trim().toLowerCase();
    const evAttCount = attCountByEventId[ev.id] || 0;
    const existing = allFutureGrouped.get(normalizedNameKey);

    if (!existing) {
      const matchedClub =
        (ev.venue_id && clubById.get(String(ev.venue_id))) ||
        (ev.venue_name && clubByUsername.get(ev.venue_name.replace('@', '').trim().toLowerCase()));

      allFutureGrouped.set(normalizedNameKey, {
        ...ev,
        city: ev.city || matchedClub?.city || ev.venue_profile?.city || 'Madrid',
        linked_club_id: matchedClub ? matchedClub.id : ev.venue_id || null,
        all_dates: ev.start_date ? [ev.start_date] : [],
        all_event_ids: [ev.id],
        is_active_now: timing.status === 'ACTIVE',
        startMs: timing.startMs,
        attendees_count: evAttCount
      });
    } else {
      if (!existing.all_event_ids.includes(ev.id)) {
        existing.all_event_ids.push(ev.id);
        existing.attendees_count += evAttCount;
      }
      if (ev.start_date && !existing.all_dates.includes(ev.start_date)) {
        existing.all_dates.push(ev.start_date);
        existing.all_dates.sort();
      }
      if (timing.status === 'ACTIVE') existing.is_active_now = true;
      if (timing.startMs < existing.startMs) existing.startMs = timing.startMs;
      if (existing.all_dates.length > 0) existing.start_date = existing.all_dates[0];
    }
  });

  const allFutureArray = Array.from(allFutureGrouped.values());

  const sortedByAttendance = [...allFutureArray].sort((a, b) => {
    if (b.attendees_count !== a.attendees_count) return b.attendees_count - a.attendees_count;
    return a.startMs - b.startMs;
  });

  const cityCounters = {};
  const rankMapByName = {};
  sortedByAttendance.forEach((ev, idx) => {
    const cityKey = ev.city || 'Madrid';
    cityCounters[cityKey] = (cityCounters[cityKey] || 0) + 1;
    const globalRank = idx + 1;
    rankMapByName[ev.name.trim().toLowerCase()] = {
      global_rank: globalRank,
      trending_rank: globalRank <= 5 ? globalRank : null,
      city_rank: cityCounters[cityKey]
    };
  });

  const top5Trending = sortedByAttendance.slice(0, 5).map((ev, idx) => ({
    ...ev,
    ...rankMapByName[ev.name.trim().toLowerCase()],
    trending_rank: idx + 1
  }));

  const filteredList = allFutureArray
    .map((ev) => ({
      ...ev,
      ...(rankMapByName[ev.name.trim().toLowerCase()] || {})
    }))
    .filter((ev) => {
      const matchesGenre =
        nextGenre === 'ALL' || (ev.subgenre && ev.subgenre.toLowerCase().includes(genreLc));
      const matchesQuery =
        ev.name.toLowerCase().includes(queryLc) ||
        (ev.city && ev.city.toLowerCase().includes(queryLc)) ||
        (ev.venue_name && ev.venue_name.toLowerCase().includes(queryLc));

      let matchesTime = true;
      if (nextTime === 'ACTIVE_NOW') {
        matchesTime = ev.is_active_now;
      } else if (nextTime !== 'ALL' && ev.start_date) {
        const evDate = new Date(ev.start_date + 'T00:00:00');
        const diffDays = (evDate.getTime() - todayMs) / (1000 * 60 * 60 * 24);
        const dayOfWeek = evDate.getDay();
        if (nextTime === 'TODAY') matchesTime = ev.start_date === todayStr || ev.is_active_now;
        else if (nextTime === 'WEEKEND') matchesTime = diffDays >= 0 && diffDays <= 7 && (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0);
        else if (nextTime === 'MONTH') matchesTime = diffDays >= 0 && diffDays <= 30;
      }
      return matchesGenre && matchesQuery && matchesTime;
    });

  // Secret location bloqueada: se calcula UNA vez por evento (antes, una vez por evento y por club)
  const lockedById = new Map();
  const isLocked = (ev) => {
    let v = lockedById.get(ev.id);
    if (v === undefined) {
      v = isEventLockedSecret(ev, myAttendingEventIds);
      lockedById.set(ev.id, v);
    }
    return v;
  };

  const nextFilteredDjs = djs.filter((dj) => {
    const allDjGenres = [
      dj.favorite_subgenre,
      ...(Array.isArray(dj.secondary_subgenres) ? dj.secondary_subgenres : [])
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const matchesGenre = nextGenre === 'ALL' || allDjGenres.includes(genreLc);
    const matchesQuery =
      !hasQuery ||
      dj.username?.toLowerCase().includes(queryLc) ||
      dj.city?.toLowerCase().includes(queryLc);
    return matchesGenre && matchesQuery;
  });

  // ---- Clubs: a qué clubs pertenece cada evento (una pasada) ----
  const clubIdsOfEvent = (ev) => {
    const ids = new Set();
    if (ev.linked_club_id) ids.add(String(ev.linked_club_id));
    if (ev.venue_id) ids.add(String(ev.venue_id));
    if (ev.venue_name) {
      const byName = clubIdsByUsername.get(ev.venue_name.replace('@', '').trim().toLowerCase());
      if (byName) byName.forEach((id) => ids.add(id));
    }
    return ids;
  };

  const hostedByClub = new Map();
  filteredList.forEach((ev) => {
    if (isLocked(ev)) return;
    clubIdsOfEvent(ev).forEach((id) => {
      if (!clubById.has(id)) return;
      if (!hostedByClub.has(id)) hostedByClub.set(id, []);
      hostedByClub.get(id).push(ev);
    });
  });

  const attendeesSumByClub = new Map();
  allFutureArray.forEach((ev) => {
    if (isLocked(ev)) return;
    clubIdsOfEvent(ev).forEach((id) => {
      if (!clubById.has(id)) return;
      attendeesSumByClub.set(id, (attendeesSumByClub.get(id) || 0) + (ev.attendees_count || 0));
    });
  });

  const nextFilteredClubs = clubsList
    .map((club) => {
      const idKey = String(club.id);
      const visibleHostedEvents = (hostedByClub.get(idKey) || []).slice();
      return {
        ...club,
        hosted_events: visibleHostedEvents,
        events_count: visibleHostedEvents.length,
        total_attendees_count: attendeesSumByClub.get(idKey) || 0
      };
    })
    .filter((club) => {
      const allClubGenres = [
        club.favorite_subgenre,
        ...(Array.isArray(club.secondary_subgenres) ? club.secondary_subgenres : []),
        ...(club.hosted_events || []).map((e) => e.subgenre)
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesGenre = nextGenre === 'ALL' || allClubGenres.includes(genreLc);
      const matchesQuery =
        !hasQuery ||
        club.username?.toLowerCase().includes(queryLc) ||
        club.city?.toLowerCase().includes(queryLc) ||
        (club.hosted_events || []).some((e) => e.name.toLowerCase().includes(queryLc));
      return matchesGenre && matchesQuery;
    });

  // ---- Promotores: mismo enfoque con índices ----
  const promIdSet = new Set();
  const promIdsByUsernameLc = new Map(); // para promoters_list[].username
  const promIdsByUsernameTrim = new Map(); // para ev.promoter (texto libre)
  const pushIdx = (map, key, id) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(id);
  };
  promotersList.forEach((prom) => {
    const idKey = String(prom.id);
    promIdSet.add(idKey);
    const lc = prom.username?.toLowerCase();
    if (lc !== undefined) pushIdx(promIdsByUsernameLc, lc, idKey);
    const trimLc = prom.username?.trim().toLowerCase();
    if (trimLc !== undefined) pushIdx(promIdsByUsernameTrim, trimLc, idKey);
  });

  const promIdsOfEvent = (ev) => {
    const ids = new Set();
    if (ev.created_by) ids.add(String(ev.created_by));
    if (Array.isArray(ev.promoters_list)) {
      ev.promoters_list.forEach((p) => {
        if (!p) return;
        if (p.id) ids.add(String(p.id));
        if (p.username) {
          const byName = promIdsByUsernameLc.get(p.username.toLowerCase());
          if (byName) byName.forEach((id) => ids.add(id));
        }
      });
    }
    if (ev.promoter) {
      const byName = promIdsByUsernameTrim.get(ev.promoter.replace('@', '').trim().toLowerCase());
      if (byName) byName.forEach((id) => ids.add(id));
    }
    return ids;
  };

  const hostedByProm = new Map();
  filteredList.forEach((ev) => {
    if (isLocked(ev)) return;
    promIdsOfEvent(ev).forEach((id) => {
      if (!promIdSet.has(id)) return;
      if (!hostedByProm.has(id)) hostedByProm.set(id, []);
      hostedByProm.get(id).push(ev);
    });
  });

  const attendeesSumByProm = new Map();
  allFutureArray.forEach((ev) => {
    if (isLocked(ev)) return;
    promIdsOfEvent(ev).forEach((id) => {
      if (!promIdSet.has(id)) return;
      attendeesSumByProm.set(id, (attendeesSumByProm.get(id) || 0) + (ev.attendees_count || 0));
    });
  });

  const nextFilteredPromoters = promotersList
    .map((prom) => {
      const idKey = String(prom.id);
      const hostedEvents = (hostedByProm.get(idKey) || []).slice();
      return {
        ...prom,
        hosted_events: hostedEvents,
        events_count: hostedEvents.length,
        total_attendees_count: attendeesSumByProm.get(idKey) || 0
      };
    })
    .filter((prom) => {
      const allPromGenres = [
        prom.favorite_subgenre,
        ...(Array.isArray(prom.secondary_subgenres) ? prom.secondary_subgenres : []),
        ...(prom.hosted_events || []).map((e) => e.subgenre)
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesGenre = nextGenre === 'ALL' || allPromGenres.includes(genreLc);
      const matchesQuery =
        !hasQuery ||
        prom.username?.toLowerCase().includes(queryLc) ||
        prom.city?.toLowerCase().includes(queryLc);
      return matchesGenre && matchesQuery;
    });

  const syncedSelectedClubEvents = selectedClub
    ? nextFilteredClubs.find((c) => String(c.id) === String(selectedClub.id))?.hosted_events || []
    : [];

  const syncedSelectedPromoterEvents = selectedPromoter
    ? nextFilteredPromoters.find((p) => String(p.id) === String(selectedPromoter.id))?.hosted_events || []
    : [];

  return {
    activeSubgenre: nextGenre,
    activeTimeFilter: nextTime,
    searchQuery: nextQuery,
    filteredEvents: filteredList,
    topTrendingEvents: top5Trending,
    filteredDjs: nextFilteredDjs,
    filteredClubs: nextFilteredClubs,
    filteredPromoters: nextFilteredPromoters,
    selectedClubEvents: syncedSelectedClubEvents,
    selectedPromoterEvents: syncedSelectedPromoterEvents
  };
}

export const useRaveStore = create((set, get) => ({
  lang: detectBrowserLanguage(),
  setLang: (lang) => set({ lang }),

  // Fiestas activas (no terminadas) del usuario, sin depender de los filtros del mapa.
  // Una fiesta con varias fechas cuenta como una (igual que en el mapa).
  getMyActiveEventsCount: () => {
    const { user, events } = get();
    if (!user) return 0;
    const names = new Set();
    (events || []).forEach((ev) => {
      if (String(ev.created_by) !== String(user.id)) return;
      const timing = evaluateEventTiming(ev.start_date, ev.start_time, ev.duration_hours);
      if (timing.status !== 'FINISHED') names.add((ev.name || '').trim().toLowerCase());
    });
    return names.size;
  },

  // Devuelve true si hay sesión; si no, abre el login y devuelve false.
  // Uso en componentes:  onClick={() => requireAuth() && hacerAlgo()}
  requireAuth: () => {
    if (get().user) return true;
    set({ isAuthOpen: true });
    return false;
  },

  events: [],
  filteredEvents: [],
  topTrendingEvents: [],
  allAttendancesList: [],
  djs: [],
  filteredDjs: [],
  clubs: [],
  filteredClubs: [],
  promoters: [],
  filteredPromoters: [],
  myHypedDjIds: [],

  selectedEventGroup: [],
  currentGroupIndex: 0,
  selectedEvent: null,

  selectedDj: null,
  selectedDjEvents: [],
  isDjEventsLoading: false,
  isDjMediaExpanded: false,
  djLeftPanelMode: null, 
  incomingAccessRequests: [],
  isEventAudioPlaying: false,

  selectedClub: null,
  selectedClubEvents: [],
  isClubInfoExpanded: false,

  selectedPromoter: null,
  selectedPromoterEvents: [],
  isPromoterInfoExpanded: false,

  // Modal central de asistentes ("Voy a ir" / "Busco Rave Squad")
  attendeesModalFilter: null, // null | 'going' | 'squad'
  setAttendeesModalFilter: (filter) => {
    if (filter && !get().user) return set({ isAuthOpen: true });
    set({ attendeesModalFilter: filter });
  },

  // Visor Multimedia a Pantalla Completa (Lightbox)
  isLightboxOpen: false,
  lightboxMediaList: [],
  lightboxResumeTimes: {},
  lightboxIndex: 0,

  openMediaLightbox: (mediaArray = [], initialId = null) => {
    if (!get().user) return set({ isAuthOpen: true });
    const visualItems = (mediaArray || []).filter(
      (item) => item && item.url && item.type !== 'track'
    );
    if (visualItems.length === 0) return;
    const foundIdx = initialId ? visualItems.findIndex((m) => m.id === initialId) : 0;
    set({
      lightboxMediaList: visualItems,
      lightboxIndex: foundIdx >= 0 ? foundIdx : 0,
      // Segundo por el que iba cada vídeo del panel: el visor continúa desde ahí
      lightboxResumeTimes: captureInlineVideoTimes(),
      isLightboxOpen: true
    });
  },
  closeMediaLightbox: () =>
    set({ isLightboxOpen: false, lightboxMediaList: [], lightboxIndex: 0, lightboxResumeTimes: {} }),
  nextLightboxMedia: () =>
    set((s) => ({
      lightboxIndex: s.lightboxMediaList.length > 0 ? (s.lightboxIndex + 1) % s.lightboxMediaList.length : 0
    })),
  prevLightboxMedia: () =>
    set((s) => ({
      lightboxIndex:
        s.lightboxMediaList.length > 0
          ? (s.lightboxIndex - 1 + s.lightboxMediaList.length) % s.lightboxMediaList.length
          : 0
    })),

  // Capas del mapa activas por defecto
  mapLayers: {
    events: true,
    djs: true,
    clubs: true,
    promoters: true
  },
  toggleMapLayer: (layerKey) =>
    set((s) => ({
      mapLayers: {
        ...s.mapLayers,
        [layerKey]: !s.mapLayers[layerKey]
      }
    })),
  setMapLayerMode: (mode) => {
    if (mode === 'ALL') set({ mapLayers: { events: true, djs: true, clubs: true, promoters: true } });
    else if (mode === 'EVENTS') set({ mapLayers: { events: true, djs: false, clubs: false, promoters: false } });
    else if (mode === 'DJS') set({ mapLayers: { events: false, djs: true, clubs: false, promoters: false } });
  },

  isEventChatExpanded: false,
  attendees: [],
  isEventDetailsLoading: false,
  eventInvitations: [],
  myEventInvitations: [],
  myAcceptedInviteEventIds: [],

  activeSubgenre: 'ALL',
  activeTimeFilter: 'ALL',
  searchQuery: '',

  user: null,
  authEmail: '',
  inspectedUser: null,
  inspectedUserEvents: [],
  isAuthOpen: false,
  isOnboardingOpen: false,
  isProfileOpen: false,
  isProfileEditing: false,
  isAddEventOpen: false,
  isSocialDockOpen: false,
  isRankingOpen: false,
  isSupportOpen: false,
  isStudioOpen: false, // Estudio de contenido (plantillas) · de momento maqueta
  isProModalOpen: false,
  proModalReason: '',
  isCollabOpen: false,
  isManageEventsOpen: false,
  editingEvent: null,

  // Colaboraciones
  collabOffers: [],

  // Configuración Admin, Verificación de Roles y Analíticas
  autoApproveRoles: false,
  myRoleRequest: null,
  allRoleRequests: [],
  allProfilesAdmin: [],

  supportTickets: [],
  ghostClaims: [], // reclamaciones de perfiles fantasma (panel de admin)
  mySupportNotifications: [],

  chatRooms: [],
  activeRoom: null,
  roomMessages: [],
  unreadChatCount: 0,
  friends: [],
  groupInvitations: [], // invitaciones a grupos privados que me han enviado (pendientes)
  appNotifications: [], // avisos de la tabla notifications (fundador, avisos del admin…)
  profileEditTabRequest: null, // pestaña de Editar perfil que hay que abrir (p. ej. 'frame')
  adminBroadcasts: [], // historial de avisos enviados desde /admin
  sentGroupInvitations: [], // invitaciones que yo he enviado y aún no han contestado
  collabApplications: [],
  myAttendingEvents: [],
  myAttendingEventIds: [],
  mySquadEventIds: [], // fiestas en las que busco Rave Squad (pin verde con icono de grupo)

  isPickingLocation: false,
  pickingTarget: 'event',
  pickedCoords: { lat: 40.4168, lng: -3.7038 },
  pickedSecretCoords: { lat: 40.4235, lng: -3.6955 },
  pickedProfileCoords: null,
  focusMyPinTrigger: 0,

  focusMyPinOnMap: () => {
    const { user, djs, clubs, promoters, mapLayers } = get();
    if (!user || !user.lat || !user.lng) return;

    if (user.role === 'DJ') {
      if (!mapLayers.djs) set({ mapLayers: { ...mapLayers, djs: true } });
      const myDj = djs.find((d) => String(d.id) === String(user.id)) || user;
      get().selectDj(myDj);
    } else if (user.role === 'Club') {
      if (!mapLayers.clubs) set({ mapLayers: { ...mapLayers, clubs: true } });
      const myClub = clubs.find((c) => String(c.id) === String(user.id)) || user;
      get().selectClub(myClub);
    } else if (user.role === 'Promotor') {
      if (!mapLayers.promoters) set({ mapLayers: { ...mapLayers, promoters: true } });
      const myPromoter = promoters.find((p) => String(p.id) === String(user.id)) || user;
      get().selectPromoter(myPromoter);
    }

    set((s) => ({ focusMyPinTrigger: s.focusMyPinTrigger + 1 }));
  },

  // ---------------------------------------------------------------------------
  // PAGOS (Stripe vía Supabase Edge Functions)
  // ---------------------------------------------------------------------------
  billing: null, // { status, current_period_end, cancel_at_period_end } del usuario
  isRedirectingToPayment: false,

  // Mensaje de error legible desde una Edge Function
  _functionErrorMessage: async (error, fallback) => {
    try {
      const body = await error?.context?.json?.();
      if (body?.error) return body.error;
    } catch {
      /* respuesta sin JSON */
    }
    return fallback;
  },

  // "Hazte PRO" → página de pago de Stripe
  upgradeToPro: async () => {
    const { user } = get();
    if (!user) return set({ isAuthOpen: true });

    set({ isRedirectingToPayment: true });
    const { data, error } = await supabase.functions.invoke('create-checkout-session', { body: {} });
    if (error || !data?.url) {
      const message = await get()._functionErrorMessage(error, 'No se pudo iniciar el pago. Inténtalo de nuevo.');
      set({ isRedirectingToPayment: false, proModalReason: message, isProModalOpen: true });
      return;
    }
    window.location.href = data.url;
  },

  // "Gestionar suscripción" → portal de Stripe (cancelar, tarjeta, facturas)
  openBillingPortal: async () => {
    set({ isRedirectingToPayment: true });
    const { data, error } = await supabase.functions.invoke('create-portal-session', { body: {} });
    if (error || !data?.url) {
      const message = await get()._functionErrorMessage(error, 'No se pudo abrir la gestión de la suscripción.');
      set({ isRedirectingToPayment: false, proModalReason: message, isProModalOpen: true });
      return;
    }
    window.location.href = data.url;
  },

  // Recarga el perfil y los datos de suscripción del usuario
  refreshProStatus: async () => {
    const { user } = get();
    if (!user) return null;
    const [{ data: profile }, { data: billing }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase
        .from('billing')
        .select('status, current_period_end, cancel_at_period_end')
        .eq('user_id', user.id)
        .maybeSingle()
    ]);
    if (profile) set({ user: profile });
    set({ billing: billing || null });
    return profile;
  },

  // Al volver de Stripe (?pro=success|cancel|portal): esperar al webhook y avisar
  handleProCheckoutReturn: async () => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('pro');
    if (!result) return;

    params.delete('pro');
    const cleanUrl = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', cleanUrl);

    if (result === 'cancel') return;
    if (result === 'portal') {
      await get().refreshProStatus();
      return;
    }

    // success: el webhook de Stripe suele tardar 1-5 s en activar PRO
    set({ isProModalOpen: true, proModalReason: 'Confirmando tu pago…' });
    for (let attempt = 0; attempt < 15; attempt++) {
      const profile = await get().refreshProStatus();
      if (isProUser(profile)) {
        set({ proModalReason: '¡Pago confirmado! Ya eres PRO. 🎉' });
        return;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    set({
      proModalReason:
        'Tu pago se ha recibido pero la activación está tardando. Recarga la página en un minuto; si sigue sin activarse, escríbenos desde Soporte.'
    });
  },

  triggerProLimit: (reason) => {
    set({ proModalReason: reason, isProModalOpen: true });
  },

  setEventAudioPlaying: (isPlaying) => {
    set({ isEventAudioPlaying: isPlaying });
    if (isPlaying) {
      window.dispatchEvent(new CustomEvent('raveradar:mute-entity-audio'));
    }
  },

  markWelcomeNotifReadAndOpenProfile: async () => {
    const { user } = get();
    if (!user) return;

    set({
      user: { ...user, welcome_notif_read: true },
      isProfileOpen: true,
      isProfileEditing: true
    });

    await supabase
      .from('profiles')
      .update({ welcome_notif_read: true })
      .eq('id', user.id);
  },

  fetchAppSettings: async () => {
    const { data, error } = await supabase
      .from('app_settings')
      .select('*')
      .eq('id', 'global')
      .maybeSingle();

    if (!error && data) {
      set({ autoApproveRoles: Boolean(data.auto_approve_roles) });
    }
  },

  toggleAutoApproveRoles: async (nextVal) => {
    const prevVal = get().autoApproveRoles;
    set({ autoApproveRoles: nextVal });

    const { error } = await supabase
      .from('app_settings')
      .upsert(
        { id: 'global', auto_approve_roles: Boolean(nextVal), updated_at: new Date().toISOString() },
        { onConflict: 'id' }
      );

    if (error) {
      set({ autoApproveRoles: prevVal });
      alert('Error al guardar en base de datos (ejecuta el SQL de permisos de app_settings): ' + error.message);
    }
  },

  fetchAllProfilesForAdmin: async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: true });

    if (!error && data) {
      set({ allProfilesAdmin: data });
    }
  },

  toggleUserProStatusAdmin: async (targetUserId, nextProVal) => {
    // PRO dado a mano = sin fecha de fin (no caduca). Se borra la fecha de una
    // suscripción antigua de Stripe para que no cuente como caducado.
    const patch = nextProVal ? { is_pro: true, pro_until: null } : { is_pro: false };
    const { error, data } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', targetUserId)
      .select()
      .single();

    if (!error && data) {
      set({
        allProfilesAdmin: get().allProfilesAdmin.map((p) => (p.id === targetUserId ? data : p))
      });
    }
  },

  fetchMyRoleRequest: async () => {
    const { user } = get();
    if (!user) return;
    const { data } = await supabase
      .from('role_requests')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    set({ myRoleRequest: data || null });
  },

  submitRoleRequest: async ({ requestedRole, message, lat = null, lng = null }) => {
    const { user, authEmail } = get();
    if (!user) throw new Error('Debes iniciar sesión.');

    const payload = {
      user_id: user.id,
      username: user.username,
      user_email: authEmail || '',
      requested_role: requestedRole,
      message: (message || '').trim() || `Solicitud de verificación para perfil ${requestedRole}.`,
      requested_lat: lat ?? user.lat ?? 40.4168,
      requested_lng: lng ?? user.lng ?? -3.7038,
      status: 'pending',
      user_read_resolution: false
    };

    const { data: createdReq, error } = await supabase
      .from('role_requests')
      .insert([payload])
      .select()
      .single();

    if (error) throw new Error('No se pudo enviar la solicitud: ' + error.message);

    const { data: updatedProf } = await supabase
      .from('profiles')
      .update({ role: 'Raver', onboarding_completed: true })
      .eq('id', user.id)
      .select()
      .single();

    set({
      user: updatedProf || { ...user, role: 'Raver', onboarding_completed: true },
      myRoleRequest: createdReq,
      isOnboardingOpen: false
    });
  },

  dismissRoleRequestNotification: async (requestId) => {
    if (!requestId) return;
    await supabase
      .from('role_requests')
      .update({ user_read_resolution: true })
      .eq('id', requestId);

    set((s) => ({
      myRoleRequest:
        s.myRoleRequest?.id === requestId
          ? { ...s.myRoleRequest, user_read_resolution: true }
          : s.myRoleRequest
    }));
  },

  fetchAllRoleRequests: async () => {
    const { data, error } = await supabase
      .from('role_requests')
      .select('*, profile:profiles!user_id(id, username, role, avatar_url, city)')
      .order('created_at', { ascending: false });

    if (!error && data) {
      set({ allRoleRequests: data });
    }
  },

  resolveRoleRequest: async (reqItem, decision) => {
    const nowIso = new Date().toISOString();

    if (decision === 'approved') {
      const profileUpdates = {
        role: reqItem.requested_role,
        onboarding_completed: true
      };
      if (reqItem.requested_lat && reqItem.requested_lng) {
        profileUpdates.lat = reqItem.requested_lat;
        profileUpdates.lng = reqItem.requested_lng;
      }

      const { error: profErr } = await supabase
        .from('profiles')
        .update(profileUpdates)
        .eq('id', reqItem.user_id);

      if (profErr) throw new Error('Error al actualizar el rol del usuario: ' + profErr.message);
    }

    const { data, error } = await supabase
      .from('role_requests')
      .update({
        status: decision,
        user_read_resolution: false,
        resolved_at: nowIso
      })
      .eq('id', reqItem.id)
      .select('*, profile:profiles!user_id(id, username, role, avatar_url, city)')
      .single();

    if (error) throw new Error('Error al resolver solicitud: ' + error.message);

    set({
      allRoleRequests: get().allRoleRequests.map((r) => (r.id === reqItem.id ? data : r))
    });

    await Promise.all([get().fetchDjs(), get().fetchClubs()]);
  },

  // Funciones de Colaboraciones (Ofertas + Vínculos + Colaboración directa DJ a DJ)
  fetchCollabData: async () => {
    const { data, error } = await supabase
      .from('collab_offers')
      .select('*, creator:profiles!creator_id(id, username, avatar_url, role, city), links:collab_links(*, target:profiles!target_user_id(id, username, avatar_url, role, city))')
      .order('created_at', { ascending: false });

    if (!error && data) {
      set({ collabOffers: data });
    }
  },

  saveCollabOffer: async (offerData, imageFile = null) => {
    const { user } = get();
    if (!user) throw new Error('Debes iniciar sesión.');

    let finalImageUrl = offerData.image_url || null;
    if (imageFile) {
      const ext = imageFile.name.split('.').pop();
      const fileName = `collab_${user.id}_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('flyers').upload(fileName, imageFile, { upsert: true });
      if (upErr) throw new Error('Error al subir imagen: ' + upErr.message);
      finalImageUrl = supabase.storage.from('flyers').getPublicUrl(fileName).data.publicUrl;
    }

    const payload = {
      creator_id: user.id,
      title: offerData.title.trim(),
      description: offerData.description.trim(),
      target_roles: offerData.target_roles,
      details: offerData.details || {},
      image_url: finalImageUrl,
      status: 'active'
    };

    if (offerData.id) {
      const { error } = await supabase
        .from('collab_offers')
        .update(payload)
        .eq('id', offerData.id);
      if (error) throw new Error('Error al actualizar oferta: ' + error.message);
    } else {
      const { error } = await supabase
        .from('collab_offers')
        .insert([payload]);
      if (error) throw new Error('Error al crear oferta: ' + error.message);
    }

    await get().fetchCollabData();
  },

  toggleCollabOfferStatus: async (offer) => {
    const nextStatus = offer.status === 'active' ? 'closed' : 'active';
    await supabase
      .from('collab_offers')
      .update({ status: nextStatus })
      .eq('id', offer.id);
    await get().fetchCollabData();
  },

  initiateCollabRelation: async ({ offer, targetUser, direction, message }) => {
    const { user } = get();
    if (!user || !offer || !targetUser || !message.trim()) return null;

    const cleanMsg = message.trim();

    const roomName = `Colab: ${offer.title}`;
    const { data: createdRoom, error: roomErr } = await supabase
      .from('chat_rooms')
      .insert([{
        type: 'collab',
        name: roomName,
        created_by: user.id,
        collab_offer_id: offer.id
      }])
      .select()
      .single();

    if (roomErr) throw new Error('No se pudo crear el chat de colaboración: ' + roomErr.message);

    await supabase.from('chat_participants').insert([
      { room_id: createdRoom.id, user_id: offer.creator_id, role: 'admin' },
      { room_id: createdRoom.id, user_id: targetUser.id, role: 'member' }
    ]);

    const { error: linkErr } = await supabase.from('collab_links').insert([{
      offer_id: offer.id,
      creator_id: offer.creator_id,
      target_user_id: targetUser.id,
      direction,
      initial_message: cleanMsg,
      room_id: createdRoom.id
    }]);

    if (linkErr) throw new Error('Ya existe una solicitud para esta oferta.');

    await supabase.from('chat_messages').insert([{
      room_id: createdRoom.id,
      sender_id: user.id,
      sender_username: user.username,
      sender_avatar: user.avatar_url || null,
      content: `[Oferta: ${offer.title}] ${cleanMsg}`
    }]);

    await Promise.all([get().fetchCollabData(), get().fetchSocialData()]);
    return get().chatRooms.find((r) => String(r.id) === String(createdRoom.id)) || createdRoom;
  },

  initiateDjToDjCollab: async (targetDj, initialMessage) => {
    const { user, chatRooms } = get();
    if (!user || !targetDj || !initialMessage?.trim()) return null;

    const cleanMsg = initialMessage.trim();

    const existingCollabRoom = (chatRooms || []).find(
      (r) =>
        r.type === 'collab' &&
        !r.collab_offer_id &&
        (r.collabPartner?.id === targetDj.id ||
          r.participants?.some((p) => String(p.user_id) === String(targetDj.id)))
    );

    if (existingCollabRoom) {
      await get().selectChatRoom(existingCollabRoom);
      set({ inspectedUser: null, isSocialDockOpen: true });
      return existingCollabRoom;
    }

    const roomName = `Colab DJ: @${user.username} & @${targetDj.username}`;
    const { data: createdRoom, error: roomErr } = await supabase
      .from('chat_rooms')
      .insert([{
        type: 'collab',
        name: roomName,
        created_by: user.id
      }])
      .select()
      .single();

    if (roomErr) throw new Error('No se pudo iniciar el chat de colaboración: ' + roomErr.message);

    await supabase.from('chat_participants').insert([
      { room_id: createdRoom.id, user_id: user.id, role: 'admin' },
      { room_id: createdRoom.id, user_id: targetDj.id, role: 'member' }
    ]);

    await supabase.from('chat_messages').insert([{
      room_id: createdRoom.id,
      sender_id: user.id,
      sender_username: user.username,
      sender_avatar: user.avatar_url || null,
      content: `[Propuesta de Colaboración DJ] ${cleanMsg}`
    }]);

    await get().fetchSocialData();
    const enrichedRoom =
      get().chatRooms.find((r) => String(r.id) === String(createdRoom.id)) || {
        ...createdRoom,
        collabPartner: targetDj,
        collabOfferTitle: `Colaboración DJ con @${targetDj.username}`
      };

    await get().selectChatRoom(enrichedRoom);
    set({ inspectedUser: null, isSocialDockOpen: true });
    return enrichedRoom;
  },

  fetchMyEventInvitations: async () => {
    const { user } = get();
    if (!user) return;

    // 1. Invitaciones o solicitudes donde yo soy el usuario invitado/solicitante
    const { data, error } = await supabase
      .from('event_invitations')
      .select('*, event:events!event_id(*), inviter:profiles!invited_by(id, username, avatar_url, role)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    let validMyInvites = [];
    if (!error && data) {
      const orphanIds = data
        .filter((inv) => !inv.event || inv.event.lat == null || inv.event.lng == null)
        .map((inv) => inv.id);

      // PUNTO 5: Si el evento ya no existe en la base de datos, limpiar la invitación huérfana automáticamente
      if (orphanIds.length > 0) {
        await supabase.from('event_invitations').delete().in('id', orphanIds);
      }

      validMyInvites = data.filter(
        (inv) => inv.event && inv.event.lat != null && inv.event.lng != null
      );
    }

    const acceptedIds = validMyInvites
      .filter((inv) => inv.status === 'accepted')
      .map((inv) => inv.event_id);

    // 2. PUNTO 1: Solicitudes de permiso ('requested' + 'pending') enviadas por otros usuarios a mis fiestas
    const { data: myOwnedEvents } = await supabase
      .from('events')
      .select('id')
      .or(`created_by.eq.${user.id},venue_id.eq.${user.id}`);

    const myEventIds = (myOwnedEvents || []).map((e) => e.id);
    let incomingReqs = [];

    if (myEventIds.length > 0) {
      const { data: incData } = await supabase
        .from('event_invitations')
        .select('*, event:events!event_id(*), profile:profiles!user_id(id, username, avatar_url, role, city, favorite_subgenre)')
        .in('event_id', myEventIds)
        .eq('direction', 'requested')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      incomingReqs = (incData || []).filter(
        (req) => req.event && req.event.lat != null && req.event.lng != null
      );
    }

    set({
      myEventInvitations: validMyInvites,
      myAcceptedInviteEventIds: acceptedIds,
      incomingAccessRequests: incomingReqs
    });
    get().applyFilters({});
  },

  requestEventAccess: async (eventId) => {
    const { user, selectedEvent, eventInvitations } = get();
    if (!user) return set({ isAuthOpen: true });
    if (!eventId) return;

    const payload = {
      event_id: eventId,
      user_id: user.id,
      direction: 'requested',
      status: 'pending',
      user_read_notification: true
    };

    const { data, error } = await supabase
      .from('event_invitations')
      .upsert(payload, { onConflict: 'event_id,user_id' })
      .select('*, profile:profiles!user_id(id, username, avatar_url, role, city, favorite_subgenre)')
      .single();

    if (!error && data) {
      if (selectedEvent?.id === eventId) {
        set({
          eventInvitations: [
            data,
            ...eventInvitations.filter((i) => String(i.user_id) !== String(user.id))
          ]
        });
      }
      await get().fetchMyEventInvitations();
    }
  },

  respondToEventInvitation: async (invitationId, decision) => {
    const { user, selectedEvent } = get();
    if (!user || !invitationId) return;

    const { data: updatedInv, error } = await supabase
      .from('event_invitations')
      .update({
        status: decision,
        user_read_notification: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', invitationId)
      .select('*, event:events!event_id(*)')
      .single();

    if (error || !updatedInv) return;

    if (decision === 'accepted') {
      const attPayload = {
        event_id: updatedInv.event_id,
        user_id: user.id,
        status: 'going',
        is_going: true,
        looking_for_squad: false
      };
      await supabase.from('event_attendees').upsert(attPayload);
    }

    await Promise.all([
      get().fetchMyEventInvitations(),
      get().fetchSocialData(),
      get().fetchEvents()
    ]);

    if (selectedEvent && String(selectedEvent.id) === String(updatedInv.event_id)) {
      const freshEv = get().filteredEvents.find((e) => String(e.id) === String(updatedInv.event_id)) || selectedEvent;
      await get().selectEvent(freshEv);
    }
  },

  dismissEventInviteNotification: async (invitationId) => {
    if (!invitationId) return;
    await supabase
      .from('event_invitations')
      .update({ user_read_notification: true })
      .eq('id', invitationId);
    await get().fetchMyEventInvitations();
  },

  sendEventInvitationsToUsers: async (eventId, targetUsers = []) => {
    const { user } = get();
    if (!user || !eventId || !Array.isArray(targetUsers) || targetUsers.length === 0) return;

    const rows = targetUsers.map((u) => ({
      event_id: eventId,
      user_id: u.id,
      invited_by: user.id,
      direction: 'invited',
      status: 'pending',
      user_read_notification: false
    }));

    await supabase
      .from('event_invitations')
      .upsert(rows, { onConflict: 'event_id,user_id', ignoreDuplicates: true });

    if (get().selectedEvent?.id === eventId) {
      const { data: invitesData } = await supabase
        .from('event_invitations')
        .select('*, profile:profiles!user_id(id, username, avatar_url, role, city, favorite_subgenre)')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false });
      set({ eventInvitations: invitesData || [] });
    }
  },

  resolveEventAccessRequest: async (inviteRow, decision) => {
    if (!inviteRow?.id) return;

    const { data: updated, error } = await supabase
      .from('event_invitations')
      .update({
        status: decision,
        user_read_notification: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', inviteRow.id)
      .select('*, event:events!event_id(*), profile:profiles!user_id(id, username, avatar_url, role, city, favorite_subgenre)')
      .single();

    if (error) throw new Error('No se pudo actualizar la solicitud: ' + error.message);

    if (decision === 'accepted') {
      await supabase.from('event_attendees').upsert({
        event_id: inviteRow.event_id,
        user_id: inviteRow.user_id,
        status: 'going',
        is_going: true,
        looking_for_squad: false
      });
      await get().fetchEvents();
    }

    set((s) => ({
      incomingAccessRequests: s.incomingAccessRequests.filter((r) => r.id !== inviteRow.id),
      eventInvitations:
        s.selectedEvent?.id === inviteRow.event_id
          ? s.eventInvitations.map((i) => (i.id === inviteRow.id ? updated : i))
          : s.eventInvitations
    }));

    return updated;
  },

  initAuth: async () => {
    await get().fetchAppSettings();
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await get().ensureUserProfile(session.user);
      await get().refreshProStatus();
      await get().handleProCheckoutReturn();
    }

    supabase.auth.onAuthStateChange(async (eventName, session) => {
      if (eventName === 'TOKEN_REFRESHED' && get().user?.id === session?.user?.id) {
        return;
      }
      if (session?.user) {
        if (get().user?.id !== session.user.id) {
          await get().ensureUserProfile(session.user);
          await get().refreshProStatus();
        }
      } else if (eventName === 'SIGNED_OUT') {
        set({
          user: null,
          authEmail: '',
          isOnboardingOpen: false,
          selectedEvent: null,
          selectedEventGroup: [],
          selectedDj: null,
          selectedClub: null,
          selectedPromoter: null,
          friends: [],
          myHypedDjIds: [],
          chatRooms: [],
          myAttendingEvents: [],
          myAttendingEventIds: [],
          mySquadEventIds: [],
          myEventInvitations: [],
          myAcceptedInviteEventIds: [],
          mySupportNotifications: [],
          appNotifications: [],
          supportTickets: [],
          myRoleRequest: null,
          billing: null
        });
      }
    });
  },

  ensureUserProfile: async (authUser) => {
    const googleAvatar = authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture || null;
    const email = authUser.email || '';

    const { data: existing } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle();

    let currentUser = existing;
    let shouldShowOnboarding = false;

    if (!existing) {
      const defaultProfile = {
        id: authUser.id,
        username: (authUser.user_metadata?.name || email.split('@')[0] || 'Raver').replace(/\s+/g, '_') + '_' + authUser.id.slice(0, 3),
        avatar_url: googleAvatar,
        raves_attended: 0,
        favorite_subgenre: 'Hard Techno',
        secondary_subgenres: [],
        role: 'Raver',
        city: 'Madrid',
        lat: 40.4168,
        lng: -3.7038,
        favorite_bpm: 155,
        dj_audio_source: 'soundcloud',
        dj_media: [],
        club_media: [],
        available_dates: [],
        booking_fee: '',
        is_fee_negotiable: true,
        willing_to_travel: true,
        onboarding_completed: false,
        welcome_notif_read: false,
        bio: 'Amante del sonido club y frecuencias industriales.'
      };
      const { data: created } = await supabase.from('profiles').upsert(defaultProfile).select().single();
      currentUser = created || defaultProfile;
      shouldShowOnboarding = true;
    } else {
      if (!existing.avatar_url && googleAvatar) {
        const { data: updated } = await supabase
          .from('profiles')
          .update({ avatar_url: googleAvatar })
          .eq('id', authUser.id)
          .select()
          .single();
        if (updated) currentUser = updated;
      }
      if (currentUser.onboarding_completed === false) {
        shouldShowOnboarding = true;
      }
    }

    set({
      user: currentUser,
      authEmail: email,
      isOnboardingOpen: shouldShowOnboarding,
      pickedProfileCoords: currentUser.lat && currentUser.lng ? { lat: currentUser.lat, lng: currentUser.lng } : null
    });

    await Promise.all([
      get().fetchAppSettings(),
      get().fetchMyRoleRequest(),
      get().fetchMyEventInvitations(),
      get().fetchSocialData(),
      get().fetchMyHypedDjs(),
      get().fetchMySupportNotifications(),
      get().fetchAppNotifications(),
      get().fetchClubs(),
      get().fetchCollabData()
    ]);
    get().subscribeToNotifications();
  },

  completeOnboardingRole: async (selectedRole, verificationMessage = '') => {
    const { user, autoApproveRoles } = get();
    if (!user) return;

    if (selectedRole === 'Raver' || autoApproveRoles) {
      const { data, error } = await supabase
        .from('profiles')
        .update({ role: selectedRole, onboarding_completed: true })
        .eq('id', user.id)
        .select()
        .single();

      const updatedUser = (!error && data) ? data : { ...user, role: selectedRole, onboarding_completed: true };

      if (selectedRole === 'DJ' || selectedRole === 'Club' || selectedRole === 'Promotor') {
        set({
          user: updatedUser,
          isOnboardingOpen: false,
          isPickingLocation: true,
          pickingTarget: 'onboarding_dj'
        });
      } else {
        set({
          user: updatedUser,
          isOnboardingOpen: false
        });
      }
      return;
    }

    await get().submitRoleRequest({
      requestedRole: selectedRole,
      message: verificationMessage
    });
  },

  subscribeToNotifications: () => {
    const { user } = get();
    if (!user) return;
    if (notificationsChannel) supabase.removeChannel(notificationsChannel);

    notificationsChannel = supabase
      .channel(`notifs_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => {
        get().fetchSocialData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_invitations' }, () => {
        get().fetchMyEventInvitations();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, () => {
        get().fetchMySupportNotifications();
        if (user.is_admin || user.role === 'Admin') {
          get().fetchAllSupportTickets();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'role_requests' }, async () => {
        await get().fetchMyRoleRequest();
        const { data: freshProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();
        if (freshProfile) set({ user: freshProfile });

        if (user.is_admin || user.role === 'Admin') {
          get().fetchAllRoleRequests();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, () => {
        get().fetchAppSettings();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_invitations' }, () => {
        get().fetchSocialData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'collab_links' }, () => {
        get().fetchSocialData();
        if (get().isCollabOpen) get().fetchCollabData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => {
        get().fetchAppNotifications();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
        const { isSocialDockOpen, activeRoom } = get();
        if (payload.new.sender_id !== user.id) {
          const isViewingThisRoom = isSocialDockOpen && activeRoom?.id === payload.new.room_id;
          if (!isViewingThisRoom) {
            set((s) => ({ unreadChatCount: s.unreadChatCount + 1 }));
          }
        }
      })
      .subscribe();
  },

  sendSupportTicket: async ({ subject, message, email }) => {
    const { user, authEmail } = get();
    if (!user) throw new Error('Debes iniciar sesión para enviar una consulta.');

    const payload = {
      user_id: user.id,
      username: user.username,
      user_email: (email || authEmail || '').trim(),
      user_role: user.role || 'Raver',
      subject: subject.trim(),
      message: message.trim(),
      status: 'open',
      user_read_reply: false
    };

    const { error } = await supabase.from('support_tickets').insert([payload]);
    if (error) throw new Error('No se pudo enviar el mensaje: ' + error.message);
  },

  fetchMySupportNotifications: async () => {
    const { user } = get();
    if (!user) return;

    const { data } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'answered')
      .eq('user_read_reply', false)
      .order('replied_at', { ascending: false });

    set({ mySupportNotifications: data || [] });
  },

    markSupportReplyRead: async (ticketId) => {
    const { mySupportNotifications } = get();
    await supabase.from('support_tickets').update({ user_read_reply: true }).eq('id', ticketId);
    set({
      mySupportNotifications: mySupportNotifications.filter((t) => t.id !== ticketId)
    });
  },

  // ----- Avisos (tabla notifications: fundador, avisos del admin…) -----
  fetchAppNotifications: async () => {
    const { user } = get();
    if (!user) return;
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(30);
    if (!error) set({ appNotifications: data || [] });
  },

  dismissAppNotification: async (id) => {
    set((s) => ({ appNotifications: s.appNotifications.filter((n) => n.id !== id) }));
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
  },

  // Al pulsar un aviso: se marca como leído y, si tiene acción, se hace
  openAppNotification: async (notif) => {
    if (!notif) return;
    get().dismissAppNotification(notif.id);
    if (notif.action === 'open_frames') {
      set({ isProfileOpen: true, isProfileEditing: true, profileEditTabRequest: 'frame' });
    }
  },

  // ----- Admin: mandar un aviso a uno o varios tipos de usuario -----
  adminSendNotification: async ({ title, body, roles }) => {
    const { data, error } = await supabase.rpc('admin_send_notification', {
      p_title: title,
      p_body: body,
      p_roles: roles
    });
    if (error) throw new Error(error.message);
    get().fetchAdminBroadcasts();
    return data || 0;
  },

  fetchAdminBroadcasts: async () => {
    const { data, error } = await supabase
      .from('admin_broadcasts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (!error) set({ adminBroadcasts: data || [] });
  },

  // ---------------------------------------------------------------------------
  // Perfiles fantasma (clubs / promotoras importados) · migración 10
  // ---------------------------------------------------------------------------
  submitGhostClaim: async ({ ghost, email, message }) => {
    const { user } = get();
    if (!user) throw new Error('Inicia sesión para reclamar un perfil.');
    if (!ghost?.is_ghost) throw new Error('Este perfil ya no se puede reclamar.');
    const cleanEmail = (email || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) throw new Error('Pon un email de contacto válido.');
    const { error } = await supabase.from('ghost_claims').insert([
      {
        ghost_id: ghost.id,
        ghost_username: ghost.username,
        ghost_role: ghost.role,
        user_id: user.id,
        username: user.username,
        contact_email: cleanEmail,
        message: (message || '').trim()
      }
    ]);
    if (error) {
      if (/duplicate|unique/i.test(error.message)) throw new Error('Ya tienes una reclamación pendiente de este perfil.');
      throw new Error('No se pudo enviar la reclamación: ' + error.message);
    }
  },

  fetchGhostClaims: async () => {
    const { data, error } = await supabase
      .from('ghost_claims')
      .select('*, ghost:profiles!ghost_id(id, username, role, city, avatar_url, street_address, is_ghost), claimant:profiles!user_id(id, username, role, avatar_url, city)')
      .order('created_at', { ascending: false })
      .limit(300);
    if (!error) set({ ghostClaims: data || [] });
  },

  resolveGhostClaim: async (claimId, approve, note = '') => {
    const { error } = await supabase.rpc(approve ? 'admin_merge_ghost' : 'admin_reject_ghost_claim', {
      p_claim_id: claimId,
      p_note: note || null
    });
    if (error) throw new Error(error.message);
    await get().fetchGhostClaims();
    if (approve) await Promise.all([get().fetchClubs(), get().fetchEvents()]);
  },

  fetchAllSupportTickets: async () => {
    const { data, error } = await supabase
      .from('support_tickets')
      .select('*, profile:profiles!user_id(id, username, role, avatar_url)')
      .order('created_at', { ascending: false });

    if (!error && data) set({ supportTickets: data });
  },

  replySupportTicket: async (ticketId, replyText) => {
    if (!replyText.trim()) return;
    const { data, error } = await supabase
      .from('support_tickets')
      .update({
        admin_reply: replyText.trim(),
        status: 'answered',
        user_read_reply: false,
        replied_at: new Date().toISOString()
      })
      .eq('id', ticketId)
      .select('*, profile:profiles!user_id(id, username, role, avatar_url)')
      .single();

    if (error) throw new Error('Error al responder ticket: ' + error.message);
    set({
      supportTickets: get().supportTickets.map((t) => (t.id === ticketId ? data : t))
    });
  },

  signInWithProvider: async (provider) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin }
    });
    if (error) throw error;
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({
      user: null,
      isProfileOpen: false,
      isOnboardingOpen: false,
      selectedEvent: null,
      selectedEventGroup: [],
      selectedDj: null,
      selectedClub: null,
      selectedPromoter: null,
      friends: [],
      myHypedDjIds: [],
      chatRooms: [],
      myAttendingEvents: [],
      myAttendingEventIds: [],
      mySquadEventIds: [],
      myEventInvitations: [],
      myAcceptedInviteEventIds: [],
      mySupportNotifications: [],
      appNotifications: [],
      myRoleRequest: null
    });
  },

  uploadDjMediaFile: async (file, mediaType = 'video', title = '') => {
    const { user } = get();
    if (!user || !file) return null;

    const currentCount = Array.isArray(user.dj_media) ? user.dj_media.length : 0;
    assertActionAllowed(get, user, 'maxDjMediaItems', currentCount);
    assertFileAllowed(get, user, file, mediaType);

    const ext = file.name.split('.').pop();
    const folder =
      mediaType === 'video' ? 'dj_sessions' : mediaType === 'track' ? 'dj_tracks' : 'dj_photos';
    const path = `${folder}/dj_${user.id}_${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from(mediaBucketFor(user)).upload(path, file, { upsert: true });
    if (error) throw new Error('Error al subir archivo multimedia: ' + error.message);

    const publicUrl = supabase.storage.from(mediaBucketFor(user)).getPublicUrl(path).data.publicUrl;
    const defaultTitle =
      mediaType === 'video'
        ? 'Live DJ Session'
        : mediaType === 'track'
        ? file.name.replace(/\.[^/.]+$/, '')
        : 'Press / Club Photo';

    const newItem = {
      id: `media_${Date.now()}`,
      type: mediaType,
      url: publicUrl,
      title: title.trim() || defaultTitle,
      created_at: new Date().toISOString()
    };

    const currentMedia = Array.isArray(user.dj_media) ? user.dj_media : [];
    const updatedMedia = [newItem, ...currentMedia];

    const { data: updatedProfile } = await supabase
      .from('profiles')
      .update({ dj_media: updatedMedia })
      .eq('id', user.id)
      .select()
      .single();

    const finalUser = updatedProfile || { ...user, dj_media: updatedMedia };
    set({
      user: finalUser,
      selectedDj: get().selectedDj?.id === user.id ? finalUser : get().selectedDj
    });
    await get().fetchDjs();
    return newItem;
  },

  removeDjMediaItem: async (mediaId) => {
    const { user } = get();
    if (!user) return;

    const currentMedia = Array.isArray(user.dj_media) ? user.dj_media : [];
    const updatedMedia = currentMedia.filter((item) => item.id !== mediaId);

    const { data: updatedProfile } = await supabase
      .from('profiles')
      .update({ dj_media: updatedMedia })
      .eq('id', user.id)
      .select()
      .single();

    const finalUser = updatedProfile || { ...user, dj_media: updatedMedia };
    set({
      user: finalUser,
      selectedDj: get().selectedDj?.id === user.id ? finalUser : get().selectedDj
    });
    await get().fetchDjs();
  },

  uploadClubMediaFile: async (file, mediaType = 'photo', title = '') => {
    const { user } = get();
    if (!user || !file) return null;

    if (mediaType !== 'video') {
      const currentCount = Array.isArray(user.club_media) ? user.club_media.length : 0;
      assertActionAllowed(get, user, 'maxGalleryPhotos', currentCount);
    }
    assertFileAllowed(get, user, file, mediaType === 'video' ? 'video' : 'image');

    const ext = file.name.split('.').pop();
    const path = `club_media/club_${user.id}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(mediaBucketFor(user)).upload(path, file, { upsert: true });
    if (error) throw new Error('Error al subir archivo: ' + error.message);

    const publicUrl = supabase.storage.from(mediaBucketFor(user)).getPublicUrl(path).data.publicUrl;

    if (mediaType === 'video') {
      const { data: updatedProfile } = await supabase
        .from('profiles')
        .update({ club_video_url: publicUrl })
        .eq('id', user.id)
        .select()
        .single();
      const finalUser = updatedProfile || { ...user, club_video_url: publicUrl };
      set({
        user: finalUser,
        selectedClub: get().selectedClub?.id === user.id ? finalUser : get().selectedClub,
        selectedPromoter: get().selectedPromoter?.id === user.id ? finalUser : get().selectedPromoter
      });
      await get().fetchClubs();
      return publicUrl;
    }

    const newItem = {
      id: `club_img_${Date.now()}`,
      type: 'photo',
      url: publicUrl,
      title: title.trim() || 'Galería Oficial',
      created_at: new Date().toISOString()
    };

    const currentMedia = Array.isArray(user.club_media) ? user.club_media : [];
    const updatedMedia = [newItem, ...currentMedia];

    const { data: updatedProfile } = await supabase
      .from('profiles')
      .update({ club_media: updatedMedia })
      .eq('id', user.id)
      .select()
      .single();

    const finalUser = updatedProfile || { ...user, club_media: updatedMedia };
    set({
      user: finalUser,
      selectedClub: get().selectedClub?.id === user.id ? finalUser : get().selectedClub,
      selectedPromoter: get().selectedPromoter?.id === user.id ? finalUser : get().selectedPromoter
    });
    await get().fetchClubs();
    return newItem;
  },

  // Quitar el vídeo oficial del club / promotor (el archivo huérfano lo borra la limpieza diaria)
  removeClubVideo: async () => {
    const { user } = get();
    if (!user) return;

    const { data: updatedProfile } = await supabase
      .from('profiles')
      .update({ club_video_url: null })
      .eq('id', user.id)
      .select()
      .single();

    const finalUser = updatedProfile || { ...user, club_video_url: null };
    set({
      user: finalUser,
      selectedClub: get().selectedClub?.id === user.id ? finalUser : get().selectedClub,
      selectedPromoter: get().selectedPromoter?.id === user.id ? finalUser : get().selectedPromoter
    });
    await get().fetchClubs();
  },

  removeClubMediaItem: async (mediaId) => {
    const { user } = get();
    if (!user) return;

    const currentMedia = Array.isArray(user.club_media) ? user.club_media : [];
    const updatedMedia = currentMedia.filter((item) => item.id !== mediaId);

    const { data: updatedProfile } = await supabase
      .from('profiles')
      .update({ club_media: updatedMedia })
      .eq('id', user.id)
      .select()
      .single();

    const finalUser = updatedProfile || { ...user, club_media: updatedMedia };
    set({
      user: finalUser,
      selectedClub: get().selectedClub?.id === user.id ? finalUser : get().selectedClub,
      selectedPromoter: get().selectedPromoter?.id === user.id ? finalUser : get().selectedPromoter
    });
    await get().fetchClubs();
  },

  updateUserProfile: async (updates, avatarFile, djAudioFile, clubAudioFile) => {
    const { user, pickedProfileCoords } = get();
    if (!user) throw new Error('Debes iniciar sesión.');

    const cleanUsername = (updates.username || '').trim();
    if (!cleanUsername) throw new Error('El nombre de usuario no puede estar vacío.');

    if (updates.role === 'DJ' && (!pickedProfileCoords?.lat || !pickedProfileCoords?.lng)) {
      throw new Error('Como DJ / Producer es obligatorio marcar en el mapa dónde quieres aparecer.');
    }

    const { data: duplicate } = await supabase
      .from('profiles')
      .select('id')
      .ilike('username', cleanUsername)
      .neq('id', user.id)
      .maybeSingle();

    if (duplicate) throw new Error('Ese nombre de usuario ya está en uso. Elige otro.');

    assertFileAllowed(get, user, avatarFile, 'image');
    assertFileAllowed(get, user, djAudioFile, 'audio');
    assertFileAllowed(get, user, clubAudioFile, 'audio');

    let avatar_url = user.avatar_url;
    if (avatarFile) {
      const ext = avatarFile.name.split('.').pop();
      const path = `avatar_${user.id}_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, avatarFile, { upsert: true });
      if (upErr) throw new Error('Error al subir imagen: ' + upErr.message);
      avatar_url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    }

    let dj_audio_url = user.dj_audio_url || null;
    if (updates.role === 'DJ' && updates.dj_audio_source === 'upload' && djAudioFile) {
      const ext = djAudioFile.name.split('.').pop();
      const audioPath = `audio/dj_${user.id}_${Date.now()}.${ext}`;
      const { error: audErr } = await supabase.storage.from(mediaBucketFor(user)).upload(audioPath, djAudioFile, { upsert: true });
      if (audErr) throw new Error('Error al subir tu canción: ' + audErr.message);
      dj_audio_url = supabase.storage.from(mediaBucketFor(user)).getPublicUrl(audioPath).data.publicUrl;
    }

    let club_audio_url = user.club_audio_url || null;
    if ((updates.role === 'Club' || updates.role === 'Promotor') && clubAudioFile) {
      const ext = clubAudioFile.name.split('.').pop();
      const audioPath = `audio/entity_${user.id}_${Date.now()}.${ext}`;
      const { error: clubAudErr } = await supabase.storage.from(mediaBucketFor(user)).upload(audioPath, clubAudioFile, { upsert: true });
      if (clubAudErr) throw new Error('Error al subir la canción: ' + clubAudErr.message);
      club_audio_url = supabase.storage.from(mediaBucketFor(user)).getPublicUrl(audioPath).data.publicUrl;
    }

    const foundCity = SPAIN_LOCATIONS.find((c) => c.value === updates.city) || SPAIN_LOCATIONS[0];
    const finalLat = pickedProfileCoords?.lat ?? user.lat ?? foundCity.lat;
    const finalLng = pickedProfileCoords?.lng ?? user.lng ?? foundCity.lng;

    const cleanSecondary = Array.isArray(updates.secondary_subgenres)
      ? updates.secondary_subgenres.map((s) => s.trim()).filter(Boolean).slice(0, getLimitValue(user, 'maxSecondarySubgenres'))
      : [];

    const isRequestingRoleUpgrade = user.role === 'Raver' && updates.role && updates.role !== 'Raver';
    const shouldHoldRoleForReview = isRequestingRoleUpgrade && !get().autoApproveRoles;
    const effectiveRoleToSave = user.role !== 'Raver'
      ? user.role
      : shouldHoldRoleForReview
      ? 'Raver'
      : (updates.role || 'Raver');

    const isClubOrPromoter = updates.role === 'Club' || updates.role === 'Promotor';

    const payload = {
      id: user.id,
      username: cleanUsername,
      role: effectiveRoleToSave,
      city: foundCity.value,
      street_address: isClubOrPromoter ? (updates.street_address || '').trim() : (user.street_address || ''),
      website_url: isClubOrPromoter ? (updates.website_url || '').trim() || null : (user.website_url || null),
      club_video_url: user.club_video_url || null,
      club_audio_url: isClubOrPromoter ? club_audio_url : (user.club_audio_url || null),
      club_media: Array.isArray(user.club_media) ? user.club_media : [],
      lat: parseFloat(finalLat),
      lng: parseFloat(finalLng),
      favorite_subgenre: updates.favorite_subgenre || 'Hard Techno',
      secondary_subgenres: cleanSecondary,
      favorite_bpm: Number(updates.favorite_bpm) || 155,
      dj_audio_source: updates.role === 'DJ' ? (updates.dj_audio_source || 'soundcloud') : 'soundcloud',
      soundcloud_url: updates.role === 'DJ' ? (updates.soundcloud_url || '').trim() : null,
      dj_audio_url: updates.role === 'DJ' ? dj_audio_url : null,
      instagram_url: (updates.instagram_url || '').trim() || null,
      spotify_url: (updates.spotify_url || '').trim() || null,
      tiktok_url: (updates.tiktok_url || '').trim() || null,
      youtube_url: (updates.youtube_url || '').trim() || null,
      booking_fee: updates.role === 'DJ' ? (updates.booking_fee || '').trim() : '',
      is_fee_negotiable: updates.role === 'DJ' ? Boolean(updates.is_fee_negotiable) : true,
      willing_to_travel: updates.role === 'DJ' ? Boolean(updates.willing_to_travel) : true,
      available_dates: updates.role === 'DJ' && Array.isArray(updates.available_dates) ? updates.available_dates : [],
      // Eventos propios del DJ (fuera del mapa) · migración 09
      ...('dj_private_events' in updates
        ? { dj_private_events: updates.role === 'DJ' ? sanitizeOwnEvents(updates.dj_private_events) : [] }
        : {}),
      dj_media: Array.isArray(user.dj_media) ? user.dj_media : [],
      onboarding_completed: true,
            bio: (updates.bio || '').trim(),
      avatar_url,
      // Marco animado: solo DJs con PRO activo (la base de datos también lo comprueba)
            // Marco animado: Corona → DJs fundadores; resto → DJs PRO. Quitarlo, siempre.
      // (la base de datos también lo comprueba)
      ...(effectiveRoleToSave === 'DJ' &&
      'avatar_frame' in updates &&
      (!updates.avatar_frame || canUseFrame(user, updates.avatar_frame))
        ? {
            avatar_frame: updates.avatar_frame || null,
            avatar_frame_color: updates.avatar_frame ? (updates.avatar_frame_color || null) : null
          }
        : {})
    };

    let { data, error } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single();

    // Si aún no has ejecutado la migración 09, guardamos el resto del perfil igualmente
    if (error && /dj_private_events/i.test(error.message || '')) {
      console.warn('Falta la columna dj_private_events (ejecuta la migración 09). Se guarda el resto del perfil.');
      delete payload.dj_private_events;
      ({ data, error } = await supabase
        .from('profiles')
        .upsert(payload, { onConflict: 'id' })
        .select()
        .single());
    }

    if (error) throw new Error('No se pudo guardar en Supabase: ' + error.message);

    if (shouldHoldRoleForReview) {
      await get().submitRoleRequest({
        requestedRole: updates.role,
        message: updates.role_request_message || `Solicitud de cambio a ${updates.role} desde edición de perfil.`,
        lat: parseFloat(finalLat),
        lng: parseFloat(finalLng)
      });
    }

    set({
      user: data,
      isProfileEditing: false,
      selectedDj: get().selectedDj?.id === data.id ? data : get().selectedDj,
      selectedClub: get().selectedClub?.id === data.id ? data : get().selectedClub,
      selectedPromoter: get().selectedPromoter?.id === data.id ? data : get().selectedPromoter
    });
    await Promise.all([get().fetchDjs(), get().fetchClubs()]);
  },

  fetchDjs: async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'DJ')
      .order('hype_score', { ascending: false });

    if (!error && data) {
      set({ djs: data });
      get().applyFilters({});
    }
  },

  fetchClubs: async () => {
    const [clubsRes, promotersRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'Club').order('username', { ascending: true }),
      supabase.from('profiles').select('*').eq('role', 'Promotor').order('username', { ascending: true })
    ]);

    if (!clubsRes.error && clubsRes.data) {
      set({
        clubs: clubsRes.data,
        promoters: promotersRes.data || []
      });
      get().applyFilters({});
    }
  },

  toggleClubInfoExpand: () =>
    set((s) => (!s.isClubInfoExpanded && !s.user ? { isAuthOpen: true } : {
      isClubInfoExpanded: !s.isClubInfoExpanded,
      selectedEvent: !s.isClubInfoExpanded ? null : s.selectedEvent,
      selectedEventGroup: !s.isClubInfoExpanded ? [] : s.selectedEventGroup,
      isEventChatExpanded: false
    })),

  togglePromoterInfoExpand: () =>
    set((s) => (!s.isPromoterInfoExpanded && !s.user ? { isAuthOpen: true } : {
      isPromoterInfoExpanded: !s.isPromoterInfoExpanded,
      selectedEvent: !s.isPromoterInfoExpanded ? null : s.selectedEvent,
      selectedEventGroup: !s.isPromoterInfoExpanded ? [] : s.selectedEventGroup,
      isEventChatExpanded: false
    })),

  selectClub: (club) => {
    const { filteredEvents, filteredClubs, clubs, myAttendingEventIds } = get();
    // Abrir el panel básico no requiere sesión (ver requireAuth / LOGIN_REQUIRED_MODALS)

    if (!club) {
      set({
        selectedClub: null,
        selectedClubEvents: [],
        isClubInfoExpanded: false,
        selectedEvent: null,
        selectedEventGroup: [],
        isEventChatExpanded: false
      });
      return;
    }

    const fullClubProfile =
      (filteredClubs || []).find(
        (c) =>
          (club.id && String(c.id) === String(club.id)) ||
          (club.username && c.username?.toLowerCase() === club.username.toLowerCase())
      ) ||
      (clubs || []).find(
        (c) =>
          (club.id && String(c.id) === String(club.id)) ||
          (club.username && c.username?.toLowerCase() === club.username.toLowerCase())
      ) ||
      club;

    const clubEvents = (filteredEvents || []).filter((ev) => {
      const belongsToClub =
        (ev.linked_club_id && String(ev.linked_club_id) === String(fullClubProfile.id)) ||
        (ev.venue_id && String(ev.venue_id) === String(fullClubProfile.id)) ||
        (ev.venue_name &&
          ev.venue_name.replace('@', '').trim().toLowerCase() === fullClubProfile.username?.trim().toLowerCase());

      if (!belongsToClub) return false;
      return !isEventLockedSecret(ev, myAttendingEventIds);
    });

    set({
      selectedClub: fullClubProfile,
      selectedClubEvents: clubEvents,
      isClubInfoExpanded: false,
      selectedPromoter: null,
      selectedPromoterEvents: [],
      isPromoterInfoExpanded: false,
      selectedDj: null,
      isDjMediaExpanded: false,
      djLeftPanelMode: null,
      selectedEvent: null,
      selectedEventGroup: [],
      isEventChatExpanded: false
    });
  },

  selectPromoter: (promoter) => {
    const { filteredEvents, filteredPromoters, promoters, myAttendingEventIds } = get();
    // Abrir el panel básico no requiere sesión (ver requireAuth / LOGIN_REQUIRED_MODALS)

    if (!promoter) {
      set({
        selectedPromoter: null,
        selectedPromoterEvents: [],
        isPromoterInfoExpanded: false,
        selectedEvent: null,
        selectedEventGroup: [],
        isEventChatExpanded: false
      });
      return;
    }

    const fullPromoterProfile =
      (filteredPromoters || []).find((p) => String(p.id) === String(promoter.id)) ||
      (promoters || []).find((p) => String(p.id) === String(promoter.id)) ||
      promoter;

    const promoterEvents = (filteredEvents || []).filter((ev) => {
      const isCreator = ev.created_by && String(ev.created_by) === String(fullPromoterProfile.id);
      const inPromotersList =
        Array.isArray(ev.promoters_list) &&
        ev.promoters_list.some(
          (p) =>
            (p.id && String(p.id) === String(fullPromoterProfile.id)) ||
            (p.username && p.username.toLowerCase() === fullPromoterProfile.username?.toLowerCase())
        );
      if (!isCreator && !inPromotersList) return false;
      return !isEventLockedSecret(ev, myAttendingEventIds);
    });

    set({
      selectedPromoter: fullPromoterProfile,
      selectedPromoterEvents: promoterEvents,
      isPromoterInfoExpanded: false,
      selectedClub: null,
      selectedClubEvents: [],
      isClubInfoExpanded: false,
      selectedDj: null,
      isDjMediaExpanded: false,
      djLeftPanelMode: null,
      selectedEvent: null,
      selectedEventGroup: [],
      isEventChatExpanded: false
    });
  },

  selectEventFromClub: async (event) => {
    const { user } = get();
    if (!event) return;
    const seq = ++eventSelectSeq;

    set({
      isEventDetailsLoading: true,
      isClubInfoExpanded: false,
      isPromoterInfoExpanded: false,
      selectedEventGroup: [event],
      currentGroupIndex: 0,
      selectedEvent: event,
      isEventChatExpanded: false,
      attendees: [],
      eventInvitations: []
    });

    await get()._loadEventDetails(event, seq, user);
  },

  fetchMyHypedDjs: async () => {
    const { user } = get();
    if (!user) return;
    const { data } = await supabase.from('dj_hypes').select('dj_id').eq('user_id', user.id);
    if (data) set({ myHypedDjIds: data.map((r) => r.dj_id) });
  },

  giveHypeToDj: async (djId) => {
    const { user, djs, selectedDj, myHypedDjIds } = get();
    if (!user) return set({ isAuthOpen: true });
    if (myHypedDjIds.includes(djId)) return;

    const target = djs.find((d) => d.id === djId);
    if (!target) return;

    const { error } = await supabase.from('dj_hypes').insert([{ dj_id: djId, user_id: user.id }]);
    if (error) return;

    const nextScore = (target.hype_score || 10) + 1;
    await supabase.from('profiles').update({ hype_score: nextScore }).eq('id', djId);

    const updatedDjs = djs
      .map((d) => (d.id === djId ? { ...d, hype_score: nextScore } : d))
      .sort((a, b) => (b.hype_score || 0) - (a.hype_score || 0));

    set({
      myHypedDjIds: [...myHypedDjIds, djId],
      djs: updatedDjs,
      selectedDj: selectedDj?.id === djId ? { ...selectedDj, hype_score: nextScore } : selectedDj
    });
    get().applyFilters({});
  },

  toggleDjMediaExpand: () =>
    set((s) => {
      const isOpening = !(s.isDjMediaExpanded && s.djLeftPanelMode === 'media');
      if (isOpening && !s.user) return { isAuthOpen: true };
      return {
        isDjMediaExpanded: isOpening,
        djLeftPanelMode: isOpening ? 'media' : null
      };
    }),

  toggleDjPromoterExpand: () =>
    set((s) => {
      const isOpening = !(s.isDjMediaExpanded && s.djLeftPanelMode === 'promoter');
      if (isOpening && !s.user) return { isAuthOpen: true };
      return {
        isDjMediaExpanded: isOpening,
        djLeftPanelMode: isOpening ? 'promoter' : null
      };
    }),

  selectDj: async (dj) => {
    // Abrir el panel básico no requiere sesión (ver requireAuth / LOGIN_REQUIRED_MODALS)
    const seq = ++djSelectSeq;

    set({
      selectedDj: dj,
      isDjMediaExpanded: false,
      djLeftPanelMode: null,
      selectedDjEvents: [],
      isDjEventsLoading: Boolean(dj),
      selectedClub: null,
      selectedClubEvents: [],
      isClubInfoExpanded: false,
      selectedPromoter: null,
      selectedPromoterEvents: [],
      isPromoterInfoExpanded: false,
      selectedEvent: null,
      selectedEventGroup: [],
      isEventChatExpanded: false
    });
    if (!dj) return;

    let attendanceRows = [];
    try {
      const { data } = await supabase
        .from('event_attendees')
        .select('event_id, status')
        .eq('user_id', dj.id);
      attendanceRows = data || [];
    } catch (err) {
      console.error('Error cargando eventos del DJ:', err);
    }
    // El usuario ya abrió otro DJ / otro panel o lo cerró: descartamos esta respuesta
    if (seq !== djSelectSeq || String(get().selectedDj?.id) !== String(dj.id)) return;

    const attendingIds = new Set((attendanceRows || []).map((a) => a.event_id));
    const { events } = get();

    const combinedEvents = [];

    events.forEach((ev) => {
      const timing = evaluateEventTiming(ev.start_date, ev.start_time, ev.duration_hours);
      if (timing.status === 'FINISHED') return;

      const lineupArr = Array.isArray(ev.lineup) ? ev.lineup : [];
      const officialSlot = lineupArr.find(
        (slot) =>
          (slot.dj_id && String(slot.dj_id) === String(dj.id)) ||
          (slot.name && slot.name.trim().toLowerCase() === dj.username?.trim().toLowerCase())
      );

      const isAttending = attendingIds.has(ev.id);

      if (officialSlot || isAttending) {
        combinedEvents.push({
          ...ev,
          timingStatus: timing.status,
          startMs: timing.startMs,
          isOfficialLineup: Boolean(officialSlot),
          officialSetTime: officialSlot?.set_time || null,
          officialStage: officialSlot?.stage || officialSlot?.stage_or_genre || null
        });
      }
    });

    combinedEvents.sort((a, b) => {
      if (a.isOfficialLineup && !b.isOfficialLineup) return -1;
      if (!a.isOfficialLineup && b.isOfficialLineup) return 1;
      return a.startMs - b.startMs;
    });

    set({ selectedDjEvents: combinedEvents, isDjEventsLoading: false });
  },

  inspectUserById: async (userId) => {
    const { user } = get();
    if (!userId) return;
    if (!user) {
      set({ isAuthOpen: true });
      return;
    }

    if (String(user.id) === String(userId)) {
      set({ isProfileOpen: true, inspectedUser: null });
      return;
    }

    const [profileRes, attRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('event_attendees').select('event_id, status').eq('user_id', userId)
    ]);

    if (!profileRes.data) return;

    const eventIds = new Set((attRes.data || []).map((a) => a.event_id));
    const activeOrFutureEvents = get().events
      .filter((ev) => eventIds.has(ev.id))
      .map((ev) => {
        const timing = evaluateEventTiming(ev.start_date, ev.start_time, ev.duration_hours);
        return { ...ev, timingStatus: timing.status, startMs: timing.startMs };
      })
      .filter((ev) => ev.timingStatus !== 'FINISHED')
      .sort((a, b) => a.startMs - b.startMs);

    set({
      inspectedUser: profileRes.data,
      inspectedUserEvents: activeOrFutureEvents
    });
  },

  closeInspectUser: () => set({ inspectedUser: null, inspectedUserEvents: [] }),

  fetchEvents: async () => {
    const [eventsRes, attRes] = await Promise.all([
      supabase
        .from('events')
        .select('*, creator:profiles!created_by(id, username, avatar_url, role, is_pro), venue_profile:profiles!venue_id(*)')
        .order('start_date', { ascending: true }),
      supabase.from('event_attendees').select('event_id, user_id, status, is_going, looking_for_squad')
    ]);

    if (!eventsRes.error && eventsRes.data) {
      set({
        events: eventsRes.data,
        allAttendancesList: attRes.data || []
      });
      get().applyFilters({});
      if (get().user) get().fetchSocialData();
    }
  },

  applyFilters: ({ subgenre, timeFilter, query }) => {
    const { activeSubgenre, activeTimeFilter, searchQuery } = get();
    const nextGenre = subgenre !== undefined ? subgenre : activeSubgenre;
    const nextTime = timeFilter !== undefined ? timeFilter : activeTimeFilter;
    const nextQuery = query !== undefined ? query : searchQuery;

    // Escribiendo en el buscador: el texto se actualiza al instante y el recálculo
    // pesado (eventos, clubs, mapa) se hace una sola vez cuando se deja de teclear.
    const isTypingOnly = query !== undefined && subgenre === undefined && timeFilter === undefined;
    if (isTypingOnly) {
      set({ searchQuery: nextQuery });
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        searchDebounceTimer = null;
        const s = get();
        set(computeFilteredState(s, s.activeSubgenre, s.activeTimeFilter, s.searchQuery));
      }, SEARCH_DEBOUNCE_MS);
      return;
    }

    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = null;
    }
    set(computeFilteredState(get(), nextGenre, nextTime, nextQuery));
  },

  selectEventGroup: async (group, index = 0) => {
    const { user, filteredClubs, clubs, myAttendingEventIds } = get();
    const event = group[index] || null;
    const seq = ++eventSelectSeq;

    // Abrir el panel básico no requiere sesión (ver requireAuth / LOGIN_REQUIRED_MODALS)

    // Si el evento pertenece a un Club registrado y NO está bloqueado en Secret Location,
    // abrimos el panel del Club a la derecha con el evento seleccionado ([Evento] <- [Club])
    let clubToKeepOpen = event ? null : get().selectedClub;
    let clubEventsToKeep = event ? [] : get().selectedClubEvents;

    if (event && !isEventLockedSecret(event, myAttendingEventIds, user)) {
      const matchedClub =
        (event.venue_id &&
          ((filteredClubs || []).find((c) => String(c.id) === String(event.venue_id)) ||
            (clubs || []).find((c) => String(c.id) === String(event.venue_id)))) ||
        (event.linked_club_id &&
          ((filteredClubs || []).find((c) => String(c.id) === String(event.linked_club_id)) ||
            (clubs || []).find((c) => String(c.id) === String(event.linked_club_id)))) ||
        (event.venue_name &&
          ((filteredClubs || []).find(
            (c) => c.username?.trim().toLowerCase() === event.venue_name.replace('@', '').trim().toLowerCase()
          ) ||
            (clubs || []).find(
              (c) => c.username?.trim().toLowerCase() === event.venue_name.replace('@', '').trim().toLowerCase()
            )));

      if (matchedClub) {
        clubToKeepOpen = matchedClub;
        clubEventsToKeep = matchedClub.hosted_events || [event];
      }
    }

    set({
      selectedEventGroup: group,
      currentGroupIndex: index,
      selectedEvent: event,
      selectedDj: null,
      isDjMediaExpanded: false,
      djLeftPanelMode: null,
      selectedClub: clubToKeepOpen,
      selectedClubEvents: clubEventsToKeep,
      isClubInfoExpanded: false,
      selectedPromoter: event ? null : get().selectedPromoter,
      isEventChatExpanded: false,
      attendeesModalFilter: null,
      attendees: [],
      eventInvitations: [],
      isEventDetailsLoading: Boolean(event)
    });
    if (!event) return;

    await get()._loadEventDetails(event, seq, user);
  },

  // Carga asistentes, invitaciones y chat de un evento sin bloquear la UI.
  // Si mientras tanto el usuario abre otro evento o cierra el panel, se descarta.
  _loadEventDetails: async (event, seq, user) => {
    const isStale = () => seq !== eventSelectSeq || String(get().selectedEvent?.id) !== String(event.id);
    try {
      const [attendeesRes, invitesRes] = await Promise.all([
        supabase
          .from('event_attendees')
          .select('*, profile:profiles!user_id(id, username, avatar_url, role, city, favorite_subgenre)')
          .eq('event_id', event.id),
        supabase
          .from('event_invitations')
          .select('*, profile:profiles!user_id(id, username, avatar_url, role, city, favorite_subgenre)')
          .eq('event_id', event.id)
          .order('created_at', { ascending: false })
      ]);
      if (isStale()) return;

      set({
        attendees: attendeesRes.data || [],
        eventInvitations: invitesRes.data || [],
        isEventDetailsLoading: false
      });

      // El chat del evento es solo para usuarios con sesión
      if (!user) return;

      let { data: room } = await supabase.from('chat_rooms').select('*').eq('event_id', event.id).maybeSingle();
      if (isStale()) return;
      if (!room) {
        const { data: created } = await supabase
          .from('chat_rooms')
          .insert([{ type: 'event', name: event.name, event_id: event.id }])
          .select()
          .single();
        room = created;
      }
      if (room && !isStale()) await get().selectChatRoom(room);
    } catch (err) {
      console.error('Error cargando detalles del evento:', err);
    } finally {
      if (seq === eventSelectSeq && get().isEventDetailsLoading) set({ isEventDetailsLoading: false });
    }
  },

  selectEvent: (eventOrStub) => {
    if (!eventOrStub) return get().selectEventGroup([], 0);
    const { filteredEvents, events } = get();
    const fullEvent =
      (filteredEvents || []).find((e) => String(e.id) === String(eventOrStub.id)) ||
      (events || []).find((e) => String(e.id) === String(eventOrStub.id)) ||
      eventOrStub;

    // PUNTO 5: Si el evento ya no existe o no tiene coordenadas válidas, no abrimos ni movemos el mapa
    if (!fullEvent || fullEvent.lat == null || fullEvent.lng == null) {
      get().fetchMyEventInvitations();
      return;
    }

    return get().selectEventGroup([fullEvent], 0);
  },
  toggleEventChatExpand: () =>
    set((s) =>
      !s.isEventChatExpanded && !s.user
        ? { isAuthOpen: true }
        : { isEventChatExpanded: !s.isEventChatExpanded }
    ),

  selectChatRoom: async (room) => {
    if (activeRealtimeChannel) {
      supabase.removeChannel(activeRealtimeChannel);
      activeRealtimeChannel = null;
    }
    set({ activeRoom: room, roomMessages: [], unreadChatCount: 0 });
    if (!room) return;

    const { data: rawMsgs } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('room_id', room.id)
      .order('created_at', { ascending: true });

    const msgs = rawMsgs || [];
    const senderIds = [...new Set(msgs.map((m) => m.sender_id).filter(Boolean))];
    let profileMap = {};

    if (senderIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, role')
        .in('id', senderIds);
      (profs || []).forEach((p) => {
        profileMap[p.id] = p;
      });
    }

    const enrichedMsgs = msgs.map((m) => ({
      ...m,
      sender_avatar: profileMap[m.sender_id]?.avatar_url || m.sender_avatar || null,
      sender_username: profileMap[m.sender_id]?.username || m.sender_username,
      sender: profileMap[m.sender_id] || null
    }));

    set({ roomMessages: enrichedMsgs });

    activeRealtimeChannel = supabase
      .channel(`room_${room.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${room.id}` },
        async (payload) => {
          const currentMsgs = get().roomMessages;
          if (payload.eventType === 'INSERT') {
            if (!currentMsgs.some((m) => m.id === payload.new.id)) {
              const { data: senderProf } = await supabase
                .from('profiles')
                .select('id, username, avatar_url, role')
                .eq('id', payload.new.sender_id)
                .maybeSingle();

              const newMsg = {
                ...payload.new,
                sender_avatar: senderProf?.avatar_url || payload.new.sender_avatar || null,
                sender_username: senderProf?.username || payload.new.sender_username,
                sender: senderProf || null
              };
              set({ roomMessages: [...get().roomMessages, newMsg] });
            }
          } else if (payload.eventType === 'UPDATE') {
            set({
              roomMessages: currentMsgs.map((m) => (m.id === payload.new.id ? { ...m, ...payload.new } : m))
            });
          }
        }
      )
      .subscribe();
  },

  sendChatMessage: async (content) => {
    const { activeRoom, user, roomMessages, chatRooms } = get();
    if (!activeRoom || !user || !content.trim()) return;

    // En chats de colaboración, bloquear mensajes adicionales del emisor hasta que el receptor responda
    if (activeRoom.type === 'collab' && roomMessages.length > 0) {
      const initiatorId = roomMessages[0]?.sender_id || activeRoom.created_by;
      const hasReply = roomMessages.some((m) => String(m.sender_id) !== String(initiatorId));
      if (String(user.id) === String(initiatorId) && !hasReply) {
        return;
      }
    }

    const cleanText = content.trim();
    const tempId = `temp_${Date.now()}`;
    const optimisticMsg = {
      id: tempId,
      room_id: activeRoom.id,
      sender_id: user.id,
      sender_username: user.username,
      sender_avatar: user.avatar_url || null,
      sender: { id: user.id, username: user.username, avatar_url: user.avatar_url || null, role: user.role },
      content: cleanText,
      created_at: new Date().toISOString()
    };

    set({ roomMessages: [...roomMessages, optimisticMsg] });

    let { data: savedMsg, error } = await supabase
      .from('chat_messages')
      .insert([{
        room_id: activeRoom.id,
        sender_id: user.id,
        sender_username: user.username,
        sender_avatar: user.avatar_url || null,
        content: cleanText
      }])
      .select()
      .single();

    if (error) {
      const retry = await supabase
        .from('chat_messages')
        .insert([{
          room_id: activeRoom.id,
          sender_id: user.id,
          sender_username: user.username,
          content: cleanText
        }])
        .select()
        .single();
      savedMsg = retry.data;
    }

    if (savedMsg) {
      const enrichedSaved = {
        ...savedMsg,
        sender_avatar: user.avatar_url || savedMsg.sender_avatar || null,
        sender: { id: user.id, username: user.username, avatar_url: user.avatar_url || null, role: user.role }
      };
      set({
        roomMessages: get().roomMessages.map((m) => (m.id === tempId ? enrichedSaved : m))
      });
    }

    if (!chatRooms.some((r) => r.id === activeRoom.id)) {
      set({ chatRooms: [activeRoom, ...chatRooms] });
    }
  },

  togglePinMessage: async (msg) => {
    const { activeRoom, roomMessages } = get();
    if (!activeRoom) return;
    const nextPinnedState = !msg.is_pinned;
    if (nextPinnedState) {
      await supabase.from('chat_messages').update({ is_pinned: false }).eq('room_id', activeRoom.id);
    }
    await supabase.from('chat_messages').update({ is_pinned: nextPinnedState }).eq('id', msg.id);
    set({
      roomMessages: roomMessages.map((m) =>
        m.id === msg.id ? { ...m, is_pinned: nextPinnedState } : { ...m, is_pinned: false }
      )
    });
  },

  fetchSocialData: async () => {
    const { user, events } = get();
    if (!user) return;

    const [myMsgsRes, myParticipationsRes, allRoomsRes, friendsRes, myAttendanceRes, offersRes] = await Promise.all([
      supabase.from('chat_messages').select('room_id').eq('sender_id', user.id),
      supabase.from('chat_participants').select('room_id').eq('user_id', user.id),
      supabase
        .from('chat_rooms')
        .select('*, participants:chat_participants(user_id, role, profile:profiles(id, username, avatar_url, role, city))')
        .order('created_at', { ascending: false }),
      supabase.from('friendships')
        .select('*, requester:profiles!requester_id(*), addressee:profiles!addressee_id(*)')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
      supabase.from('event_attendees').select('event_id, status, is_going, looking_for_squad').eq('user_id', user.id),
      supabase.from('collab_offers').select('id, title, image_url, creator_id')
    ]);

    const offersById = new Map((offersRes.data || []).map((o) => [o.id, o]));

    const allFriendships = friendsRes.data || [];
    const acceptedFriendUserIds = new Set(
      allFriendships
        .filter((f) => f.status === 'accepted')
        .map((f) => (f.requester_id === user.id ? f.addressee_id : f.requester_id))
    );

    const messagedRoomIds = new Set((myMsgsRes.data || []).map((m) => m.room_id));
    const participantRoomIds = new Set((myParticipationsRes.data || []).map((p) => p.room_id));
    const eventsById = new Map(events.map((ev) => [ev.id, ev]));

    const validRooms = (allRoomsRes.data || [])
      .map((room) => {
        if (room.type === 'direct') {
          const otherParticipant = room.participants?.find((p) => p.user_id !== user.id)?.profile;
          return { ...room, directFriend: otherParticipant || null };
        }
        if (room.type === 'collab') {
          const otherParticipant = room.participants?.find((p) => p.user_id !== user.id)?.profile;
          const linkedOffer = room.collab_offer_id ? offersById.get(room.collab_offer_id) : null;
          return {
            ...room,
            collabPartner: otherParticipant || null,
            collabOfferTitle: linkedOffer?.title || room.name.replace('Colab: ', ''),
            collabOfferImage: linkedOffer?.image_url || otherParticipant?.avatar_url || null
          };
        }
        if (room.type === 'event' && room.event_id) {
          const linkedEvent = eventsById.get(room.event_id);
          return { ...room, eventImage: linkedEvent?.image_url || null };
        }
        return room;
      })
      .filter((room) => {
        if (room.type === 'event') return messagedRoomIds.has(room.id);
        if (room.type === 'collab') {
          return participantRoomIds.has(room.id) || room.created_by === user.id;
        }
        if (room.type === 'direct') {
          const isMyDm = participantRoomIds.has(room.id) || room.created_by === user.id;
          const isStillFriend = room.directFriend && acceptedFriendUserIds.has(room.directFriend.id);
          return isMyDm && isStillFriend;
        }
        return participantRoomIds.has(room.id) || room.created_by === user.id;
      });

    const attendanceMap = new Map(
      (myAttendanceRes.data || []).map((a) => [
        a.event_id,
        a.looking_for_squad ? 'looking_for_squad' : 'going'
      ])
    );

    const attendingEvents = events
      .filter((ev) => attendanceMap.has(ev.id))
      .map((ev) => {
        const timing = evaluateEventTiming(ev.start_date, ev.start_time, ev.duration_hours);
        return {
          ...ev,
          my_status: attendanceMap.get(ev.id),
          timingStatus: timing.status,
          startMs: timing.startMs
        };
      })
      .filter((ev) => ev.timingStatus !== 'FINISHED')
      .sort((a, b) => a.startMs - b.startMs);

    const currentActiveId = get().activeRoom?.id;
    const updatedActiveRoom = currentActiveId
      ? validRooms.find((r) => r.id === currentActiveId) || get().activeRoom
      : null;

    // Invitaciones a grupos privados y aplicaciones nuevas a mis ofertas
    // (si aún no has ejecutado la migración 05, simplemente vienen vacías)
    const [groupInvRes, applicationsRes] = await Promise.all([
      supabase
        .from('group_invitations')
        .select('*, inviter:profiles!inviter_id(id, username, avatar_url, role), invitee:profiles!invitee_id(id, username, avatar_url, role)')
        .eq('status', 'pending')
        .or(`inviter_id.eq.${user.id},invitee_id.eq.${user.id}`)
        .order('created_at', { ascending: false }),
      supabase
        .from('collab_links')
        .select('*, target:profiles!target_user_id(id, username, avatar_url, role), offer:collab_offers(id, title)')
        .eq('creator_id', user.id)
        .eq('direction', 'applied')
        .eq('creator_read', false)
        .order('created_at', { ascending: false })
    ]);
    const pendingGroupInvs = groupInvRes.error ? [] : groupInvRes.data || [];

    set({
      groupInvitations: pendingGroupInvs.filter((i) => String(i.invitee_id) === String(user.id)),
      sentGroupInvitations: pendingGroupInvs.filter((i) => String(i.inviter_id) === String(user.id)),
      collabApplications: applicationsRes.error ? [] : applicationsRes.data || [],
      chatRooms: validRooms,
      activeRoom: updatedActiveRoom,
      friends: allFriendships,
      myAttendingEvents: attendingEvents,
      myAttendingEventIds: Array.from(attendanceMap.keys()),
      mySquadEventIds: Array.from(attendanceMap)
        .filter(([, st]) => st === 'looking_for_squad')
        .map(([id]) => id)
    });

    get().applyFilters({});
  },

    // Ya no mete a la persona directamente: le envía una invitación que tiene que aceptar
  addMemberToPrivateGroup: async (roomId, targetProfile) => {
    const { user, chatRooms } = get();
    if (!user || !roomId || !targetProfile) return;

    const room = (chatRooms || []).find((r) => r.id === roomId);
    const { data, error } = await supabase
      .from('group_invitations')
      .upsert(
        [{
          room_id: roomId,
          room_name: room?.name || 'Grupo privado',
          inviter_id: user.id,
          invitee_id: targetProfile.id,
          status: 'pending',
          created_at: new Date().toISOString(),
          responded_at: null
        }],
        { onConflict: 'room_id,invitee_id' }
      )
      .select()
      .single();

    if (error) {
      alert('No se pudo enviar la invitación: ' + error.message);
      return;
    }
    set((s) => ({
      sentGroupInvitations: [
        { ...data, invitee: targetProfile },
        ...s.sentGroupInvitations.filter((i) => !(i.room_id === roomId && String(i.invitee_id) === String(targetProfile.id)))
      ]
    }));
  },

  cancelGroupInvitation: async (invitationId) => {
    await supabase.from('group_invitations').delete().eq('id', invitationId);
    set((s) => ({ sentGroupInvitations: s.sentGroupInvitations.filter((i) => i.id !== invitationId) }));
  },

  // Aceptar (entras al grupo y se abre) o rechazar una invitación a un grupo privado
  respondToGroupInvitation: async (invitation, decision) => {
    const { user } = get();
    if (!user || !invitation) return;

    // Quitarla de la lista al momento (cuenta como leída)
    set((s) => ({ groupInvitations: s.groupInvitations.filter((i) => i.id !== invitation.id) }));

    const { error } = await supabase
      .from('group_invitations')
      .update({ status: decision, responded_at: new Date().toISOString() })
      .eq('id', invitation.id);
    if (error) {
      alert('No se pudo responder a la invitación: ' + error.message);
      await get().fetchSocialData();
      return;
    }
    if (decision !== 'accepted') return;

    await supabase
      .from('chat_participants')
      .insert([{ room_id: invitation.room_id, user_id: user.id, role: 'member' }]);

    await get().fetchSocialData();
    const room = get().chatRooms.find((r) => String(r.id) === String(invitation.room_id));
    if (room) await get().selectChatRoom(room);
    set({ isSocialDockOpen: true, unreadChatCount: 0 });
  },

  // Abrir el chat de alguien que ha aplicado a mi oferta (y marcar el aviso como leído)
  openCollabApplication: async (link) => {
    if (!link) return;
    set((s) => ({ collabApplications: s.collabApplications.filter((l) => l.id !== link.id) }));
    await supabase.from('collab_links').update({ creator_read: true }).eq('id', link.id);

    let room = get().chatRooms.find((r) => String(r.id) === String(link.room_id));
    if (!room) {
      await get().fetchSocialData();
      room = get().chatRooms.find((r) => String(r.id) === String(link.room_id));
    }
    if (room) await get().selectChatRoom(room);
    set({ isSocialDockOpen: true, isCollabOpen: false });
  },

  removeMemberFromPrivateGroup: async (roomId, targetUserId) => {
    const { user, chatRooms, activeRoom } = get();
    if (!user || !roomId || !targetUserId) return;

    const { error } = await supabase
      .from('chat_participants')
      .delete()
      .eq('room_id', roomId)
      .eq('user_id', targetUserId);

    // Sin invitación válida no puede volver a entrar por su cuenta
    await supabase.from('group_invitations').delete().eq('room_id', roomId).eq('invitee_id', targetUserId);

    if (!error) {
      const filterRoomParticipants = (r) => {
        if (r.id !== roomId) return r;
        return {
          ...r,
          participants: (r.participants || []).filter((p) => p.user_id !== targetUserId)
        };
      };

      set({
        chatRooms: chatRooms.map(filterRoomParticipants),
        activeRoom: activeRoom?.id === roomId ? filterRoomParticipants(activeRoom) : activeRoom
      });
    }
  },

  removeFriend: async (friendshipId, friendUserId) => {
    const { user, friends, chatRooms, activeRoom } = get();
    if (!user) return;

    await supabase.from('friendships').delete().eq('id', friendshipId);

    const dmRoomsToDelete = chatRooms.filter(
      (r) =>
        r.type === 'direct' &&
        (r.directFriend?.id === friendUserId ||
          r.participants?.some((p) => p.user_id === friendUserId))
    );

    for (const room of dmRoomsToDelete) {
      await supabase.from('chat_rooms').delete().eq('id', room.id);
    }

    const deletedRoomIds = new Set(dmRoomsToDelete.map((r) => r.id));

    set({
      friends: friends.filter((f) => f.id !== friendshipId),
      chatRooms: chatRooms.filter((r) => !deletedRoomIds.has(r.id)),
      activeRoom: activeRoom && deletedRoomIds.has(activeRoom.id) ? null : activeRoom,
      roomMessages: activeRoom && deletedRoomIds.has(activeRoom.id) ? [] : get().roomMessages
    });
  },

  searchProfilesAutocomplete: async (query) => {
    const { user } = get();
    if (!query || query.trim().length < 1) return [];
    const clean = query.replace('@', '').trim();
    let req = supabase
      .from('profiles')
      .select('id, username, avatar_url, role, city, favorite_subgenre')
      .ilike('username', `%${clean}%`)
      .limit(6);

    if (user?.id) req = req.neq('id', user.id);
    const { data } = await req;
    return data || [];
  },

  addFriendByUserId: async (targetUserId) => {
    const { user, friends } = get();
    if (!user) {
      set({ isAuthOpen: true });
      return false;
    }
    if (!targetUserId || targetUserId === user.id) return false;

    const existing = friends.find(
      (f) =>
        (f.requester_id === user.id && f.addressee_id === targetUserId) ||
        (f.requester_id === targetUserId && f.addressee_id === user.id)
    );
    if (existing) return true;

    const { data: friendship, error } = await supabase
      .from('friendships')
      .insert([{ requester_id: user.id, addressee_id: targetUserId, status: 'pending' }])
      .select('*, requester:profiles!requester_id(*), addressee:profiles!addressee_id(*)')
      .single();

    if (!error && friendship) {
      set({ friends: [...friends, friendship] });
      return true;
    }
    return false;
  },

  acceptFriendRequest: async (friendshipId) => {
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', friendshipId);
    if (!error) await get().fetchSocialData();
  },

  rejectFriendRequest: async (friendshipId) => {
    const { friends } = get();
    const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
    if (!error) set({ friends: friends.filter((f) => f.id !== friendshipId) });
  },

  openDirectMessageWithUser: async (targetUser) => {
    const { user, chatRooms } = get();
    if (!user) return set({ isAuthOpen: true });
    if (!targetUser) return;

    let existing = chatRooms.find(
      (r) =>
        r.type === 'direct' &&
        (r.directFriend?.id === targetUser.id ||
          r.participants?.some((p) => p.user_id === targetUser.id))
    );

    if (!existing) {
      const dmName = `@${user.username} & @${targetUser.username}`;
      const { data: created } = await supabase
        .from('chat_rooms')
        .insert([{ type: 'direct', name: dmName, created_by: user.id }])
        .select()
        .single();

      if (created) {
        await supabase.from('chat_participants').insert([
          { room_id: created.id, user_id: user.id, role: 'admin' },
          { room_id: created.id, user_id: targetUser.id, role: 'member' }
        ]);
        existing = { ...created, directFriend: targetUser };
        set({ chatRooms: [existing, ...chatRooms] });
      }
    } else if (!existing.directFriend) {
      existing.directFriend = targetUser;
    }

    if (existing) {
      await get().selectChatRoom(existing);
      set({ inspectedUser: null, isSocialDockOpen: true });
    }
  },

  createPrivateGroup: async (groupName) => {
    const { user, chatRooms } = get();
    if (!user || !groupName.trim()) return;

    const myGroups = (chatRooms || []).filter(
      (r) => r.type === 'private_group' && String(r.created_by) === String(user.id)
    ).length;
    const groupCheck = checkUserActionLimit(user, 'maxPrivateGroups', myGroups);
    if (!groupCheck.allowed) {
      if (groupCheck.requiresPro) get().triggerProLimit(groupCheck.message);
      else alert(groupCheck.message);
      return;
    }
    const { data: room } = await supabase
      .from('chat_rooms')
      .insert([{ type: 'private_group', name: groupName.trim(), created_by: user.id }])
      .select()
      .single();
    if (room) {
      await supabase.from('chat_participants').insert([{ room_id: room.id, user_id: user.id, role: 'admin' }]);
      const enrichedRoom = {
        ...room,
        participants: [{ user_id: user.id, role: 'admin', profile: user }]
      };
      set({ chatRooms: [enrichedRoom, ...chatRooms], activeRoom: enrichedRoom });
    }
  },

  uploadCustomDjAvatar: async (file) => {
    if (!file) return null;
    assertFileAllowed(get, get().user, file, 'image');
    const ext = file.name.split('.').pop();
    const fileName = `custom_dj_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('avatars').upload(fileName, file, { upsert: true });
    if (error) return null;
    return supabase.storage.from('avatars').getPublicUrl(fileName).data.publicUrl;
  },

  saveCommunityEvent: async (eventForm, files = {}, isEditMode = false) => {
    const { events, clubs, user, pickedCoords, editingEvent } = get();
    if (!user) throw new Error('Debes iniciar sesión para publicar o editar un evento.');

    if (!isEditMode) {
      assertActionAllowed(get, user, 'maxActiveEvents', get().getMyActiveEventsCount());
    }

    assertFileAllowed(get, user, files.imageFile, 'image');
    assertFileAllowed(get, user, files.videoFile, 'video');
    assertFileAllowed(get, user, files.audioFile, 'audio');

    let finalImageUrl = eventForm.image_url || 'https://images.unsplash.com/photo-1574169208507-84376144848b?auto=format&fit=crop&w=800&q=80';
    let finalVideoUrl = eventForm.video_url || 'https://assets.mixkit.co/videos/preview/mixkit-dj-playing-music-at-a-nightclub-43446-large.mp4';
    let finalAudioUrl = eventForm.audio_url || null;
    const storagePaths = [...(eventForm.media_storage_paths || [])];

    if (files.imageFile) {
      const fileName = `flyer_${Date.now()}.${files.imageFile.name.split('.').pop()}`;
      const { error } = await supabase.storage.from('flyers').upload(fileName, files.imageFile);
      if (!error) finalImageUrl = supabase.storage.from('flyers').getPublicUrl(fileName).data.publicUrl;
    }
    if (files.videoFile) {
      const videoPath = `video/user_${Date.now()}.${files.videoFile.name.split('.').pop()}`;
      const { error } = await supabase.storage.from(mediaBucketFor(user)).upload(videoPath, files.videoFile);
      if (!error) {
        storagePaths.push(videoPath);
        finalVideoUrl = supabase.storage.from(mediaBucketFor(user)).getPublicUrl(videoPath).data.publicUrl;
      }
    }
    if (files.audioFile) {
      const audioPath = `audio/user_${Date.now()}.${files.audioFile.name.split('.').pop()}`;
      const { error } = await supabase.storage.from(mediaBucketFor(user)).upload(audioPath, files.audioFile);
      if (!error) {
        storagePaths.push(audioPath);
        finalAudioUrl = supabase.storage.from(mediaBucketFor(user)).getPublicUrl(audioPath).data.publicUrl;
      }
    }

    const cleanTicketUrl =
      eventForm.ticket_url && eventForm.ticket_url.trim() !== '' && eventForm.ticket_url.trim() !== '#'
        ? eventForm.ticket_url.trim()
        : null;

    const hasClub = eventForm.has_club !== false;
    const matchedClub =
      hasClub &&
      ((eventForm.venue_id && clubs.find((c) => String(c.id) === String(eventForm.venue_id))) ||
        (user.role === 'Club' ? user : null) ||
        clubs.find((c) => c.username.toLowerCase() === (eventForm.venue_name || '').replace('@', '').trim().toLowerCase()));

    const effectiveCity = matchedClub?.city || eventForm.city || 'Madrid';
    const effectiveStreet = matchedClub ? (matchedClub.street_address || '') : (eventForm.street_address || '').trim();
    const realLat = matchedClub?.lat ? parseFloat(matchedClub.lat) : parseFloat(pickedCoords.lat);
    const realLng = matchedClub?.lng ? parseFloat(matchedClub.lng) : parseFloat(pickedCoords.lng);

    let approxLat = null;
    let approxLng = null;
    if (eventForm.is_secret_location) {
      const offset = generateOffsetSecretCoords(realLat, realLng);
      approxLat = offset.lat;
      approxLng = offset.lng;
    }

    const finalVenueName = matchedClub
      ? matchedClub.username
      : hasClub
      ? (eventForm.venue_name || '').trim() || effectiveStreet || 'Club'
      : effectiveStreet || 'Espacio Libre / Open Air';

    const promotersList = Array.isArray(eventForm.promoters_list) && eventForm.promoters_list.length > 0
      ? eventForm.promoters_list
      : [{ id: user.id, username: user.username || 'Colectivo', avatar_url: user.avatar_url || null, is_custom: false }];

    const promoterSummaryText = promotersList
      .map((p) => (p.is_custom ? p.username : `@${p.username}`))
      .join(', ');

    const basePayload = {
      name: eventForm.name.trim(),
      description: eventForm.description,
      promoter: promoterSummaryText,
      promoters_list: promotersList,
      created_by: user.id,
      venue_id: matchedClub ? matchedClub.id : null,
      venue_name: finalVenueName,
      street_address: effectiveStreet,
      start_time: (eventForm.start_time || '23:00').slice(0, 5),
      duration_hours: Number(eventForm.duration_hours) || 12,
      subgenre: eventForm.subgenre,
      image_url: finalImageUrl,
      video_url: finalVideoUrl,
      audio_url: finalAudioUrl,
      media_storage_paths: storagePaths,
      ticket_url: cleanTicketUrl,
      city: effectiveCity,
      lat: realLat,
      lng: realLng,
      is_secret_location: Boolean(eventForm.is_secret_location),
      is_invite_only: Boolean(eventForm.is_invite_only),
      secret_lat: approxLat,
      secret_lng: approxLng,
      lineup: Array.isArray(eventForm.lineup) ? eventForm.lineup : []
    };

    if (isEditMode && editingEvent) {
      const { data, error } = await supabase
        .from('events')
        .update({ ...basePayload, start_date: eventForm.start_date })
        .eq('id', editingEvent.id)
        .select('*, creator:profiles!created_by(id, username, avatar_url, role, is_pro), venue_profile:profiles!venue_id(*)')
        .single();

      if (error) throw new Error('Error al actualizar en Supabase: ' + error.message);

      if (eventForm.is_invite_only && Array.isArray(eventForm.invited_users_list) && eventForm.invited_users_list.length > 0 && data?.id) {
        await get().sendEventInvitationsToUsers(data.id, eventForm.invited_users_list);
      }

      const updatedList = events.map((e) => (e.id === editingEvent.id ? data : e));
      set({ events: updatedList, isAddEventOpen: false, editingEvent: null });
      get().applyFilters({});
      get().selectEvent(data);
    } else {
      const datesToInsert = eventForm.dates_array?.length > 0 ? eventForm.dates_array : [eventForm.start_date];
      const payloads = datesToInsert.map((date) => ({
        ...basePayload,
        external_id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        start_date: date,
        likes_count: 1
      }));

      const { data, error } = await supabase
        .from('events')
        .insert(payloads)
        .select('*, creator:profiles!created_by(id, username, avatar_url, role, is_pro), venue_profile:profiles!venue_id(*)');

      if (error) throw new Error('Error al guardar evento en Supabase: ' + error.message);

      if (eventForm.is_invite_only && Array.isArray(eventForm.invited_users_list) && eventForm.invited_users_list.length > 0) {
        for (const evObj of data || []) {
          if (evObj?.id) {
            await get().sendEventInvitationsToUsers(evObj.id, eventForm.invited_users_list);
          }
        }
      }

      const updatedList = [...(data || []), ...events];
      set({ events: updatedList, isAddEventOpen: false });
      get().applyFilters({});
      if (data?.[0]) get().selectEvent(data[0]);
    }
  },

  openEditEventModal: (event) => {
    const fallbackSecret = generateOffsetSecretCoords(event.lat, event.lng);
    set({
      editingEvent: event,
      isAddEventOpen: true,
      pickedCoords: { lat: event.lat, lng: event.lng },
      pickedSecretCoords: {
        lat: event.secret_lat || fallbackSecret.lat,
        lng: event.secret_lng || fallbackSecret.lng
      }
    });
  },

  toggleAttendance: async (type) => {
    const { selectedEvent, user, attendees, allAttendancesList, myAttendingEventIds, filteredClubs, clubs } = get();
    if (!user) return set({ isAuthOpen: true });
    if (!selectedEvent) return;

    const wasLockedSecretBefore = isEventLockedSecret(selectedEvent, myAttendingEventIds, user);

    const existing = attendees.find((a) => String(a.user_id) === String(user.id));
    const currentGoing = existing ? (existing.is_going ?? existing.status === 'going') : false;
    const currentSquad = existing ? (existing.looking_for_squad ?? existing.status === 'looking_for_squad') : false;

    const nextGoing = type === 'going' ? !currentGoing : currentGoing;
    const nextSquad = type === 'looking_for_squad' ? !currentSquad : currentSquad;

    if (!nextGoing && !nextSquad) {
      const nextAttendees = attendees.filter((a) => String(a.user_id) !== String(user.id));
      const nextGlobalAtt = allAttendancesList.filter(
        (a) => !(a.event_id === selectedEvent.id && String(a.user_id) === String(user.id))
      );

      set({ attendees: nextAttendees, allAttendancesList: nextGlobalAtt });
      await supabase
        .from('event_attendees')
        .delete()
        .eq('event_id', selectedEvent.id)
        .eq('user_id', user.id);

      await get().fetchSocialData();
      return;
    }

    const legacyStatus = nextSquad ? 'looking_for_squad' : 'going';
    const dbPayload = {
      event_id: selectedEvent.id,
      user_id: user.id,
      status: legacyStatus,
      is_going: nextGoing,
      looking_for_squad: nextSquad
    };

    const enrichedRecord = {
      ...dbPayload,
      profile: {
        id: user.id,
        username: user.username,
        avatar_url: user.avatar_url,
        role: user.role,
        city: user.city,
        favorite_subgenre: user.favorite_subgenre
      }
    };

    const updatedAttendees = [
      ...attendees.filter((a) => String(a.user_id) !== String(user.id)),
      enrichedRecord
    ];
    const updatedGlobalAtt = [
      ...allAttendancesList.filter((a) => !(a.event_id === selectedEvent.id && String(a.user_id) === String(user.id))),
      dbPayload
    ];

    set({ attendees: updatedAttendees, allAttendancesList: updatedGlobalAtt });
    await supabase.from('event_attendees').upsert(dbPayload);
    await get().fetchSocialData();

    if (wasLockedSecretBefore) {
      const linkedClub =
        (selectedEvent.venue_id &&
          ((filteredClubs || []).find((c) => String(c.id) === String(selectedEvent.venue_id)) ||
            (clubs || []).find((c) => String(c.id) === String(selectedEvent.venue_id)))) ||
        (selectedEvent.linked_club_id &&
          ((filteredClubs || []).find((c) => String(c.id) === String(selectedEvent.linked_club_id)) ||
            (clubs || []).find((c) => String(c.id) === String(selectedEvent.linked_club_id)))) ||
        (selectedEvent.venue_name &&
          ((filteredClubs || []).find(
            (c) => c.username?.trim().toLowerCase() === selectedEvent.venue_name.replace('@', '').trim().toLowerCase()
          ) ||
            (clubs || []).find(
              (c) => c.username?.trim().toLowerCase() === selectedEvent.venue_name.replace('@', '').trim().toLowerCase()
            )));

      if (linkedClub) {
        const refreshedClub =
          get().filteredClubs.find((c) => String(c.id) === String(linkedClub.id)) || linkedClub;
        set({
          selectedClub: refreshedClub,
          selectedClubEvents: refreshedClub.hosted_events || [selectedEvent],
          isClubInfoExpanded: false,
          selectedPromoter: null,
          selectedDj: null,
          selectedEvent: selectedEvent,
          selectedEventGroup: [selectedEvent],
          currentGroupIndex: 0
        });
      }
    }
  },

  setModal: (modalName, value) => {
    if (value === true && LOGIN_REQUIRED_MODALS.has(modalName) && !get().user) {
      set({ isAuthOpen: true });
      return;
    }
    if (modalName === 'isSocialDockOpen' && value === true) {
      set({ isSocialDockOpen: true, unreadChatCount: 0 });
    } else {
      set({ [modalName]: value });
    }
  },

  startPickingLocation: (target = 'event') => {
    if (target === 'profile') {
      set({ isPickingLocation: true, pickingTarget: 'profile', isProfileOpen: false, isProfileEditing: true });
    } else if (target === 'onboarding_dj') {
      set({ isPickingLocation: true, pickingTarget: 'onboarding_dj', isOnboardingOpen: false });
    } else {
      set({ isPickingLocation: true, pickingTarget: target, isAddEventOpen: false });
    }
  },

  cancelPickingLocation: () => {
    const { pickingTarget } = get();
    if (pickingTarget === 'profile') {
      set({ isPickingLocation: false, isProfileOpen: true, isProfileEditing: true });
    } else if (pickingTarget === 'onboarding_dj') {
      set({ isPickingLocation: false });
    } else {
      set({ isPickingLocation: false, isAddEventOpen: true });
    }
  },

  finishPickingLocation: async (lat, lng) => {
    const { pickingTarget, user } = get();
    const coords = { lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)) };

    if (pickingTarget === 'onboarding_dj') {
      set({ pickedProfileCoords: coords, isPickingLocation: false });
      if (user) {
        const { data: updated } = await supabase
          .from('profiles')
          .update({ lat: coords.lat, lng: coords.lng, onboarding_completed: true })
          .eq('id', user.id)
          .select()
          .single();
        if (updated) set({ user: updated });
        await Promise.all([get().fetchDjs(), get().fetchClubs()]);
      }
    } else if (pickingTarget === 'profile') {
      set({
        pickedProfileCoords: coords,
        isPickingLocation: false,
        isProfileOpen: true,
        isProfileEditing: true
      });
    } else {
      set({
        pickedCoords: coords,
        isPickingLocation: false,
        isAddEventOpen: true
      });
    }
  }
}));
