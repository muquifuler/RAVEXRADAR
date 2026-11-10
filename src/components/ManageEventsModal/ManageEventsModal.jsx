// src/components/ManageEventsModal/ManageEventsModal.jsx
import React, { useState, useEffect } from 'react';
import {
  X, Calendar, Edit3, Users, UserPlus, Check, Lock,
  MapPin, Search, Disc, Flame, Zap, Plus, Eye
} from 'lucide-react';
import { useRaveStore } from '../../store/useRaveStore';
import { supabase } from '../../lib/supabaseClient';
import './ManageEventsModal.css';

export const ManageEventsModal = () => {
  const {
    isManageEventsOpen,
    setModal,
    user,
    filteredEvents,
    openEditEventModal,
    selectEvent,
    inspectUserById,
    searchProfilesAutocomplete,
    sendEventInvitationsToUsers,
    resolveEventAccessRequest
  } = useRaveStore();

  const [selectedEvId, setSelectedEvId] = useState(null);
  const [evInvites, setEvInvites] = useState([]);
  const [evAttendees, setEvAttendees] = useState([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [listFilter, setListFilter] = useState('ALL'); // 'ALL' | 'PENDING_REQ' | 'INVITED' | 'GOING'

  // Buscador para invitar nuevos usuarios automáticamente
  const [inviteSearch, setInviteSearch] = useState('');
  const [inviteSuggestions, setInviteSuggestions] = useState([]);
  const [sendingInviteUserId, setSendingInviteUserId] = useState(null);

  // Filtrar las fiestas que pertenecen a este Club o Promotor
  const myManagedEvents = (filteredEvents || []).filter((ev) => {
    if (!user) return false;
    if (String(ev.created_by) === String(user.id)) return true;
    if (ev.venue_id && String(ev.venue_id) === String(user.id)) return true;
    if (ev.linked_club_id && String(ev.linked_club_id) === String(user.id)) return true;
    if (
      Array.isArray(ev.promoters_list) &&
      ev.promoters_list.some(
        (p) =>
          (p.id && String(p.id) === String(user.id)) ||
          (p.username && p.username.toLowerCase() === user.username?.toLowerCase())
      )
    ) {
      return true;
    }
    return false;
  });

  const activeManagedEvent =
    myManagedEvents.find((e) => String(e.id) === String(selectedEvId)) ||
    myManagedEvents[0] ||
    null;

  useEffect(() => {
    if (isManageEventsOpen && myManagedEvents.length > 0 && !selectedEvId) {
      setSelectedEvId(myManagedEvents[0].id);
    }
  }, [isManageEventsOpen, myManagedEvents.length, selectedEvId]);

  const loadEventAccessAndAttendees = async (eventId) => {
    if (!eventId) return;
    setIsLoadingDetails(true);
    const [invRes, attRes] = await Promise.all([
      supabase
        .from('event_invitations')
        .select('*, profile:profiles!user_id(id, username, avatar_url, role, city, favorite_subgenre)')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false }),
      supabase
        .from('event_attendees')
        .select('*, profile:profiles!user_id(id, username, avatar_url, role, city, favorite_subgenre)')
        .eq('event_id', eventId)
    ]);
    setEvInvites(invRes.data || []);
    setEvAttendees(attRes.data || []);
    setIsLoadingDetails(false);
  };

  useEffect(() => {
    if (isManageEventsOpen && activeManagedEvent?.id) {
      loadEventAccessAndAttendees(activeManagedEvent.id);
    }
  }, [isManageEventsOpen, activeManagedEvent?.id]);

  // Autocompletado para añadir e invitar usuarios
  useEffect(() => {
    let active = true;
    if (inviteSearch.trim().length < 1) {
      setInviteSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      const res = await searchProfilesAutocomplete(inviteSearch);
      if (active) setInviteSuggestions(res);
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [inviteSearch, searchProfilesAutocomplete]);

  if (!isManageEventsOpen || !user) return null;

  const handleInviteNewUser = async (prof) => {
    if (!activeManagedEvent) return;
    setSendingInviteUserId(prof.id);
    await sendEventInvitationsToUsers(activeManagedEvent.id, [prof]);
    await loadEventAccessAndAttendees(activeManagedEvent.id);
    setInviteSearch('');
    setInviteSuggestions([]);
    setSendingInviteUserId(null);
  };

  const handleDecision = async (invRow, decision) => {
    await resolveEventAccessRequest(invRow, decision);
    await loadEventAccessAndAttendees(activeManagedEvent.id);
  };

  // Unificar lista de Invitados + Solicitudes + Asistentes ("Voy a ir" / "Busco Rave Squad")
  const combinedUsersMap = new Map();

  evInvites.forEach((inv) => {
    combinedUsersMap.set(String(inv.user_id), {
      user_id: inv.user_id,
      profile: inv.profile,
      inviteRow: inv,
      attendanceRow: null
    });
  });

  evAttendees.forEach((att) => {
    const key = String(att.user_id);
    if (combinedUsersMap.has(key)) {
      combinedUsersMap.get(key).attendanceRow = att;
    } else {
      combinedUsersMap.set(key, {
        user_id: att.user_id,
        profile: att.profile,
        inviteRow: null,
        attendanceRow: att
      });
    }
  });

  const allCombinedList = Array.from(combinedUsersMap.values()).filter((item) => {
    if (listFilter === 'PENDING_REQ') {
      return item.inviteRow?.direction === 'requested' && item.inviteRow?.status === 'pending';
    }
    if (listFilter === 'INVITED') {
      return item.inviteRow?.direction === 'invited';
    }
    if (listFilter === 'GOING') {
      return Boolean(item.attendanceRow) || item.inviteRow?.status === 'accepted';
    }
    return true;
  });

  const pendingRequestsCount = evInvites.filter(
    (i) => i.direction === 'requested' && i.status === 'pending'
  ).length;

  return (
    <div className="modal-overlay">
      <div className="modal-card manage-events-modal-card">
        <button className="modal-close" onClick={() => setModal('isManageEventsOpen', false)}>
          <X size={18} />
        </button>

        <div className="collab-header">
          <div className="collab-title-group modal-icon-header">
            <Calendar size={24} className="icon-neon" />
            <div>
              <h2 className="modal-title">GESTIONAR MIS FIESTAS Y ACCESOS</h2>
              <p className="modal-subtitle" style={{ marginBottom: 0 }}>
                Edita los detalles de tus eventos, revisa asistentes, aprueba solicitudes y envía invitaciones directas.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="btn-neon-full"
            style={{ width: 'auto', padding: '9px 16px' }}
            onClick={() => {
              setModal('isManageEventsOpen', false);
              useRaveStore.setState({ editingEvent: null });
              setModal('isAddEventOpen', true);
            }}
          >
            <Plus size={15} /> Publicar Nueva Fiesta
          </button>
        </div>

        {myManagedEvents.length === 0 ? (
          <div className="ranking-empty" style={{ padding: '40px 20px' }}>
            Aún no tienes fiestas activas asociadas a tu cuenta de {user.role}.
          </div>
        ) : (
          <div className="manage-events-split">
            {/* COLUMNA IZQUIERDA: LISTA DE MIS FIESTAS */}
            <div className="manage-events-sidebar">
              <span className="mini-field-label">Tus Fiestas Activas ({myManagedEvents.length}):</span>
              {myManagedEvents.map((ev) => {
                const isSelected = activeManagedEvent?.id === ev.id;
                return (
                  <button
                    type="button"
                    key={ev.id}
                    className={`manage-ev-item ${isSelected ? 'active' : ''}`}
                    onClick={() => setSelectedEvId(ev.id)}
                  >
                    <img src={ev.image_url} alt={ev.name} />
                    <div className="manage-ev-item-info">
                      <strong>{ev.name}</strong>
                      <span>{ev.start_date} · {ev.city}</span>
                      <div style={{ display: 'flex', gap: '4px', marginTop: '3px', flexWrap: 'wrap' }}>
                        {ev.is_invite_only && (
                          <span className="mini-pill-tag invite">Por Invitación</span>
                        )}
                        {ev.is_secret_location && (
                          <span className="mini-pill-tag secret">Secret Location</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* COLUMNA DERECHA: DETALLES, EDICIÓN E INVITADOS/ASISTENTES DE LA FIESTA SELECCIONADA */}
            {activeManagedEvent && (
              <div className="manage-events-main">
                <div className="manage-ev-top-card">
                  <div className="manage-ev-top-info">
                    <h3>{activeManagedEvent.name}</h3>
                    <span>
                      <MapPin size={12} className="icon-neon" /> {activeManagedEvent.venue_name} ({activeManagedEvent.city}) · {activeManagedEvent.start_date} a las {activeManagedEvent.start_time?.slice(0, 5)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn-secondary-outline"
                      style={{ padding: '8px 12px', fontSize: '12px' }}
                      onClick={() => {
                        setModal('isManageEventsOpen', false);
                        selectEvent(activeManagedEvent);
                      }}
                    >
                      <Eye size={14} /> Ver en Mapa
                    </button>

                    <button
                      type="button"
                      className="btn-neon-full"
                      style={{ width: 'auto', padding: '8px 14px', fontSize: '12px' }}
                      onClick={() => {
                        setModal('isManageEventsOpen', false);
                        openEditEventModal(activeManagedEvent);
                      }}
                    >
                      <Edit3 size={14} /> Editar Detalles de la Fiesta
                    </button>
                  </div>
                </div>

                {/* Buscador para añadir e invitar usuarios directamente a esta fiesta */}
                <div className="manage-invite-adder-box">
                  <label className="mini-field-label">
                    <UserPlus size={12} className="icon-neon" /> Añadir / Enviar Invitación Automática a Usuarios (Ravers, DJs, Promotores o Clubs):
                  </label>
                  <div style={{ position: 'relative' }}>
                    <div className="pro-search-input-wrap">
                      <Search size={14} className="pro-search-icon" />
                      <input
                        type="text"
                        placeholder="Escribe el @username del usuario para enviarle invitación directa..."
                        value={inviteSearch}
                        onChange={(e) => setInviteSearch(e.target.value)}
                      />
                    </div>

                    {inviteSuggestions.length > 0 && (
                      <div className="pro-autocomplete-dropdown">
                        {inviteSuggestions.map((prof) => {
                          const existingRec = combinedUsersMap.get(String(prof.id));
                          return (
                            <button
                              type="button"
                              key={prof.id}
                              className="autocomplete-option"
                              disabled={Boolean(existingRec?.inviteRow) || sendingInviteUserId === prof.id}
                              onMouseDown={() => handleInviteNewUser(prof)}
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
                              <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 800, color: existingRec?.inviteRow ? '#4ade80' : 'var(--accent-neon)' }}>
                                {existingRec?.inviteRow
                                  ? '✓ Ya en lista'
                                  : sendingInviteUserId === prof.id
                                  ? 'Enviando...'
                                  : '+ Enviar Invitación'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Filtros de la lista de asistentes, invitados y solicitudes */}
                <div className="ranking-mode-pills">
                  <button
                    type="button"
                    className={listFilter === 'ALL' ? 'active' : ''}
                    onClick={() => setListFilter('ALL')}
                  >
                    <Users size={13} />
                    <span>Todos ({combinedUsersMap.size})</span>
                  </button>
                  <button
                    type="button"
                    className={listFilter === 'PENDING_REQ' ? 'active' : ''}
                    onClick={() => setListFilter('PENDING_REQ')}
                  >
                    <Lock size={13} />
                    <span>Solicitudes Pendientes ({pendingRequestsCount})</span>
                  </button>
                  <button
                    type="button"
                    className={listFilter === 'INVITED' ? 'active' : ''}
                    onClick={() => setListFilter('INVITED')}
                  >
                    <UserPlus size={13} />
                    <span>Invitados por Ti ({evInvites.filter((i) => i.direction === 'invited').length})</span>
                  </button>
                  <button
                    type="button"
                    className={listFilter === 'GOING' ? 'active' : ''}
                    onClick={() => setListFilter('GOING')}
                  >
                    <Flame size={13} />
                    <span>Aceptados / Van a ir ({evAttendees.length})</span>
                  </button>
                </div>

                {/* Listado de usuarios */}
                <div className="manage-attendees-list">
                  {isLoadingDetails ? (
                    <div className="ranking-empty">Cargando lista de usuarios...</div>
                  ) : allCombinedList.length === 0 ? (
                    <div className="ranking-empty">No hay usuarios en este apartado todavía.</div>
                  ) : (
                    allCombinedList.map(({ user_id, profile, inviteRow, attendanceRow }) => {
                      const roleName = profile?.role || 'Raver';
                      const isGoing = attendanceRow && (attendanceRow.is_going ?? attendanceRow.status === 'going');
                      const isSquad = attendanceRow && (attendanceRow.looking_for_squad ?? attendanceRow.status === 'looking_for_squad');

                      return (
                        <div key={user_id} className="manage-user-row">
                          <div
                            className="manage-user-left"
                            onClick={() => {
                              setModal('isManageEventsOpen', false);
                              inspectUserById(user_id);
                            }}
                          >
                            <div className="attendee-row-avatar">
                              {profile?.avatar_url ? (
                                <img src={profile.avatar_url} alt={profile.username} referrerPolicy="no-referrer" />
                              ) : (
                                <Disc size={15} className="icon-neon" />
                              )}
                            </div>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <strong>@{profile?.username || 'Usuario'}</strong>
                                <span className={`chat-role-mini-badge role-${roleName.toLowerCase()}`}>
                                  {roleName === 'Club' ? 'Club / Sala' : roleName}
                                </span>
                                {isGoing && (
                                  <span className="chat-badge badge-going">Voy a ir ✓</span>
                                )}
                                {isSquad && (
                                  <span className="chat-badge badge-squad"><Zap size={10} /> Rave Squad</span>
                                )}
                              </div>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                {profile?.city || 'Madrid'} ·{' '}
                                {inviteRow
                                  ? inviteRow.direction === 'requested'
                                    ? `Pidió permiso (${inviteRow.status === 'pending' ? 'Pendiente' : inviteRow.status === 'accepted' ? 'Aceptado' : 'Rechazado'})`
                                    : `Invitado por ti (${inviteRow.status === 'pending' ? 'Pendiente de responder' : inviteRow.status === 'accepted' ? 'Aceptó invitación' : 'Rechazó'})`
                                  : 'Asistente confirmado'}
                              </span>
                            </div>
                          </div>

                          {/* Si el usuario pidió permiso (requested) y está pendiente, botones para Aceptar o Rechazar */}
                          {inviteRow && inviteRow.direction === 'requested' && inviteRow.status === 'pending' && (
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                type="button"
                                className="btn-notif-accept"
                                title="Aceptar acceso y marcar Voy a ir"
                                onClick={() => handleDecision(inviteRow, 'accepted')}
                              >
                                <Check size={14} />
                              </button>
                              <button
                                type="button"
                                className="btn-notif-reject"
                                title="Rechazar solicitud"
                                onClick={() => handleDecision(inviteRow, 'rejected')}
                              >
                                <X size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
