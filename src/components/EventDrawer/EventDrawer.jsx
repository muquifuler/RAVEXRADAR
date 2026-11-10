// src/components/EventDrawer/EventDrawer.jsx
import React, { useState, useEffect, useRef } from 'react';
import {
  X, Calendar, Clock, Disc, MapPin, Lock, Unlock, Flame, Users, Edit3,
  CheckCircle2, Zap, Ticket, Send, Volume2, VolumeX,
  ChevronLeft, ChevronRight, MessagesSquare, Pin, User, Radio,
  Headphones, Trophy, Building2
} from 'lucide-react';
import { useRaveStore, evaluateEventTiming, isEventLockedSecret } from '../../store/useRaveStore';
import { translations } from '../../i18n/translations';
import { EmojiPicker } from '../ui/EmojiPicker';
import { buildChatTimeline, formatMsgTime } from '../../lib/chatTime';
import { ShareButton } from '../ui/ShareButton';
import './EventDrawer.css';

export const EventDrawer = () => {
  const {
    lang, selectedEvent, selectedEventGroup, currentGroupIndex, selectEventGroup,
    isEventChatExpanded, toggleEventChatExpand, attendees, isEventDetailsLoading, toggleAttendance, user, requireAuth,
    roomMessages, sendChatMessage, togglePinMessage, inspectUserById, setModal,
    openEditEventModal, djs, clubs, promoters, selectDj, selectClub, selectPromoter,
    myAttendingEventIds, attendeesModalFilter, setAttendeesModalFilter, eventInvitations, 
    myEventInvitations, requestEventAccess, respondToEventInvitation
  } = useRaveStore();

  const t = translations[lang];
  const [msgText, setMsgText] = useState('');
  const chatInputRef = useRef(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  const [isDescLong, setIsDescLong] = useState(false);
  const [activeStageTab, setActiveStageTab] = useState('ALL');
  //const [attendeesModalFilter, setAttendeesModalFilter] = useState(null); // null | 'going' | 'squad'

  const descRef = useRef(null);
  const isMutedRef = useRef(false);
  const audioRef = useRef(null);
  const fadeIntervalRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Reiniciar estados locales al cambiar de evento y comprobar si la descripción supera las 5 líneas
  useEffect(() => {
    setIsDescExpanded(false);
    setActiveStageTab('ALL');
    setAttendeesModalFilter(null);

    if (!selectedEvent?.description) {
      setIsDescLong(false);
      return;
    }
    const timer = setTimeout(() => {
      if (descRef.current) {
        const exceedsFiveLines = descRef.current.scrollHeight > descRef.current.clientHeight + 2;
        setIsDescLong(exceedsFiveLines || selectedEvent.description.length > 220);
      }
    }, 30);
    return () => clearTimeout(timer);
  }, [selectedEvent]);

  // Auto-scroll al último mensaje cuando el chat está desplegado
  useEffect(() => {
    if (isEventChatExpanded) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [roomMessages, isEventChatExpanded]);

  // Audio del evento sincronizado con el del Club/Promotor para que nunca suenen a la vez
  useEffect(() => {
    if (!selectedEvent) {
      useRaveStore.getState().setEventAudioPlaying(false);
      return;
    }

    clearInterval(fadeIntervalRef.current);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }

    // Silenciar automáticamente el audio del Club o Promotor al empezar a sonar el evento
    if (!isMutedRef.current) {
      useRaveStore.getState().setEventAudioPlaying(true);
    }

    const trackUrl = selectedEvent.audio_url || 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
    const audio = new Audio(trackUrl);
    audio.loop = true;
    audio.volume = 0;
    audio.muted = isMutedRef.current;
    audioRef.current = audio;

    audio.play().then(() => {
      let vol = 0;
      fadeIntervalRef.current = setInterval(() => {
        if (vol < 0.75) {
          vol = Math.min(0.75, +(vol + 0.05).toFixed(2));
          audio.volume = vol;
        } else {
          clearInterval(fadeIntervalRef.current);
        }
      }, 90);
    }).catch(() => {});

    // Si el usuario pulsa "Reanudar" en la canción del Club/Promotor, silenciamos el audio del evento
    const handleExternalMuteEventAudio = () => {
      setIsMuted(true);
      isMutedRef.current = true;
      if (audioRef.current) {
        audioRef.current.muted = true;
        audioRef.current.pause();
      }
    };

    window.addEventListener('raveradar:mute-event-audio', handleExternalMuteEventAudio);

    return () => {
      window.removeEventListener('raveradar:mute-event-audio', handleExternalMuteEventAudio);
      clearInterval(fadeIntervalRef.current);
      if (audioRef.current) {
        const closingAudio = audioRef.current;
        closingAudio.pause();
        closingAudio.src = '';
      }
      useRaveStore.getState().setEventAudioPlaying(false);
    };
  }, [selectedEvent?.id]);

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    isMutedRef.current = nextMuted;

    if (audioRef.current) {
      audioRef.current.muted = nextMuted;
      if (!nextMuted) {
        // Al activar el audio del evento, silenciamos inmediatamente el audio del Club o Promotor
        useRaveStore.getState().setEventAudioPlaying(true);
        if (audioRef.current.volume < 0.2) audioRef.current.volume = 0.75;
        if (audioRef.current.paused || audioRef.current.ended) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(() => {});
        }
      } else {
        audioRef.current.pause();
        useRaveStore.getState().setEventAudioPlaying(false);
      }
    }
  };

  if (!selectedEvent) return null;

  const handlePrevEvent = () => {
    if (currentGroupIndex > 0) selectEventGroup(selectedEventGroup, currentGroupIndex - 1);
  };
  const handleNextEvent = () => {
    if (currentGroupIndex < selectedEventGroup.length - 1) selectEventGroup(selectedEventGroup, currentGroupIndex + 1);
  };

  // Listas independientes de "Voy a ir" y "Busco Rave Squad"
  const goingUsers = attendees.filter((a) => a.is_going ?? a.status === 'going');
  const squadUsers = attendees.filter((a) => a.looking_for_squad ?? a.status === 'looking_for_squad');
  const totalGoing = goingUsers.length;
  const squadSeekers = squadUsers.length;

  const myAttendanceRecord = user ? attendees.find((a) => String(a.user_id) === String(user.id)) : null;
  const isMyGoingActive = Boolean(
    myAttendanceRecord && (myAttendanceRecord.is_going ?? myAttendanceRecord.status === 'going')
  );
  const isMySquadActive = Boolean(
    myAttendanceRecord && (myAttendanceRecord.looking_for_squad ?? myAttendanceRecord.status === 'looking_for_squad')
  );

  // Se desbloquea la Secret Location tanto si marcó asistencia como si está en el Lineup del evento
  const isUserAttending = !isEventLockedSecret(selectedEvent, myAttendingEventIds, user);
  const isEventOwner = user && String(selectedEvent.created_by) === String(user.id);
  const pinnedMessage = roomMessages.find((m) => m.is_pinned);

  const timing = evaluateEventTiming(selectedEvent.start_date, selectedEvent.start_time, selectedEvent.duration_hours);
  const isEventActiveNow = selectedEvent.is_active_now || timing.status === 'ACTIVE';

  const hasValidTicketUrl =
    Boolean(selectedEvent.ticket_url) &&
    selectedEvent.ticket_url.trim() !== '' &&
    selectedEvent.ticket_url.trim() !== '#';

  const datesList =
    selectedEvent.all_dates && selectedEvent.all_dates.length > 0
      ? selectedEvent.all_dates
      : [selectedEvent.start_date];

  const eventLineup = Array.isArray(selectedEvent.lineup) ? selectedEvent.lineup : [];

  // Priorizar siempre el objeto completo de clubs en el store para conservar subgéneros, BPM, bio y multimedia
  const matchedClubProfile =
    (selectedEvent.venue_id && clubs?.find((c) => String(c.id) === String(selectedEvent.venue_id))) ||
    (selectedEvent.linked_club_id && clubs?.find((c) => String(c.id) === String(selectedEvent.linked_club_id))) ||
    clubs?.find((c) => c.username.toLowerCase() === (selectedEvent.venue_name || '').replace('@', '').trim().toLowerCase()) ||
    selectedEvent.venue_profile;

  // Comprobar si el Promotor es la misma cuenta que el Club donde se celebra el evento
  const isPromoterSameAsClub =
    (selectedEvent.created_by &&
      matchedClubProfile &&
      String(selectedEvent.created_by) === String(matchedClubProfile.id)) ||
    (selectedEvent.created_by &&
      selectedEvent.venue_id &&
      String(selectedEvent.created_by) === String(selectedEvent.venue_id)) ||
    selectedEvent.creator?.role === 'Club' ||
    (selectedEvent.promoter &&
      selectedEvent.venue_name &&
      selectedEvent.promoter.replace('@', '').trim().toLowerCase() ===
        selectedEvent.venue_name.replace('@', '').trim().toLowerCase());

  const handleClickLineupDj = (slot) => {
    if (!slot.dj_id) return;
    const foundDj = djs.find((d) => String(d.id) === String(slot.dj_id));
    if (foundDj) {
      selectDj(foundDj);
    } else {
      inspectUserById(slot.dj_id);
    }
  };

  const handleClickPromoterBadge = (promId) => {
    if (!promId) return;
    const foundProm = (promoters || []).find((p) => String(p.id) === String(promId));
    if (foundProm) {
      selectPromoter(foundProm);
    } else {
      inspectUserById(promId);
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!user) return setModal('isAuthOpen', true);
    sendChatMessage(msgText);
    setMsgText('');
  };

  const getAttendeeBadge = (senderId) => {
    const rec = attendees.find((a) => String(a.user_id) === String(senderId));
    if (!rec) return null;
    const isGoing = rec.is_going ?? rec.status === 'going';
    const isSquad = rec.looking_for_squad ?? rec.status === 'looking_for_squad';

    return (
      <>
        {isGoing && (
          <span className="chat-badge badge-going">
            <CheckCircle2 size={10} /> Going
          </span>
        )}
        {isSquad && (
          <span className="chat-badge badge-squad">
            <Zap size={10} /> Rave Squad
          </span>
        )}
      </>
    );
  };

  const videoSource = selectedEvent.video_url || 'https://assets.mixkit.co/videos/preview/mixkit-dj-playing-music-at-a-nightclub-43446-large.mp4';

  const myInviteRecord = user
    ? (eventInvitations || []).find((i) => String(i.user_id) === String(user.id)) ||
      (myEventInvitations || []).find(
        (i) => String(i.event_id) === String(selectedEvent.id) && String(i.user_id) === String(user.id)
      )
    : null;

  const isUserInLineup = Boolean(
    user &&
      eventLineup.some(
        (slot) =>
          (slot.dj_id && String(slot.dj_id) === String(user.id)) ||
          (slot.name &&
            user.username &&
            slot.name.replace('@', '').trim().toLowerCase() === user.username.replace('@', '').trim().toLowerCase())
      )
  );

  const isHostClubOrCreator = Boolean(
    user &&
      (String(selectedEvent.created_by) === String(user.id) ||
        (selectedEvent.venue_id && String(selectedEvent.venue_id) === String(user.id)))
  );

  // Si el evento es "Solo por Invitación", los botones de Voy a ir y Busco Rave Squad solo salen si ya está aceptado (o es creador/club/lineup)
  const hasInvitePermission =
    !selectedEvent.is_invite_only ||
    isHostClubOrCreator ||
    isUserInLineup ||
    myInviteRecord?.status === 'accepted';

  return (
    <aside className={`event-drawer-shell ${isEventChatExpanded ? 'is-expanded' : ''}`}>
      {/* COLUMNA IZQUIERDA EXPANDIBLE: CHAT GRUPAL DEL EVENTO */}
      {isEventChatExpanded && (
        <div className="drawer-chat-column">
          <div className="drawer-chat-header">
            <div className="chat-title-group">
              <MessagesSquare size={16} className="icon-neon" />
              <strong>Chat Grupal · {selectedEvent.name}</strong>
            </div>
            <button type="button" className="btn-collapse-chat" onClick={toggleEventChatExpand}>
              <ChevronRight size={18} />
            </button>
          </div>

          {pinnedMessage && (
            <div className="pinned-message-banner">
              <Pin size={14} className="icon-neon" />
              <div className="pinned-content">
                <strong>Fijado (@{pinnedMessage.sender_username}):</strong>
                <p>{pinnedMessage.content}</p>
              </div>
            </div>
          )}

          <div className="drawer-chat-messages">
            {buildChatTimeline(roomMessages, lang).map((item) => {
              if (item.type === 'day') {
                return (
                  <div key={item.key} className="chat-day-sep">
                    <span>{item.label}</span>
                  </div>
                );
              }
              const m = item.msg;
              const avatarUrl =
                m.sender?.avatar_url ||
                m.sender_avatar ||
                (m.sender_id === user?.id ? user?.avatar_url : null);

              return (
                <div key={item.key} className={`event-chat-msg ${m.sender_id === user?.id ? 'is-mine' : ''}`}>
                  <button
                    type="button"
                    className="msg-avatar-btn"
                    onClick={() => inspectUserById(m.sender_id)}
                  >
                    {avatarUrl ? (
                      <img src={avatarUrl} alt={m.sender_username} referrerPolicy="no-referrer" />
                    ) : (
                      <User size={15} />
                    )}
                  </button>

                  <div className="msg-Bubble-wrap">
                    <div className="msg-meta-top">
                      <button
                        type="button"
                        className="msg-username-btn"
                        onClick={() => inspectUserById(m.sender_id)}
                      >
                        @{m.sender?.username || m.sender_username}
                      </button>
                      {getAttendeeBadge(m.sender_id)}
                      {isEventOwner && (
                        <button
                          type="button"
                          className={`btn-pin-msg ${m.is_pinned ? 'pinned' : ''}`}
                          onClick={() => togglePinMessage(m)}
                          title="Fijar mensaje"
                        >
                        <Pin size={12} />
                        </button>
                      )}
                      <span className="chat-msg-time is-inline" style={{ margin: '0', marginTop: '-7px' }}>
                        {String(m.id).startsWith('temp_') ? '…' : formatMsgTime(m.created_at, lang)}
                      </span>
                    </div>
                    <p className="msg-text">{m.content}</p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="drawer-chat-input">
            <EmojiPicker targetRef={chatInputRef} value={msgText} onChange={setMsgText} />
            <input
              ref={chatInputRef}
              type="text"
              placeholder={t.writeComment}
              value={msgText}
              onChange={(e) => setMsgText(e.target.value)}
            />
            <button type="submit">
              <Send size={15} />
            </button>
          </form>
        </div>
      )}

      {/* COLUMNA DERECHA: INFORMACIÓN DEL EVENTO */}
      <div className="drawer-info-column">
                <button type="button" className="drawer-close" onClick={() => selectEventGroup([], 0)}>
          <X size={18} />
        </button>
        <ShareButton
          kind="fiesta"
          value={selectedEvent.id}
          title={`${selectedEvent.name} · RAVEXRADAR`}
          text={`🔥 ${selectedEvent.name}${selectedEvent.city ? ` en ${selectedEvent.city}` : ''}. ¿Vamos? Míralo en RAVEXRADAR`}
        />

        <div className="drawer-hero">
          <video
            key={videoSource}
            src={videoSource}
            poster={selectedEvent.image_url}
            autoPlay
            loop
            muted
            playsInline
            className="drawer-video"
          />
          <span className="badge-subgenre">{selectedEvent.subgenre}</span>

          <button type="button" className="btn-audio-toggle" onClick={toggleMute}>
            {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            <span>{isMuted ? 'Audio OFF' : 'Audio ON'}</span>
          </button>
        </div>

        {/* Barra de navegación de eventos en la misma coordenada (debajo del vídeo) */}
        {selectedEventGroup.length > 1 && (
          <div className="cluster-nav-bar">
            <button type="button" onClick={handlePrevEvent} disabled={currentGroupIndex === 0}>
              <ChevronLeft size={16} />
            </button>
            <span>
              Evento {currentGroupIndex + 1} de {selectedEventGroup.length} en esta ubicación
            </span>
            <button
              type="button"
              onClick={handleNextEvent}
              disabled={currentGroupIndex === selectedEventGroup.length - 1}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        <div className="drawer-body">
          <div className="drawer-title-row">
            <h2 className="drawer-title">{selectedEvent.name}</h2>
            {isEventOwner && (
              <button
                type="button"
                className="btn-edit-event"
                onClick={() => openEditEventModal(selectedEvent)}
                title="Editar Fiesta"
              >
                <Edit3 size={15} />
              </button>
            )}
          </div>

          {/* Insignia de Ranking para las fiestas del Top 5 Trending */}
          {selectedEvent.trending_rank && selectedEvent.trending_rank <= 5 && (() => {
            const cityRank = selectedEvent.city_rank || selectedEvent.trending_rank;
            const goingNow = Math.max(selectedEvent.attendees_count || 0, totalGoing);
            return (
              <div className={`event-trending-rank-box rank-tier-${cityRank <= 3 ? cityRank : 'x'}`}>
                <div className="rank-medal" aria-hidden="true">
                  <span className="rank-medal-hash">#</span>
                  {cityRank}
                </div>
                <div className="rank-copy">
                  <span className="rank-kicker">
                    <Trophy size={11} /> {t.eventRanking}
                    <span className="trending-pill-live">
                      <i className="trending-live-dot" /> TRENDING
                    </span>
                  </span>
                  <strong>
                    {cityRank === 1 ? 'La nº1' : `Puesto ${cityRank}`} en {selectedEvent.city || 'Madrid'}
                  </strong>
                  <span className="rank-hype">
                    <Flame size={12} /> Top <b>#{selectedEvent.trending_rank}</b> en España · <b>{goingNow}</b> {t.goingCount}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Descripción con Mostrar más / Mostrar menos si supera 5 líneas */}
          <div className="drawer-desc-container">
            <p ref={descRef} className={`drawer-desc ${!isDescExpanded ? 'clamped-5-lines' : ''}`}>
              {selectedEvent.description}
            </p>
            {isDescLong && (
              <button
                type="button"
                className="btn-show-more-desc"
                onClick={() => (isDescExpanded || requireAuth()) && setIsDescExpanded(!isDescExpanded)}
              >
                {isDescExpanded ? t.showLess : t.showMore}
              </button>
            )}
          </div>

          {/* Lineup & Horarios con pestañas automáticas si hay múltiples escenarios */}
          {eventLineup.length > 0 && (() => {
            const distinctStages = [
              ...new Set(eventLineup.map((s) => s.stage || s.stage_or_genre || 'Main Stage'))
            ];
            const hasMultipleStages = distinctStages.length > 1;
            const visibleLineup =
              !hasMultipleStages || activeStageTab === 'ALL'
                ? eventLineup
                : eventLineup.filter((s) => (s.stage || s.stage_or_genre || 'Main Stage') === activeStageTab);

            return (
              <div className="drawer-lineup-showcase">
                <div className="lineup-showcase-header">
                  <Headphones size={15} className="icon-neon" />
                  <strong>{t.lineupTitle} ({eventLineup.length})</strong>
                </div>

                {hasMultipleStages && (
                  <div className="lineup-stage-tabs">
                    <button
                      type="button"
                      className={activeStageTab === 'ALL' ? 'active' : ''}
                      onClick={() => setActiveStageTab('ALL')}
                    >
                      Todos
                    </button>
                    {distinctStages.map((st) => (
                      <button
                        type="button"
                        key={st}
                        className={activeStageTab === st ? 'active' : ''}
                        onClick={() => setActiveStageTab(st)}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                )}

                <div className="lineup-showcase-grid">
                  {visibleLineup.map((slot) => (
                    <div
                      key={slot.slot_id}
                      className={`lineup-dj-card ${slot.dj_id ? 'is-clickable' : ''}`}
                      onClick={() => handleClickLineupDj(slot)}
                    >
                      <div className="lineup-dj-avatar">
                        {slot.avatar_url ? (
                          <img src={slot.avatar_url} alt={slot.name} referrerPolicy="no-referrer" />
                        ) : (
                          <Disc size={18} className="icon-neon" />
                        )}
                      </div>
                      <div className="lineup-dj-info">
                        <div className="lineup-dj-name-row">
                          <strong>{slot.dj_id ? `@${slot.name}` : slot.name}</strong>
                          {slot.dj_id && <span className="lineup-verified-dot">DJ</span>}
                        </div>
                        {hasMultipleStages && (
                          <span className="lineup-dj-stage">{slot.stage || slot.stage_or_genre}</span>
                        )}
                      </div>
                      {slot.set_time && (
                        <span className="lineup-time-pill">
                          <Clock size={11} /> {slot.set_time}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          <div className="drawer-meta">
            {/* Fechas y horas renderizadas siempre con la clase .date-chip */}
            <div className="meta-line" style={{ alignItems: 'flex-start' }}>
              <Calendar size={15} className="icon-neon" style={{ marginTop: '3px' }} />
              <div className="multi-date-list">
                <strong>{datesList.length > 1 ? 'Fechas disponibles:' : `${t.dateLabel}:`}</strong>
                <div className="date-chips">
                  {datesList.map((d) => (
                    <span key={d} className="date-chip">
                      {d} · {selectedEvent.start_time?.slice(0, 5) || '23:00'}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="meta-line">
              <Clock size={15} className="icon-neon" />
              <span><strong>Duración estimada:</strong> {selectedEvent.duration_hours || 12}h</span>
            </div>

            {/* Uno o múltiples promotores (oculto como Incógnita si está en Secret Location y el Promotor es el mismo Club) */}
            <div className="meta-line" style={{ flexWrap: 'wrap' }}>
              <Disc size={15} className="icon-neon" />
              <strong>{t.promoterLabel}:</strong>
              {selectedEvent.is_secret_location && !isUserAttending && isPromoterSameAsClub ? (
                <span className="incognita-club-chip">
                  <Lock size={12} /> ??? (Incógnita · Secret Location)
                </span>
              ) : Array.isArray(selectedEvent.promoters_list) && selectedEvent.promoters_list.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                  {selectedEvent.promoters_list.map((prom, idx) =>
                    prom.id && !prom.is_custom ? (
                      <button
                        type="button"
                        key={`${prom.id}_${idx}`}
                        className="promoter-user-chip"
                        onClick={() => handleClickPromoterBadge(prom.id)}
                      >
                        {prom.avatar_url ? (
                          <img src={prom.avatar_url} alt={prom.username} referrerPolicy="no-referrer" />
                        ) : (
                          <User size={12} className="icon-neon" />
                        )}
                        <span>@{prom.username}</span>
                      </button>
                    ) : (
                      <span
                        key={`custom_${idx}`}
                        className="promoter-user-chip"
                        style={{ cursor: 'default', borderColor: '#3f3f46', background: '#18181b' }}
                      >
                        <Disc size={12} className="icon-neon" />
                        <span>{prom.username}</span>
                      </span>
                    )
                  )}
                </div>
              ) : selectedEvent.created_by ? (
                <button
                  type="button"
                  className="promoter-user-chip"
                  onClick={() => handleClickPromoterBadge(selectedEvent.created_by)}
                >
                  {selectedEvent.creator?.avatar_url ? (
                    <img
                      src={selectedEvent.creator.avatar_url}
                      alt={selectedEvent.creator.username}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <User size={12} className="icon-neon" />
                  )}
                  <span>@{selectedEvent.creator?.username || selectedEvent.promoter}</span>
                </button>
              ) : (
                <span>{selectedEvent.promoter}</span>
              )}
            </div>

            {/* Club / Sala clicable, pero oculto como Incógnita mientras esté en Secret Location sin desbloquear */}
            <div className="meta-line" style={{ flexWrap: 'wrap' }}>
              <Building2 size={15} className="icon-neon" />
              <strong>{t.venueLabel}:</strong>
              {selectedEvent.is_secret_location && !isUserAttending ? (
                <span className="incognita-club-chip">
                  <Lock size={12} /> ??? (Incógnita · Secret Location)
                </span>
              ) : matchedClubProfile ? (
                <button
                  type="button"
                  className="promoter-user-chip club-chip"
                  onClick={() => selectClub(matchedClubProfile)}
                >
                  {matchedClubProfile.avatar_url ? (
                    <img
                      src={matchedClubProfile.avatar_url}
                      alt={matchedClubProfile.username}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <Building2 size={12} />
                  )}
                  <span>@{matchedClubProfile.username}</span>
                </button>
              ) : (
                <span>{selectedEvent.venue_name || selectedEvent.city}</span>
              )}
            </div>

            {/* Dirección o Estado de Secret Location */}
            {selectedEvent.is_secret_location ? (
              isUserAttending ? (
                <div className="meta-line">
                  <Unlock size={15} className="icon-neon"/>
                  <span>
                    <strong>{t.secretUnlocked}</strong>{' '}
                    {selectedEvent.street_address || matchedClubProfile?.street_address || selectedEvent.venue_name} ({selectedEvent.lat}, {selectedEvent.lng})
                  </span>
                </div>
              ) : (
                <div className="meta-line">
                  <Lock size={15} />
                  <span>
                    {t.secretLocked} (Zona aprox: {(selectedEvent.secret_lat || selectedEvent.lat + 0.007).toFixed(3)}, {(selectedEvent.secret_lng || selectedEvent.lng + 0.007).toFixed(3)})
                  </span>
                </div>
              )
            ) : (
              (selectedEvent.street_address || matchedClubProfile?.street_address) && (
                <div className="meta-line">
                  <MapPin size={15} className="icon-neon" />
                  <span>
                    <strong>Dirección:</strong> {selectedEvent.street_address || matchedClubProfile?.street_address}, {selectedEvent.city}
                  </span>
                </div>
              )
            )}
          </div>

          <div className="squad-box">
            {/* Contadores clicables para ver el listado de usuarios que van a ir o buscan Rave Squad */}
            <div className="squad-stats">
              <button
                type="button"
                className={`stat-inline-btn ${attendeesModalFilter === 'going' ? 'active' : ''}`}
                onClick={() =>
                  setAttendeesModalFilter(attendeesModalFilter === 'going' ? null : 'going')
                }
              >
                <Flame size={14} className="icon-neon" />
                <strong>{isEventDetailsLoading ? <span className="panel-loading-dots" aria-hidden="true" /> : totalGoing}</strong>
                <span>{t.goingCount}</span>
              </button>

              <button
                type="button"
                className={`stat-inline-btn ${attendeesModalFilter === 'squad' ? 'active' : ''}`}
                onClick={() =>
                  setAttendeesModalFilter(attendeesModalFilter === 'squad' ? null : 'squad')
                }
              >
                <Users size={14} className="icon-neon" />
                <strong>{isEventDetailsLoading ? <span className="panel-loading-dots" aria-hidden="true" /> : squadSeekers}</strong>
                <span>{t.squadCount}</span>
              </button>
            </div>

            {isEventDetailsLoading && !hasInvitePermission ? (
              <div className="squad-actions" role="status" aria-live="polite">
                <div className="panel-skeleton-button">
                  <span className="panel-spinner" aria-hidden="true" />
                  <span>{lang === 'es' ? 'Cargando acceso…' : 'Loading access…'}</span>
                </div>
              </div>
            ) : hasInvitePermission ? (
              <div className="squad-actions">
                <button
                  type="button"
                  onClick={() => toggleAttendance('going')}
                  disabled={isEventDetailsLoading}
                  className={`btn-going ${isMyGoingActive ? 'is-active' : ''} ${isEventDetailsLoading ? 'is-loading' : ''}`}
                  title={isMyGoingActive ? 'Haz clic para desmarcar Voy a ir' : ''}
                >
                  <CheckCircle2 size={15} />
                  <span>{isMyGoingActive ? 'Vas a ir ✓' : t.btnGoing}</span>
                </button>

                <button
                  type="button"
                  onClick={() => toggleAttendance('looking_for_squad')}
                  disabled={isEventDetailsLoading}
                  className={`btn-squad ${isMySquadActive ? 'is-active' : ''} ${isEventDetailsLoading ? 'is-loading' : ''}`}
                  title={isMySquadActive ? 'Haz clic para desmarcar Busco Rave Squad' : ''}
                >
                  <Zap size={15} />
                  <span>{isMySquadActive ? 'Buscando Squad ✓' : t.btnSquad}</span>
                </button>
              </div>
            ) : (
              <div className="invite-only-access-box" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {!myInviteRecord ? (
                  <button
                    type="button"
                    className="btn-neon-full"
                    onClick={() => requestEventAccess(selectedEvent.id)}
                  >
                    <Lock size={15} />
                    <span>Fiesta por Invitación · Pedir Permiso para Ir</span>
                  </button>
                ) : myInviteRecord.direction === 'invited' && myInviteRecord.status === 'pending' ? (
                  <div
                    style={{
                      background: 'rgba(250, 204, 21, 0.12)',
                      border: '1px solid var(--accent-neon)',
                      borderRadius: '10px',
                      padding: '10px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}
                  >
                    <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--accent-neon)' }}>
                      ✨ ¡Tienes una invitación directa para esta fiesta!
                    </span>
                    <div className="squad-actions">
                      <button
                        type="button"
                        className="btn-going is-active"
                        onClick={() => respondToEventInvitation(myInviteRecord.id, 'accepted')}
                      >
                        <CheckCircle2 size={15} />
                        <span>Aceptar Invitación</span>
                      </button>
                      <button
                        type="button"
                        className="btn-squad"
                        style={{ borderColor: '#ef4444', color: '#f87171' }}
                        onClick={() => respondToEventInvitation(myInviteRecord.id, 'rejected')}
                      >
                        <X size={15} />
                        <span>Rechazar</span>
                      </button>
                    </div>
                  </div>
                ) : myInviteRecord.status === 'pending' ? (
                  <div
                    style={{
                      background: 'rgba(250, 204, 21, 0.1)',
                      border: '1px dashed var(--accent-neon)',
                      color: '#fde047',
                      padding: '10px',
                      borderRadius: '10px',
                      fontSize: '12px',
                      fontWeight: 800,
                      textAlign: 'center'
                    }}
                  >
                    ⏳ Solicitud enviada · Esperando a que el organizador acepte tu acceso
                  </div>
                ) : (
                  <div
                    style={{
                      background: 'rgba(239, 68, 68, 0.12)',
                      border: '1px solid #ef4444',
                      color: '#fca5a5',
                      padding: '10px',
                      borderRadius: '10px',
                      fontSize: '12px',
                      fontWeight: 800,
                      textAlign: 'center'
                    }}
                  >
                    Acceso no disponible (Invitación o solicitud rechazada)
                  </div>
                )}
              </div>
            )}

            <button type="button" onClick={toggleEventChatExpand} className="btn-toggle-expand-chat">
              {isEventChatExpanded ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              <MessagesSquare size={16} />
              <span>
                {isEventChatExpanded ? 'Contraer Chat' : `${t.btnOpenEventChat} (${roomMessages.length})`}
              </span>
            </button>
          </div>

          {/* Estado "Evento Activo" o botón de entradas solo si existe URL */}
          {isEventActiveNow ? (
            <div className="btn-event-active-live">
              <Radio size={17} className="pulse-live-icon" />
              <span>EVENTO ACTIVO EN CURSO</span>
            </div>
          ) : (
            hasValidTicketUrl && (
              <a href={selectedEvent.ticket_url} target="_blank" rel="noreferrer" className="btn-tickets">
                <Ticket size={16} />
                <span>{t.btnBuyTickets}</span>
              </a>
            )
          )}
        </div>
      </div>
    </aside>
  );
};
