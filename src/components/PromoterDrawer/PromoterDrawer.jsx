// src/components/PromoterDrawer/PromoterDrawer.jsx
import React, { useState, useEffect, useRef } from 'react';
import {
  X, Disc, MapPin, Activity, Calendar, MessageSquare,
  UserPlus, Sparkles, Check, Clock, Radio, Globe,
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
import '../ClubDrawer/ClubDrawer.css';

export const PromoterDrawer = () => {
  const {
    lang, selectedPromoter, selectedPromoterEvents, selectedEvent,
    isPromoterInfoExpanded, togglePromoterInfoExpand,
    selectPromoter, selectEventFromClub, openMediaLightbox,
    inspectUserById, addFriendByUserId, openDirectMessageWithUser, user, friends, requireAuth,
    removeClubMediaItem, removeClubVideo
  } = useRaveStore();

  const [isBioExpanded, setIsBioExpanded] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const audioRef = useRef(null);
  const videoRef = useRef(null);
  const t = translations[lang];

  // Al ampliar un vídeo (visor a pantalla completa) se para la música y el vídeo de este panel
  useEffect(() => {
    const onTakeover = () => {
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        setIsAudioMuted(true);
      }
      if (videoRef.current && !videoRef.current.paused) videoRef.current.pause();
    };
    window.addEventListener(MEDIA_TAKEOVER_EVENT, onTakeover);
    return () => window.removeEventListener(MEDIA_TAKEOVER_EVENT, onTakeover);
  }, []);

  useEffect(() => {
    if (!selectedPromoter?.club_audio_url) return;

    const audio = new Audio(selectedPromoter.club_audio_url);
    audio.loop = true;
    audio.volume = 0.75;
    audioRef.current = audio;

    if (!selectedEvent) {
      setIsAudioMuted(false);
      audio.play().catch(() => {});
    } else {
      setIsAudioMuted(true);
    }

    return () => {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, [selectedPromoter?.id, selectedPromoter?.club_audio_url]);

  useEffect(() => {
    if (!audioRef.current) return;
    if (selectedEvent) {
      audioRef.current.pause();
      setIsAudioMuted(true);
    } else if (!isAudioMuted) {
      audioRef.current.play().catch(() => {});
    }
  }, [selectedEvent?.id]);

  const pauseSongForVideo = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsAudioMuted(true);
    }
  };

  const toggleAudioMute = () => {
    if (!audioRef.current) return;
    if (isAudioMuted || audioRef.current.paused) {
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
      }
      audioRef.current.muted = false;
      audioRef.current.play().catch(() => {});
      setIsAudioMuted(false);
    } else {
      audioRef.current.pause();
      setIsAudioMuted(true);
    }
  };

  if (!selectedPromoter) return null;

  const existingFriendship = user
    ? friends.find(
        (f) =>
          (f.requester_id === user.id && f.addressee_id === selectedPromoter.id) ||
          (f.requester_id === selectedPromoter.id && f.addressee_id === user.id)
      )
    : null;

  const secondaryGenres = Array.isArray(selectedPromoter.secondary_subgenres)
    ? selectedPromoter.secondary_subgenres
    : [];

  const promPhotos = Array.isArray(selectedPromoter.club_media) ? selectedPromoter.club_media : [];
  // Es mi propio perfil: puedo borrar mi vídeo y mis fotos desde aquí
  const isOwnProfile = Boolean(user && String(user.id) === String(selectedPromoter.id));
  const galleryItems = [
    ...(selectedPromoter.club_video_url
      ? [{ id: 'prom_promo_video', type: 'video', url: selectedPromoter.club_video_url, title: `Vídeo Oficial · @${selectedPromoter.username}` }]
      : []),
    ...promPhotos.map((p) => ({ ...p, type: 'photo' }))
  ];

  const bioText =
    selectedPromoter.bio ||
    'Promotora & colectivo enfocado en eventos de música electrónica y cultura de club.';

  return (
    <aside className={`club-drawer-shell promoter-drawer-shell ${isPromoterInfoExpanded ? 'is-expanded' : ''}`}>
      {/* COLUMNA IZQUIERDA SECUNDARIA: VÍDEO Y FOTOS DEL PROMOTOR */}
      {isPromoterInfoExpanded && (
        <div className="club-info-media-column">
          <div className="club-media-header">
            <div className="club-media-title" style={{ color: '#f43f5e' }}>
              <Film size={16} />
              <strong>Multimedia · @{selectedPromoter.username}</strong>
            </div>
            <button type="button" className="btn-collapse-chat" onClick={togglePromoterInfoExpand}>
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="club-media-scroll-body">
            <div className="club-media-section">
              <h4><Film size={14} style={{ color: '#f43f5e' }} /> Aftermovie / Vídeo Oficial</h4>
              {selectedPromoter.club_video_url ? (
                <div className="club-video-card owner-media-wrap">
                  {isOwnProfile && (
                    <OwnerDeleteButton
                      label="Borrar vídeo"
                      onDelete={async () => {
                        if (videoRef.current && !videoRef.current.paused) videoRef.current.pause();
                        await removeClubVideo();
                      }}
                    />
                  )}
                  <RaveVideo
                    ref={videoRef}
                    src={selectedPromoter.club_video_url}
                    preload="metadata"
                    className="club-promo-video"
                    accent="#f43f5e"
                    onPlay={pauseSongForVideo}
                  />
                  <button
                    type="button"
                    className="club-video-expand"
                    onClick={() => openMediaLightbox(galleryItems, 'prom_promo_video')}
                  >
                    <Maximize2 size={13} />
                    <span>Ver en grande</span>
                  </button>
                </div>
              ) : (
                <p className="no-gigs-note">Este promotor aún no ha subido un vídeo promocional.</p>
              )}
            </div>

            <div className="club-media-section">
              <h4><ImageIcon size={14} style={{ color: '#f43f5e' }} /> Galería de Fotos ({promPhotos.length})</h4>
              {promPhotos.length > 0 ? (
                <div className="club-photos-grid">
                  {promPhotos.map((photo) => (
                    <div
                      key={photo.id}
                      className="club-photo-card owner-media-wrap"
                      style={{ cursor: 'zoom-in' }}
                      onClick={() => openMediaLightbox(galleryItems, photo.id)}
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
                <p className="no-gigs-note">Este promotor aún no ha subido fotos a su galería.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* COLUMNA PRINCIPAL DERECHA DEL PROMOTOR */}
      <div className="club-main-column">
                <button type="button" className="drawer-close" onClick={() => selectPromoter(null)}>
          <X size={18} />
        </button>
        <ShareButton
          kind="promotor"
          value={selectedPromoter.username}
          title={`${selectedPromoter.username} · Promotor en RAVEXRADAR`}
          text={`Mira las fiestas de ${selectedPromoter.username} en RAVEXRADAR 🔊`}
        />

        <div
          className="club-hero-banner"
          style={{
            background: 'linear-gradient(160deg, rgba(244, 63, 94, 0.22) 0%, rgba(250, 204, 21, 0.08) 50%, #0d0d11 100%)'
          }}
        >
          <div
            className="club-avatar-square"
            style={{ cursor: 'pointer', borderColor: '#f43f5e', boxShadow: '0 0 20px rgba(244, 63, 94, 0.35)' }}
            onClick={() => inspectUserById(selectedPromoter.id)}
            title="Ver Carta de Perfil"
          >
            {selectedPromoter.avatar_url ? (
              <img src={selectedPromoter.avatar_url} alt={selectedPromoter.username} referrerPolicy="no-referrer" />
            ) : (
              <Disc size={40} style={{ color: '#f43f5e' }} />
            )}
            <span className="club-live-tag" style={{ background: '#f43f5e', color: '#fff' }}>
              <Disc size={10} /> PROMO
            </span>
          </div>

          <div className="artist-header-titles">
            <div className="drawer-pill-row">
              {selectedPromoter.is_ghost ? (
                <GhostPill />
              ) : (
                <span className="club-verified-pill" style={{ color: '#fda4af' }}>
                  <Sparkles size={11} /> Promotor / Colectivo Oficial
                </span>
              )}
              {isProUser(selectedPromoter) && (
                <span className="pro-member-badge pro-tone-promoter" title="Miembro RAVEXRADAR PRO">
                  <Crown size={11} /> PRO
                </span>
              )}
            </div>
            <h2
              style={{ cursor: 'pointer' }}
              onClick={() => inspectUserById(selectedPromoter.id)}
              title="Ver Carta de Perfil"
            >
              @{selectedPromoter.username}
            </h2>
            <div className="artist-Quick-badges">
              <span className="club-badge-main-genre" style={{ background: '#f43f5e', color: '#fff' }}>
                <Disc size={11} /> {selectedPromoter.favorite_subgenre || 'Hard Techno'}
              </span>
              {secondaryGenres.map((sg) => (
                <span key={sg} className="artist-badge-subgenre">
                  +{sg}
                </span>
              ))}
              <span className="artist-badge-city">
                <MapPin size={11} /> {selectedPromoter.city || 'Madrid'}
              </span>
            </div>
          </div>
        </div>

        <div className="artist-drawer-body">
          <GhostClaimBanner profile={selectedPromoter} />
          {/* PUNTO 3: Web Oficial y Redes Sociales directamente en el Panel Principal del Promotor */}
          {(selectedPromoter.website_url ||
            selectedPromoter.instagram_url ||
            selectedPromoter.spotify_url ||
            selectedPromoter.tiktok_url ||
            selectedPromoter.youtube_url) && (
            <div className="club-links-showcase">
              {selectedPromoter.website_url && (
                <a
                  href={selectedPromoter.website_url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-club-official-web"
                  style={{ borderColor: '#f43f5e', color: '#fda4af', background: 'rgba(244, 63, 94, 0.14)' }}
                >
                  <Globe size={15} />
                  <span>Visitar Web Oficial de la Promotora</span>
                  <ExternalLink size={13} style={{ marginLeft: 'auto' }} />
                </a>
              )}

              {(selectedPromoter.instagram_url ||
                selectedPromoter.spotify_url ||
                selectedPromoter.tiktok_url ||
                selectedPromoter.youtube_url) && (
                <div className="artist-socials-row">
                  {selectedPromoter.instagram_url && (
                    <a href={selectedPromoter.instagram_url} target="_blank" rel="noreferrer" className="dj-social-pill">
                      <InstagramIcon size={13} /> <span>Instagram</span>
                    </a>
                  )}
                  {selectedPromoter.spotify_url && (
                    <a href={selectedPromoter.spotify_url} target="_blank" rel="noreferrer" className="dj-social-pill">
                      <SpotifyIcon size={13} /> <span>Spotify</span>
                    </a>
                  )}
                  {selectedPromoter.tiktok_url && (
                    <a href={selectedPromoter.tiktok_url} target="_blank" rel="noreferrer" className="dj-social-pill">
                      <TiktokIcon size={13} /> <span>TikTok</span>
                    </a>
                  )}
                  {selectedPromoter.youtube_url && (
                    <a href={selectedPromoter.youtube_url} target="_blank" rel="noreferrer" className="dj-social-pill">
                      <YoutubeIcon size={13} /> <span>YouTube</span>
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {selectedPromoter.club_audio_url && (
            <div className="dj-uploaded-player-box" style={{ borderColor: '#f43f5e' }}>
              <div className="dj-uploaded-info">
                <Disc size={20} className={!isAudioMuted && !selectedEvent ? 'spin-disc' : ''} style={{ color: '#f43f5e' }} />
                <div>
                  <strong>Track Oficial · @{selectedPromoter.username}</strong>
                  <span style={{ color: '#fda4af' }}>
                    {selectedEvent
                      ? 'Silenciado mientras escuchas la fiesta'
                      : isAudioMuted
                      ? 'Audio en pausa'
                      : 'Sonando ahora'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="btn-dj-mute"
                style={{ background: '#f43f5e', color: '#fff' }}
                onClick={toggleAudioMute}
              >
                {isAudioMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                <span>{isAudioMuted ? 'Reanudar' : 'ON'}</span>
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
              <Calendar size={14} style={{ color: '#f43f5e' }} />{' '}
              Próximas Fiestas de @{selectedPromoter.username} ({selectedPromoterEvents.length})
            </h4>
            {selectedPromoterEvents.length > 0 ? (
              selectedPromoterEvents.map((ev) => {
                const isSelectedNow = selectedEvent?.id === ev.id;
                return (
                  <button
                    type="button"
                    key={ev.id}
                    className={`artist-gig-card ${isSelectedNow ? 'is-active-cascade' : ''}`}
                    style={isSelectedNow ? { borderColor: '#f43f5e' } : {}}
                    onClick={() => selectEventFromClub(ev)}
                  >
                    <img src={ev.image_url} alt={ev.name} />
                    <div className="gig-card-info">
                      <strong>{ev.name}</strong>
                      <span>
                        <MapPin size={10} style={{ display: 'inline', marginRight: '3px' }} />
                        {ev.venue_name ? `${ev.venue_name} (${ev.city || ev.venue_profile?.city || selectedPromoter.city || 'Madrid'})` : (ev.city || selectedPromoter.city || 'Madrid')} · {ev.start_date} ({ev.start_time?.slice(0, 5) || '23:00'})
                      </span>
                    </div>

                    <div className="gig-badges-col">
                      <span
                        className="club-ev-att-pill"
                        style={{ borderColor: 'rgba(244, 63, 94, 0.45)', background: 'rgba(244, 63, 94, 0.16)', color: '#fda4af' }}
                      >
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
                Aún no hay eventos próximos públicos vinculados a @{selectedPromoter.username}.
              </p>
            )}
          </div>

          <button
            type="button"
            className={`btn-toggle-club-info ${isPromoterInfoExpanded ? 'active' : ''}`}
            style={{
              marginTop: 'auto',
              borderColor: '#f43f5e',
              color: isPromoterInfoExpanded ? '#fff' : '#fda4af',
              background: isPromoterInfoExpanded ? '#f43f5e' : 'rgba(244, 63, 94, 0.14)'
            }}
            onClick={togglePromoterInfoExpand}
          >
            {isPromoterInfoExpanded ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            <Film size={15} />
            <span>
              {isPromoterInfoExpanded
                ? 'Ocultar Vídeo y Fotos del Promotor'
                : `Ver Vídeo y Fotos del Promotor (${galleryItems.length})`}
            </span>
          </button>

          {user?.id !== selectedPromoter.id && !selectedPromoter.is_ghost && (
            <div className="artist-actions-bottom">
              <button
                type="button"
                className="btn-secondary-outline"
                disabled={Boolean(existingFriendship)}
                onClick={() => addFriendByUserId(selectedPromoter.id)}
                style={{ gridColumn: existingFriendship?.status === 'accepted' ? 'auto' : '1 / -1' }}
              >
                {existingFriendship?.status === 'accepted' ? (
                  <><Check size={15} className="icon-neon" /> Amigos</>
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
                  onClick={() => openDirectMessageWithUser(selectedPromoter)}
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
