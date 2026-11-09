// src/App.jsx
import React, { useEffect, useRef, useState } from 'react';
import { Zap, Headphones, Building2, Crosshair, X, Check, Layers, Disc } from 'lucide-react';
import { useRaveStore } from './store/useRaveStore';
import { translations } from './i18n/translations';
import { Navbar } from './components/Navbar/Navbar';
import { TopEventsWidget } from './components/TopEventsWidget/TopEventsWidget';
import { FriendsGoingWidget } from './components/TopEventsWidget/FriendsGoingWidget';
import { RaveMap } from './components/Map/RaveMap';
import { EventAttendeesModal } from './components/EventAttendeesModal/EventAttendeesModal';
import { EventDrawer } from './components/EventDrawer/EventDrawer';
import { ArtistDrawer } from './components/ArtistDrawer/ArtistDrawer';
import { ClubDrawer } from './components/ClubDrawer/ClubDrawer';
import { ManageEventsModal } from './components/ManageEventsModal/ManageEventsModal';
import { PromoterDrawer } from './components/PromoterDrawer/PromoterDrawer';
import { SocialDock } from './components/SocialDock/SocialDock';
import { AddEventModal } from './components/AddEventModal/AddEventModal';
import { MediaLightboxModal } from './components/MediaLightboxModal/MediaLightboxModal';
import { ProfileModal } from './components/ProfileModal/ProfileModal';
import { RankingModal } from './components/RankingModal/RankingModal';
import { UserInspectModal } from './components/UserInspectModal/UserInspectModal';
import { AuthModal } from './components/AuthModal/AuthModal';
import { OnboardingModal } from './components/OnboardingModal/OnboardingModal';
import { CollabModal } from './components/CollabModal/CollabModal';
import { SupportModal } from './components/SupportModal/SupportModal';
import { ProUpgradeModal } from './components/ProUpgradeModal/ProUpgradeModal';
import { AdminPanel } from './components/AdminPanel/AdminPanel';
import { ContentStudio } from './components/ContentStudio/ContentStudio';
import { InstallAppPrompt } from './components/ui/InstallAppPrompt';
import { readSharedTarget, openSharedTarget, clearSharedParam } from './lib/shareLinks';
import { installBackButton } from './lib/backButton';
import { installPanelAudioGuard } from './lib/mediaSync';
import './App.css';

export default function App() {
  const {
    lang, fetchEvents, fetchDjs, fetchClubs, initAuth,
    isPickingLocation, pickingTarget, cancelPickingLocation,
    mapLayers, toggleMapLayer, filteredEvents, filteredDjs, filteredClubs,
    myAttendingEventIds, filteredPromoters
  } = useRaveStore();

  const [isAdminRoute, setIsAdminRoute] = useState(
    window.location.pathname === '/admin'
  );

  const t = translations[lang];

  // Título de la pestaña según lo que tengas abierto (se ve al compartir y en el historial)
  const seoEvent = useRaveStore((s) => s.selectedEvent);
  const seoDj = useRaveStore((s) => s.selectedDj);
  const seoClub = useRaveStore((s) => s.selectedClub);
  const seoPromoter = useRaveStore((s) => s.selectedPromoter);
  useEffect(() => {
    const name =
      seoEvent?.name ||
      (seoDj && `@${seoDj.username} · DJ`) ||
      (seoClub && `${seoClub.username} · Club`) ||
      (seoPromoter && `${seoPromoter.username} · Promotor`);
    document.title = name ? `${name} · RAVEXRADAR` : 'RAVEXRADAR · Mapa de raves y fiestas techno en España';
  }, [seoEvent?.name, seoDj?.username, seoClub?.username, seoPromoter?.username]);

  // Botón atrás del móvil: cierra el panel/ventana abierto en vez de salir de la web
  useEffect(() => {
    installBackButton(useRaveStore);
    installPanelAudioGuard(useRaveStore); // al abrir el estudio o una ventana, se calla la música de fondo
  }, []);

  // Enlace compartido (?fiesta=…, ?dj=…, ?club=…, ?promotor=…): abre ese panel
  // en cuanto estén cargados los datos. Si a los 10 s no aparece, se olvida.
  const sharedTargetRef = useRef(readSharedTarget());
  const loadedEvents = useRaveStore((s) => s.events);
  const loadedDjs = useRaveStore((s) => s.djs);
  const loadedClubs = useRaveStore((s) => s.clubs);
  const loadedPromoters = useRaveStore((s) => s.promoters);
  useEffect(() => {
    if (!sharedTargetRef.current) return;
    if (openSharedTarget(sharedTargetRef.current, useRaveStore.getState())) {
      sharedTargetRef.current = null;
      clearSharedParam();
    }
  }, [loadedEvents, loadedDjs, loadedClubs, loadedPromoters]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (sharedTargetRef.current) {
        sharedTargetRef.current = null;
        clearSharedParam();
      }
    }, 10000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    initAuth();
    fetchEvents();
    fetchDjs();
    fetchClubs();

    const handlePopState = () => {
      setIsAdminRoute(window.location.pathname === '/admin');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [initAuth, fetchEvents, fetchDjs, fetchClubs]);

  const openAdminView = () => {
    window.history.pushState({}, '', '/admin');
    setIsAdminRoute(true);
  };

  const exitAdminView = () => {
    window.history.pushState({}, '', '/');
    setIsAdminRoute(false);
  };

  if (isAdminRoute) {
    return <AdminPanel onExitAdmin={exitAdminView} />;
  }

  const independentEventsCount = (filteredEvents || []).filter(
    (ev) => !ev.linked_club_id || (ev.is_secret_location && !myAttendingEventIds.includes(ev.id))
  ).length;

  const getPickingLabel = () => {
    if (pickingTarget === 'onboarding_dj' || pickingTarget === 'profile') {
      return 'MODO SELECCIÓN: Haz clic en el punto del mapa donde quieres que aparezca tu icono';
    }
    return 'MODO SELECCIÓN DE EVENTO: Haz clic en el punto exacto del mapa donde se celebrará la fiesta';
  };

  return (
    <main className={`app-shell ${isPickingLocation ? 'picking-mode-active' : ''}`}>
      <Navbar onOpenAdmin={openAdminView} />
      <div className="map-top-widgets">
        <TopEventsWidget />
        <FriendsGoingWidget />
      </div>

      {isPickingLocation && (
        <>
          <div className="map-picking-frame-overlay" />
          <div className="picking-hud-banner">
            <Crosshair size={20} className="picking-spin-icon" />
            <div className="picking-hud-text">
              <strong>SELECCIONA UN LUGAR EN EL MAPA</strong>
              <span>{getPickingLabel()}</span>
            </div>
            {pickingTarget !== 'onboarding_dj' && (
              <button
                type="button"
                className="btn-cancel-picking"
                onClick={cancelPickingLocation}
              >
                <X size={15} /> Cancelar
              </button>
            )}
          </div>
        </>
      )}

      {/* PUNTO 1: Panel HUD Profesional de Capas del Mapa en Columna (Abajo a la Izquierda) */}
      <div className="bottom-left-controls">
        <div className="radar-layers-hud">
          <div className="radar-layers-header">
            <Layers size={13} className="icon-neon" />
            <span>{lang === 'es' ? 'FILTRO DE CAPAS' : 'RADAR LAYERS'}</span>
          </div>

          <label className={`hud-layer-card ${mapLayers.events ? 'active-events' : ''}`}>
            <input
              type="checkbox"
              checked={mapLayers.events}
              onChange={() => toggleMapLayer('events')}
            />
            <div className="hud-layer-icon-box events">
              <Zap size={14} />
            </div>
            <div className="hud-layer-info">
              <strong>{t.layerEvents}</strong>
                <em className="hud-layer-short">{lang === 'es' ? 'Fiestas' : 'Events'}</em>
              <span>{independentEventsCount} en radar</span>
            </div>
            <span className="hud-layer-check">
              {mapLayers.events && <Check size={12} strokeWidth={3} />}
            </span>
          </label>

          <label className={`hud-layer-card ${mapLayers.djs ? 'active-djs' : ''}`}>
            <input
              type="checkbox"
              checked={mapLayers.djs}
              onChange={() => toggleMapLayer('djs')}
            />
            <div className="hud-layer-icon-box djs">
              <Headphones size={14} />
            </div>
            <div className="hud-layer-info">
              <strong>{t.layerDjs}</strong>
              <em className="hud-layer-short">DJs</em>
              <span>{(filteredDjs || []).length} activos</span>
            </div>
            <span className="hud-layer-check">
              {mapLayers.djs && <Check size={12} strokeWidth={3} />}
            </span>
          </label>

          <label className={`hud-layer-card ${mapLayers.promoters ? 'active-promoters' : ''}`}>
            <input
              type="checkbox"
              checked={mapLayers.promoters}
              onChange={() => toggleMapLayer('promoters')}
            />
            <div className="hud-layer-icon-box promoters">
              <Disc size={14} />
            </div>
            <div className="hud-layer-info">
              <strong>{lang === 'es' ? 'Promotores' : 'Promoters'}</strong>
              <em className="hud-layer-short">{lang === 'es' ? 'Promos' : 'Promoters'}</em>
              <span>{(filteredPromoters || []).length} colectivos</span>
            </div>
            <span className="hud-layer-check">
              {mapLayers.promoters && <Check size={12} strokeWidth={3} />}
            </span>
          </label>

          <label className={`hud-layer-card ${mapLayers.clubs ? 'active-clubs' : ''}`}>
            <input
              type="checkbox"
              checked={mapLayers.clubs}
              onChange={() => toggleMapLayer('clubs')}
            />
            <div className="hud-layer-icon-box clubs">
              <Building2 size={14} />
            </div>
            <div className="hud-layer-info">
              <strong>{t.layerClubs}</strong>
              <em className="hud-layer-short">Clubs</em>
              <span>{(filteredClubs || []).length} salas</span>
            </div>
            <span className="hud-layer-check">
              {mapLayers.clubs && <Check size={12} strokeWidth={3} />}
            </span>
          </label>
        </div>
      </div>

      <RaveMap />

      {/* PUNTO 3: Contenedor en cascada de derecha a izquierda: [Chat Evento] <- [Evento] <- [Club] */}
      <div className="drawers-cascade-dock">
        <EventDrawer />
        <ArtistDrawer />
        <ClubDrawer />
        <PromoterDrawer />
      </div>

      <SocialDock />
      <InstallAppPrompt lang={lang} />
      <AddEventModal />
      <ProfileModal />
      <RankingModal />
      <UserInspectModal />
      <AuthModal />
      <OnboardingModal />
      <SupportModal />
      <ContentStudio />
      <ProUpgradeModal />
      <MediaLightboxModal />
      <EventAttendeesModal />
      <CollabModal />
      <ManageEventsModal/>
    </main>
  );
}
