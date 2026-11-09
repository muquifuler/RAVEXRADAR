// src/components/ArtistDrawer/ArtistDrawer.jsx
import React, { useState, useEffect, useRef } from 'react';
import {
  X, Headphones, Trophy, Flame, MapPin, Activity,
  Calendar, MessageSquare, UserPlus, ExternalLink, Disc,
  Sparkles, Check, Clock, Volume2, VolumeX, Radio,
  Film, ChevronLeft, ChevronRight, Image as ImageIcon,
  Music, Play, Pause, Lock, Maximize2, Briefcase, DollarSign, Plane,
  Handshake, Send, Crown
} from 'lucide-react';
import { InstagramIcon, YoutubeIcon, SpotifyIcon, TiktokIcon } from '../ui/BrandIcons';
import { DjSixMonthCalendar } from '../ui/DjSixMothCalendar';
import { useRaveStore, isEventLockedSecret } from '../../store/useRaveStore';
import { translations } from '../../i18n/translations';
import { isProUser } from '../../constants/proConfig';
import { AvatarFrame } from '../ui/AvatarFrame';
import { getProfileFrame } from '../../lib/avatarFrames';
import { OwnerDeleteButton } from '../ui/OwnerDeleteButton';
import { CollabRequestModal } from '../ui/CollabRequestModal';
import { MEDIA_TAKEOVER_EVENT } from '../../lib/mediaSync';
import { RaveVideo } from '../ui/RaveVideo';
import { ShareButton } from '../ui/ShareButton';
import './ArtistDrawer.css';

const WAVE_BARS = [
  35, 65, 45, 85, 55, 95, 70, 40, 80, 100,
  60, 45, 90, 75, 50, 85, 95, 65, 40, 70,
  90, 55, 80, 60, 45, 75, 85, 50, 65, 40
];

const formatTime = (sec) => {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

const CyberWavePlayer = ({ item, activeAudioId, onActivateAudio, ownerAction = null }) => {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = new Audio(item.url);
    audioRef.current = audio;

    const handleLoaded = () => setDuration(audio.duration || 0);
    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration) setProgress((audio.currentTime / audio.duration) * 100);
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setProgress(0);
    };

    audio.addEventListener('loadedmetadata', handleLoaded);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.pause();
      audio.src = '';
      audio.removeEventListener('loadedmetadata', handleLoaded);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [item.url]);

  useEffect(() => {
    if (activeAudioId !== item.id && isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, [activeAudioId, item.id, isPlaying]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      onActivateAudio(item.id);
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleBarSeek = (barIndex) => {
    if (!audioRef.current || !duration) return;
    const pct = (barIndex + 1) / WAVE_BARS.length;
    audioRef.current.currentTime = pct * duration;
    setProgress(pct * 100);
  };

  return (
    <div className={`cyber-wave-player ${isPlaying ? 'is-playing' : ''}`}>
      <div className="cyber-wave-top">
        <button type="button" className="cyber-play-btn" onClick={togglePlay}>
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <div className="cyber-track-meta">
          <strong>{item.title}</strong>
          <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
        </div>
        <span className="media-type-pill track">
          <Music size={10} /> TRACK
        </span>
        {ownerAction}
      </div>

      <div className="cyber-bars-container">
        {WAVE_BARS.map((heightPct, idx) => {
          const barThreshold = ((idx + 1) / WAVE_BARS.length) * 100;
          const isFilled = progress >= barThreshold;
          return (
            <button
              type="button"
              key={idx}
              className={`cyber-wave-bar ${isFilled ? 'filled' : ''}`}
              style={{ height: `${heightPct}%` }}
              onClick={() => handleBarSeek(idx)}
            />
          );
        })}
      </div>
    </div>
  );
};

export const ArtistDrawer = () => {
  const {
    lang, selectedDj, selectedDjEvents, isDjEventsLoading,
    isDjMediaExpanded, djLeftPanelMode, toggleDjMediaExpand, toggleDjPromoterExpand,
    selectDj, djs, myHypedDjIds, giveHypeToDj, addFriendByUserId,
    openDirectMessageWithUser, selectEvent, inspectUserById,
    myAttendingEventIds, openMediaLightbox, user, friends,
    initiateDjToDjCollab, chatRooms, requireAuth, removeDjMediaItem
  } = useRaveStore();

  const [isBioExpanded, setIsBioExpanded] = useState(false);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [mediaFilter, setMediaFilter] = useState('ALL');
  const [isMuted, setIsMuted] = useState(false);
  const [activeAudioId, setActiveAudioId] = useState('main');
  const [isDjCollabBoxOpen, setIsDjCollabBoxOpen] = useState(false);
  const [djCollabMsg, setDjCollabMsg] = useState('');
  const [isSendingDjCollab, setIsSendingDjCollab] = useState(false);

  const mainAudioRef = useRef(null);
  const scIframeRef = useRef(null);
  const videoRefsMap = useRef({});
  const t = translations[lang];

  // Si se amplía un vídeo (visor a pantalla completa), aquí se para todo lo que suene
  const takeoverRef = useRef(null);
  useEffect(() => {
    const onTakeover = () => takeoverRef.current?.();
    window.addEventListener(MEDIA_TAKEOVER_EVENT, onTakeover);
    return () => window.removeEventListener(MEDIA_TAKEOVER_EVENT, onTakeover);
  }, []);

  const isCustomUpload = selectedDj?.dj_audio_source === 'upload' && Boolean(selectedDj?.dj_audio_url);

  useEffect(() => {
    setShowAllEvents(false);
    setIsBioExpanded(false);
    setActiveAudioId('main');
    setIsMuted(false);
    setIsDjCollabBoxOpen(false);
    setDjCollabMsg('');
    setIsSendingDjCollab(false);
  }, [selectedDj?.id]);

  useEffect(() => {
    if (!selectedDj || !isCustomUpload) return;

    const audio = new Audio(selectedDj.dj_audio_url);
    audio.loop = true;
    audio.volume = 0.75;
    mainAudioRef.current = audio;

    if (activeAudioId === 'main') {
      audio.play().catch(() => {});
    }

    return () => {
      audio.pause();
      audio.src = '';
    };
  }, [selectedDj?.id, isCustomUpload]);

  const handleActivateGalleryMedia = (mediaId) => {
    setActiveAudioId(mediaId);
    if (mainAudioRef.current) {
      mainAudioRef.current.pause();
      setIsMuted(true);
    }
    if (scIframeRef.current?.contentWindow) {
      scIframeRef.current.contentWindow.postMessage(JSON.stringify({ method: 'pause' }), '*');
    }
    Object.entries(videoRefsMap.current).forEach(([id, vidEl]) => {
      if (id !== mediaId && vidEl && !vidEl.paused) {
        vidEl.pause();
      }
    });
  };

  takeoverRef.current = () => handleActivateGalleryMedia('__lightbox__');

  const handleResumeMainAudio = () => {
    setActiveAudioId('main');
    setIsMuted(false);
    Object.values(videoRefsMap.current).forEach((vidEl) => {
      if (vidEl && !vidEl.paused) vidEl.pause();
    });
    if (mainAudioRef.current) {
      mainAudioRef.current.muted = false;
      mainAudioRef.current.play().catch(() => {});
    }
  };

  const toggleCustomMute = () => {
    if (activeAudioId !== 'main') {
      handleResumeMainAudio();
      return;
    }
    const next = !isMuted;
    setIsMuted(next);
    if (mainAudioRef.current) {
      mainAudioRef.current.muted = next;
      if (!next && mainAudioRef.current.paused) mainAudioRef.current.play().catch(() => {});
    }
  };

  if (!selectedDj) return null;

  const alreadyHyped = myHypedDjIds.includes(selectedDj.id);

  const existingFriendship = user
    ? friends.find(
        (f) =>
          (f.requester_id === user.id && f.addressee_id === selectedDj.id) ||
          (f.requester_id === selectedDj.id && f.addressee_id === user.id)
      )
    : null;

  const canViewPromoterInfo = Boolean(
    user &&
      (user.role === 'Promotor' ||
        user.role === 'Club' ||
        user.role === 'Admin' ||
        user.is_admin ||
        String(user.id) === String(selectedDj.id))
  );

  // Mapa de fechas ocupadas automáticamente por Lineup o asistencia del DJ
  const djAutoBookedDatesMap = (selectedDjEvents || []).reduce((acc, ev) => {
    if (ev.start_date) {
      acc[ev.start_date] = `${ev.isOfficialLineup ? 'Lineup' : 'Evento'}: ${ev.name}`;
    }
    return acc;
  }, {});

  const cityDjs = djs
    .filter((d) => (d.city || 'Madrid') === (selectedDj.city || 'Madrid'))
    .sort((a, b) => (b.hype_score || 0) - (a.hype_score || 0));
  const cityRankPosition = cityDjs.findIndex((d) => d.id === selectedDj.id) + 1 || 1;

  const scUrl = selectedDj.soundcloud_url || 'https://soundcloud.com/charlottedewittemusic/charlotte-de-witte-bbc-radio-1-essential-mix';
  const soundcloudEmbedSrc = `https://w.soundcloud.com/player/?url=${encodeURIComponent(scUrl)}&color=%23ff5500&inverse=false&auto_play=true&show_user=true&show_artwork=false&visual=false`;

  const bioText = selectedDj.bio || 'DJ & Producer enfocado en ritmos industriales, bombos contundentes y sesiones de alto voltaje en cabina.';
  const secondaryGenres = Array.isArray(selectedDj.secondary_subgenres) ? selectedDj.secondary_subgenres : [];

  const visibleEvents = showAllEvents ? selectedDjEvents : selectedDjEvents.slice(0, 3);
  const djMediaList = Array.isArray(selectedDj.dj_media) ? selectedDj.dj_media : [];
  // Es mi propio perfil: puedo borrar mis vídeos, canciones y fotos desde aquí
  const isOwnProfile = Boolean(user && String(user.id) === String(selectedDj.id));
  const deleteMyMedia = async (item) => {
    const vid = videoRefsMap.current[item.id];
    if (vid && !vid.paused) vid.pause();
    delete videoRefsMap.current[item.id];
    if (activeAudioId === item.id) setActiveAudioId('__none__');
    await removeDjMediaItem(item.id);
  };
  const filteredMedia = djMediaList.filter((m) => mediaFilter === 'ALL' || m.type === mediaFilter);

  const isMediaOpen = isDjMediaExpanded && djLeftPanelMode === 'media';
  const isPromoterPanelOpen = isDjMediaExpanded && djLeftPanelMode === 'promoter';
  const djFrame = getProfileFrame(selectedDj);

  return (
    <aside className={`artist-drawer-shell ${isDjMediaExpanded ? 'is-expanded' : ''}`}>
      {/* COLUMNA IZQUIERDA EXPANDIBLE: MODO 1 (INFO PROMOTORES Y CLUBS) O MODO 2 (MULTIMEDIA) */}
      {isDjMediaExpanded && (
        <div className="artist-media-column">
          {isPromoterPanelOpen ? (
            <>
              <div className="artist-media-header">
                <div className="media-header-title" style={{ color: '#c084fc' }}>
                  <Briefcase size={16} />
                  <strong>Info Promotores & Clubs · @{selectedDj.username}</strong>
                </div>
                <button type="button" className="btn-collapse-chat" onClick={toggleDjPromoterExpand}>
                  <ChevronRight size={18} />
                </button>
              </div>

              <div className="artist-media-feed">
                <div className="dj-promoter-booking-card">
                  <div className="dj-promoter-card-header">
                    <Briefcase size={14} />
                    <strong>Condiciones de Contratación</strong>
                  </div>

                  <div className="dj-promoter-grid">
                    <div className="dj-promoter-stat">
                      <span className="dj-prom-label"><DollarSign size={11} /> Caché Orientativo</span>
                      <strong>{selectedDj.booking_fee || 'A consultar'}</strong>
                      <small>{selectedDj.is_fee_negotiable !== false ? 'Tarifa Negociable' : 'Tarifa Fija'}</small>
                    </div>

                    <div className="dj-promoter-stat">
                      <span className="dj-prom-label"><Plane size={11} /> Desplazamientos</span>
                      <strong>{selectedDj.willing_to_travel !== false ? 'Disponible para viajar' : 'Solo local'}</strong>
                      <small>Base: {selectedDj.city || 'Madrid'}</small>
                    </div>
                  </div>

                  <div className="dj-promoter-dates">
                    <span className="dj-prom-label" style={{ marginBottom: '4px' }}>
                      <Calendar size={11} /> Calendario de Disponibilidad (Próximos 6 Meses):
                    </span>
                    <DjSixMonthCalendar
                      manuallyBusyDates={Array.isArray(selectedDj.available_dates) ? selectedDj.available_dates : []}
                      autoBookedDatesMap={djAutoBookedDatesMap}
                      ownEvents={selectedDj.dj_private_events}
                      readOnly={true}
                    />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="artist-media-header">
                <div className="media-header-title">
                  <Film size={16} style={{ color: '#ff5500' }} />
                  <strong>Multimedia · @{selectedDj.username}</strong>
                </div>
                <button type="button" className="btn-collapse-chat" onClick={toggleDjMediaExpand}>
                  <ChevronRight size={18} />
                </button>
              </div>

              <div className="artist-media-tabs">
                <button
                  type="button"
                  className={mediaFilter === 'ALL' ? 'active' : ''}
                  onClick={() => setMediaFilter('ALL')}
                >
                  Todo ({djMediaList.length})
                </button>
                <button
                  type="button"
                  className={mediaFilter === 'video' ? 'active' : ''}
                  onClick={() => setMediaFilter('video')}
                >
                  <Film size={12} /> Sesiones ({djMediaList.filter((m) => m.type === 'video').length})
                </button>
                <button
                  type="button"
                  className={mediaFilter === 'track' ? 'active' : ''}
                  onClick={() => setMediaFilter('track')}
                >
                  <Music size={12} /> Canciones ({djMediaList.filter((m) => m.type === 'track').length})
                </button>
                <button
                  type="button"
                  className={mediaFilter === 'photo' ? 'active' : ''}
                  onClick={() => setMediaFilter('photo')}
                >
                  <ImageIcon size={12} /> Fotos ({djMediaList.filter((m) => m.type === 'photo').length})
                </button>
              </div>

              <div className="artist-media-feed">
                {filteredMedia.length === 0 ? (
                  <div className="artist-media-empty">
                    <Disc size={28} style={{ color: '#ff5500', opacity: 0.6 }} />
                    <p>@{selectedDj.username} aún no ha subido contenido en esta categoría.</p>
                  </div>
                ) : (
                  filteredMedia.map((item) =>
                    item.type === 'track' ? (
                      <CyberWavePlayer
                        key={item.id}
                        item={item}
                        activeAudioId={activeAudioId}
                        onActivateAudio={handleActivateGalleryMedia}
                        ownerAction={
                          isOwnProfile ? (
                            <OwnerDeleteButton
                              className="is-inline"
                              label="Borrar canción"
                              onDelete={() => deleteMyMedia(item)}
                            />
                          ) : null
                        }
                      />
                    ) : (
                      <div key={item.id} className="artist-media-card owner-media-wrap">
                        {isOwnProfile && (
                          <OwnerDeleteButton
                            label={item.type === 'video' ? 'Borrar vídeo' : 'Borrar foto'}
                            onDelete={() => deleteMyMedia(item)}
                          />
                        )}
                        {item.type === 'video' ? (
                          <RaveVideo
                            ref={(el) => {
                              if (el) videoRefsMap.current[item.id] = el;
                            }}
                            src={item.url}
                            preload="metadata"
                            className="dj-session-video"
                            accent="#ff5500"
                            onPlay={() => handleActivateGalleryMedia(item.id)}
                          />
                        ) : (
                          <img
                            src={item.url}
                            alt={item.title}
                            className="dj-gallery-photo"
                            style={{ cursor: 'zoom-in' }}
                            onClick={() => openMediaLightbox(djMediaList, item.id)}
                          />
                        )}
                        <div
                          className="artist-media-caption"
                          style={{ cursor: 'pointer', justifyContent: 'space-between' }}
                          onClick={() => openMediaLightbox(djMediaList, item.id)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                            <span className={`media-type-pill ${item.type}`}>
                              {item.type === 'video' ? (
                                <><Film size={10} /> DJ SESSION</>
                              ) : (
                                <><ImageIcon size={10} /> FOTO</>
                              )}
                            </span>
                            <strong>{item.title}</strong>
                          </div>
                          <Maximize2 size={13} className="icon-neon" style={{ flexShrink: 0 }} title="Ver en grande" />
                        </div>
                      </div>
                    )
                  )
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* COLUMNA DERECHA: PERFIL DEL ARTISTA */}
      <div className="artist-info-column">
                <button type="button" className="drawer-close" onClick={() => selectDj(null)}>
          <X size={18} />
        </button>
        <ShareButton
          kind="dj"
          value={selectedDj.username}
          title={`@${selectedDj.username} · DJ en RAVEXRADAR`}
          text={`Mira a @${selectedDj.username} en RAVEXRADAR 🎧`}
        />

                <div className={`artist-hero-banner${djFrame ? ' has-avatar-frame' : ''}`}>
          <AvatarFrame frame={djFrame} avatarUrl={selectedDj.avatar_url}>
            <div
              className="artist-avatar-giant"
              style={{ cursor: 'pointer' }}
              onClick={() => inspectUserById(selectedDj.id)}
              title="Ver Carta de Perfil"
            >
              {selectedDj.avatar_url ? (
                <img src={selectedDj.avatar_url} alt={selectedDj.username} referrerPolicy="no-referrer" />
              ) : (
                <Disc size={44} className="icon-neon" />
              )}
              <span className="dj-live-tag"><Headphones size={11} /> DJ</span>
            </div>
          </AvatarFrame>

          <div className="artist-header-titles">
            <div className="drawer-pill-row">
              <span className="artist-verified-pill">
                <Sparkles size={11} /> {t.djVerified}
              </span>
                            {isProUser(selectedDj) && (
                <span className="pro-member-badge pro-tone-dj" title="Miembro RAVEXRADAR PRO">
                  <Crown size={11} /> PRO
                </span>
              )}
              {selectedDj.is_founder && (
                <span className="pro-member-badge founder-badge" title="Uno de los 100 primeros DJs de RAVEXRADAR">
                  FUNDADOR
                </span>
              )}
            </div>
            <h2
              style={{ cursor: 'pointer' }}
              onClick={() => inspectUserById(selectedDj.id)}
              title="Ver Carta de Perfil"
            >
              @{selectedDj.username}
            </h2>
            <div className="artist-Quick-badges">
              <span className="artist-badge-main-genre">
                <Disc size={11} /> {selectedDj.favorite_subgenre || 'Hard Techno'}
              </span>

              {secondaryGenres.map((sg) => (
                <span key={sg} className="artist-badge-subgenre">
                  +{sg}
                </span>
              ))}

              <span className="artist-badge-bpm">
                <Activity size={11} /> {selectedDj.favorite_bpm || 155} BPM
              </span>

              <span className="artist-badge-city">
                <MapPin size={11} /> {selectedDj.city || 'Madrid'}
              </span>
            </div>
          </div>
        </div>

        <div className="artist-drawer-body">
          <div className={`artist-ranking-box rank-tier-${cityRankPosition <= 3 ? cityRankPosition : 'x'}`}>
            <div className="rank-medal" aria-hidden="true">
              <span className="rank-medal-hash">#</span>
              {cityRankPosition}
            </div>
            <div className="rank-copy">
              <span className="rank-kicker">
                <Trophy size={11} /> {t.cityRanking}
              </span>
              <strong>
                {cityRankPosition === 1 ? 'DJ nº1' : `Puesto ${cityRankPosition}`} en {selectedDj.city || 'Madrid'}
              </strong>
              <span className="rank-hype">
                <Flame size={12} /> <b>{selectedDj.hype_score || 10}</b> pts de hype
              </span>
            </div>
            <button
              type="button"
              className={`btn-give-hype ${alreadyHyped ? 'is-hyped' : ''}`}
              disabled={alreadyHyped}
              onClick={() => giveHypeToDj(selectedDj.id)}
            >
              {alreadyHyped ? <Check size={15} /> : <Flame size={15} />}
              <span>{alreadyHyped ? 'Hype' : t.giveHype}</span>
            </button>
          </div>

          {(selectedDj.instagram_url || selectedDj.spotify_url || selectedDj.tiktok_url || selectedDj.youtube_url) && (
            <div className="artist-socials-row">
              {selectedDj.instagram_url && (
                <a href={selectedDj.instagram_url} target="_blank" rel="noreferrer" className="dj-social-pill">
                  <InstagramIcon size={13} /> <span>Instagram</span>
                </a>
              )}
              {selectedDj.spotify_url && (
                <a href={selectedDj.spotify_url} target="_blank" rel="noreferrer" className="dj-social-pill">
                  <SpotifyIcon size={13} /> <span>Spotify</span>
                </a>
              )}
              {selectedDj.tiktok_url && (
                <a href={selectedDj.tiktok_url} target="_blank" rel="noreferrer" className="dj-social-pill">
                  <TiktokIcon size={13} /> <span>TikTok</span>
                </a>
              )}
              {selectedDj.youtube_url && (
                <a href={selectedDj.youtube_url} target="_blank" rel="noreferrer" className="dj-social-pill">
                  <YoutubeIcon size={13} /> <span>YouTube</span>
                </a>
              )}
            </div>
          )}

          <div className="drawer-desc-container">
            <p className={`drawer-desc ${!isBioExpanded ? 'clamped-5-lines' : ''}`}>
              {bioText}
            </p>
            {(bioText.length > 180 || bioText.split('\n').length > 5) && (
              <button
                type="button"
                className="btn-show-more-desc"
                onClick={() => (isBioExpanded || requireAuth()) && setIsBioExpanded(!isBioExpanded)}
              >
                {isBioExpanded ? t.showLess : t.showMore}
              </button>
            )}
          </div>

          <div className="artist-sc-section">
            {isCustomUpload ? (
              <div className="dj-uploaded-player-box">
                <div className="dj-uploaded-info">
                  <Disc size={20} className={`icon-neon ${activeAudioId === 'main' && !isMuted ? 'spin-disc' : ''}`} />
                  <div>
                    <strong>Track Principal de @{selectedDj.username}</strong>
                    <span>
                      {activeAudioId === 'main' && !isMuted
                        ? 'Reproduciendo ahora'
                        : 'En pausa (Reproduciendo galería)'}
                    </span>
                  </div>
                </div>
                <button type="button" className="btn-dj-mute" onClick={toggleCustomMute}>
                  {activeAudioId !== 'main' || isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                  <span>{activeAudioId !== 'main' || isMuted ? 'Reanudar' : 'ON'}</span>
                </button>
              </div>
            ) : (
              <>
                <div className="sc-header-row">
                  <span><Headphones size={14} className="sc-icon" /> <strong>SoundCloud Player</strong></span>
                  {selectedDj.soundcloud_url && (
                    <a href={selectedDj.soundcloud_url} target="_blank" rel="noreferrer" className="sc-ext-link">
                      Abrir en SoundCloud <ExternalLink size={12} />
                    </a>
                  )}
                </div>

                {activeAudioId === 'main' ? (
                  <div className="sc-iframe-wrap">
                    <iframe
                      ref={scIframeRef}
                      key={`${selectedDj.id}_main`}
                      className="sc-iframe-dark"
                      title="DJ SoundCloud Player"
                      width="100%"
                      height="116"
                      scrolling="no"
                      frameBorder="no"
                      allow="autoplay; encrypted-media"
                      src={soundcloudEmbedSrc}
                    />
                  </div>
                ) : (
                  <div className="sc-paused-by-gallery-bar">
                    <span>SoundCloud en pausa mientras reproduces la galería</span>
                    <button type="button" onClick={handleResumeMainAudio}>
                      <Play size={13} /> Reanudar SoundCloud
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="artist-gigs-section">
            <h4>
              <Calendar size={14} className="icon-neon" />{' '}
              {lang === 'es' ? 'Lineup Oficial & Eventos' : 'Official Lineup & Events'}{' '}
              {isDjEventsLoading ? <span className="panel-loading-dots" aria-hidden="true" /> : `(${selectedDjEvents.length})`}
            </h4>
            {isDjEventsLoading ? (
              <div className="panel-skeleton-list" role="status" aria-live="polite">
                <span className="sr-only">{lang === 'es' ? 'Cargando eventos…' : 'Loading events…'}</span>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="panel-skeleton-card">
                    <div className="panel-skeleton-thumb" />
                    <div className="panel-skeleton-lines">
                      <div className="panel-skeleton-line" />
                      <div className="panel-skeleton-line is-short" />
                    </div>
                  </div>
                ))}
              </div>
            ) : visibleEvents.length > 0 ? (
              <>
                {visibleEvents.map((ev) => {
                  const isSecretForUser = isEventLockedSecret(ev, myAttendingEventIds);

                  return (
                    <button
                      type="button"
                      key={ev.id}
                      className={`artist-gig-card ${ev.isOfficialLineup ? 'official-lineup-gig' : ''} ${isSecretForUser ? 'secret-gig-card' : ''}`}
                      onClick={() => selectEvent(ev)}
                    >
                      {isSecretForUser ? (
                        <div className="secret-gig-thumb">
                          <Lock size={16} />
                        </div>
                      ) : (
                        <img src={ev.image_url} alt={ev.name} />
                      )}

                      <div className="gig-card-info">
                        <strong>{isSecretForUser ? '??? (Secret Location)' : ev.name}</strong>
                        <span>
                          {isSecretForUser ? 'Ubicación Secreta (??)' : (ev.venue_name || ev.city)} · {ev.start_date} ({ev.officialSetTime || ev.start_time?.slice(0, 5) || '23:00'})
                        </span>
                      </div>

                      <div className="gig-badges-col">
                        {ev.isOfficialLineup ? (
                          <span className="gig-official-badge">
                            <Headphones size={10} /> EN LINEUP
                          </span>
                        ) : (
                          <span className="gig-attending-badge">
                            <Check size={10} /> VA A IR
                          </span>
                        )}

                        {ev.timingStatus === 'ACTIVE' && (
                          <span className="gig-live-now-badge">
                            <Radio size={10} /> EN CURSO
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}

                {selectedDjEvents.length > 3 && (
                  <button
                    type="button"
                    className="btn-show-more-desc"
                    onClick={() => (showAllEvents || requireAuth()) && setShowAllEvents(!showAllEvents)}
                  >
                    {showAllEvents
                      ? `${t.showLess}`
                      : `${t.showMore} (${selectedDjEvents.length - 3} más)`}
                  </button>
                )}
              </>
            ) : (
              <p className="no-gigs-note">
                {lang === 'es'
                  ? `@${selectedDj.username} no tiene actuaciones ni asistencias próximas registradas.`
                  : `@${selectedDj.username} has no upcoming gigs or attendances registered.`}
              </p>
            )}
          </div>

          <div className="artist-expand-buttons-stack">
            {canViewPromoterInfo && (
              <button
                type="button"
                onClick={toggleDjPromoterExpand}
                className={`btn-toggle-dj-promoter ${isPromoterPanelOpen ? 'active' : ''}`}
              >
                {isPromoterPanelOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                <Briefcase size={15} />
                <span>
                  {isPromoterPanelOpen
                    ? 'Ocultar Info para Promotores y Clubs'
                    : 'Ver Info para Promotores y Clubs'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={toggleDjMediaExpand}
              className={`btn-toggle-dj-media ${isMediaOpen ? 'active' : ''}`}
            >
              {isMediaOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              <Film size={16} />
              <span>
                {isMediaOpen
                  ? 'Contraer Sesiones, Canciones y Fotos'
                  : `Ver Sesiones, Canciones y Fotos (${djMediaList.length})`}
              </span>
            </button>
          </div>

          {user?.id !== selectedDj.id && (
            <>
              {isDjCollabBoxOpen && (
                <CollabRequestModal
                  targetUser={selectedDj}
                  onClose={() => setIsDjCollabBoxOpen(false)}
                  onSend={(message) => initiateDjToDjCollab(selectedDj, message)}
                />
              )}

              <div className="artist-actions-bottom">
                <button
                  type="button"
                  className="btn-secondary-outline"
                  disabled={Boolean(existingFriendship)}
                  onClick={() => addFriendByUserId(selectedDj.id)}
                  style={{
                    gridColumn:
                      existingFriendship?.status === 'accepted' || user?.role === 'DJ'
                        ? 'auto'
                        : '1 / -1'
                  }}
                >
                  {existingFriendship?.status === 'accepted' ? (
                    <><Check size={15} className="icon-neon" /> Amigos</>
                  ) : existingFriendship?.status === 'pending' ? (
                    <><Clock size={15} className="icon-neon" /> Solicitud Enviada</>
                  ) : (
                    <><UserPlus size={15} /> {t.addFriend}</>
                  )}
                </button>

                {/* PUNTO 2: Si quien mira el perfil también es un DJ, botón "Pedir Colaboración" al lado de Añadir Amigo */}
                {user?.role === 'DJ' && (
                  <button
                    type="button"
                    className="btn-neon-full"
                    style={{ background: '#ff5500', color: '#fff' }}
                    onClick={() => {
                      const existingCollab = (chatRooms || []).find(
                        (r) =>
                          r.type === 'collab' &&
                          (r.collabPartner?.id === selectedDj.id ||
                            r.participants?.some((p) => String(p.user_id) === String(selectedDj.id)))
                      );
                      if (existingCollab) {
                        useRaveStore.getState().selectChatRoom(existingCollab);
                        useRaveStore.getState().setModal('isSocialDockOpen', true);
                      } else {
                        setIsDjCollabBoxOpen(!isDjCollabBoxOpen);
                      }
                    }}
                  >
                    <Handshake size={15} />
                    <span>Pedir Colaboración</span>
                  </button>
                )}

                {existingFriendship?.status === 'accepted' && (
                  <button
                    type="button"
                    className="btn-neon-full"
                    style={{ gridColumn: user?.role === 'DJ' ? '1 / -1' : 'auto' }}
                    onClick={() => openDirectMessageWithUser(selectedDj)}
                  >
                    <MessageSquare size={15} /> {t.contactBooking}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  );
};
