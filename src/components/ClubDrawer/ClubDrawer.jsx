// src/components/ClubDrawer/ClubDrawer.jsx
import React, { useState, useEffect, useRef } from 'react';
import {
  X, Building2, MapPin, Calendar, MessageSquare,
  UserPlus, Disc, Sparkles, Check, Clock, Radio, Globe,
  Film, Image as ImageIcon, ChevronLeft, ChevronRight,
  ExternalLink, Users, Volume2, VolumeX, Crown, Maximize2
} from 'lucide-react';
import { InstagramIcon, YoutubeIcon, SpotifyIcon, TiktokIcon } from '../ui/BrandIcons';
import { useRaveStore } from '../../store/useRaveStore';
import { translations } from '../../i18n/translations';
import { isProUser } from '../../constants/proConfig';
import { OwnerDeleteButton } from '../ui/OwnerDeleteButton';
import { MEDIA_TAKEOVER_EVENT } from '../../lib/mediaSync';
import { RaveVideo } from '../ui/RaveVideo';
import { ShareButton } from '../ui/ShareButton';
import { GhostClaimBanner, GhostPill } from '../ui/GhostClaim';
import './ClubDrawer.css';

export const ClubDrawer = () => {
  const {
    lang, selectedClub, selectedClubEvents, selectedEvent,
    isClubInfoExpanded, toggleClubInfoExpand,
    selectClub, selectEventFromClub, openMediaLightbox,
    inspectUserById, addFriendByUserId, openDirectMessageWithUser, user, friends, requireAuth,
    removeClubMediaItem, removeClubVideo
  } = useRaveStore();

  const [isBioExpanded, setIsBioExpanded] = useState(false);
  const [isClubAudioMuted, setIsClubAudioMuted] = useState(false);
  const clubAudioRef = useRef(null);
  const clubVideoRef = useRef(null);
  const t = translations[lang];

  // Al ampliar un vídeo (visor a pantalla completa) se para la música y el vídeo de este panel
  useEffect(() => {
    const onTakeover = () => {
      if (clubAudioRef.current && !clubAudioRef.current.paused) {
        clubAudioRef.current.pause();
        setIsClubAudioMuted(true);
      }
      if (clubVideoRef.current && !clubVideoRef.current.paused) clubVideoRef.current.pause();
    };
    window.addEventListener(MEDIA_TAKEOVER_EVENT, onTakeover);
    return () => window.removeEventListener(MEDIA_TAKEOVER_EVENT, onTakeover);
  }, []);

  // Reproducir automáticamente la canción del Club al abrir su perfil y parar al cerrarlo
  useEffect(() => {
    if (!selectedClub?.club_audio_url) return;

    const audio = new Audio(selectedClub.club_audio_url);
    audio.loop = true;
    audio.volume = 0.75;
    clubAudioRef.current = audio;

    // Solo reproducir si no hay ya un evento abierto reproduciendo su propia canción
    if (!selectedEvent) {
      setIsClubAudioMuted(false);
      audio.play().catch(() => {});
    } else {
      setIsClubAudioMuted(true);
    }

    return () => {
      audio.pause();
      audio.src = '';
      clubAudioRef.current = null;
    };
  }, [selectedClub?.id, selectedClub?.club_audio_url]);

  // Si el usuario hace clic en una fiesta del Club (y se abre el panel del evento con su música), pausar la canción del Club
  useEffect(() => {
    if (!clubAudioRef.current) return;
    if (selectedEvent) {
      clubAudioRef.current.pause();
      setIsClubAudioMuted(true);
    } else if (!isClubAudioMuted) {
      clubAudioRef.current.play().catch(() => {});
    }
  }, [selectedEvent?.id]);

  // Escuchar cuando el audio del evento se activa para pausar inmediatamente la canción del Club
  useEffect(() => {
    const handleMuteFromEvent = () => {
      if (clubAudioRef.current) {
        clubAudioRef.current.pause();
      }
      setIsClubAudioMuted(true);
    };
    window.addEventListener('raveradar:mute-entity-audio', handleMuteFromEvent);
    return () => window.removeEventListener('raveradar:mute-entity-audio', handleMuteFromEvent);
  }, []);

  // Pausar la canción del Club cuando el usuario da al Play en el vídeo promocional del Club
  const pauseClubSongForVideo = () => {
    if (clubAudioRef.current) {
      clubAudioRef.current.pause();
      setIsClubAudioMuted(true);
    }
  };

  const toggleClubAudioMute = () => {
    if (!clubAudioRef.current) return;
    if (isClubAudioMuted || clubAudioRef.current.paused) {
      if (clubVideoRef.current && !clubVideoRef.current.paused) {
        clubVideoRef.current.pause();
      }
      // Silenciar inmediatamente el audio del evento si estaba abierto y sonando
      window.dispatchEvent(new CustomEvent('raveradar:mute-event-audio'));
      useRaveStore.getState().setEventAudioPlaying(false);

      clubAudioRef.current.muted = false;
      clubAudioRef.current.play().catch(() => {});
      setIsClubAudioMuted(false);
    } else {
      clubAudioRef.current.pause();
      setIsClubAudioMuted(true);
    }
  };

  if (!selectedClub) return null;

  const existingFriendship = user
    ? friends.find(
        (f) =>
          (f.requester_id === user.id && f.addressee_id === selectedClub.id) ||
          (f.requester_id === selectedClub.id && f.addressee_id === user.id)
      )
    : null;

  const secondaryGenres = Array.isArray(selectedClub.secondary_subgenres)
    ? selectedClub.secondary_subgenres
    : [];

  const clubPhotos = Array.isArray(selectedClub.club_media) ? selectedClub.club_media : [];
  // Es mi propio perfil: puedo borrar mi vídeo y mis fotos desde aquí
  const isOwnProfile = Boolean(user && String(user.id) === String(selectedClub.id));
  const clubGalleryItems = [
    ...(selectedClub.club_video_url
      ? [{ id: 'club_promo_video', type: 'video', url: selectedClub.club_video_url, title: `Vídeo Oficial · @${selectedClub.username}` }]
      : []),
    ...clubPhotos.map((p) => ({ ...p, type: 'photo' }))
  ];

  const bioText =
    selectedClub.bio ||
    'Club & espacio de música electrónica con programación regular de sesiones y eventos en vivo.';

  return (
    <aside className={`club-drawer-shell ${isClubInfoExpanded ? 'is-expanded' : ''}`}>
      {/* COLUMNA IZQUIERDA SECUNDARIA: VÍDEO Y GALERÍA DE FOTOS DEL CLUB */}
      {isClubInfoExpanded && (
        <div className="club-info-media-column">
          <div className="club-media-header">
            <div className="club-media-title">
              <Film size={16} style={{ color: '#06b6d4' }} />
              <strong>Multimedia del Club · @{selectedClub.username}</strong>
            </div>
            <button type="button" className="btn-collapse-chat" onClick={toggleClubInfoExpand}>
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="club-media-scroll-body">
            <div className="club-media-section">
              <h4><Film size={14} style={{ color: '#06b6d4' }} /> Vídeo Oficial de la Sala</h4>
              {selectedClub.club_video_url ? (
                <div className="club-video-card owner-media-wrap">
                  {isOwnProfile && (
                    <OwnerDeleteButton
                      label="Borrar vídeo"
                      onDelete={async () => {
                        if (clubVideoRef.current && !clubVideoRef.current.paused) clubVideoRef.current.pause();
                        await removeClubVideo();
                      }}
                    />
                  )}
                  <RaveVideo
                    ref={clubVideoRef}
                    src={selectedClub.club_video_url}
                    preload="metadata"
                    className="club-promo-video"
                    accent="#06b6d4"
                    onPlay={pauseClubSongForVideo}
                  />
                  <button
                    type="button"
                    className="club-video-expand"
                    onClick={() => openMediaLightbox(clubGalleryItems, 'club_promo_video')}
                  >
                    <Maximize2 size={13} />
                    <span>Ver en grande</span>
                  </button>
                </div>
              ) : (
                <p className="no-gigs-note">Este club aún no ha subido un vídeo promocional.</p>
              )}
            </div>

            <div className="club-media-section">
              <h4><ImageIcon size={14} style={{ color: '#06b6d4' }} /> Galería de Imágenes ({clubPhotos.length})</h4>
              {clubPhotos.length > 0 ? (
                <div className="club-photos-grid">
                  {clubPhotos.map((photo) => (
                    <div
                      key={photo.id}
                      className="club-photo-card owner-media-wrap"
                      style={{ cursor: 'zoom-in' }}
                      onClick={() => openMediaLightbox(clubGalleryItems, photo.id)}
                    >
                      {isOwnProfile && (
                        <OwnerDeleteButton label="Borrar foto" onDelete={() => removeClubMediaItem(photo.id)} />
                      )}
                      <img src={photo.url} alt={photo.title} />
                      {photo.title && <span>{photo.title}</span>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="no-gigs-note">Este club aún no ha subido fotos de sus instalaciones.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* COLUMNA PRINCIPAL DERECHA DEL CLUB */}
      <div className="club-main-column">
                <button type="button" className="drawer-close" onClick={() => selectClub(null)}>
          <X size={18} />
        </button>
        <ShareButton
          kind="club"
          value={selectedClub.username}
          title={`${selectedClub.username} · Club en RAVEXRADAR`}
          text={`Mira las fiestas de ${selectedClub.username} en RAVEXRADAR 🔊`}
        />

        <div className="club-hero-banner">
          <div
            className="club-avatar-square"
            style={{ cursor: 'pointer' }}
            onClick={() => inspectUserById(selectedClub.id)}
            title="Ver Carta de Perfil"
          >
            {selectedClub.avatar_url ? (
              <img src={selectedClub.avatar_url} alt={selectedClub.username} referrerPolicy="no-referrer" />
            ) : (
              <Building2 size={40} style={{ color: '#06b6d4' }} />
            )}
            <span className="club-live-tag">
              <Building2 size={10} /> CLUB
            </span>
          </div>

          <div className="artist-header-titles">
            <div className="drawer-pill-row">
            {selectedClub.is_ghost ? (
                <GhostPill />
              ) : (
                <span className="club-verified-pill">
                  <Sparkles size={11} /> {t.clubVerified}
                </span>
              )}
              {isProUser(selectedClub) && (
                <span className="pro-member-badge pro-tone-club" title="Miembro RAVEXRADAR PRO">
                  <Crown size={11} /> PRO
                </span>
              )}
            </div>
            <h2
              style={{ cursor: 'pointer' }}
              onClick={() => inspectUserById(selectedClub.id)}
              title="Ver Carta de Perfil"
            >
              @{selectedClub.username}
            </h2>
            <div className="artist-Quick-badges">
              <span className="club-badge-main-genre">
                <Disc size={11} /> {selectedClub.favorite_subgenre || 'Techno / Electronic'}
              </span>
              {secondaryGenres.map((sg) => (
                <span key={sg} className="artist-badge-subgenre">
                  +{sg}
                </span>
              ))}
              <span className="artist-badge-city">
                <MapPin size={11} /> {selectedClub.city || 'Madrid'}
              </span>
            </div>

            {selectedClub.street_address && (
              <div className="club-street-line">
                <MapPin size={12} />
                <span>{selectedClub.street_address}, {selectedClub.city}</span>
              </div>
            )}
          </div>
        </div>

        <div className="artist-drawer-body">
          <GhostClaimBanner profile={selectedClub} />
          {/* Web Oficial y Redes Sociales directamente en el Panel Principal del Club */}
          {(selectedClub.website_url ||
            selectedClub.instagram_url ||
            selectedClub.spotify_url ||
            selectedClub.tiktok_url ||
            selectedClub.youtube_url) && (
            <div className="club-links-showcase">
              {selectedClub.website_url && (
                <a
                  href={selectedClub.website_url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-club-official-web"
                >
                  <Globe size={15} />
                  <span>Visitar Web Oficial del Club</span>
                  <ExternalLink size={13} style={{ marginLeft: 'auto' }} />
                </a>
              )}

              {(selectedClub.instagram_url ||
                selectedClub.spotify_url ||
                selectedClub.tiktok_url ||
                selectedClub.youtube_url) && (
                <div className="artist-socials-row">
                  {selectedClub.instagram_url && (
                    <a href={selectedClub.instagram_url} target="_blank" rel="noreferrer" className="dj-social-pill">
                      <InstagramIcon size={13} /> <span>Instagram</span>
                    </a>
                  )}
                  {selectedClub.spotify_url && (
                    <a href={selectedClub.spotify_url} target="_blank" rel="noreferrer" className="dj-social-pill">
                      <SpotifyIcon size={13} /> <span>Spotify</span>
                    </a>
                  )}
                  {selectedClub.tiktok_url && (
                    <a href={selectedClub.tiktok_url} target="_blank" rel="noreferrer" className="dj-social-pill">
                      <TiktokIcon size={13} /> <span>TikTok</span>
                    </a>
                  )}
                  {selectedClub.youtube_url && (
                    <a href={selectedClub.youtube_url} target="_blank" rel="noreferrer" className="dj-social-pill">
                      <YoutubeIcon size={13} /> <span>YouTube</span>
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {selectedClub.club_audio_url && (
            <div className="dj-uploaded-player-box" style={{ borderColor: '#06b6d4' }}>
              <div className="dj-uploaded-info">
                <Disc size={20} className={!isClubAudioMuted ? 'spin-disc' : ''} style={{ color: '#06b6d4' }} />
                <div>
                  <strong>Track Oficial · @{selectedClub.username}</strong>
                  <span style={{ color: '#67e8f9' }}>
                    {isClubAudioMuted ? 'Audio en pausa' : 'Sonando ahora'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="btn-dj-mute"
                style={{ background: '#06b6d4', color: '#09090b' }}
                onClick={toggleClubAudioMute}
              >
                {isClubAudioMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                <span>{isClubAudioMuted ? 'Reanudar' : 'ON'}</span>
              </button>
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

          <div className="artist-gigs-section">
            <h4>
              <Calendar size={14} style={{ color: '#06b6d4' }} />{' '}
              {t.clubUpcomingEvents} ({selectedClubEvents.length})
            </h4>
            {selectedClubEvents.length > 0 ? (
              selectedClubEvents.map((ev) => {
                const isSelectedNow = selectedEvent?.id === ev.id;
                return (
                  <button
                    type="button"
                    key={ev.id}
                    className={`artist-gig-card club-gig-card ${isSelectedNow ? 'is-active-cascade' : ''}`}
                    onClick={() => selectEventFromClub(ev)}
                  >
                    <img src={ev.image_url} alt={ev.name} />
                    <div className="gig-card-info">
                      <strong>{ev.name}</strong>
                      <span>
                        <MapPin size={10} style={{ display: 'inline', marginRight: '3px' }} />
                        {ev.city || selectedClub.city || 'Madrid'} · {ev.start_date} · {ev.start_time?.slice(0, 5) || '23:00'} ({ev.subgenre})
                      </span>
                    </div>

                    <div className="gig-badges-col">
                      <span className="club-ev-att-pill">
                        <Users size={10} /> {ev.attendees_count || 0}
                      </span>
                      {ev.is_active_now && (
                        <span className="gig-live-now-badge">
                          <Radio size={10} /> EN CURSO
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            ) : (
              <p className="no-gigs-note">
                {lang === 'es'
                  ? `Aún no hay eventos próximos vinculados a @${selectedClub.username}.`
                  : `No upcoming events linked to @${selectedClub.username} yet.`}
              </p>
            )}
          </div>

          <button
            type="button"
            className={`btn-toggle-club-info ${isClubInfoExpanded ? 'active' : ''}`}
            style={{ marginTop: 'auto' }}
            onClick={toggleClubInfoExpand}
          >
            {isClubInfoExpanded ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            <Film size={15} />
            <span>
              {isClubInfoExpanded
                ? 'Ocultar Vídeo y Fotos del Club'
                : `Ver Vídeo y Fotos del Club (${clubGalleryItems.length})`}
            </span>
          </button>

          {user?.id !== selectedClub.id && !selectedClub.is_ghost && (
            <div className="artist-actions-bottom">
              <button
                type="button"
                className="btn-secondary-outline"
                disabled={Boolean(existingFriendship)}
                onClick={() => addFriendByUserId(selectedClub.id)}
                style={{ gridColumn: existingFriendship?.status === 'accepted' ? 'auto' : '1 / -1' }}
              >
                {existingFriendship?.status === 'accepted' ? (
                  <><Check size={15} className="icon-neon" /> Conectados</>
                ) : existingFriendship?.status === 'pending' ? (
                  <><Clock size={15} className="icon-neon" /> Solicitud Enviada</>
                ) : (
                  <><UserPlus size={15} /> {t.addFriend}</>
                )}
              </button>

              {existingFriendship?.status === 'accepted' && (
                <button
                  type="button"
                  className="btn-neon-full"
                  onClick={() => openDirectMessageWithUser(selectedClub)}
                >
                  <MessageSquare size={15} /> {t.contactBooking}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
