// src/components/ProfileModal/ProfileModal.jsx
import React, { useRef, useState, useEffect, useMemo } from 'react';
import {
  X, Camera, Edit3, Check, LogOut,
  Disc, MapPin, Activity, ShieldCheck, Headphones,
  SlidersHorizontal, Music, Film, Image as ImageIcon, Trash2,
  Plus, Calendar, Plane, DollarSign, Lock, AlertCircle, Crown, Globe
} from 'lucide-react';
import { InstagramIcon, YoutubeIcon, SpotifyIcon, TiktokIcon } from '../ui/BrandIcons';
import { useRaveStore } from '../../store/useRaveStore';
import { SPAIN_LOCATIONS } from '../../constants/spainLocations';
import { DjCalendarEditor } from '../ui/DjCalendarEditor';
import { ELECTRONIC_GENRE_OPTIONS, ELECTRONIC_GENRES } from '../../constants/electronicGenres';
import { ProSelect } from '../ui/ProSelect';
import { getLimitValue, isProUser, checkFileSizeLimit, FILE_SIZE_LIMITS_MB, PRO_FEATURES_ENABLED } from '../../constants/proConfig';
import { AudioTrimmer } from '../ui/AudioTrimmer';
import { EmojiPicker } from '../ui/EmojiPicker';
import { MyMediaManager } from '../ui/MyMediaManager';
import { AvatarFrame } from '../ui/AvatarFrame';
import { AvatarFramePicker } from '../ui/AvatarFramePicker';
import { getProfileFrame, normalizeFrame, canUseFrame } from '../../lib/avatarFrames';

import './ProfileModal.css';

function getEventSpanDates(startDate, startTime = '23:00', durationHours = 12) {
  if (!startDate) return [];
  const dates = [startDate];
  const [h, m] = (startTime || '23:00').split(':').map(Number);
  const startHourDecimal = (h || 0) + (m || 0) / 60;
  const totalEndHours = startHourDecimal + (Number(durationHours) || 12);
  const extraDays = Math.floor(totalEndHours / 24);

  const baseDate = new Date(`${startDate}T12:00:00`);
  for (let i = 1; i <= extraDays; i++) {
    const next = new Date(baseDate.getTime() + i * 86400000);
    dates.push(next.toISOString().split('T')[0]);
  }
  return dates;
}

export const ProfileModal = () => {
  const {
    isProfileOpen, isProfileEditing, setModal, user, events,
    updateUserProfile, uploadDjMediaFile, removeDjMediaItem,
    uploadClubMediaFile, removeClubMediaItem, removeClubVideo,
    signOut, pickedProfileCoords, startPickingLocation,
    myAttendingEvents, autoApproveRoles
  } = useRaveStore();

  const cardRef = useRef(null);
  const hasInitializedFormRef = useRef(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editTab, setEditTab] = useState('basic'); // 'basic' | 'media' | 'promoters'
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, glareX: 50, glareY: 50 });

  const [avatarFile, setAvatarFile] = useState(null);
  const [djAudioFile, setDjAudioFile] = useState(null);
  const [clubAudioFile, setClubAudioFile] = useState(null);
  // Canción principal que pesa más de lo que permite el plan → editor de recorte
  const [trimTarget, setTrimTarget] = useState(null); // { file, kind: 'dj' | 'club' }
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [customSubgenreInput, setCustomSubgenreInput] = useState('');
  const [presetSubgenreSelect, setPresetSubgenreSelect] = useState(ELECTRONIC_GENRES[0]);

  const [mediaTitle, setMediaTitle] = useState('');
  const bioRef = useRef(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);

  const [clubStreetQuery, setClubStreetQuery] = useState('');
  const [clubStreetResults, setClubStreetResults] = useState([]);
  const clubStreetDebounceRef = useRef(null);

  const [form, setForm] = useState({
    username: '',
    role: 'Raver',
    role_request_message: '',
    city: 'Madrid',
    street_address: '',
    website_url: '',
    favorite_subgenre: 'Hard Techno',
    secondary_subgenres: [],
    favorite_bpm: 155,
    dj_audio_source: 'soundcloud',
    soundcloud_url: '',
    instagram_url: '',
    spotify_url: '',
    tiktok_url: '',
    youtube_url: '',
    booking_fee: '',
    is_fee_negotiable: true,
    willing_to_travel: true,
    available_dates: [],
    dj_private_events: [],
    bio: '',
    avatar_frame: null,
    avatar_frame_color: null
  });

    useEffect(() => {
    if (isProfileEditing) setIsEditing(true);
  }, [isProfileEditing]);

  // Abrir directamente una pestaña del editor (p. ej. el aviso de fundador → Marco)
  const profileEditTabRequest = useRaveStore((s) => s.profileEditTabRequest);
  useEffect(() => {
    if (!isProfileOpen || !profileEditTabRequest) return;
    setIsEditing(true);
    setEditTab(profileEditTabRequest);
    useRaveStore.setState({ profileEditTabRequest: null });
  }, [isProfileOpen, profileEditTabRequest]);

  // Inicializar el formulario una sola vez por apertura del modal para no perder enlaces al cambiar de pestaña
  useEffect(() => {
    if (!isProfileOpen) {
      if (!isProfileEditing) {
        hasInitializedFormRef.current = false;
      }
      return;
    }

    useRaveStore.getState().fetchAppSettings();

    if (user && !hasInitializedFormRef.current) {
      setForm({
        username: user.username || '',
        role: user.role || 'Raver',
        role_request_message: '',
        city: SPAIN_LOCATIONS.some((c) => c.value === user.city) ? user.city : 'Madrid',
        street_address: user.street_address || '',
        website_url: user.website_url || '',
        favorite_subgenre: ELECTRONIC_GENRES.includes(user.favorite_subgenre) ? user.favorite_subgenre : 'Hard Techno',
        secondary_subgenres: Array.isArray(user.secondary_subgenres) ? user.secondary_subgenres.slice(0, 2) : [],
        favorite_bpm: user.favorite_bpm || 155,
        dj_audio_source: user.dj_audio_source || 'soundcloud',
        soundcloud_url: user.soundcloud_url || '',
        instagram_url: user.instagram_url || '',
        spotify_url: user.spotify_url || '',
        tiktok_url: user.tiktok_url || '',
        youtube_url: user.youtube_url || '',
        booking_fee: user.booking_fee || '',
        is_fee_negotiable: user.is_fee_negotiable !== undefined ? user.is_fee_negotiable : true,
        willing_to_travel: user.willing_to_travel !== undefined ? user.willing_to_travel : true,
        available_dates: Array.isArray(user.available_dates) ? user.available_dates : [],
        dj_private_events: Array.isArray(user.dj_private_events) ? user.dj_private_events : [],
        bio: user.bio || '',
        avatar_frame: user.avatar_frame || null,
        avatar_frame_color: user.avatar_frame_color || null
      });
      setAvatarPreview(user.avatar_url);
      setAvatarFile(null);
      setDjAudioFile(null);
      setClubAudioFile(null);
      setErrorMsg('');
      hasInitializedFormRef.current = true;
    }
  }, [isProfileOpen, user, isProfileEditing]);

  // Buscador de calle y número exacto para Clubs
  useEffect(() => {
    const q = clubStreetQuery.trim();
    if (q.length < 1 || form.role !== 'Club') {
      setClubStreetResults([]);
      return;
    }
    clearTimeout(clubStreetDebounceRef.current);
    clubStreetDebounceRef.current = setTimeout(async () => {
      try {
        const cityBias = form.city || 'Madrid';
        const res = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(`${q} ${cityBias} España`)}&limit=5`
        );
        const data = await res.json();
        const parsed = (data?.features || []).map((f, idx) => {
          const props = f.properties || {};
          const [lon, lat] = f.geometry?.coordinates || [-3.7038, 40.4168];
          const streetPart = [props.street || props.name, props.housenumber].filter(Boolean).join(' ');
          const cityPart = props.city || props.town || props.state || form.city;
          return {
            id: `club_st_${idx}_${lat}`,
            addressLabel: streetPart || props.name || q,
            fullSubtitle: [streetPart, cityPart].filter(Boolean).join(', '),
            city: cityPart,
            lat: parseFloat(lat),
            lng: parseFloat(lon)
          };
        });
        setClubStreetResults(parsed);
      } catch {
        setClubStreetResults([]);
      }
    }, 200);
    return () => clearTimeout(clubStreetDebounceRef.current);
  }, [clubStreetQuery, form.role, form.city]);

  // Fiestas de cada día ocupado (para ver su info al pinchar en el calendario)
  const autoBookedEventsByDate = useMemo(() => {
    const map = {};
    if (!user) return map;
    const push = (d, item) => {
      if (!map[d]) map[d] = [];
      if (!map[d].some((x) => String(x.ev.id) === String(item.ev.id))) map[d].push(item);
    };
    (events || []).forEach((ev) => {
      const lineupArr = Array.isArray(ev.lineup) ? ev.lineup : [];
      const slot = lineupArr.find(
        (s) =>
          (s.dj_id && String(s.dj_id) === String(user.id)) ||
          (s.name && s.name.trim().toLowerCase() === user.username?.trim().toLowerCase())
      );
      if (slot) {
        getEventSpanDates(ev.start_date, ev.start_time, ev.duration_hours).forEach((d) =>
          push(d, { ev, kind: 'lineup', slot })
        );
      }
    });
    (myAttendingEvents || []).forEach((ev) => {
      getEventSpanDates(ev.start_date, ev.start_time, ev.duration_hours).forEach((d) =>
        push(d, { ev, kind: 'attending', slot: null })
      );
    });
    return map;
  }, [user, myAttendingEvents, events]);

  // Calcular automáticamente las fechas ocupadas por Lineup o por eventos a los que asiste
  const autoBookedDatesMap = useMemo(() => {
    const map = {};
    if (!user) return map;

    (myAttendingEvents || []).forEach((ev) => {
      const spanDates = getEventSpanDates(ev.start_date, ev.start_time, ev.duration_hours);
      spanDates.forEach((d) => {
        map[d] = `Asiste: ${ev.name}`;
      });
    });

    (events || []).forEach((ev) => {
      const lineupArr = Array.isArray(ev.lineup) ? ev.lineup : [];
      const inLineup = lineupArr.some(
        (slot) =>
          (slot.dj_id && String(slot.dj_id) === String(user.id)) ||
          (slot.name && slot.name.trim().toLowerCase() === user.username?.trim().toLowerCase())
      );
      if (inLineup) {
        const spanDates = getEventSpanDates(ev.start_date, ev.start_time, ev.duration_hours);
        spanDates.forEach((d) => {
          map[d] = `Lineup: ${ev.name}`;
        });
      }
    });

    return map;
  }, [user, myAttendingEvents, events]);

  const upcomingCalendarDays = useMemo(() => {
    const days = [];
    const base = new Date();
    for (let i = 0; i < 28; i++) {
      const d = new Date(base.getTime() + i * 86400000);
      const iso = d.toISOString().split('T')[0];
      const label = d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
      days.push({ iso, label });
    }
    return days;
  }, []);

  if (!isProfileOpen || !user) return null;

  const handleMouseMove = (e) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const rx = ((y - rect.height / 2) / (rect.height / 2)) * -10;
    const ry = ((x - rect.width / 2) / (rect.width / 2)) * 10;
    setTilt({ rx, ry, glareX: (x / rect.width) * 100, glareY: (y / rect.height) * 100 });
  };

  const resetTilt = () => setTilt({ rx: 0, ry: 0, glareX: 50, glareY: 50 });

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  const maxSecondarySubgenres = getLimitValue(user, 'maxSecondarySubgenres');

  const addSecondarySubgenre = (val) => {
    const clean = (val || '').trim();
    if (!clean) return;
    if (form.secondary_subgenres.length >= maxSecondarySubgenres) return;
    if (form.secondary_subgenres.includes(clean) || form.favorite_subgenre === clean) return;
    setForm({ ...form, secondary_subgenres: [...form.secondary_subgenres, clean] });
    setCustomSubgenreInput('');
  };

  const removeSecondarySubgenre = (val) => {
    setForm({
      ...form,
      secondary_subgenres: form.secondary_subgenres.filter((s) => s !== val)
    });
  };

  // Canción principal: si pesa más que el límite del plan, se abre el recortador
  const pickMainAudio = (file, kind) => {
    if (!file) return;
    const check = checkFileSizeLimit(user, file, 'audio');
    if (check.allowed) {
      if (kind === 'dj') setDjAudioFile(file);
      else setClubAudioFile(file);
      return;
    }
    setTrimTarget({ file, kind });
  };
  const mainAudioMaxMb =
    (PRO_FEATURES_ENABLED && isProUser(user) ? FILE_SIZE_LIMITS_MB.PRO : FILE_SIZE_LIMITS_MB.FREE).audio;

  const toggleAvailableDate = (isoDate) => {
    if (autoBookedDatesMap[isoDate]) return;
    const exists = form.available_dates.includes(isoDate);
    setForm({
      ...form,
      available_dates: exists
        ? form.available_dates.filter((d) => d !== isoDate)
        : [...form.available_dates, isoDate].sort()
    });
  };

  const handleDjMediaUpload = async (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingMedia(true);
    setErrorMsg('');
    try {
      await uploadDjMediaFile(file, type, mediaTitle);
      setMediaTitle('');
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const handleClubMediaUpload = async (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingMedia(true);
    setErrorMsg('');
    try {
      await uploadClubMediaFile(file, type, mediaTitle);
      setMediaTitle('');
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setIsSaving(true);
    try {
      await updateUserProfile(form, avatarFile, djAudioFile, clubAudioFile);
      setIsEditing(false);
      setAvatarFile(null);
      setDjAudioFile(null);
      setClubAudioFile(null);
      hasInitializedFormRef.current = false;
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const activeRole = isEditing ? form.role : (user.role || 'Raver');
  // Marco PRO en la tarjeta: mientras editas se ve el que estás eligiendo
    // Marco en la tarjeta: mientras editas se ve el que estás eligiendo (si puedes llevarlo)
    const editingFrame = normalizeFrame(form.avatar_frame, form.avatar_frame_color);
  // Marco elegido que este usuario no puede guardar (p. ej. un marco PRO sin ser PRO)
  const frameBlocked = Boolean(
    isEditing && user.role === 'DJ' && editingFrame && !canUseFrame(user, editingFrame.key)
  );
  const cardFrame = isEditing
    ? (editingFrame && canUseFrame(user, editingFrame.key) ? editingFrame : null)
    : getProfileFrame(user);
  const displaySecondary = isEditing ? form.secondary_subgenres : (user.secondary_subgenres || []);

  const getRoleDisplayLabel = (r) => {
    if (r === 'DJ') return 'DJ / Producer';
    if (r === 'Club') return 'Club / Sala';
    return r;
  };

  return (
    <div className="modal-overlay">
      <div className={`modal-card profile-modal-shell ${isEditing ? 'is-wide-editor' : ''}`}>
        <button
          className="modal-close"
          onClick={() => {
            setModal('isProfileOpen', false);
            setModal('isProfileEditing', false);
            setIsEditing(false);
            hasInitializedFormRef.current = false;
          }}
        >
          <X size={18} />
        </button>

        <div className="profile-modal-layout">
          {/* COLUMNA IZQUIERDA: TARJETA 3D HOLOGRÁFICA Y ACCIONES */}
          <div className="profile-left-column">
            <div className="passport-perspective-stage">
              <div
                ref={cardRef}
                className={`holo-passport-card card-role-${activeRole.toLowerCase()}`}
                onMouseMove={handleMouseMove}
                onMouseLeave={resetTilt}
                style={{ transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)` }}
              >
                <div
                  className="holo-glare"
                  style={{ background: `radial-gradient(circle at ${tilt.glareX}% ${tilt.glareY}%, rgba(250, 204, 21, 0.22), transparent 60%)` }}
                />

                <div className="holo-top-bar">
                  <span className="holo-brand">RAVEX<strong>RADAR</strong> {"// ID PASS"}</span>
                  {/* PUNTO 4: Solo DJs y Ravers muestran BPM; Clubs y Promotores muestran su distintivo */}
                  {(activeRole === 'DJ' || activeRole === 'Raver') ? (
                    <span className="holo-bpm-chip">
                      <Activity size={12} /> {isEditing ? form.favorite_bpm : (user.favorite_bpm || 155)} BPM
                    </span>
                  ) : (
                    <span className="holo-bpm-chip" style={{ background: activeRole === 'Club' ? '#06b6d4' : '#f43f5e', color: '#fff' }}>
                      <ShieldCheck size={12} /> {activeRole === 'Club' ? 'SALA OFICIAL' : 'COLECTIVO'}
                    </span>
                  )}
                </div>

                <div className="holo-identity">
                  <AvatarFrame frame={cardFrame} avatarUrl={avatarPreview} className="holo-avatar-frame">
                    <div className="holo-avatar-wrap">
                      {avatarPreview ? (
                        <img src={avatarPreview} alt="Avatar" referrerPolicy="no-referrer" />
                      ) : (
                        <Disc size={32} className="icon-neon" />
                      )}
                    </div>
                  </AvatarFrame>
                  <div className="holo-user-titles">
                    <h3>@{isEditing ? (form.username || 'usuario') : user.username}</h3>
                    <span className={`holo-role-badge role-${activeRole.toLowerCase()}`}>
                      <ShieldCheck size={12} /> {getRoleDisplayLabel(activeRole)}
                    </span>
                  </div>
                </div>

                <p className="holo-bio">
                  {isEditing ? form.bio : (user.bio || 'Amante del sonido club y frecuencias industriales.')}
                </p>

                {/* PUNTO 5: Métricas públicas personalizadas según el tipo de usuario */}
                <div className="holo-stats-grid">
                  <div className="holo-stat">
                    <span className="holo-stat-val">{isEditing ? form.city : (user.city || 'Madrid')}</span>
                    <span className="holo-stat-lbl"><MapPin size={10} /> PROVINCIA</span>
                  </div>

                  {activeRole === 'DJ' ? (
                    <div className="holo-stat">
                      <span className="holo-stat-val">{user.hype_score || 10} pts</span>
                      <span className="holo-stat-lbl">HYPE SCORE</span>
                    </div>
                  ) : activeRole === 'Club' || activeRole === 'Promotor' ? (
                    <div className="holo-stat">
                      <span className="holo-stat-val">
                        {(events || []).filter((e) => String(e.created_by) === String(user.id) || String(e.venue_id) === String(user.id)).length}
                      </span>
                      <span className="holo-stat-lbl">FIESTAS</span>
                    </div>
                  ) : (
                    <div className="holo-stat">
                      <span className="holo-stat-val">{myAttendingEvents.length}</span>
                      <span className="holo-stat-lbl">ASISTENCIAS</span>
                    </div>
                  )}

                  <div className="holo-stat">
                    <span className="holo-stat-val">{isEditing ? form.favorite_subgenre : (user.favorite_subgenre || 'Hard Techno')}</span>
                    <span className="holo-stat-lbl">GÉNERO</span>
                  </div>
                </div>

                {displaySecondary.length > 0 && (
                  <div className="holo-secondary-genres">
                    {displaySecondary.map((sg) => (
                      <span key={sg} className="holo-subgenre-chip">+{sg}</span>
                    ))}
                  </div>
                )}

                {/* PUNTO 5: Datos públicos extra según el rol (Dirección del Club, Web Oficial y Redes Sociales) */}
                <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {activeRole === 'Club' && (isEditing ? form.street_address : user.street_address) && (
                    <div style={{ fontSize: '11.5px', color: '#67e8f9', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <MapPin size={12} />
                      <span>{isEditing ? form.street_address : user.street_address}, {isEditing ? form.city : user.city}</span>
                    </div>
                  )}

                  {(activeRole === 'Club' || activeRole === 'Promotor') && (isEditing ? form.website_url : user.website_url) && (
                    <a
                      href={isEditing ? form.website_url : user.website_url}
                      target="_blank"
                      rel="noreferrer"
                      className="dj-social-pill"
                      style={{ width: 'fit-content', borderColor: activeRole === 'Club' ? '#06b6d4' : '#f43f5e' }}
                    >
                      <Globe size={12} /> <span>Web Oficial</span>
                    </a>
                  )}

                  {(user.instagram_url || user.spotify_url || user.tiktok_url || user.youtube_url) && (
                    <div className="artist-socials-row">
                      {user.instagram_url && (
                        <a href={user.instagram_url} target="_blank" rel="noreferrer" className="dj-social-pill">
                          <InstagramIcon size={12} /> <span>IG</span>
                        </a>
                      )}
                      {user.spotify_url && (
                        <a href={user.spotify_url} target="_blank" rel="noreferrer" className="dj-social-pill">
                          <SpotifyIcon size={12} /> <span>Spotify</span>
                        </a>
                      )}
                      {user.tiktok_url && (
                        <a href={user.tiktok_url} target="_blank" rel="noreferrer" className="dj-social-pill">
                          <TiktokIcon size={12} /> <span>TikTok</span>
                        </a>
                      )}
                      {user.youtube_url && (
                        <a href={user.youtube_url} target="_blank" rel="noreferrer" className="dj-social-pill">
                          <YoutubeIcon size={12} /> <span>YouTube</span>
                        </a>
                      )}
                    </div>
                  )}
                </div>

                <div className="holo-footer">
                  <span>AUTHENTICATED ELECTRONIC PASSPORT</span>
                  <span className="holo-barcode">||| |||| || ||||| ||||</span>
                </div>
              </div>
            </div>

            {!isEditing && (
              <div className="profile-modal-actions">
       

                <button onClick={() => setIsEditing(true)} className="btn-secondary-outline">
                  <Edit3 size={15} /> Editar Perfil Completo
                </button>
                {(user.role === 'Club' || user.role === 'Promotor' || user.is_admin || user.role === 'Admin') && (
                  <button
                    type="button"
                    className="btn-secondary-outline"
                    style={{
                      borderColor: user.role === 'Club' ? '#06b6d4' : '#f43f5e',
                      color: user.role === 'Club' ? '#67e8f9' : '#fda4af'
                    }}
                    onClick={() => {
                      setModal('isProfileOpen', false);
                      setModal('isManageEventsOpen', true);
                    }}
                  >
                    <Calendar size={15} /> Gestionar Mis Fiestas / Eventos
                  </button>
                )}
                <button onClick={signOut} className="btn-logout-minimal">
                  <LogOut size={14} /> Cerrar Sesión
                </button>

                <button
                  type="button"
                  onClick={() => setModal('isProModalOpen', true)}
                  className={`btn-pro-vip-premium ${isProUser(user) ? 'is-already-pro' : ''}`}
                >
                  <span className="pro-vip-shimmer" />
                  <div className="pro-vip-left">
                    <div className="pro-vip-crown-box">
                      <Crown size={18} />
                    </div>
                    <div className="pro-vip-texts">
                      <strong>{isProUser(user) ? 'MIEMBRO RAVEXRADAR PRO' : 'HACERSE RAVEXRADAR PRO'}</strong>
                      <span>
                        {isProUser(user)
                          ? 'Todas las ventajas PRO desbloqueadas'
                          : 'Límites ampliados · Pin destacado en el mapa · 4,99 €/mes'}
                      </span>
                    </div>
                  </div>
                  <span className="pro-vip-pill">{isProUser(user) ? 'ACTIVO' : 'UPGRADE'}</span>
                </button>
              </div>
            )}
          </div>

          {/* COLUMNA DERECHA: EDITOR CON PESTAÑAS INTERNAS */}
          {isEditing && (
            <form onSubmit={handleSave} className="profile-right-editor">
              <div className="editor-tabs-bar">
                <button
                  type="button"
                  className={editTab === 'basic' ? 'active' : ''}
                  onClick={() => setEditTab('basic')}
                >
                  <SlidersHorizontal size={13} /> Básico & Géneros
                </button>
                <button
                  type="button"
                  className={editTab === 'media' ? 'active' : ''}
                  onClick={() => setEditTab('media')}
                >
                                    <Headphones size={13} /> Redes & Multimedia
                </button>
                {user.role === 'DJ' && (
                  <button
                    type="button"
                    className={editTab === 'frame' ? 'active' : ''}
                    onClick={() => setEditTab('frame')}
                  >
                    <Crown size={13} /> Marco PRO
                  </button>
                )}
                {form.role === 'DJ' && (
                  <button
                    type="button"
                    className={editTab === 'promoters' ? 'active-promoter' : ''}
                    onClick={() => setEditTab('promoters')}
                  >
                    <Lock size={13} /> Info Promotores y Clubs
                  </button>
                )}
              </div>

              {errorMsg && (
                <div className="profile-error-banner">
                  <AlertCircle size={14} /> <span>{errorMsg}</span>
                </div>
              )}

              <div className="editor-tab-scroll-body">
                {/* PESTAÑA 1: BÁSICO, ROL, UBICACIÓN Y GÉNEROS */}
                {editTab === 'basic' && (
                  <div className="editor-section-stack">
                    <label className="avatar-upload-label">
                      <Camera size={15} />
                      <span>{avatarFile ? 'Foto seleccionada (Click para cambiar)' : 'Cambiar foto de perfil'}</span>
                      <input type="file" accept="image/*" onChange={handleImageSelect} />
                    </label>

                    <div className="edit-row">
                      <input
                        type="text"
                        placeholder="Username / Nombre (Obligatorio)"
                        required
                        value={form.username}
                        onChange={(e) => setForm({ ...form, username: e.target.value })}
                      />

                      {/* El selector para cambiar de rol SOLO aparece si la cuenta actual es Raver */}
                      {user.role === 'Raver' ? (
                        <ProSelect
                          value={form.role}
                          options={[
                            { value: 'Raver', label: 'Rol: Raver' },
                            { value: 'DJ', label: 'Solicitar: DJ / Producer' },
                            { value: 'Promotor', label: 'Solicitar: Promotor' },
                            { value: 'Club', label: 'Solicitar: Club / Sala' }
                          ]}
                          onChange={(val) => setForm({ ...form, role: val })}
                        />
                      ) : (
                        <div
                          className={`holo-role-badge role-${user.role.toLowerCase()}`}
                          style={{ margin: 0, padding: '0 14px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}
                          title="Tu rol verificado es permanente"
                        >
                          <ShieldCheck size={14} />
                          <span>{getRoleDisplayLabel(user.role)}</span>
                        </div>
                      )}
                    </div>

                    {/* Si es Raver y elige cambiar a DJ, Promotor o Club con revisión manual activa */}
                    {user.role === 'Raver' && form.role !== 'Raver' && !autoApproveRoles && (
                      <div className="subgenre-box" style={{ borderColor: 'var(--accent-neon)', background: 'rgba(250, 204, 21, 0.08)' }}>
                        <label className="mini-field-label" style={{ color: 'var(--accent-neon)' }}>
                          Solicitud de verificación para {getRoleDisplayLabel(form.role)} (Seguirás siendo Raver hasta que el Admin la apruebe):
                        </label>
                        <textarea
                          rows="2"
                          required
                          placeholder="Envía enlaces a tus redes, SoundCloud o información para verificar tu perfil..."
                          value={form.role_request_message || ''}
                          onChange={(e) => setForm({ ...form, role_request_message: e.target.value })}
                        />
                      </div>
                    )}

                    <div className="edit-row">
                      <ProSelect
                        icon={MapPin}
                        value={form.city}
                        options={SPAIN_LOCATIONS}
                        onChange={(val) => setForm({ ...form, city: val })}
                      />
                      {(form.role === 'DJ' || form.role === 'Raver') && (
                        <input
                          type="number"
                          placeholder="BPM Favorito (ej. 155)"
                          value={form.favorite_bpm}
                          onChange={(e) => setForm({ ...form, favorite_bpm: Number(e.target.value) })}
                        />
                      )}
                    </div>

                    {form.role === 'Club' && (
                      <div className="subgenre-box" style={{ position: 'relative' }}>
                        <label className="mini-field-label">Calle y número exacto del Club / Sala:</label>
                        <input
                          type="text"
                          placeholder="Escribe la calle y número del club (ej. Calle de Atocha 125)..."
                          value={form.street_address}
                          onChange={(e) => {
                            setForm({ ...form, street_address: e.target.value });
                            setClubStreetQuery(e.target.value);
                          }}
                        />
                        {clubStreetResults.length > 0 && (
                          <div className="pro-autocomplete-dropdown">
                            {clubStreetResults.map((loc) => (
                              <button
                                type="button"
                                key={loc.id}
                                className="autocomplete-option"
                                onMouseDown={() => {
                                  const matchedProv = SPAIN_LOCATIONS.find((c) =>
                                    (loc.city || '').toLowerCase().includes(c.value.toLowerCase())
                                  );
                                  setForm({
                                    ...form,
                                    street_address: loc.addressLabel,
                                    city: matchedProv ? matchedProv.value : form.city
                                  });
                                  useRaveStore.setState({
                                    pickedProfileCoords: { lat: loc.lat, lng: loc.lng }
                                  });
                                  setClubStreetResults([]);
                                  setClubStreetQuery('');
                                }}
                              >
                                <MapPin size={14} className="icon-neon" />
                                <div className="autocomplete-info">
                                  <strong>{loc.addressLabel}</strong>
                                  <span>{loc.fullSubtitle}</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {(form.role === 'DJ' || form.role === 'Club' || form.role === 'Promotor') && (
                      <div
                        className="pro-coords-bar"
                        style={{
                          borderColor:
                            form.role === 'Promotor'
                              ? '#f43f5e'
                              : form.role === 'Club'
                              ? '#06b6d4'
                              : '#ff5500'
                        }}
                      >
                        <span>
                          <MapPin
                            size={14}
                            style={{
                              color:
                                form.role === 'Promotor'
                                  ? '#f43f5e'
                                  : form.role === 'Club'
                                  ? '#06b6d4'
                                  : '#ff5500'
                            }}
                          />{' '}
                          {pickedProfileCoords
                            ? `Ubicación en Mapa: ${pickedProfileCoords.lat}, ${pickedProfileCoords.lng}`
                            : 'Elige dónde aparecer en el mapa'}
                        </span>
                        <button
                          type="button"
                          className="btn-pick-coords"
                          style={{
                            background:
                              form.role === 'Promotor'
                                ? '#f43f5e'
                                : form.role === 'Club'
                                ? '#06b6d4'
                                : '#ff5500',
                            color: '#fff'
                          }}
                          onClick={() => startPickingLocation('profile')}
                        >
                          Marcar en Mapa
                        </button>
                      </div>
                    )}

                    <div className="subgenre-box">
                      <label className="mini-field-label">Género Principal (Lista oficial):</label>
                      <ProSelect
                        icon={SlidersHorizontal}
                        value={form.favorite_subgenre}
                        options={ELECTRONIC_GENRE_OPTIONS}
                        onChange={(val) => setForm({ ...form, favorite_subgenre: val })}
                      />
                    </div>

                    <div className="subgenre-box">
                      <label className="mini-field-label">
                        Subgéneros Secundarios ({form.secondary_subgenres.length}/{maxSecondarySubgenres} máx):
                      </label>

                      {form.secondary_subgenres.length < maxSecondarySubgenres && (
                        <>
                          <div className="edit-row">
                            <ProSelect
                              value={presetSubgenreSelect}
                              options={ELECTRONIC_GENRE_OPTIONS}
                              onChange={setPresetSubgenreSelect}
                            />
                            <button
                              type="button"
                              className="btn-add-subgenre"
                              onClick={() => addSecondarySubgenre(presetSubgenreSelect)}
                            >
                              <Plus size={14} /> Lista
                            </button>
                          </div>

                          <div className="edit-row">
                            <input
                              type="text"
                              placeholder="O escribe un subgénero a mano (ej. Hardgroove, Rawstyle...)"
                              value={customSubgenreInput}
                              onChange={(e) => setCustomSubgenreInput(e.target.value)}
                            />
                            <button
                              type="button"
                              className="btn-add-subgenre"
                              onClick={() => addSecondarySubgenre(customSubgenreInput)}
                            >
                              <Plus size={14} /> Añadir
                            </button>
                          </div>
                        </>
                      )}

                      {form.secondary_subgenres.length > 0 && (
                        <div className="secondary-chips-list">
                          {form.secondary_subgenres.map((sg) => (
                            <span key={sg} className="secondary-Editable-chip">
                              {sg}
                              <button type="button" onClick={() => removeSecondarySubgenre(sg)}>
                                <X size={11} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rich-textarea-wrap">
                      <textarea
                        ref={bioRef}
                        rows="4"
                        placeholder="Biografía, historia del club/colectivo o estilo musical..."
                        value={form.bio}
                        onChange={(e) => setForm({ ...form, bio: e.target.value })}
                      />
                      <EmojiPicker
                        targetRef={bioRef}
                        value={form.bio}
                        onChange={(bio) => setForm((f) => ({ ...f, bio }))}
                        placement="bottom"
                      />
                    </div>
                  </div>
                )}

                {/* PESTAÑA 2: REDES SOCIALES, WEB OFICIAL, AUDIO PRINCIPAL Y MULTIMEDIA */}
                {editTab === 'media' && (
                  <div className="editor-section-stack">
                    <label className="mini-field-label">Redes Sociales Oficiales:</label>
                    <div className="edit-row">
                      <div className="social-input-icon-wrap">
                        <InstagramIcon size={14} className="icon-neon" />
                        <input
                          type="url"
                          placeholder="URL Instagram"
                          value={form.instagram_url}
                          onChange={(e) => setForm({ ...form, instagram_url: e.target.value })}
                        />
                      </div>
                      <div className="social-input-icon-wrap">
                        <SpotifyIcon size={14} className="icon-neon" />
                        <input
                          type="url"
                          placeholder="URL Spotify"
                          value={form.spotify_url}
                          onChange={(e) => setForm({ ...form, spotify_url: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="edit-row">
                      <div className="social-input-icon-wrap">
                        <TiktokIcon size={14} className="icon-neon" />
                        <input
                          type="url"
                          placeholder="URL TikTok"
                          value={form.tiktok_url}
                          onChange={(e) => setForm({ ...form, tiktok_url: e.target.value })}
                        />
                      </div>
                      <div className="social-input-icon-wrap">
                        <YoutubeIcon size={14} className="icon-neon" />
                        <input
                          type="url"
                          placeholder="URL YouTube"
                          value={form.youtube_url}
                          onChange={(e) => setForm({ ...form, youtube_url: e.target.value })}
                        />
                      </div>
                    </div>

                    {/* Multimedia exclusivo para DJ */}
                    {form.role === 'DJ' && (
                      <>
                        <label className="mini-field-label">Audio Principal al abrir tu Pin en el Mapa:</label>
                        <ProSelect
                          icon={Music}
                          value={form.dj_audio_source}
                          options={[
                            { value: 'soundcloud', label: 'Reproducir mi SoundCloud' },
                            { value: 'upload', label: 'Subir mi propia canción (.mp3)' }
                          ]}
                          onChange={(val) => setForm({ ...form, dj_audio_source: val })}
                        />

                        {form.dj_audio_source === 'soundcloud' ? (
                          <div className="soundcloud-input-wrap">
                            <Headphones size={16} className="sc-icon" />
                            <input
                              type="url"
                              placeholder="URL de tu perfil o track en SoundCloud"
                              value={form.soundcloud_url}
                              onChange={(e) => setForm({ ...form, soundcloud_url: e.target.value })}
                            />
                          </div>
                        ) : (
                          <label className="avatar-upload-label" style={{ borderColor: '#ff5500', color: '#ff5500' }}>
                            <Music size={15} />
                            <span>
                              {djAudioFile
                                ? `Canción lista: ${djAudioFile.name}`
                                : user.dj_audio_url
                                ? 'Canción guardada (Click para reemplazar)'
                                : 'Seleccionar archivo de audio (.mp3 / .wav)'}
                            </span>
                            <input
                              type="file"
                              accept="audio/*"
                              onChange={(e) => {
                                pickMainAudio(e.target.files?.[0] || null, 'dj');
                                e.target.value = '';
                              }}
                            />
                          </label>
                        )}

                        <div className="dj-media-uploader-box">
                          <span className="dj-media-box-title">
                            <Film size={12} /> Galería: Sesiones, Canciones & Fotos ({(user.dj_media || []).length}/{getLimitValue(user, 'maxDjMediaItems')})
                          </span>
                          <input
                            type="text"
                            placeholder="Título de la sesión, canción o foto..."
                            value={mediaTitle}
                            onChange={(e) => setMediaTitle(e.target.value)}
                          />
                          <div className="edit-row">
                            <label className="avatar-upload-label" style={{ flex: 1, borderColor: '#ff5500', color: '#ff5500' }}>
                              <Film size={14} />
                              <span>{isUploadingMedia ? '...' : '+ Sesión (.mp4)'}</span>
                              <input type="file" accept="video/mp4,video/webm" disabled={isUploadingMedia} onChange={(e) => handleDjMediaUpload(e, 'video')} />
                            </label>

                            <label className="avatar-upload-label" style={{ flex: 1, borderColor: '#facc15', color: '#facc15' }}>
                              <Music size={14} />
                              <span>{isUploadingMedia ? '...' : '+ Canción (.mp3)'}</span>
                              <input type="file" accept="audio/*" disabled={isUploadingMedia} onChange={(e) => handleDjMediaUpload(e, 'track')} />
                            </label>

                            <label className="avatar-upload-label" style={{ flex: 1 }}>
                              <ImageIcon size={14} />
                              <span>{isUploadingMedia ? '...' : '+ Foto'}</span>
                              <input type="file" accept="image/*" disabled={isUploadingMedia} onChange={(e) => handleDjMediaUpload(e, 'photo')} />
                            </label>
                          </div>

                          <MyMediaManager
                            items={Array.isArray(user.dj_media) ? user.dj_media : []}
                            uploading={isUploadingMedia}
                            onDelete={(m) => removeDjMediaItem(m.id)}
                            emptyText="Aún no has subido sesiones, canciones ni fotos."
                          />
                        </div>
                      </>
                    )}

                    {/* Multimedia para Club y Promotor: Web Oficial, Audio de Pin, Vídeo y Fotos */}
                    {(form.role === 'Club' || form.role === 'Promotor') && (
                      <>
                        <label className="mini-field-label">
                          Página Web Oficial ({form.role === 'Promotor' ? 'Promotora / Colectivo' : 'Club / Sala'}):
                        </label>
                        <div className="social-input-icon-wrap">
                          <Globe size={14} style={{ color: form.role === 'Promotor' ? '#f43f5e' : '#06b6d4' }} />
                          <input
                            type="url"
                            placeholder="https://www.tuweboficial.com"
                            value={form.website_url}
                            onChange={(e) => setForm({ ...form, website_url: e.target.value })}
                          />
                        </div>

                        <label className="mini-field-label">
                          Audio Principal al abrir tu Pin en el Mapa:
                        </label>
                        <label
                          className="avatar-upload-label"
                          style={{
                            borderColor: form.role === 'Promotor' ? '#f43f5e' : '#06b6d4',
                            color: form.role === 'Promotor' ? '#f43f5e' : '#06b6d4'
                          }}
                        >
                          <Music size={15} />
                          <span>
                            {clubAudioFile
                              ? `Canción lista: ${clubAudioFile.name}`
                              : user.club_audio_url
                              ? '✓ Canción guardada (Click para cambiar)'
                              : '+ Subir Canción Principal (.mp3 / .wav)'}
                          </span>
                          <input
                            type="file"
                            accept="audio/*"
                            onChange={(e) => {
                              pickMainAudio(e.target.files?.[0] || null, 'club');
                              e.target.value = '';
                            }}
                          />
                        </label>

                        <div
                          className="dj-media-uploader-box"
                          style={{ borderColor: form.role === 'Promotor' ? 'rgba(244, 63, 94, 0.45)' : 'rgba(6, 182, 212, 0.4)' }}
                        >
                          <span
                            className="dj-media-box-title"
                            style={{ color: form.role === 'Promotor' ? '#f43f5e' : '#06b6d4' }}
                          >
                            <Film size={12} /> Multimedia: Vídeo Oficial & Galería de Fotos
                          </span>

                          <input
                            type="text"
                            placeholder="Título opcional de la foto o aftermovie..."
                            value={mediaTitle}
                            onChange={(e) => setMediaTitle(e.target.value)}
                          />

                          <div className="edit-row">
                            <label
                              className="avatar-upload-label"
                              style={{
                                flex: 1,
                                borderColor: form.role === 'Promotor' ? '#f43f5e' : '#06b6d4',
                                color: form.role === 'Promotor' ? '#f43f5e' : '#06b6d4'
                              }}
                            >
                              <Film size={14} />
                              <span>
                                {isUploadingMedia
                                  ? 'Subiendo...'
                                  : user.club_video_url
                                  ? '✓ Vídeo Subido (Cambiar)'
                                  : '+ Subir Vídeo (.mp4)'}
                              </span>
                              <input
                                type="file"
                                accept="video/mp4,video/webm"
                                disabled={isUploadingMedia}
                                onChange={(e) => handleClubMediaUpload(e, 'video')}
                              />
                            </label>

                            <label
                              className="avatar-upload-label"
                              style={{ flex: 1, borderColor: 'var(--accent-neon)', color: 'var(--accent-neon)' }}
                            >
                              <ImageIcon size={14} />
                              <span>
                                {isUploadingMedia
                                  ? 'Subiendo...'
                                  : `+ Subir Foto (${(user.club_media || []).length}/${getLimitValue(user, 'maxGalleryPhotos')})`}
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                disabled={isUploadingMedia}
                                onChange={(e) => handleClubMediaUpload(e, 'photo')}
                              />
                            </label>
                          </div>

                          <MyMediaManager
                            items={[
                              ...(user.club_video_url
                                ? [{ id: '__club_video__', type: 'video', url: user.club_video_url, title: 'Vídeo oficial' }]
                                : []),
                              ...(Array.isArray(user.club_media) ? user.club_media : []).map((m) => ({ ...m, type: 'photo' }))
                            ]}
                            typeLabels={{ video: 'Vídeo' }}
                            uploading={isUploadingMedia}
                            onDelete={(m) => (m.id === '__club_video__' ? removeClubVideo() : removeClubMediaItem(m.id))}
                            emptyText="Aún no has subido el vídeo ni fotos."
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}

                                {/* PESTAÑA: MARCO ANIMADO PRO (solo DJs) */}
                {editTab === 'frame' && user.role === 'DJ' && (
                  <div className="editor-section-stack">
                    <AvatarFramePicker
                      value={{ key: form.avatar_frame, color: form.avatar_frame_color }}
                      onChange={(v) => setForm((f) => ({ ...f, avatar_frame: v.key, avatar_frame_color: v.color }))}
                      avatarUrl={avatarPreview}
                      isPro={isProUser(user)}
                      isFounder={Boolean(user.is_founder)}
                      onUpgrade={() => setModal('isProModalOpen', true)}
                    />
                  </div>
                )}

                {/* PESTAÑA 3: INFORMACIÓN PRIVADA PARA PROMOTORES Y CLUBS */}
                {editTab === 'promoters' && form.role === 'DJ' && (
                  <div className="editor-section-stack">
                    <div className="promoter-private-banner">
                      <Lock size={14} className="icon-neon" />
                      <span>
                        <strong>Vista Privada para Promotores y Clubs:</strong> Estos datos solo los verán los promotores y clubs/salas al consultar tu perfil profesional.
                      </span>
                    </div>

                    <div className="edit-row">
                      <div className="social-input-icon-wrap" style={{ flex: 1 }}>
                        <DollarSign size={14} className="icon-neon" />
                        <input
                          type="text"
                          placeholder="Caché orientativo (ej. 350€ / 2h Set)"
                          value={form.booking_fee}
                          onChange={(e) => setForm({ ...form, booking_fee: e.target.value })}
                        />
                      </div>

                      <label className="promoter-check-pill">
                        <input
                          type="checkbox"
                          checked={form.is_fee_negotiable}
                          onChange={(e) => setForm({ ...form, is_fee_negotiable: e.target.checked })}
                        />
                        <span>Tarifa Negociable</span>
                      </label>
                    </div>

                    <div className="travel-selector-row">
                      <span className="mini-field-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Plane size={14} className="icon-neon" /> Disponibilidad para viajar a otras provincias:
                      </span>
                      <div className="travel-toggle-btns">
                        <button
                          type="button"
                          className={form.willing_to_travel ? 'active' : ''}
                          onClick={() => setForm({ ...form, willing_to_travel: true })}
                        >
                          Sí, disponible
                        </button>
                        <button
                          type="button"
                          className={!form.willing_to_travel ? 'active' : ''}
                          onClick={() => setForm({ ...form, willing_to_travel: false })}
                        >
                          No (Solo local)
                        </button>
                      </div>
                    </div>

                    <div className="dj-calendar-box">
                      <p className="dj-calendar-hint">
                        Todas tus fechas salen como <strong>LIBRES</strong> por defecto. Haz clic en cualquier día de los próximos <strong>6 meses</strong> para marcarlo como <strong>OCUPADO</strong> (los días con Lineup se marcan solos). ¿Pinchas en una fiesta que no está en el mapa? Añádela como <strong>evento propio</strong>.
                      </p>
                      <DjCalendarEditor
                        manuallyBusyDates={form.available_dates}
                        autoBookedDatesMap={autoBookedDatesMap}
                        autoBookedEvents={autoBookedEventsByDate}
                        onToggleBusyDate={toggleAvailableDate}
                        ownEvents={form.dj_private_events}
                        onOwnEventsChange={(list) => setForm((f) => ({ ...f, dj_private_events: list }))}
                        defaultCity={form.city || user.city || 'Madrid'}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="editor-footer-btns">
                <button
                  type="button"
                  className="btn-secondary-outline"
                  onClick={() => {
                    setIsEditing(false);
                    setModal('isProfileEditing', false);
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-neon-full"
                  disabled={isSaving || frameBlocked}
                  title={frameBlocked ? 'Ese marco es PRO: quítalo o hazte PRO para guardar' : undefined}
                >
                  <Check size={16} /> {isSaving ? 'Guardando...' : 'Guardar Perfil'}
                </button>
              </div>
              {frameBlocked && (
                <p className="editor-save-blocked">
                  🔒 Has elegido un marco que no puedes llevar. Pon «Sin marco» (o uno disponible) o hazte PRO para guardar.
                </p>
              )}
            </form>
          )}
        </div>
      </div>

      {trimTarget && (
        <AudioTrimmer
          file={trimTarget.file}
          maxMb={mainAudioMaxMb}
          isPro={PRO_FEATURES_ENABLED && isProUser(user)}
          proMaxMb={FILE_SIZE_LIMITS_MB.PRO.audio}
          accent={trimTarget.kind === 'dj' ? '#ff5500' : form.role === 'Promotor' ? '#f43f5e' : '#06b6d4'}
          onCancel={() => setTrimTarget(null)}
          onDone={(trimmed) => {
            if (trimTarget.kind === 'dj') setDjAudioFile(trimmed);
            else setClubAudioFile(trimmed);
            setTrimTarget(null);
          }}
        />
      )}
    </div>
  );
};
