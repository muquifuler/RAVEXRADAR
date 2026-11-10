// Botón "atrás" del móvil (y del navegador): si hay algo abierto (un panel,
// una ventana, el visor de fotos…) lo cierra en vez de salir de la web.
//
// Cómo funciona: cuando se abre algo, se añade UNA entrada al historial. Al
// pulsar atrás, el navegador la quita y aquí se cierra lo que esté "encima".
// Si se cierra con la X, se quita esa entrada sin que se note.
// ============================================================================

// De lo que está más encima a lo que está más abajo
const OVERLAYS = [
  { open: (s) => s.isLightboxOpen, close: (s) => s.closeMediaLightbox() },
  { open: (s) => Boolean(s.inspectedUser), close: (s) => s.closeInspectUser() },
  { open: (s) => Boolean(s.attendeesModalFilter), close: (s) => s.setAttendeesModalFilter(null) },
  { open: (s) => s.isProModalOpen, close: (s) => s.setModal('isProModalOpen', false) },
  { open: (s) => s.isAuthOpen, close: (s) => s.setModal('isAuthOpen', false) },
  { open: (s) => s.isSupportOpen, close: (s) => s.setModal('isSupportOpen', false) },
  { open: (s) => s.isStudioOpen, close: (s) => s.setModal('isStudioOpen', false) },
  { open: (s) => s.isRankingOpen, close: (s) => s.setModal('isRankingOpen', false) },
  { open: (s) => s.isCollabOpen, close: (s) => s.setModal('isCollabOpen', false) },
  { open: (s) => s.isManageEventsOpen, close: (s) => s.setModal('isManageEventsOpen', false) },
  {
    open: (s) => s.isAddEventOpen,
    close: (_s, store) => store.setState({ isAddEventOpen: false, editingEvent: null })
  },
  {
    open: (s) => s.isProfileOpen,
    close: (_s, store) => store.setState({ isProfileOpen: false, isProfileEditing: false })
  },
  { open: (s) => s.isSocialDockOpen, close: (s) => s.setModal('isSocialDockOpen', false) },
  { open: (s) => s.isPickingLocation, close: (s) => s.cancelPickingLocation() },
  // Paneles ampliados dentro de un panel (chat, sesiones, info…)
  { open: (s) => s.isEventChatExpanded, close: (_s, store) => store.setState({ isEventChatExpanded: false }) },
  { open: (s) => s.isDjMediaExpanded, close: (_s, store) => store.setState({ isDjMediaExpanded: false }) },
  { open: (s) => s.isClubInfoExpanded, close: (_s, store) => store.setState({ isClubInfoExpanded: false }) },
  { open: (s) => s.isPromoterInfoExpanded, close: (_s, store) => store.setState({ isPromoterInfoExpanded: false }) },
  // Paneles (la fiesta va delante del club/promotor que la abre)
  { open: (s) => Boolean(s.selectedEvent), close: (s) => s.selectEventGroup([], 0) },
  { open: (s) => Boolean(s.selectedDj), close: (s) => s.selectDj(null) },
  { open: (s) => Boolean(s.selectedPromoter), close: (s) => s.selectPromoter(null) },
  { open: (s) => Boolean(s.selectedClub), close: (s) => s.selectClub(null) }
];

let installed = false;

export function installBackButton(store) {
  if (installed || typeof window === 'undefined' || !window.history?.pushState) return;
  installed = true;

  let armed = false; // hay una entrada nuestra en el historial
  let skipPops = 0; // "atrás" lanzados por nosotros al cerrar con la X

  const anyOpen = () => {
    const s = store.getState();
    return OVERLAYS.some((o) => o.open(s));
  };

  const sync = () => {
    const open = anyOpen();
    if (open && !armed) {
      window.history.pushState({ ...(window.history.state || {}), rrOverlay: true }, '');
      armed = true;
    } else if (!open && armed) {
      // Se cerró con la X: quitamos nuestra entrada sin cerrar nada más
      armed = false;
      skipPops += 1;
      window.history.back();
    }
  };

  store.subscribe(sync);

  window.addEventListener('popstate', () => {
    if (skipPops > 0) {
      skipPops -= 1;
      return;
    }
    if (!armed) return; // atrás normal (no había nada abierto)
    armed = false;
    const s = store.getState();
    const top = OVERLAYS.find((o) => o.open(s));
    if (top) top.close(s, store);
    // Si queda algo abierto debajo, se vuelve a preparar otra entrada
    window.setTimeout(sync, 0);
  });

  sync();
}
