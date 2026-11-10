// src/components/Map/RaveMap.jsx
import React, { memo, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './RaveMap.css';
import { useRaveStore, isEventLockedSecret } from '../../store/useRaveStore';
import { SPAIN_LOCATIONS } from '../../constants/spainLocations';
import { MapMarkerEngine, MAP_PERF } from './mapMarkerEngine';
import { readSharedTarget } from '../../lib/shareLinks';

// Zoom a partir del cual los pins ya no se agrupan: al abrir algo, acercamos hasta aquí
const UNCLUSTER_ZOOM = MAP_PERF.CLUSTER_UNTIL_ZOOM + 1;
const MADRID_CENTER = [40.4238, -3.7058];
const INTRO_ZOOM = UNCLUSTER_ZOOM;

// Mapa base (el mismo para pintar y para precargar)
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_SUBDOMAINS = 'abc';

// Precarga las teselas del mapa de la vista a la que vamos a volar, para que al
// llegar no se vea borroso. Usa la misma URL que Leaflet → se sirven de la caché.
function prefetchTiles(map, center, zoom) {
  try {
    const size = map.getSize();
    if (!size.x || !size.y) return;
    const c = map.project(center, zoom);
    const half = size.divideBy(2);
    const min = c.subtract(half).divideBy(256).floor();
    const max = c.add(half).divideBy(256).floor();
    const n = 2 ** zoom;
    for (let x = min.x - 1; x <= max.x + 1; x++) {
      for (let y = min.y - 1; y <= max.y + 1; y++) {
        if (y < 0 || y >= n) continue;
        const wx = ((x % n) + n) % n;
        const s = TILE_SUBDOMAINS[Math.abs(wx + y) % TILE_SUBDOMAINS.length];
        const img = new Image();
        img.src = TILE_URL.replace('{s}', s).replace('{z}', zoom).replace('{x}', wx).replace('{y}', y);
      }
    }
  } catch {
    /* si falla la precarga no pasa nada: el mapa carga normal */
  }
}

// memo: aunque App se re-renderice por cualquier cambio de la store, el mapa no.
export const RaveMap = memo(function RaveMap() {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const engineRef = useRef(null);
  const hasCenteredUserCityRef = useRef(false);
  const skipIntroRef = useRef(false); // el usuario tiene otra ciudad: no se vuela a Madrid

  // Suscripciones finas: el mapa solo se entera de lo que pinta.
  // (Antes useRaveStore() sin selector → re-render con CUALQUIER cambio de la app.)
  const filteredEvents = useRaveStore((s) => s.filteredEvents);
  const filteredDjs = useRaveStore((s) => s.filteredDjs);
  const filteredClubs = useRaveStore((s) => s.filteredClubs);
  const filteredPromoters = useRaveStore((s) => s.filteredPromoters);
  const mapLayers = useRaveStore((s) => s.mapLayers);
  const myAttendingEventIds = useRaveStore((s) => s.myAttendingEventIds);
  const myAcceptedInviteEventIds = useRaveStore((s) => s.myAcceptedInviteEventIds);
  const user = useRaveStore((s) => s.user);
  const focusMyPinTrigger = useRaveStore((s) => s.focusMyPinTrigger);
  const isPickingLocation = useRaveStore((s) => s.isPickingLocation);

  const selectedEvent = useRaveStore((s) => s.selectedEvent);
  const selectedDj = useRaveStore((s) => s.selectedDj);
  const selectedClub = useRaveStore((s) => s.selectedClub);
  const selectedPromoter = useRaveStore((s) => s.selectedPromoter);

  const selectEventGroup = useRaveStore((s) => s.selectEventGroup);
  const selectDj = useRaveStore((s) => s.selectDj);
  const selectClub = useRaveStore((s) => s.selectClub);
  const selectPromoter = useRaveStore((s) => s.selectPromoter);
  const finishPickingLocation = useRaveStore((s) => s.finishPickingLocation);
  const mySquadEventIds = useRaveStore((s) => s.mySquadEventIds);
  // Vista a la que vuela la cámara al entrar: se precargan sus teselas y pins
  const introTargetRef = useRef(null);

  // 1. Crear mapa + motor de marcadores (una sola vez)
  useEffect(() => {
    if (mapInstanceRef.current) return;
    const map = L.map(mapRef.current, {
      zoomControl: false,
      preferCanvas: true // círculos y vectores en canvas en vez de SVG
    }).setView([40.4168, -3.7038], 6);

    L.tileLayer(TILE_URL, {
      subdomains: TILE_SUBDOMAINS,
      maxZoom: 19,
      updateWhenZooming: false, // no pide tiles en cada frame del pinch-zoom
      keepBuffer: 3 // conserva tiles alrededor → pan más fluido
    }).addTo(map);

    mapInstanceRef.current = map;
    engineRef.current = new MapMarkerEngine(map);

    // Vuelo de entrada a Madrid (no si se entra con un enlace compartido: ese
    // panel ya mueve el mapa a su sitio)
    let introTimer = null;
    if (!readSharedTarget()) {
      introTargetRef.current = { center: MADRID_CENTER, zoom: INTRO_ZOOM };
      prefetchTiles(map, MADRID_CENTER, INTRO_ZOOM);
      introTimer = setTimeout(() => {
        if (!mapInstanceRef.current || skipIntroRef.current) return;
        map.flyTo(MADRID_CENTER, INTRO_ZOOM, { duration: 2.4, easeLinearity: 0.2 });
      }, 450);
    }

    return () => {
      clearTimeout(introTimer);
      engineRef.current?.destroy();
      engineRef.current = null;
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // 2. Acciones al pulsar un pin
  useEffect(() => {
    engineRef.current?.setHandlers({
      onSelectEventGroup: selectEventGroup,
      onSelectDj: selectDj,
      onSelectClub: selectClub,
      onSelectPromoter: selectPromoter
    });
  }, [selectEventGroup, selectDj, selectClub, selectPromoter]);

  // 3. Datos → el motor solo reconstruye la capa que haya cambiado y hace diff del DOM
  useEffect(() => {
    engineRef.current?.setData({
      events: filteredEvents,
      djs: filteredDjs,
      clubs: filteredClubs,
      promoters: filteredPromoters,
            myAttendingEventIds,
      myAcceptedInviteEventIds,
      mySquadEventIds,
      user
    });
    // Mientras se entra, precarga las imágenes de los pins de la vista de llegada
    const target = introTargetRef.current;
    if (target) engineRef.current?.prefetchView(target.center, target.zoom);
  }, [
    filteredEvents, filteredDjs, filteredClubs, filteredPromoters,
    myAttendingEventIds, myAcceptedInviteEventIds, mySquadEventIds, user
  ]);

  // La precarga de la llegada solo tiene sentido los primeros segundos
  useEffect(() => {
    const t = setTimeout(() => {
      introTargetRef.current = null;
    }, 8000);
    return () => clearTimeout(t);
  }, []);

  // 4. Capas visibles
  useEffect(() => {
    engineRef.current?.setLayers(mapLayers);
  }, [mapLayers]);

  // 5. Selección → solo se actualizan los 2 pins afectados
  useEffect(() => {
    engineRef.current?.setSelection({
      eventId: selectedEvent?.id ?? null,
      djId: selectedDj?.id ?? null,
      clubId: selectedClub?.id ?? null,
      promoterId: selectedPromoter?.id ?? null
    });
  }, [selectedEvent?.id, selectedDj?.id, selectedClub?.id, selectedPromoter?.id]);

  // ---- Movimientos de cámara (misma lógica que antes, dependencias corregidas) ----
  useEffect(() => {
    if (!mapInstanceRef.current || hasCenteredUserCityRef.current) return;
    if (user?.city) {
      const foundProv = SPAIN_LOCATIONS.find((c) => c.value === user.city);
      if (foundProv) {
        hasCenteredUserCityRef.current = true;
        // Madrid ya lo hace el vuelo de entrada; otras ciudades, al mismo zoom
        if (foundProv.value !== 'Madrid') {
          skipIntroRef.current = true;
          const target = [foundProv.lat, foundProv.lng];
          introTargetRef.current = { center: target, zoom: INTRO_ZOOM };
          prefetchTiles(mapInstanceRef.current, target, INTRO_ZOOM);
          engineRef.current?.prefetchView(target, INTRO_ZOOM);
          mapInstanceRef.current.flyTo([foundProv.lat, foundProv.lng], INTRO_ZOOM, { duration: 1.6 });
        }
      }
    }
  }, [user?.city]);

  useEffect(() => {
    if (!focusMyPinTrigger || !mapInstanceRef.current || !user?.lat || !user?.lng) return;
    const currentZoom = mapInstanceRef.current.getZoom();
    mapInstanceRef.current.flyTo([user.lat, user.lng], Math.max(currentZoom, 15), { duration: 1.0 });
  }, [focusMyPinTrigger, user?.lat, user?.lng]);

  useEffect(() => {
    if (selectedEvent && mapInstanceRef.current) {
      const isLockedSecret = isEventLockedSecret(selectedEvent, myAttendingEventIds, user);
      const rawLat = isLockedSecret
        ? (selectedEvent.secret_lat ?? (Number(selectedEvent.lat) + 0.007))
        : selectedEvent.lat;
      const rawLng = isLockedSecret
        ? (selectedEvent.secret_lng ?? (Number(selectedEvent.lng) + 0.007))
        : selectedEvent.lng;

      const targetLat = Number(rawLat);
      const targetLng = Number(rawLng);
      if (!Number.isFinite(targetLat) || !Number.isFinite(targetLng)) return;

      const nextZoom = Math.max(mapInstanceRef.current.getZoom(), UNCLUSTER_ZOOM);
      mapInstanceRef.current.flyTo([targetLat, targetLng], nextZoom, { duration: 1.0 });
    }
    // user?.id en vez de user: antes cualquier cambio del perfil relanzaba el flyTo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEvent?.id, myAttendingEventIds.length, user?.id]);

  useEffect(() => {
    if (selectedDj && selectedDj.lat && mapInstanceRef.current) {
      const nextZoom = Math.max(mapInstanceRef.current.getZoom(), UNCLUSTER_ZOOM);
      mapInstanceRef.current.flyTo([selectedDj.lat, selectedDj.lng], nextZoom, { duration: 1.0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDj?.id]);

  useEffect(() => {
    if (selectedClub && selectedClub.lat && mapInstanceRef.current) {
      const nextZoom = Math.max(mapInstanceRef.current.getZoom(), UNCLUSTER_ZOOM);
      mapInstanceRef.current.flyTo([selectedClub.lat, selectedClub.lng], nextZoom, { duration: 1.0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClub?.id]);

  useEffect(() => {
    if (selectedPromoter && selectedPromoter.lat && mapInstanceRef.current) {
      const nextZoom = Math.max(mapInstanceRef.current.getZoom(), UNCLUSTER_ZOOM);
      mapInstanceRef.current.flyTo([selectedPromoter.lat, selectedPromoter.lng], nextZoom, { duration: 1.0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPromoter?.id]);

  // Modo selección de ubicación
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const handleMapClick = (e) => {
      if (isPickingLocation) finishPickingLocation(e.latlng.lat, e.latlng.lng);
    };
    map.on('click', handleMapClick);
    return () => map.off('click', handleMapClick);
  }, [isPickingLocation, finishPickingLocation]);

  return <div ref={mapRef} className="rave-map-container" />;
});