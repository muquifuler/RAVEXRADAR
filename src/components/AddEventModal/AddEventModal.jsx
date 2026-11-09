// src/components/AddEventModal/AddEventModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import {
  X, MapPin, Image, Video, Music, Rocket, Lock, SlidersHorizontal,
  Search, Plus, Clock, Headphones, UserPlus, Trash2, Disc,
  CheckCircle2, Layers, Building2
} from 'lucide-react';
import { useRaveStore } from '../../store/useRaveStore';
import { EmojiPicker } from '../ui/EmojiPicker';
import { getLimitValue, checkUserActionLimit, PRO_FEATURES_ENABLED } from '../../constants/proConfig';
import { SPAIN_LOCATIONS } from '../../constants/spainLocations';
import { ELECTRONIC_GENRE_OPTIONS } from '../../constants/electronicGenres';
import { ProSelect } from '../ui/ProSelect';
import './AddEventModal.css';

export const AddEventModal = () => {
  const {
    isAddEventOpen, setModal, saveCommunityEvent, uploadCustomDjAvatar,
    pickedCoords, startPickingLocation, editingEvent,
    user, djs, clubs, promoters, searchProfilesAutocomplete
  } = useRaveStore();

  const [imageFile, setImageFile] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [audioFile, setAudioFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const descriptionRef = useRef(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Buscador de Calle y Número exacto
  const [streetInputFocused, setStreetInputFocused] = useState(false);
  const [locationResults, setLocationResults] = useState([]);
  const [isSearchingStreet, setIsSearchingStreet] = useState(false);
  const [autoUpdatedStreetNotice, setAutoUpdatedStreetNotice] = useState('');
  const searchDebounceRef = useRef(null);

  // Selector de Club / Sala registrado
  const [showClubDropdown, setShowClubDropdown] = useState(false);

  // PUNTO 2: Selector de Promotor(es) (Registrados o Externos)
  const [promoterQuery, setPromoterQuery] = useState('');
  const [showPromoterDropdown, setShowPromoterDropdown] = useState(false);

  // Gestión de Escenarios
  const [stages, setStages] = useState(['Main Stage']);
  const [activeStage, setActiveStage] = useState('Main Stage');
  const [showStageAdder, setShowStageAdder] = useState(false);
  const [newStageName, setNewStageName] = useState('');

  // Buscador de DJs para el Lineup
  const [djSearchQuery, setDjSearchQuery] = useState('');
  const [isDjDropdownOpen, setIsDjDropdownOpen] = useState(false);
  const [selectedPlatformDj, setSelectedPlatformDj] = useState(null);
  const [slotSetTime, setSlotSetTime] = useState('01:00 - 03:00');
  const [isCreatingCustomDj, setIsCreatingCustomDj] = useState(false);
  const [customDjName, setCustomDjName] = useState('');
  const [customDjAvatarFile, setCustomDjAvatarFile] = useState(null);
  const [isUploadingDjPhoto, setIsUploadingDjPhoto] = useState(false);

  const [inviteUserQuery, setInviteUserQuery] = useState('');
  const [inviteUserSuggestions, setInviteUserSuggestions] = useState([]);

  const todayStr = new Date().toISOString().split('T')[0];

  const isCreatorPromoter = user?.role === 'Promotor';
  const isCreatorClub = user?.role === 'Club';

  const [form, setForm] = useState({
    name: '',
    subgenre: 'Hard Techno',
    start_date: todayStr,
    dates_array: [],
    start_time: '23:59',
    duration_hours: 12,
    promoters_list: [],
    has_club: true,
    venue_name: '',
    venue_id: null,
    street_address: '',
    city: 'Madrid',
    ticket_url: '',
    description: '',
    is_secret_location: false,
    lineup: [],
    is_invite_only: false,
    invited_users_list: [],
  });

  // Límite de fiestas activas según el plan (FREE / PRO), sin depender de los filtros del mapa
  const myActiveEventsCount = user ? useRaveStore.getState().getMyActiveEventsCount() : 0;
  const maxActiveEvents = getLimitValue(user, 'maxActiveEvents');
  const hasReachedLimit = myActiveEventsCount >= maxActiveEvents;
  const maxStagesPerEvent = getLimitValue(user, 'maxStagesPerEvent');

  useEffect(() => {
    setErrorMsg('');
    setAutoUpdatedStreetNotice('');
    if (!isAddEventOpen || !user) return;

    // PUNTO 2.2: Si el creador es Promotor, siempre debe estar él mismo en promoters_list con locked: true
    const lockedSelfPromoter = isCreatorPromoter
      ? {
          id: user.id,
          username: user.username,
          avatar_url: user.avatar_url || null,
          is_custom: false,
          locked: true
        }
      : null;

    if (editingEvent) {
      const existingLineup = Array.isArray(editingEvent.lineup) ? editingEvent.lineup : [];
      const extractedStages = [
        ...new Set(existingLineup.map((s) => s.stage || s.stage_or_genre || 'Main Stage'))
      ];
      const nextStages = extractedStages.length > 0 ? extractedStages : ['Main Stage'];

      let initialPromoters = Array.isArray(editingEvent.promoters_list) && editingEvent.promoters_list.length > 0
        ? editingEvent.promoters_list.map((p) => ({
            ...p,
            locked: isCreatorPromoter && p.id && String(p.id) === String(user.id)
          }))
        : [];

      if (lockedSelfPromoter && !initialPromoters.some((p) => String(p.id) === String(user.id))) {
        initialPromoters = [lockedSelfPromoter, ...initialPromoters];
      }

      setStages(nextStages);
      setActiveStage(nextStages[0]);
      setForm({
        ...editingEvent,
        promoters_list: initialPromoters,
        has_club: isCreatorClub ? true : editingEvent.venue_name !== 'Espacio Libre / Open Air',
        venue_id: isCreatorClub ? user.id : (editingEvent.venue_id || null),
        venue_name: isCreatorClub
          ? user.username
          : editingEvent.venue_name === 'Espacio Libre / Open Air'
          ? ''
          : (editingEvent.venue_name || ''),
        street_address: isCreatorClub ? (user.street_address || '') : (editingEvent.street_address || ''),
        city: isCreatorClub
          ? (user.city || 'Madrid')
          : SPAIN_LOCATIONS.some((c) => c.value === editingEvent.city)
          ? editingEvent.city
          : 'Madrid',
        start_date: editingEvent.start_date || todayStr,
        start_time: (editingEvent.start_time || '23:59').slice(0, 5),
        duration_hours: editingEvent.duration_hours || 12,
        dates_array: editingEvent.all_dates || [],
        lineup: existingLineup,
        ticket_url:
          editingEvent.ticket_url && editingEvent.ticket_url !== '#'
            ? editingEvent.ticket_url
            : '',
        is_invite_only: Boolean(editingEvent.is_invite_only), 
        invited_users_list: []
      });

      if (isCreatorClub && user.lat && user.lng) {
        useRaveStore.setState({
          pickedCoords: { lat: parseFloat(user.lat), lng: parseFloat(user.lng) }
        });
      }

      setImageFile(null);
      setVideoFile(null);
      setAudioFile(null);
    } else if (form.name === '') {
      // PUNTO 2.2 y 2.3: Inicialización en nueva fiesta según si el creador es Promotor o Club
      setStages(['Main Stage']);
      setActiveStage('Main Stage');
      setForm({
        name: '',
        subgenre: 'Hard Techno',
        start_date: todayStr,
        dates_array: [],
        start_time: '23:59',
        duration_hours: 12,
        promoters_list: lockedSelfPromoter ? [lockedSelfPromoter] : [],
        has_club: true,
        venue_name: isCreatorClub ? user.username : '',
        venue_id: isCreatorClub ? user.id : null,
        street_address: isCreatorClub ? (user.street_address || '') : '',
        city: isCreatorClub ? (user.city || 'Madrid') : 'Madrid',
        ticket_url: '',
        description: '',
        is_secret_location: false,
        lineup: []
      });

      if (isCreatorClub && user.lat && user.lng) {
        useRaveStore.setState({
          pickedCoords: { lat: parseFloat(user.lat), lng: parseFloat(user.lng) }
        });
      }

      setImageFile(null);
      setVideoFile(null);
      setAudioFile(null);
    }
  }, [isAddEventOpen, editingEvent, todayStr, user]);

  useEffect(() => {
    let active = true;
    if (!form.is_invite_only || inviteUserQuery.trim().length < 1) {
      setInviteUserSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      const res = await searchProfilesAutocomplete(inviteUserQuery);
      if (active) setInviteUserSuggestions(res);
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [inviteUserQuery, form.is_invite_only, searchProfilesAutocomplete]);

  // Autocompletado de Calle y Número desde 1 carácter (solo cuando no hay un Club oficial seleccionado)
  useEffect(() => {
    const q = (form.street_address || '').trim();
    if (!streetInputFocused || q.length < 1 || form.venue_id) {
      setLocationResults([]);
      setIsSearchingStreet(false);
      return;
    }

    clearTimeout(searchDebounceRef.current);
    setIsSearchingStreet(true);

    searchDebounceRef.current = setTimeout(async () => {
      try {
        const cityBias = form.city || 'Madrid';
        const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(`${q} ${cityBias} España`)}&lat=${pickedCoords.lat}&lon=${pickedCoords.lng}&limit=6`;
        const res = await fetch(photonUrl);
        const data = await res.json();

        if (data?.features?.length > 0) {
          const parsed = data.features.map((f, idx) => {
            const props = f.properties || {};
            const [lon, lat] = f.geometry?.coordinates || [-3.7038, 40.4168];
            const streetAndNum = [props.street || props.name, props.housenumber].filter(Boolean).join(' ') || q;
            const detailParts = [streetAndNum, props.city || props.town || props.state, props.country]
              .filter(Boolean)
              .join(', ');

            return {
              id: `ph_${props.osm_id || idx}_${lat}`,
              title: streetAndNum,
              subtitle: detailParts,
              city: props.city || props.town || props.state || form.city,
              lat: parseFloat(lat),
              lng: parseFloat(lon)
            };
          });
          setLocationResults(parsed);
          setIsSearchingStreet(false);
          return;
        }

        const nomRes = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=es&addressdetails=1&limit=5`
        );
        const nomData = await nomRes.json();
        const nomParsed = (nomData || []).map((loc) => ({
          id: `nom_${loc.place_id}`,
          title: loc.display_name.split(',').slice(0, 2).join(','),
          subtitle: loc.display_name,
          city: loc.address?.city || loc.address?.town || loc.address?.state || form.city,
          lat: parseFloat(loc.lat),
          lng: parseFloat(loc.lon)
        }));
        setLocationResults(nomParsed);
      } catch {
        setLocationResults([]);
      } finally {
        setIsSearchingStreet(false);
      }
    }, 200);

    return () => clearTimeout(searchDebounceRef.current);
  }, [form.street_address, streetInputFocused, form.city, form.venue_id]);

  if (!isAddEventOpen) return null;

  const isDateTimeInFuture = (dateStr, timeStr) => {
    const cleanTime = (timeStr || '23:59').slice(0, 5);
    const targetMs = new Date(`${dateStr}T${cleanTime}:00`).getTime();
    return targetMs > Date.now();
  };

  const handleSelectStreetLocation = (loc) => {
    const matchedProvince = SPAIN_LOCATIONS.find(
      (c) =>
        (loc.city || '').toLowerCase().includes(c.value.toLowerCase()) ||
        (loc.subtitle || '').toLowerCase().includes(c.value.toLowerCase())
    );

    const updatedCity = matchedProvince ? matchedProvince.value : form.city;

    setForm((prev) => ({
      ...prev,
      street_address: loc.title,
      city: updatedCity
    }));

    useRaveStore.setState({
      pickedCoords: { lat: loc.lat, lng: loc.lng }
    });

    setLocationResults([]);
    setStreetInputFocused(false);
    setAutoUpdatedStreetNotice(
      `Ubicación real exacta actualizada automáticamente a "${loc.title}" (${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)})`
    );
  };

  // PUNTO 2.1: Al seleccionar un Club registrado de la lista, se autorrellenan sus datos y se ocultan los inputs de calle/provincia/coordenadas
  const handleSelectRegisteredClub = (club) => {
    const clubCity = SPAIN_LOCATIONS.some((c) => c.value === club.city) ? club.city : form.city;
    const clubStreet = club.street_address || '';

    setForm((prev) => ({
      ...prev,
      venue_name: club.username,
      venue_id: club.id,
      street_address: clubStreet,
      city: clubCity
    }));

    if (club.lat && club.lng) {
      useRaveStore.setState({
        pickedCoords: { lat: parseFloat(club.lat), lng: parseFloat(club.lng) }
      });
    }

    setShowClubDropdown(false);
  };

  // PUNTO 2: Añadir Promotor registrado o Promotor externo escrito a mano
  const matchingPromoters = (promoters || [])
    .filter(
      (p) =>
        !form.promoters_list.some((added) => added.id && String(added.id) === String(p.id)) &&
        (!promoterQuery.trim() ||
          p.username?.toLowerCase().includes(promoterQuery.replace('@', '').trim().toLowerCase()) ||
          (p.city && p.city.toLowerCase().includes(promoterQuery.trim().toLowerCase())))
    )
    .slice(0, 5);

  const handleAddRegisteredPromoter = (prof) => {
    if (form.promoters_list.some((p) => p.id && String(p.id) === String(prof.id))) return;
    const newEntry = {
      id: prof.id,
      username: prof.username,
      avatar_url: prof.avatar_url || null,
      is_custom: false,
      locked: isCreatorPromoter && String(prof.id) === String(user?.id)
    };
    setForm((prev) => ({
      ...prev,
      promoters_list: [...prev.promoters_list, newEntry]
    }));
    setPromoterQuery('');
    setShowPromoterDropdown(false);
  };

  const handleAddCustomPromoter = () => {
    const clean = promoterQuery.replace('@', '').trim();
    if (!clean) return;

    // Si coincide exactamente con un promotor registrado, añadirlo como registrado
    const exactMatch = (promoters || []).find(
      (p) => p.username.toLowerCase() === clean.toLowerCase()
    );
    if (exactMatch) {
      handleAddRegisteredPromoter(exactMatch);
      return;
    }

    if (form.promoters_list.some((p) => p.username.toLowerCase() === clean.toLowerCase())) {
      setPromoterQuery('');
      return;
    }

    const newCustom = {
      id: null,
      username: clean,
      avatar_url: null,
      is_custom: true,
      locked: false
    };
    setForm((prev) => ({
      ...prev,
      promoters_list: [...prev.promoters_list, newCustom]
    }));
    setPromoterQuery('');
    setShowPromoterDropdown(false);
  };

  const handleRemovePromoter = (usernameToRemove, isLocked) => {
    if (isLocked) return; // PUNTO 2.2: No puede quitarse a sí mismo si es Promotor
    setForm((prev) => ({
      ...prev,
      promoters_list: prev.promoters_list.filter((p) => p.username !== usernameToRemove)
    }));
  };

  const matchingClubs = (clubs || [])
    .filter(
      (c) =>
        !form.venue_name.trim() ||
        c.username.toLowerCase().includes(form.venue_name.replace('@', '').trim().toLowerCase()) ||
        (c.city && c.city.toLowerCase().includes(form.venue_name.trim().toLowerCase()))
    )
    .slice(0, 6);

  const handleAddStage = () => {
    const clean = newStageName.trim();
    if (!clean || stages.includes(clean)) return;
    if (stages.length >= maxStagesPerEvent) {
      const r = checkUserActionLimit(user, 'maxStagesPerEvent', stages.length);
      setErrorMsg(r.message);
      if (r.requiresPro) useRaveStore.getState().triggerProLimit(r.message);
      return;
    }
    const updated = [...stages, clean];
    setStages(updated);
    setActiveStage(clean);
    setNewStageName('');
    setShowStageAdder(false);
  };

  const handleRemoveStage = (stageToRemove) => {
    if (stages.length <= 1) return;
    const nextStages = stages.filter((s) => s !== stageToRemove);
    setStages(nextStages);
    if (activeStage === stageToRemove) setActiveStage(nextStages[0]);
    setForm((prev) => ({
      ...prev,
      lineup: prev.lineup.filter((slot) => (slot.stage || slot.stage_or_genre || 'Main Stage') !== stageToRemove)
    }));
  };

  const handleAddDate = () => {
    setErrorMsg('');
    if (!isDateTimeInFuture(form.start_date, form.start_time)) {
      setErrorMsg('No puedes añadir una fecha y hora que ya ha pasado.');
      return;
    }
    if (form.start_date && !form.dates_array.includes(form.start_date)) {
      setForm({ ...form, dates_array: [...form.dates_array, form.start_date].sort() });
    }
  };

  const matchingDjs = (djs || [])
    .filter(
      (dj) =>
        !djSearchQuery.trim() ||
        dj.username?.toLowerCase().includes(djSearchQuery.replace('@', '').trim().toLowerCase()) ||
        dj.favorite_subgenre?.toLowerCase().includes(djSearchQuery.trim().toLowerCase())
    )
    .slice(0, 6);

  const handleAddPlatformDjSlot = () => {
    if (!selectedPlatformDj) return;
    const currentStage = activeStage || stages[0];
    const newSlot = {
      slot_id: `slot_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      dj_id: selectedPlatformDj.id,
      name: selectedPlatformDj.username,
      avatar_url: selectedPlatformDj.avatar_url || null,
      set_time: slotSetTime || '01:00 - 03:00',
      stage: currentStage,
      stage_or_genre: currentStage,
      is_custom: false
    };
    setForm((prev) => ({ ...prev, lineup: [...prev.lineup, newSlot] }));
    setSelectedPlatformDj(null);
    setDjSearchQuery('');
    setIsDjDropdownOpen(false);
  };

  const handleAddCustomDjSlot = async () => {
    if (!customDjName.trim()) return;
    setIsUploadingDjPhoto(true);
    let customAvatarUrl = null;
    if (customDjAvatarFile) {
      customAvatarUrl = await uploadCustomDjAvatar(customDjAvatarFile);
    }
    const currentStage = activeStage || stages[0];
    const newSlot = {
      slot_id: `slot_custom_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      dj_id: null,
      name: customDjName.trim(),
      avatar_url: customAvatarUrl,
      set_time: slotSetTime || '02:00 - 04:00',
      stage: currentStage,
      stage_or_genre: currentStage,
      is_custom: true
    };
    setForm((prev) => ({ ...prev, lineup: [...prev.lineup, newSlot] }));
    setCustomDjName('');
    setCustomDjAvatarFile(null);
    setIsUploadingDjPhoto(false);
    setIsCreatingCustomDj(false);
  };

  const handleRemoveLineupSlot = (slotId) => {
    setForm((prev) => ({ ...prev, lineup: prev.lineup.filter((s) => s.slot_id !== slotId) }));
  };

  const currentStageLineup = form.lineup.filter(
    (slot) => (slot.stage || slot.stage_or_genre || 'Main Stage') === activeStage
  );

  // PUNTO 2.1: Saber si hay un Club oficial seleccionado (o si el creador es un Club) para ocultar calle, provincia y coordenadas
  const isOfficialClubSelected = Boolean(form.has_club && form.venue_id);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const datesToValidate = form.dates_array.length > 0 ? form.dates_array : [form.start_date];
    const hasPastDate = datesToValidate.some((d) => !isDateTimeInFuture(d, form.start_time));

    if (hasPastDate) {
      setErrorMsg('La fecha y hora del evento debe ser posterior al momento actual.');
      return;
    }

    if (form.promoters_list.length === 0 && !promoterQuery.trim()) {
      setErrorMsg('Añade al menos un promotor para la fiesta.');
      return;
    }

    // Si dejó escrito un promotor en el input sin darle a "+", lo añadimos automáticamente
    let finalForm = { ...form };
    if (promoterQuery.trim()) {
      const clean = promoterQuery.replace('@', '').trim();
      const exactMatch = (promoters || []).find((p) => p.username.toLowerCase() === clean.toLowerCase());
      const extraEntry = exactMatch
        ? { id: exactMatch.id, username: exactMatch.username, avatar_url: exactMatch.avatar_url || null, is_custom: false }
        : { id: null, username: clean, avatar_url: null, is_custom: true };
      finalForm.promoters_list = [...form.promoters_list, extraEntry];
    }

    setIsSubmitting(true);
    try {
      await saveCommunityEvent(finalForm, { imageFile, videoFile, audioFile }, Boolean(editingEvent));
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!editingEvent && hasReachedLimit) {
    return (
      <div className="modal-overlay">
        <div className="modal-card add-event-pro-card" style={{ textAlign: 'center' }}>
          <button className="modal-close" onClick={() => setModal('isAddEventOpen', false)}>
            <X size={18} />
          </button>
          <h2 className="modal-title">Límite de {maxActiveEvents} Fiestas Alcanzado</h2>
          <p className="modal-subtitle" style={{ marginTop: '8px' }}>
            Ya tienes {myActiveEventsCount} fiestas activas publicadas en el mapa. Puedes editar cualquiera de tus fiestas actuales desde su panel en el mapa.
          </p>
          {PRO_FEATURES_ENABLED && !user?.is_pro && (
            <button
              type="button"
              className="btn-neon-full"
              style={{ marginTop: '14px' }}
              onClick={() => {
                const r = checkUserActionLimit(user, 'maxActiveEvents', myActiveEventsCount);
                setModal('isAddEventOpen', false);
                useRaveStore.getState().triggerProLimit(r.message);
              }}
            >
              Publicar más fiestas con PRO
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card add-event-pro-card">
        <button
          className="modal-close"
          onClick={() => {
            setModal('isAddEventOpen', false);
            useRaveStore.setState({ editingEvent: null });
          }}
        >
          <X size={18} />
        </button>

        <h2 className="modal-title">{editingEvent ? 'Editar Fiesta / Evento' : 'Publicar Fiesta / Rave'}</h2>
        <p className="modal-subtitle">Configura el nombre de la fiesta, promotores, club, Lineup por escenarios y multimedia.</p>

        {errorMsg && <div className="add-event-error">{errorMsg}</div>}

        <form onSubmit={handleSubmit} className="add-event-form">
          {/* 1. NOMBRE DE LA FIESTA Y SUBGÉNERO */}
          <div className="pro-form-grid-2">
            <input
              type="text"
              className="pro-input"
              placeholder="Nombre de la fiesta (ej. Blackworks, Code 160...)"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <ProSelect
              icon={SlidersHorizontal}
              value={form.subgenre}
              options={ELECTRONIC_GENRE_OPTIONS}
              onChange={(v) => setForm({ ...form, subgenre: v })}
            />
          </div>

          {/* 2. FECHA(S), HORA Y DURACIÓN */}
          <div className="pro-form-grid-3">
            <div className="multi-date-input">
              <input
                type="date"
                className="pro-input"
                min={todayStr}
                required
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
              {!editingEvent && (
                <button type="button" onClick={handleAddDate} className="btn-add-date" title="Añadir otra fecha">
                  <Plus size={16} />
                </button>
              )}
            </div>

            <input
              type="time"
              className="pro-input"
              required
              value={form.start_time}
              onChange={(e) => setForm({ ...form, start_time: e.target.value })}
              title="Hora de inicio"
            />

            <div className="duration-input-wrap" title="Duración estimada en horas">
              <Clock size={14} className="icon-neon" />
              <input
                type="number"
                min="1"
                max="72"
                required
                value={form.duration_hours}
                onChange={(e) => setForm({ ...form, duration_hours: Number(e.target.value) })}
              />
              <span>h</span>
            </div>
          </div>

          {form.dates_array.length > 0 && !editingEvent && (
            <div className="added-dates-list">
              {form.dates_array.map((d) => (
                <span key={d} className="added-date-chip">
                  {d}
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, dates_array: form.dates_array.filter((x) => x !== d) })}
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* 3. PUNTO 2 y 2.2: SELECTOR DE PROMOTOR O PROMOTORES (Registrados o Externos) */}
          <div className="venue-mode-box">
            <div className="venue-mode-header">
              <span>
                <Disc size={14} className="icon-neon" />{' '}
                <strong>Promotor(es) de la Fiesta ({form.promoters_list.length})</strong>
              </span>
              {isCreatorPromoter && (
                <span style={{ fontSize: '10.5px', color: '#c084fc', fontWeight: 700 }}>
                  Tú estás fijado como promotor (puedes añadir más)
                </span>
              )}
            </div>

            <div style={{ position: 'relative' }}>
              <div className="lineup-slot-inputs-simple">
                <div className="pro-search-input-wrap">
                  <Search size={14} className="pro-search-icon" />
                  <input
                    type="text"
                    placeholder="Buscar promotor registrado o escribir uno nuevo..."
                    value={promoterQuery}
                    onFocus={() => setShowPromoterDropdown(true)}
                    onBlur={() => setTimeout(() => setShowPromoterDropdown(false), 180)}
                    onChange={(e) => {
                      setPromoterQuery(e.target.value);
                      setShowPromoterDropdown(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && promoterQuery.trim()) {
                        e.preventDefault();
                        handleAddCustomPromoter();
                      }
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="btn-add-slot"
                  disabled={!promoterQuery.trim()}
                  onClick={handleAddCustomPromoter}
                >
                  <Plus size={15} /> Añadir
                </button>
              </div>

              {showPromoterDropdown && (matchingPromoters.length > 0 || promoterQuery.trim()) && (
                <div className="pro-autocomplete-dropdown">
                  {matchingPromoters.length > 0 && (
                    <div className="dropdown-section-hint">
                      PROMOTORES OFICIALES REGISTRADOS
                    </div>
                  )}
                  {matchingPromoters.map((prom) => (
                    <button
                      type="button"
                      key={prom.id}
                      className="autocomplete-option"
                      onMouseDown={() => handleAddRegisteredPromoter(prom)}
                    >
                      {prom.avatar_url ? (
                        <img src={prom.avatar_url} alt={prom.username} className="autocomplete-thumb round-dj" />
                      ) : (
                        <div className="autocomplete-thumb round-dj"><Disc size={14} className="icon-neon" /></div>
                      )}
                      <div className="autocomplete-info">
                        <strong>@{prom.username}</strong>
                        <span>Promotor Oficial · {prom.city || 'Madrid'}</span>
                      </div>
                    </button>
                  ))}

                  {promoterQuery.trim() && (
                    <button
                      type="button"
                      className="autocomplete-option"
                      onMouseDown={handleAddCustomPromoter}
                    >
                      <div className="autocomplete-thumb round-dj"><Plus size={14} className="icon-neon" /></div>
                      <div className="autocomplete-info">
                        <strong>Añadir &quot;{promoterQuery.trim()}&quot;</strong>
                        <span>Promotor externo / Colectivo</span>
                      </div>
                    </button>
                  )}
                </div>
              )}
            </div>

            {form.promoters_list.length > 0 && (
              <div className="added-promoters-chips">
                {form.promoters_list.map((p) => (
                  <span
                    key={`${p.id || 'custom'}_${p.username}`}
                    className={`promoter-form-chip ${p.id ? 'is-official' : ''} ${p.locked ? 'is-locked' : ''}`}
                  >
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt={p.username} />
                    ) : (
                      <Disc size={12} />
                    )}
                    <span>{p.id ? `@${p.username}` : p.username}</span>
                    {p.locked ? (
                      <Lock size={11} title="No puedes quitarte a ti mismo como promotor" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleRemovePromoter(p.username, p.locked)}
                      >
                        <X size={11} />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 4. PUNTOS 2.1 y 2.3: SELECTOR DE CLUB / SALA (Fijo si eres Club; oculta calle/provincia/coords si es Club Oficial) */}
          <div className="venue-mode-box">
            <div className="venue-mode-header">
              <span>
                <Building2 size={14} className="icon-neon" />{' '}
                <strong>{isCreatorClub ? 'Club Anfitrión (Tu Sala Oficial)' : '¿Se celebra en un Club / Sala?'}</strong>
              </span>

              {!isCreatorClub && (
                <div className="venue-mode-pills">
                  <button
                    type="button"
                    className={form.has_club ? 'active' : ''}
                    onClick={() => setForm({ ...form, has_club: true })}
                  >
                    Sí, en Club / Sala
                  </button>
                  <button
                    type="button"
                    className={!form.has_club ? 'active' : ''}
                    onClick={() =>
                      setForm({
                        ...form,
                        has_club: false,
                        venue_name: '',
                        venue_id: null
                      })
                    }
                  >
                    No (Sin Club / Libre)
                  </button>
                </div>
              )}
            </div>

            {form.has_club && (
              <div style={{ position: 'relative' }}>
                <div className="pro-search-input-wrap">
                  <Building2 size={15} className="pro-search-icon" />
                  <input
                    type="text"
                    placeholder="Selecciona un Club registrado de la lista o escribe el nombre del club..."
                    required={form.has_club}
                    disabled={isCreatorClub}
                    value={form.venue_name}
                    onFocus={() => !isCreatorClub && setShowClubDropdown(true)}
                    onBlur={() => setTimeout(() => setShowClubDropdown(false), 180)}
                    onChange={(e) => {
                      if (isCreatorClub) return; // PUNTO 2.3: El Club no se puede quitar a sí mismo
                      const val = e.target.value;
                      const exactClub = (clubs || []).find(
                        (c) => c.username.toLowerCase() === val.replace('@', '').trim().toLowerCase()
                      );
                      setForm({
                        ...form,
                        venue_name: val,
                        venue_id: exactClub && val.trim() !== '' ? exactClub.id : null,
                        street_address: exactClub ? (exactClub.street_address || '') : form.street_address,
                        city: exactClub && SPAIN_LOCATIONS.some((c) => c.value === exactClub.city) ? exactClub.city : form.city
                      });
                      if (exactClub?.lat && exactClub?.lng) {
                        useRaveStore.setState({
                          pickedCoords: { lat: parseFloat(exactClub.lat), lng: parseFloat(exactClub.lng) }
                        });
                      }
                      setShowClubDropdown(true);
                    }}
                  />
                  {form.venue_id && form.venue_name.trim() !== '' && (
                    <span className="official-club-inline-badge">
                      <CheckCircle2 size={11} /> Club Oficial
                    </span>
                  )}
                  {isCreatorClub ? (
                    <Lock size={14} style={{ color: '#06b6d4', marginRight: '6px' }} title="Tu Club está fijado automáticamente" />
                  ) : (
                    form.venue_name && (
                      <button
                        type="button"
                        className="pro-search-clear"
                        onClick={() => setForm({ ...form, venue_name: '', venue_id: null })}
                      >
                        <X size={14} />
                      </button>
                    )
                  )}
                </div>

                {!isCreatorClub && showClubDropdown && matchingClubs.length > 0 && (
                  <div className="pro-autocomplete-dropdown">
                    <div className="dropdown-section-hint">
                      CLUBS OFICIALES REGISTRADOS (Asigna automáticamente su ubicación)
                    </div>
                    {matchingClubs.map((club) => (
                      <button
                        type="button"
                        key={club.id}
                        className="autocomplete-option"
                        onMouseDown={() => handleSelectRegisteredClub(club)}
                      >
                        {club.avatar_url ? (
                          <img src={club.avatar_url} alt={club.username} className="autocomplete-thumb round-dj" />
                        ) : (
                          <div className="autocomplete-thumb round-dj"><Building2 size={14} className="icon-neon" /></div>
                        )}
                        <div className="autocomplete-info">
                          <strong>@{club.username}</strong>
                          <span>
                            {club.street_address ? `${club.street_address} · ` : ''}{club.city || 'Madrid'}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* PUNTO 2.1: Si hay un Club oficial seleccionado, los inputs de calle, provincia y ubicación desaparecen */}
            {isOfficialClubSelected && (
              <div className="club-locked-location-info">
                <CheckCircle2 size={14} style={{ color: '#06b6d4', flexShrink: 0 }} />
                <span>
                  Ubicación asignada automáticamente por <strong>@{form.venue_name}</strong> ({form.street_address ? `${form.street_address}, ` : ''}{form.city})
                </span>
              </div>
            )}
          </div>

          {/* 5. PUNTO 2.1: Solo mostrar Calle, Provincia y Coordenadas si NO se ha elegido un Club oficial de la lista */}
          {!isOfficialClubSelected && (
            <>
              <div className="pro-form-grid-2">
                <div className="location-autocomplete" style={{ position: 'relative' }}>
                  <div className="pro-search-input-wrap">
                    <Search size={15} className="pro-search-icon" />
                    <input
                      type="text"
                      placeholder="Calle y número exacto (ej. Calle Atocha 125)..."
                      value={form.street_address}
                      onFocus={() => setStreetInputFocused(true)}
                      onBlur={() => setTimeout(() => setStreetInputFocused(false), 200)}
                      onChange={(e) => {
                        setForm({ ...form, street_address: e.target.value });
                        setStreetInputFocused(true);
                      }}
                    />
                    {isSearchingStreet && <span className="street-searching-tag">...</span>}
                  </div>

                  {streetInputFocused && locationResults.length > 0 && (
                    <div className="pro-autocomplete-dropdown">
                      {locationResults.map((loc) => (
                        <button
                          type="button"
                          key={loc.id}
                          className="autocomplete-option"
                          onMouseDown={() => handleSelectStreetLocation(loc)}
                        >
                          <MapPin size={15} className="icon-neon" style={{ flexShrink: 0 }} />
                          <div className="autocomplete-info">
                            <strong>{loc.title}</strong>
                            <span>{loc.subtitle}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <ProSelect
                  icon={MapPin}
                  value={form.city}
                  options={SPAIN_LOCATIONS}
                  onChange={(val) => {
                    const found = SPAIN_LOCATIONS.find((c) => c.value === val);
                    setForm({ ...form, city: val });
                    if (found) {
                      useRaveStore.setState({
                        pickedCoords: { lat: found.lat, lng: found.lng }
                      });
                    }
                  }}
                />
              </div>

              {autoUpdatedStreetNotice && (
                <div className="street-updated-toast">
                  <CheckCircle2 size={15} />
                  <span>{autoUpdatedStreetNotice}</span>
                </div>
              )}

              <div className={`pro-coords-bar ${autoUpdatedStreetNotice ? 'coords-just-updated' : ''}`}>
                <span>
                  <MapPin size={14} className="icon-neon" />{' '}
                  <strong>Ubicación Real Exacta:</strong> {pickedCoords.lat.toFixed(4)}, {pickedCoords.lng.toFixed(4)}
                </span>
                <button type="button" className="btn-pick-coords" onClick={() => startPickingLocation('event')}>
                  Pinchar en el Mapa
                </button>
              </div>
            </>
          )}

          <label className="pro-secret-toggle">
            <input
              type="checkbox"
              checked={form.is_secret_location}
              onChange={(e) => setForm({ ...form, is_secret_location: e.target.checked })}
            />
            <Lock size={15} className="icon-neon" />
            <span>
              <strong>Modo Secret Location</strong> (Desvía automáticamente el radar público ~1km y oculta el club y la calle hasta que marquen &quot;Voy a ir&quot; o estén en el Lineup)
            </span>
          </label>

          {/* PUNTO 5: Opción "Solo por Invitación" + Recomendación con Secret Location + Buscador de Invitados */}
          <div className="venue-mode-box" style={{ borderColor: form.is_invite_only ? 'var(--accent-neon)' : 'var(--border-subtle)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '9px', cursor: 'pointer', fontSize: '12.5px' }}>
              <input
                type="checkbox"
                checked={Boolean(form.is_invite_only)}
                onChange={(e) => setForm({ ...form, is_invite_only: e.target.checked })}
              />
              <Lock size={15} className="icon-neon" />
              <span>
                <strong>Evento Solo por Invitación</strong> (Oculta &quot;Voy a ir&quot; y &quot;Busco Rave Squad&quot;; los usuarios deberán pedir permiso o aceptar tu invitación)
              </span>
            </label>

            <div
              style={{
                fontSize: '11px',
                color: '#d8b4fe',
                background: 'rgba(168, 85, 247, 0.1)',
                border: '1px dashed rgba(168, 85, 247, 0.45)',
                padding: '7px 10px',
                borderRadius: '8px',
                lineHeight: 1.4
              }}
            >
              💡 <strong>Combinación recomendada (Opcional):</strong> Si marcas <strong>Modo Secret Location + Solo por Invitación</strong>, nadie podrá ver el club ni la ubicación exacta hasta que tú aceptes su solicitud o ellos acepten tu invitación (al aceptarse se les marcará automáticamente &quot;Voy a ir&quot;).
            </div>

            {form.is_invite_only && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                <div style={{ position: 'relative' }}>
                  <div className="pro-search-input-wrap">
                    <UserPlus size={14} className="pro-search-icon" />
                    <input
                      type="text"
                      placeholder="Buscar usuarios por @username (Ravers, DJs, Promotores o Clubs) para enviarles invitación..."
                      value={inviteUserQuery}
                      onChange={(e) => setInviteUserQuery(e.target.value)}
                    />
                  </div>

                  {inviteUserSuggestions.length > 0 && (
                    <div className="pro-autocomplete-dropdown">
                      {inviteUserSuggestions.map((prof) => {
                        const alreadyAdded = (form.invited_users_list || []).some(
                          (u) => String(u.id) === String(prof.id)
                        );
                        return (
                          <button
                            type="button"
                            key={prof.id}
                            className="autocomplete-option"
                            disabled={alreadyAdded}
                            onMouseDown={() => {
                              if (!alreadyAdded) {
                                setForm({
                                  ...form,
                                  invited_users_list: [...(form.invited_users_list || []), prof]
                                });
                              }
                              setInviteUserQuery('');
                              setInviteUserSuggestions([]);
                            }}
                          >
                            {prof.avatar_url ? (
                              <img src={prof.avatar_url} alt={prof.username} className="autocomplete-thumb round-dj" />
                            ) : (
                              <div className="autocomplete-thumb round-dj"><Disc size={14} className="icon-neon" /></div>
                            )}
                            <div className="autocomplete-info">
                              <strong>@{prof.username}</strong>
                              <span>{prof.role} · {prof.city || 'Madrid'}</span>
                            </div>
                            <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 800, color: alreadyAdded ? '#4ade80' : 'var(--accent-neon)' }}>
                              {alreadyAdded ? '✓ Añadido' : '+ Invitar'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {Array.isArray(form.invited_users_list) && form.invited_users_list.length > 0 && (
                  <div className="added-promoters-chips">
                    {form.invited_users_list.map((u) => (
                      <span key={u.id} className="promoter-form-chip is-official">
                        {u.avatar_url ? <img src={u.avatar_url} alt={u.username} /> : <Disc size={12} />}
                        <span>@{u.username} ({u.role})</span>
                        <button
                          type="button"
                          onClick={() =>
                            setForm({
                              ...form,
                              invited_users_list: form.invited_users_list.filter((x) => x.id !== u.id)
                            })
                          }
                        >
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 6. CONSTRUCTOR DE LINEUP SEPARADO POR ESCENARIO */}
          <div className="lineup-builder-box">
            <div className="lineup-builder-header">
              <span>
                <Headphones size={15} className="icon-neon" />{' '}
                <strong>Lineup · Escenario: {activeStage} ({currentStageLineup.length} DJs)</strong>
              </span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  className="btn-stage-adder-toggle"
                  onClick={() => setShowStageAdder(!showStageAdder)}
                >
                  <Layers size={12} />
                  <span>+ Escenario</span>
                </button>
                <button
                  type="button"
                  className="btn-toggle-custom-dj"
                  onClick={() => {
                    setIsCreatingCustomDj(!isCreatingCustomDj);
                    setSelectedPlatformDj(null);
                  }}
                >
                  <UserPlus size={13} />
                  <span>{isCreatingCustomDj ? 'Buscar DJ registrado' : '+ Crear DJ de 0'}</span>
                </button>
              </div>
            </div>

            {(stages.length > 1 || showStageAdder) && (
              <div className="stage-manager-bar">
                <div className="stage-chips-row">
                  {stages.map((st) => {
                    const countInStage = form.lineup.filter(
                      (s) => (s.stage || s.stage_or_genre || 'Main Stage') === st
                    ).length;
                    return (
                      <button
                        type="button"
                        key={st}
                        className={`stage-selectable-tab ${activeStage === st ? 'active' : ''}`}
                        onClick={() => setActiveStage(st)}
                      >
                        <span>{st} ({countInStage})</span>
                        {stages.length > 1 && (
                          <span
                            className="stage-del-x"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveStage(st);
                            }}
                          >
                            <X size={10} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {showStageAdder && (
                  <div className="stage-add-inline">
                    <input
                      type="text"
                      className="pro-input"
                      placeholder="Nombre del nuevo escenario (ej. Boiler Room, Tent...)"
                      value={newStageName}
                      onChange={(e) => setNewStageName(e.target.value)}
                    />
                    <button type="button" className="btn-add-slot" onClick={handleAddStage}>
                      <Plus size={14} /> Crear
                    </button>
                  </div>
                )}
              </div>
            )}

            {!isCreatingCustomDj ? (
              <div className="lineup-platform-adder">
                <div style={{ position: 'relative' }}>
                  <div className="pro-search-input-wrap">
                    <Search size={14} className="pro-search-icon" />
                    <input
                      type="text"
                      placeholder={`Buscar DJ para añadir a ${activeStage}...`}
                      value={djSearchQuery}
                      onFocus={() => setIsDjDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setIsDjDropdownOpen(false), 180)}
                      onChange={(e) => {
                        setSelectedPlatformDj(null);
                        setDjSearchQuery(e.target.value);
                        setIsDjDropdownOpen(true);
                      }}
                    />
                    {selectedPlatformDj && (
                      <span className="official-club-inline-badge" style={{ color: '#ff5500', background: 'rgba(255,85,0,0.16)' }}>
                        @{selectedPlatformDj.username}
                      </span>
                    )}
                    {djSearchQuery && (
                      <button
                        type="button"
                        className="pro-search-clear"
                        onClick={() => {
                          setSelectedPlatformDj(null);
                          setDjSearchQuery('');
                          setIsDjDropdownOpen(true);
                        }}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {isDjDropdownOpen && matchingDjs.length > 0 && (
                    <div className="pro-autocomplete-dropdown">
                      {matchingDjs.map((dj) => (
                        <button
                          type="button"
                          key={dj.id}
                          className="autocomplete-option"
                          onMouseDown={() => {
                            setSelectedPlatformDj(dj);
                            setDjSearchQuery(`@${dj.username}`);
                            setIsDjDropdownOpen(false);
                          }}
                        >
                          {dj.avatar_url ? (
                            <img src={dj.avatar_url} alt={dj.username} className="autocomplete-thumb round-dj" />
                          ) : (
                            <div className="autocomplete-thumb round-dj"><Disc size={15} className="icon-neon" /></div>
                          )}
                          <div className="autocomplete-info">
                            <strong>@{dj.username}</strong>
                            <span>{dj.city} · {dj.favorite_subgenre}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="lineup-slot-inputs-simple">
                  <input
                    type="text"
                    className="pro-input"
                    placeholder="Horario (ej. 02:00 - 04:00)"
                    value={slotSetTime}
                    onChange={(e) => setSlotSetTime(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-add-slot"
                    disabled={!selectedPlatformDj}
                    onClick={handleAddPlatformDjSlot}
                  >
                    <Plus size={15} /> Añadir a {activeStage}
                  </button>
                </div>
              </div>
            ) : (
              <div className="lineup-custom-adder">
                <div className="pro-form-grid-2">
                  <input
                    type="text"
                    className="pro-input"
                    placeholder="Nombre del DJ (ej. Klangkuenstler)"
                    value={customDjName}
                    onChange={(e) => setCustomDjName(e.target.value)}
                  />
                  <label className="custom-dj-photo-btn">
                    <Image size={14} className="icon-neon" />
                    <span>{customDjAvatarFile ? customDjAvatarFile.name : 'Subir Foto DJ'}</span>
                    <input type="file" accept="image/*" onChange={(e) => setCustomDjAvatarFile(e.target.files?.[0] || null)} />
                  </label>
                </div>

                <div className="lineup-slot-inputs-simple">
                  <input
                    type="text"
                    className="pro-input"
                    placeholder="Horario (ej. 03:00 - 05:00)"
                    value={slotSetTime}
                    onChange={(e) => setSlotSetTime(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-add-slot"
                    disabled={!customDjName.trim() || isUploadingDjPhoto}
                    onClick={handleAddCustomDjSlot}
                  >
                    <Plus size={15} /> {isUploadingDjPhoto ? '...' : `Añadir a ${activeStage}`}
                  </button>
                </div>
              </div>
            )}

            {currentStageLineup.length > 0 ? (
              <div className="added-lineup-list">
                {currentStageLineup.map((slot) => (
                  <div key={slot.slot_id} className="added-lineup-item">
                    <div className="lineup-item-left">
                      {slot.avatar_url ? (
                        <img src={slot.avatar_url} alt={slot.name} />
                      ) : (
                        <div className="lineup-avatar-placeholder"><Disc size={14} className="icon-neon" /></div>
                      )}
                      <div>
                        <strong>{slot.dj_id ? `@${slot.name}` : slot.name}</strong>
                        <span>{slot.set_time} · {slot.stage || activeStage}</span>
                      </div>
                    </div>
                    <button type="button" className="btn-del-slot" onClick={() => handleRemoveLineupSlot(slot.slot_id)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-stage-hint">
                Aún no has añadido ningún DJ al escenario <strong>{activeStage}</strong>.
              </p>
            )}
          </div>

          <div className="pro-media-uploads">
            <label className={`media-drop-tile ${imageFile || editingEvent?.image_url ? 'has-file' : ''}`}>
              <Image size={18} className="icon-neon" />
              <span>{imageFile ? imageFile.name : editingEvent?.image_url ? '✓ Cartel subido' : 'Subir Cartel'}</span>
              <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} />
            </label>

            <label className={`media-drop-tile ${videoFile || editingEvent?.video_url ? 'has-file' : ''}`}>
              <Video size={18} className="icon-neon" />
              <span>{videoFile ? videoFile.name : editingEvent?.video_url ? '✓ Vídeo subido' : 'Subir Vídeo (.mp4)'}</span>
              <input type="file" accept="video/mp4,video/webm" onChange={(e) => setVideoFile(e.target.files?.[0] || null)} />
            </label>

            <label className={`media-drop-tile ${audioFile || editingEvent?.audio_url ? 'has-file' : ''}`}>
              <Music size={18} className="icon-neon" />
              <span>{audioFile ? audioFile.name : editingEvent?.audio_url ? '✓ Audio subido' : 'Subir Audio (.mp3)'}</span>
              <input type="file" accept="audio/*" onChange={(e) => setAudioFile(e.target.files?.[0] || null)} />
            </label>
          </div>

          <input
            type="url"
            className="pro-input"
            placeholder="URL de Entradas / Info (opcional)"
            value={form.ticket_url}
            onChange={(e) => setForm({ ...form, ticket_url: e.target.value })}
          />

          <div className="rich-textarea-wrap">
            <textarea
              ref={descriptionRef}
              rows="4"
              className="pro-input"
              placeholder="Descripción, dresscode o información adicional..."
              required
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <EmojiPicker
              targetRef={descriptionRef}
              value={form.description}
              onChange={(description) => setForm((f) => ({ ...f, description }))}
            />
          </div>

          <button type="submit" className="btn-neon-full" disabled={isSubmitting}>
            <Rocket size={16} />
            <span>{isSubmitting ? 'Guardando...' : editingEvent ? 'Guardar Cambios' : 'Publicar Evento'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
