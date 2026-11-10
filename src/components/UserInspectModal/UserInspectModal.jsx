// src/components/UserInspectModal/UserInspectModal.jsx
import React, { useState, useEffect } from 'react';
import {
  X, Disc, MapPin, Activity, ShieldCheck, UserPlus,
  MessageSquare, Briefcase, DollarSign, Plane, Calendar,
  Globe, Handshake, Send, Check, Clock
} from 'lucide-react';
import { InstagramIcon, YoutubeIcon, SpotifyIcon, TiktokIcon } from '../ui/BrandIcons';
import { DjSixMonthCalendar } from '../ui/DjSixMothCalendar';
import { useRaveStore } from '../../store/useRaveStore';
import { CollabRequestModal } from '../ui/CollabRequestModal';
import './UserInspectModal.css';

export const UserInspectModal = () => {
  const {
    inspectedUser, inspectedUserEvents, events, closeInspectUser,
    addFriendByUserId, openDirectMessageWithUser,
    initiateDjToDjCollab, selectChatRoom, setModal,
    chatRooms, user, friends
  } = useRaveStore();

  const [isCollabPromptOpen, setIsCollabPromptOpen] = useState(false);
  const [collabMsg, setCollabMsg] = useState('');
  const [isSendingCollab, setIsSendingCollab] = useState(false);

  useEffect(() => {
    setIsCollabPromptOpen(false);
    setCollabMsg('');
    setIsSendingCollab(false);
  }, [inspectedUser?.id]);

  if (!inspectedUser) return null;

  const existingFriendship = user
    ? friends.find(
        (f) =>
          (f.requester_id === user.id && f.addressee_id === inspectedUser.id) ||
          (f.requester_id === inspectedUser.id && f.addressee_id === user.id)
      )
    : null;

  const isViewerPromoterOrClub = Boolean(
    user && (user.role === 'Promotor' || user.role === 'Club' || user.role === 'Admin' || user.is_admin)
  );
  const showDjPromoterData = inspectedUser.role === 'DJ' && isViewerPromoterOrClub;

  const uRole = inspectedUser.role || 'Raver';
  const isDjToDj = user?.role === 'DJ' && uRole === 'DJ';

  const secondaryGenres = Array.isArray(inspectedUser.secondary_subgenres)
    ? inspectedUser.secondary_subgenres
    : [];

  const hostedEventsCount = (events || []).filter(
    (e) =>
      String(e.created_by) === String(inspectedUser.id) ||
      String(e.venue_id) === String(inspectedUser.id)
  ).length;

  const autoBookedDatesMap = (inspectedUserEvents || []).reduce((acc, ev) => {
    if (ev.start_date) {
      acc[ev.start_date] = `Evento: ${ev.name}`;
    }
    return acc;
  }, {});

  const handleDjCollabClick = async () => {
    const existingCollab = (chatRooms || []).find(
      (r) =>
        r.type === 'collab' &&
        (r.collabPartner?.id === inspectedUser.id ||
          r.participants?.some((p) => String(p.user_id) === String(inspectedUser.id)))
    );

    if (existingCollab) {
      await selectChatRoom(existingCollab);
      closeInspectUser();
      setModal('isSocialDockOpen', true);
    } else {
      setIsCollabPromptOpen(!isCollabPromptOpen);
    }
  };

  const handleSendDjCollab = async (e) => {
    e.preventDefault();
    if (!collabMsg.trim()) return;
    setIsSendingCollab(true);
    try {
      await initiateDjToDjCollab(inspectedUser, collabMsg);
      setIsCollabPromptOpen(false);
      setCollabMsg('');
    } catch (err) {
      alert(err.message);
    } finally {
      setIsSendingCollab(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div
        className="modal-card inspect-user-card"
        style={{ maxWidth: showDjPromoterData ? '480px' : '430px', maxHeight: '90vh', overflowY: 'auto' }}
      >
        <button className="modal-close" onClick={closeInspectUser}>
          <X size={18} />
        </button>

        <div className={`holo-passport-card card-role-${uRole.toLowerCase()}`}>
          <div className="holo-top-bar">
            <span className="holo-brand">RAVE<strong>RADAR</strong> // ID PASS</span>
            {/* Solo DJs y Ravers muestran BPM; Clubs y Promotores muestran su distintivo */}
            {(uRole === 'DJ' || uRole === 'Raver') ? (
              <span className="holo-bpm-chip">
                <Activity size={12} /> {inspectedUser.favorite_bpm || 155} BPM
              </span>
            ) : (
              <span
                className="holo-bpm-chip"
                style={{ background: uRole === 'Club' ? '#06b6d4' : '#f43f5e', color: '#fff' }}
              >
                <ShieldCheck size={12} /> {uRole === 'Club' ? 'SALA OFICIAL' : 'COLECTIVO'}
              </span>
            )}
          </div>

          <div className="holo-identity">
            <div className="holo-avatar-wrap">
              {inspectedUser.avatar_url ? (
                <img src={inspectedUser.avatar_url} alt={inspectedUser.username} referrerPolicy="no-referrer" />
              ) : (
                <Disc size={32} className="icon-neon" />
              )}
            </div>
            <div className="holo-user-titles">
              <h3>@{inspectedUser.username}</h3>
              <span className={`holo-role-badge role-${uRole.toLowerCase()}`}>
                <ShieldCheck size={12} />{' '}
                {uRole === 'DJ'
                  ? 'DJ / Producer'
                  : uRole === 'Club'
                  ? 'Club / Sala'
                  : uRole}
              </span>
            </div>
          </div>

          <p className="holo-bio">
            {inspectedUser.bio || 'Amante del sonido club y frecuencias industriales.'}
          </p>

          {/* Datos públicos específicos según el tipo de usuario */}
          <div className="holo-stats-grid">
            <div className="holo-stat">
              <span className="holo-stat-val">{inspectedUser.city || 'Madrid'}</span>
              <span className="holo-stat-lbl"><MapPin size={10} /> PROVINCIA</span>
            </div>

            {uRole === 'DJ' ? (
              <div className="holo-stat">
                <span className="holo-stat-val">{inspectedUser.hype_score || 10} pts</span>
                <span className="holo-stat-lbl">HYPE SCORE</span>
              </div>
            ) : uRole === 'Club' || uRole === 'Promotor' ? (
              <div className="holo-stat">
                <span className="holo-stat-val">{hostedEventsCount}</span>
                <span className="holo-stat-lbl">FIESTAS</span>
              </div>
            ) : (
              <div className="holo-stat">
                <span className="holo-stat-val">{inspectedUserEvents.length}</span>
                <span className="holo-stat-lbl">ASISTENCIAS</span>
              </div>
            )}

            <div className="holo-stat">
              <span className="holo-stat-val">{inspectedUser.favorite_subgenre || 'Hard Techno'}</span>
              <span className="holo-stat-lbl">GÉNERO</span>
            </div>
          </div>

          {secondaryGenres.length > 0 && (
            <div className="holo-secondary-genres">
              {secondaryGenres.map((sg) => (
                <span key={sg} className="holo-subgenre-chip">+{sg}</span>
              ))}
            </div>
          )}

          <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {uRole === 'Club' && inspectedUser.street_address && (
              <div style={{ fontSize: '11.5px', color: '#67e8f9', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <MapPin size={12} />
                <span>{inspectedUser.street_address}, {inspectedUser.city}</span>
              </div>
            )}

            {(uRole === 'Club' || uRole === 'Promotor') && inspectedUser.website_url && (
              <a
                href={inspectedUser.website_url}
                target="_blank"
                rel="noreferrer"
                className="dj-social-pill"
                style={{ width: 'fit-content', borderColor: uRole === 'Club' ? '#06b6d4' : '#f43f5e' }}
              >
                <Globe size={12} /> <span>Visitar Web Oficial</span>
              </a>
            )}

            {(inspectedUser.instagram_url || inspectedUser.spotify_url || inspectedUser.tiktok_url || inspectedUser.youtube_url) && (
              <div className="artist-socials-row">
                {inspectedUser.instagram_url && (
                  <a href={inspectedUser.instagram_url} target="_blank" rel="noreferrer" className="dj-social-pill">
                    <InstagramIcon size={12} /> <span>Instagram</span>
                  </a>
                )}
                {inspectedUser.spotify_url && (
                  <a href={inspectedUser.spotify_url} target="_blank" rel="noreferrer" className="dj-social-pill">
                    <SpotifyIcon size={12} /> <span>Spotify</span>
                  </a>
                )}
                {inspectedUser.tiktok_url && (
                  <a href={inspectedUser.tiktok_url} target="_blank" rel="noreferrer" className="dj-social-pill">
                    <TiktokIcon size={12} /> <span>TikTok</span>
                  </a>
                )}
                {inspectedUser.youtube_url && (
                  <a href={inspectedUser.youtube_url} target="_blank" rel="noreferrer" className="dj-social-pill">
                    <YoutubeIcon size={12} /> <span>YouTube</span>
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Información para Promotores y Clubs (con separación superior y calendario de 6 meses) */}
        {showDjPromoterData && (
          <div className="dj-promoter-booking-card" style={{ marginTop: '16px', marginBottom: '16px' }}>
            <div className="dj-promoter-card-header">
              <Briefcase size={14} />
              <strong>Información para Promotores y Clubs</strong>
            </div>

            <div className="dj-promoter-grid">
              <div className="dj-promoter-stat">
                <span className="dj-prom-label"><DollarSign size={11} /> Caché Orientativo</span>
                <strong>{inspectedUser.booking_fee || 'A consultar'}</strong>
                <small>{inspectedUser.is_fee_negotiable !== false ? 'Tarifa Negociable' : 'Tarifa Fija'}</small>
              </div>

              <div className="dj-promoter-stat">
                <span className="dj-prom-label"><Plane size={11} /> Desplazamientos</span>
                <strong>{inspectedUser.willing_to_travel !== false ? 'Disponible para viajar' : 'Solo local'}</strong>
                <small>Base: {inspectedUser.city || 'Madrid'}</small>
              </div>
            </div>

            <div className="dj-promoter-dates">
              <span className="dj-prom-label" style={{ marginBottom: '4px' }}>
                <Calendar size={11} /> Calendario de Disponibilidad (Próximos 6 Meses):
              </span>
              <DjSixMonthCalendar
                manuallyBusyDates={Array.isArray(inspectedUser.available_dates) ? inspectedUser.available_dates : []}
                autoBookedDatesMap={autoBookedDatesMap}
                ownEvents={inspectedUser.dj_private_events}
                readOnly={true}
              />
            </div>
          </div>
        )}

        {/* Formulario desplegable cuando un DJ pide colaboración a otro DJ */}
        {isDjToDj && isCollabPromptOpen && (
          <CollabRequestModal
            targetUser={inspectedUser}
            onClose={() => setIsCollabPromptOpen(false)}
            onSend={(message) => initiateDjToDjCollab(inspectedUser, message)}
          />
        )}

        {/* Perfil fantasma: nadie lo lleva todavía, así que sin amistad ni chat */}
        {user?.id !== inspectedUser.id && !inspectedUser.is_ghost && (
          <div className="inspect-actions" style={{ marginTop: showDjPromoterData && !isCollabPromptOpen ? '0' : '14px' }}>
            <button
              type="button"
              className="btn-secondary-outline"
              disabled={Boolean(existingFriendship)}
              onClick={() => addFriendByUserId(inspectedUser.id)}
              style={{
                gridColumn:
                  existingFriendship?.status === 'accepted' || isDjToDj
                    ? 'auto'
                    : '1 / -1'
              }}
            >
              {existingFriendship?.status === 'accepted' ? (
                <><Check size={15} className="icon-neon" /> Amigos Confirmados</>
              ) : existingFriendship?.status === 'pending' ? (
                <><Clock size={15} className="icon-neon" /> Solicitud Pendiente</>
              ) : (
                <><UserPlus size={15} /> Añadir Amigo</>
              )}
            </button>

            {/* Entre DJs: botón "Pedir Colaboración" al lado de Añadir Amigo */}
            {isDjToDj && (
              <button
                type="button"
                className="btn-neon-full"
                style={{ background: '#ff5500', color: '#fff' }}
                onClick={handleDjCollabClick}
              >
                <Handshake size={15} />
                <span>Pedir Colaboración</span>
              </button>
            )}

            {existingFriendship?.status === 'accepted' && (
              <button
                type="button"
                className="btn-neon-full"
                style={{ gridColumn: isDjToDj ? '1 / -1' : 'auto' }}
                onClick={() => openDirectMessageWithUser(inspectedUser)}
              >
                <MessageSquare size={16} /> Chatear
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};