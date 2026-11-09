// src/components/SocialDock/SocialDock.jsx
import React, { useEffect, useRef, useState } from 'react';
import {
  MessageSquare, Users, CalendarCheck, FolderPlus,
  UserPlus, UserMinus, Send, X, Hash, MapPin, Clock, Check,
  Search, Disc, Zap, CheckCircle2, Trash2, User, Settings, Handshake
} from 'lucide-react';
import { useRaveStore } from '../../store/useRaveStore';
import { EmojiPicker } from '../ui/EmojiPicker';
import { buildChatTimeline, formatMsgTime } from '../../lib/chatTime';
import './SocialDock.css';

// Mismo corte que mobile.css
const isMobileViewport = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(max-width: 768px)').matches;

export const SocialDock = () => {
  const {
    lang, user, isSocialDockOpen, setModal, fetchSocialData,
    chatRooms, activeRoom, selectChatRoom, roomMessages, sendChatMessage,
    unreadChatCount, createPrivateGroup, addMemberToPrivateGroup, removeMemberFromPrivateGroup,
    groupInvitations, sentGroupInvitations, respondToGroupInvitation, cancelGroupInvitation,
    friends, addFriendByUserId, acceptFriendRequest, rejectFriendRequest, removeFriend,
    searchProfilesAutocomplete, myAttendingEvents,
    selectEvent, inspectUserById, openDirectMessageWithUser
  } = useRaveStore();

  const [tab, setTab] = useState('chats'); // 'chats' | 'collabs' | 'friends' | 'pending' | 'my_events'
  const [chatFilter, setChatFilter] = useState('ALL'); // 'ALL' | 'event' | 'private_group' | 'DJ' | 'Promotor' | 'Club' | 'Raver'
  const [collabRoleFilter, setCollabRoleFilter] = useState('ALL'); // 'ALL' | 'DJ' | 'Promotor' | 'Club'
  const [msgText, setMsgText] = useState('');
  const [newGroup, setNewGroup] = useState('');

  // Buscador de amigos (Pestaña Amigos)
  const [friendQuery, setFriendQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  // Gestor de miembros en Grupos Privados (Solo creador)
  const [showGroupManager, setShowGroupManager] = useState(false);
  const [groupMemberQuery, setGroupMemberQuery] = useState('');
  const [groupMemberSuggestions, setGroupMemberSuggestions] = useState([]);

  useEffect(() => {
    if (isSocialDockOpen && user) {
      fetchSocialData();
    }
  }, [isSocialDockOpen, user, fetchSocialData]);

    const dockMessagesRef = useRef(null);
  const dockInputRef = useRef(null);

  // Al abrir una conversación, ir al final. Con mensajes nuevos, solo si ya estabas abajo
  // (o el mensaje es tuyo), para no saltar si estás leyendo mensajes antiguos.
  const lastRoomIdRef = useRef(null);
  useEffect(() => {
    const el = dockMessagesRef.current;
    if (!el) return;
    const roomChanged = lastRoomIdRef.current !== activeRoom?.id;
    lastRoomIdRef.current = activeRoom?.id;
    const last = roomMessages[roomMessages.length - 1];
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    if (roomChanged || nearBottom || String(last?.sender_id) === String(user?.id)) {
      el.scrollTop = el.scrollHeight;
    }
  }, [roomMessages, activeRoom?.id, user?.id]);

  // Si se abre el SocialDock con una sala activa de tipo 'collab' (ej. tras aplicar o enviar oferta), activar automáticamente la pestaña Colaboraciones
  useEffect(() => {
    if (activeRoom?.type === 'collab') {
      setTab('collabs');
    }
  }, [activeRoom?.id, activeRoom?.type]);

  useEffect(() => {
    setShowGroupManager(false);
    setGroupMemberQuery('');
    setGroupMemberSuggestions([]);
  }, [activeRoom?.id]);

  // Autocompletado para buscar amigos
  useEffect(() => {
    let active = true;
    if (friendQuery.trim().length < 1) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const res = await searchProfilesAutocomplete(friendQuery);
      if (active) setSearchResults(res);
    }, 180);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [friendQuery, searchProfilesAutocomplete]);

  // Autocompletado para agregar miembros a un grupo privado
  useEffect(() => {
    let active = true;
    if (groupMemberQuery.trim().length < 1) {
      setGroupMemberSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      const res = await searchProfilesAutocomplete(groupMemberQuery);
      if (active) setGroupMemberSuggestions(res);
    }, 180);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [groupMemberQuery, searchProfilesAutocomplete]);

  const acceptedFriends = user ? friends.filter((f) => f.status === 'accepted') : [];
  const incomingPending = user ? friends.filter((f) => f.status === 'pending' && f.addressee_id === user.id) : [];
  const outgoingPending = user ? friends.filter((f) => f.status === 'pending' && f.requester_id === user.id) : [];
  const totalPendingCount =
    incomingPending.length + outgoingPending.length + (groupInvitations?.length || 0) + (sentGroupInvitations?.length || 0);
  const totalUnreadBadge = (unreadChatCount || 0) + incomingPending.length + (groupInvitations?.length || 0);

  // Separar estrictamente los chats normales de los chats de colaboraciones
  const regularChatRooms = (chatRooms || []).filter((r) => r.type !== 'collab');
  const collabChatRooms = (chatRooms || []).filter((r) => r.type === 'collab');

  const handleSend = (e) => {
    e.preventDefault();
    sendChatMessage(msgText);
    setMsgText('');
  };

  const formatRoleLabel = (role) => {
    if (role === 'DJ') return 'DJ';
    if (role === 'Club') return 'Club / Sala';
    if (role === 'Promotor') return 'Promotor';
    return 'Raver';
  };

  const getRoomDisplay = (room) => {
    if (room.type === 'collab') {
      const partner =
        room.collabPartner ||
        room.participants?.find((p) => String(p.user_id) !== String(user?.id))?.profile;
      const partnerRole = partner?.role || 'DJ';
      return {
        title: room.collabOfferTitle || room.name.replace('Colab: ', ''),
        avatar: partner?.avatar_url || room.collabOfferImage || null,
        subtitle: partner?.username ? `Con @${partner.username}` : 'Colaboración activa',
        roleBadge: formatRoleLabel(partnerRole),
        rawRole: partnerRole,
        partnerId: partner?.id || null,
        isDirect: false,
        isCollab: true
      };
    }

    if (room.type === 'direct') {
      const friend =
        room.directFriend ||
        room.participants?.find((p) => String(p.user_id) !== String(user?.id))?.profile;
      const friendRole = friend?.role || 'Raver';
      return {
        title: friend?.username ? `@${friend.username}` : room.name.replace('DM: ', ''),
        avatar: friend?.avatar_url || null,
        subtitle: friend?.city || 'Chat directo',
        roleBadge: formatRoleLabel(friendRole),
        rawRole: friendRole,
        partnerId: friend?.id || null,
        isDirect: true,
        isCollab: false
      };
    }

    return {
      title: room.name.replace('🔊 ', ''),
      avatar: room.eventImage || null,
      subtitle: room.type === 'event' ? 'Chat de Evento' : `Grupo (${room.participants?.length || 1} miembros)`,
      roleBadge: room.type === 'event' ? 'Evento' : 'Grupo',
      rawRole: room.type,
      partnerId: null,
      isDirect: false,
      isCollab: false
    };
  };

  // Filtrar salas en la pestaña 'chats'
  const filteredRegularRooms = regularChatRooms.filter((r) => {
    if (chatFilter === 'ALL') return true;
    if (chatFilter === 'event') return r.type === 'event';
    if (chatFilter === 'private_group') return r.type === 'private_group';
    if (r.type === 'direct') {
      const friend =
        r.directFriend ||
        r.participants?.find((p) => String(p.user_id) !== String(user?.id))?.profile;
      return (friend?.role || 'Raver') === chatFilter;
    }
    return false;
  });

  // Filtrar salas en la pestaña 'collabs'
  const filteredCollabRooms = collabChatRooms.filter((r) => {
    if (collabRoleFilter === 'ALL') return true;
    const partner =
      r.collabPartner ||
      r.participants?.find((p) => String(p.user_id) !== String(user?.id))?.profile;
    return (partner?.role || 'DJ') === collabRoleFilter;
  });

  const visibleRoomsList = tab === 'collabs' ? filteredCollabRooms : filteredRegularRooms;

  const isGroupOwner =
    activeRoom?.type === 'private_group' && String(activeRoom?.created_by) === String(user?.id);

    // PUNTO 1: En chats de colaboración, el emisor de la oferta/aplicación no puede enviar más mensajes hasta que el receptor responda
  const isCollabRoom = activeRoom?.type === 'collab';
  const collabInitiatorId = isCollabRoom
    ? (roomMessages[0]?.sender_id || activeRoom?.created_by)
    : null;
  const hasCollabRecipientReplied = isCollabRoom
    ? roomMessages.some((m) => String(m.sender_id) !== String(collabInitiatorId))
    : true;
  const isLockedWaitingCollabReply = Boolean(
    isCollabRoom &&
      collabInitiatorId &&
      String(user?.id) === String(collabInitiatorId) &&
      !hasCollabRecipientReplied
  );

  return (
    <>
      <button
        type="button"
        className="social-dock-fab"
        onClick={() => (user ? setModal('isSocialDockOpen', !isSocialDockOpen) : setModal('isAuthOpen', true))}
      >
        <MessageSquare size={22} />
        {totalUnreadBadge > 0 && (
          <span className="dock-fab-badge has-alert">
            {totalUnreadBadge}
          </span>
        )}
      </button>

      {isSocialDockOpen && user && (
        <div className="social-dock-popup">
          <div className="dock-header">
            <div className="dock-tabs">
              <button
                type="button"
                className={tab === 'chats' ? 'active' : ''}
                onClick={() => {
                  setTab('chats');
                  // En móvil la lista y la conversación no caben a la vez: pulsar "Chats"
                  // con una conversación abierta vuelve a la lista completa de chats
                  if (activeRoom?.type === 'collab' || (activeRoom && isMobileViewport())) selectChatRoom(null);
                }}
              >
                <MessageSquare size={14} />
                <span>Chats ({regularChatRooms.length})</span>
              </button>

              <button
                type="button"
                className={tab === 'collabs' ? 'active' : ''}
                onClick={() => {
                  setTab('collabs');
                  // Igual que en "Chats": en móvil vuelve a la lista de colaboraciones
                  if (activeRoom && (activeRoom.type !== 'collab' || isMobileViewport())) selectChatRoom(null);
                }}
              >
                <Handshake size={14} />
                <span>Colaboraciones ({collabChatRooms.length})</span>
              </button>

              <button
                type="button"
                className={tab === 'friends' ? 'active' : ''}
                onClick={() => setTab('friends')}
              >
                <Users size={14} />
                <span>Amigos ({acceptedFriends.length})</span>
              </button>

              <button
                type="button"
                className={tab === 'pending' ? 'active' : ''}
                onClick={() => setTab('pending')}
              >
                <Clock size={14} />
                <span>Pendientes</span>
                {totalPendingCount > 0 && (
                  <span className="tab-pill-count">{totalPendingCount}</span>
                )}
              </button>

              <button
                type="button"
                className={tab === 'my_events' ? 'active' : ''}
                onClick={() => setTab('my_events')}
              >
                <CalendarCheck size={14} />
                <span>Mis Eventos ({myAttendingEvents.length})</span>
              </button>
            </div>

            <button
              type="button"
              className="dock-close"
              onClick={() => setModal('isSocialDockOpen', false)}
            >
              <X size={17} />
            </button>
          </div>

          {(tab === 'chats' || tab === 'collabs') && (
            <div className="dock-body-split">
              <div className="dock-rooms-list">
                {tab === 'chats' ? (
                  <>
                    <div className="dock-inline-form">
                      <input
                        type="text"
                        placeholder="Crear grupo privado..."
                        value={newGroup}
                        onChange={(e) => setNewGroup(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          createPrivateGroup(newGroup);
                          setNewGroup('');
                        }}
                        title="Crear grupo"
                      >
                        <FolderPlus size={15} />
                      </button>
                    </div>

                    <div className="dock-chat-filter-pills">
                      {[
                        { id: 'ALL', label: 'Todos' },
                        { id: 'event', label: 'Eventos' },
                        { id: 'private_group', label: 'Grupos' },
                        { id: 'DJ', label: 'DJs' },
                        { id: 'Promotor', label: 'Promotores' },
                        { id: 'Club', label: 'Clubs' },
                        { id: 'Raver', label: 'Ravers' }
                      ].map((f) => (
                        <button
                          type="button"
                          key={f.id}
                          className={chatFilter === f.id ? 'active' : ''}
                          onClick={() => setChatFilter(f.id)}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="dock-chat-filter-pills">
                    {[
                      { id: 'ALL', label: 'Todas' },
                      { id: 'DJ', label: 'Con DJs' },
                      { id: 'Promotor', label: 'Con Promotores' },
                      { id: 'Club', label: 'Con Clubs' }
                    ].map((f) => (
                      <button
                        type="button"
                        key={f.id}
                        className={collabRoleFilter === f.id ? 'active' : ''}
                        onClick={() => setCollabRoleFilter(f.id)}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                )}

                {visibleRoomsList.length === 0 ? (
                  <p className="dock-empty-hint">
                    {tab === 'collabs'
                      ? 'Aquí aparecerán los chats dedicados cuando apliques a una oferta o envíes una propuesta desde el panel de Colaboraciones.'
                      : 'No hay conversaciones en esta categoría.'}
                  </p>
                ) : (
                  visibleRoomsList.map((r) => {
                    const display = getRoomDisplay(r);
                    return (
                      <button
                        type="button"
                        key={r.id}
                        className={`dock-room-btn ${activeRoom?.id === r.id ? 'active' : ''}`}
                        onClick={() => selectChatRoom(r)}
                      >
                        <div className="dock-room-avatar">
                          {display.avatar ? (
                            <img src={display.avatar} alt={display.title} referrerPolicy="no-referrer" />
                          ) : display.isCollab ? (
                            <Handshake size={15} className="icon-neon" />
                          ) : display.isDirect ? (
                            <Disc size={16} className="icon-neon" />
                          ) : (
                            <Hash size={15} className="icon-neon" />
                          )}
                        </div>
                        <div className="dock-room-meta">
                          <div className="dock-room-title-row">
                            <strong>{display.title}</strong>
                            <span className={`chat-role-mini-badge role-${display.rawRole.toLowerCase()}`}>
                              {display.roleBadge}
                            </span>
                          </div>
                          <span>{display.subtitle}</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              <div className="dock-chat-area">
                {activeRoom ? (
                  <>
                    <div className="dock-chat-header-bar">
                      {(() => {
                        const d = getRoomDisplay(activeRoom);
                        return (
                          <div
                            className="dock-chat-header-user"
                            style={{ cursor: d.partnerId ? 'pointer' : 'default' }}
                            onClick={() => d.partnerId && inspectUserById(d.partnerId)}
                            title={d.partnerId ? 'Ver Carta de Perfil' : ''}
                          >
                            <div className="dock-room-avatar small">
                              {d.avatar ? (
                                <img src={d.avatar} alt={d.title} referrerPolicy="no-referrer" />
                              ) : d.isCollab ? (
                                <Handshake size={14} className="icon-neon" />
                              ) : d.isDirect ? (
                                <Disc size={14} className="icon-neon" />
                              ) : (
                                <Hash size={14} className="icon-neon" />
                              )}
                            </div>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <strong>{d.title}</strong>
                                <span className={`chat-role-mini-badge role-${d.rawRole.toLowerCase()}`}>
                                  {d.roleBadge}
                                </span>
                              </div>
                              <span>{d.subtitle}</span>
                            </div>
                          </div>
                        );
                      })()}

                      {isGroupOwner && (
                        <button
                          type="button"
                          className={`btn-manage-group ${showGroupManager ? 'active' : ''}`}
                          onClick={() => setShowGroupManager(!showGroupManager)}
                        >
                          <Settings size={13} />
                          <span>Miembros ({activeRoom.participants?.length || 1})</span>
                        </button>
                      )}
                    </div>

                    {isGroupOwner && showGroupManager && (
                      <div className="group-members-manager-panel">
                        <div className="group-member-search-wrap">
                          <div className="friend-search-box" style={{ padding: '0 10px' }}>
                            <Search size={13} className="icon-neon" />
                            <input
                              type="text"
                              placeholder="Buscar usuario por @username para agregar al grupo..."
                              value={groupMemberQuery}
                              onChange={(e) => setGroupMemberQuery(e.target.value)}
                              style={{ padding: '7px 0', fontSize: '12px' }}
                            />
                          </div>

                          {groupMemberSuggestions.length > 0 && (
                            <div className="friend-autocomplete-dropdown">
                              {groupMemberSuggestions.map((prof) => {
                                const alreadyInGroup = (activeRoom.participants || []).some(
                                  (p) => String(p.user_id) === String(prof.id)
                                );
                                const alreadyInvited = (sentGroupInvitations || []).some(
                                  (i) => i.room_id === activeRoom.id && String(i.invitee_id) === String(prof.id)
                                );
                                return (
                                  <div key={prof.id} className="friend-suggestion-row">
                                    <div className="friend-user-cell">
                                      <div className="dock-room-avatar small">
                                        {prof.avatar_url ? (
                                          <img src={prof.avatar_url} alt={prof.username} referrerPolicy="no-referrer" />
                                        ) : (
                                          <Disc size={14} className="icon-neon" />
                                        )}
                                      </div>
                                      <div>
                                        <strong>@{prof.username}</strong>
                                        <span>{formatRoleLabel(prof.role)} · {prof.city || 'Madrid'}</span>
                                      </div>
                                    </div>
                                    {alreadyInGroup ? (
                                      <span className="status-tag accepted">En el grupo</span>
                                    ) : alreadyInvited ? (
                                      <span className="status-tag pending">Invitado</span>
                                    ) : (
                                      <button
                                        type="button"
                                        className="btn-send-req"
                                        onClick={async () => {
                                          await addMemberToPrivateGroup(activeRoom.id, prof);
                                          setGroupMemberQuery('');
                                          setGroupMemberSuggestions([]);
                                        }}
                                      >
                                        <UserPlus size={12} /> Invitar
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <div className="group-current-members-chips">
                          {(sentGroupInvitations || [])
                            .filter((i) => i.room_id === activeRoom.id)
                            .map((i) => (
                              <span key={`inv_${i.id}`} className="group-member-chip is-pending" title="Esperando a que acepte">
                                @{i.invitee?.username || 'Invitado'} · pendiente
                                <button type="button" title="Cancelar invitación" onClick={() => cancelGroupInvitation(i.id)}>
                                  <X size={11} />
                                </button>
                              </span>
                            ))}
                          {(activeRoom.participants || []).map((p) => {
                            const prof = p.profile;
                            const isMe = String(p.user_id) === String(user.id);
                            return (
                              <span key={p.user_id} className="group-member-chip">
                                @{prof?.username || 'Miembro'}
                                {!isMe && (
                                  <button
                                    type="button"
                                    title="Expulsar del grupo"
                                    onClick={() => removeMemberFromPrivateGroup(activeRoom.id, p.user_id)}
                                  >
                                    <UserMinus size={11} />
                                  </button>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                                        <div className="dock-messages" ref={dockMessagesRef}>
                      {buildChatTimeline(roomMessages, lang).map((item) => {
                        if (item.type === 'day') {
                          return (
                            <div key={item.key} className="chat-day-sep">
                              <span>{item.label}</span>
                            </div>
                          );
                        }

                        const m = item.msg;
                        const isMine = String(m.sender_id) === String(user.id);
                        const isDirectChat = activeRoom.type === 'direct';
                        const isSending = String(m.id).startsWith('temp_');
                        const senderAvatar =
                          m.sender?.avatar_url ||
                          m.sender_avatar ||
                          (isMine ? user.avatar_url : null);

                        return (
                          <div
                            key={item.key}
                            className={`dock-bubble-row ${isMine ? 'mine' : ''} ${item.grouped ? 'is-grouped' : ''}`}
                          >
                            {!isDirectChat &&
                              (item.grouped ? (
                                <span className="dock-msg-avatar-spacer" aria-hidden="true" />
                              ) : (
                                <button
                                  type="button"
                                  className="dock-msg-avatar"
                                  onClick={() => inspectUserById(m.sender_id)}
                                >
                                  {senderAvatar ? (
                                    <img src={senderAvatar} alt={m.sender_username} referrerPolicy="no-referrer" />
                                  ) : (
                                    <User size={14} className="icon-neon" />
                                  )}
                                </button>
                              ))}

                            <div className={`dock-bubble ${isMine ? 'mine' : ''}`}>
                              {!isDirectChat && !isMine && !item.grouped && (
                                <strong onClick={() => inspectUserById(m.sender_id)}>
                                  @{m.sender?.username || m.sender_username}
                                </strong>
                              )}
                              <p>{m.content}</p>
                              <span className="chat-msg-time">
                                {isSending ? (lang === 'en' ? 'Sending…' : 'Enviando…') : formatMsgTime(m.created_at, lang)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {isLockedWaitingCollabReply ? (
                      <div className="dock-collab-waiting-bar">
                        <Clock size={14} className="icon-neon" />
                        <span>
                          Has iniciado esta colaboración. Podrás enviar más mensajes en cuanto la otra parte responda.
                        </span>
                      </div>
                    ) : (
                      <form onSubmit={handleSend} className="dock-chat-form">
                        <EmojiPicker targetRef={dockInputRef} value={msgText} onChange={setMsgText} />
                        <input
                          ref={dockInputRef}
                          type="text"
                          placeholder="Escribe un mensaje..."
                          value={msgText}
                          onChange={(e) => setMsgText(e.target.value)}
                        />
                        <button type="submit">
                          <Send size={15} />
                        </button>
                      </form>
                    )}
                  </>
                ) : (
                  <div className="dock-empty">
                    {tab === 'collabs'
                      ? 'Selecciona un chat de colaboración de la columna izquierda'
                      : 'Selecciona una conversación o abre un chat desde tu lista de Amigos'}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'friends' && (
            <div className="dock-list-view">
              <div className="friend-search-autocomplete-wrap">
                <div className="friend-search-box">
                  <Search size={15} className="icon-neon" />
                  <input
                    type="text"
                    placeholder="Buscar usuarios por @username para agregar..."
                    value={friendQuery}
                    onChange={(e) => setFriendQuery(e.target.value)}
                  />
                  {friendQuery && (
                    <button
                      type="button"
                      className="clear-search-btn"
                      onClick={() => {
                        setFriendQuery('');
                        setSearchResults([]);
                      }}
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                {searchResults.length > 0 && (
                  <div className="friend-autocomplete-dropdown">
                    {searchResults.map((prof) => {
                      const relation = friends.find(
                        (f) =>
                          (f.requester_id === user.id && f.addressee_id === prof.id) ||
                          (f.requester_id === prof.id && f.addressee_id === user.id)
                      );

                      return (
                        <div key={prof.id} className="friend-suggestion-row">
                          <div className="friend-user-cell" onClick={() => inspectUserById(prof.id)}>
                            <div className="dock-room-avatar">
                              {prof.avatar_url ? (
                                <img src={prof.avatar_url} alt={prof.username} referrerPolicy="no-referrer" />
                              ) : (
                                <Disc size={16} className="icon-neon" />
                              )}
                            </div>
                            <div>
                              <strong>@{prof.username}</strong>
                              <span>{formatRoleLabel(prof.role)} · {prof.city || 'Madrid'}</span>
                            </div>
                          </div>

                          {relation?.status === 'accepted' ? (
                            <span className="status-tag accepted">Amigos</span>
                          ) : relation?.status === 'pending' ? (
                            <span className="status-tag pending">Pendiente</span>
                          ) : (
                            <button
                              type="button"
                              className="btn-send-req"
                              onClick={async () => {
                                await addFriendByUserId(prof.id);
                                setFriendQuery('');
                                setSearchResults([]);
                                setTab('pending');
                              }}
                            >
                              <UserPlus size={13} /> Solicitar
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {acceptedFriends.length === 0 ? (
                <div className="dock-empty">
                  Aún no tienes amigos confirmados. Usa el buscador superior o revisa la pestaña Pendientes.
                </div>
              ) : (
                <div className="dock-friends-grid">
                  {acceptedFriends.map((f) => {
                    const friendUser = f.requester_id === user.id ? f.addressee : f.requester;
                    const friendRole = friendUser?.role || 'Raver';
                    return (
                      <div key={f.id} className="dock-friend-card">
                        <div className="friend-user-cell" onClick={() => inspectUserById(friendUser?.id)}>
                          <div className="dock-room-avatar">
                            {friendUser?.avatar_url ? (
                              <img src={friendUser.avatar_url} alt={friendUser.username} referrerPolicy="no-referrer" />
                            ) : (
                              <Disc size={18} className="icon-neon" />
                            )}
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <strong>@{friendUser?.username || 'Raver'}</strong>
                              <span className={`chat-role-mini-badge role-${friendRole.toLowerCase()}`}>
                                {formatRoleLabel(friendRole)}
                              </span>
                            </div>
                            <span>{friendUser?.city || 'Madrid'}</span>
                          </div>
                        </div>

                        <div className="friend-card-actions" style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="dock-btn-dm"
                            onClick={async () => {
                              await openDirectMessageWithUser(friendUser);
                              setTab('chats');
                            }}
                          >
                            <MessageSquare size={13} />
                            <span>Chatear</span>
                          </button>

                          <button
                            type="button"
                            className="btn-reject-req"
                            title="Eliminar amigo y borrar nuestro chat"
                            onClick={() => removeFriend(f.id, friendUser?.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'pending' && (
            <div className="dock-list-view">
              {(groupInvitations?.length > 0 || sentGroupInvitations?.length > 0) && (
                <div className="pending-section">
                  <h4 className="pending-subtitle">Invitaciones a grupos ({groupInvitations.length})</h4>
                  {groupInvitations.map((inv) => (
                    <div key={inv.id} className="dock-friend-card">
                      <div className="friend-user-cell">
                        <div className="dock-room-avatar">
                          {inv.inviter?.avatar_url ? (
                            <img src={inv.inviter.avatar_url} alt={inv.inviter.username} referrerPolicy="no-referrer" />
                          ) : (
                            <Users size={18} className="icon-neon" />
                          )}
                        </div>
                        <div>
                          <strong>{inv.room_name}</strong>
                          <span>@{inv.inviter?.username || 'Alguien'} te invita a su grupo privado</span>
                        </div>
                      </div>
                      <div className="pending-actions">
                        <button type="button" className="btn-accept-req" onClick={() => respondToGroupInvitation(inv, 'accepted')}>
                          <Check size={14} /> Unirme
                        </button>
                        <button type="button" className="btn-reject-req" onClick={() => respondToGroupInvitation(inv, 'rejected')}>
                          <X size={14} /> Rechazar
                        </button>
                      </div>
                    </div>
                  ))}
                  {sentGroupInvitations.map((inv) => (
                    <div key={inv.id} className="dock-friend-card">
                      <div className="friend-user-cell">
                        <div className="dock-room-avatar">
                          {inv.invitee?.avatar_url ? (
                            <img src={inv.invitee.avatar_url} alt={inv.invitee.username} referrerPolicy="no-referrer" />
                          ) : (
                            <Users size={18} className="icon-neon" />
                          )}
                        </div>
                        <div>
                          <strong>@{inv.invitee?.username || 'Invitado'}</strong>
                          <span>Esperando a que entre en «{inv.room_name}»…</span>
                        </div>
                      </div>
                      <button type="button" className="btn-reject-req" onClick={() => cancelGroupInvitation(inv.id)}>
                        Cancelar
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="pending-section">
                <h4 className="pending-subtitle">Solicitudes Recibidas ({incomingPending.length})</h4>
                {incomingPending.length === 0 ? (
                  <p className="pending-empty-text">No tienes solicitudes recibidas pendientes.</p>
                ) : (
                  incomingPending.map((req) => (
                    <div key={req.id} className="dock-friend-card">
                      <div className="friend-user-cell" onClick={() => inspectUserById(req.requester?.id)}>
                        <div className="dock-room-avatar">
                          {req.requester?.avatar_url ? (
                            <img src={req.requester.avatar_url} alt={req.requester.username} referrerPolicy="no-referrer" />
                          ) : (
                            <Disc size={18} className="icon-neon" />
                          )}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <strong>@{req.requester?.username || 'Raver'}</strong>
                            <span className={`chat-role-mini-badge role-${(req.requester?.role || 'Raver').toLowerCase()}`}>
                              {formatRoleLabel(req.requester?.role)}
                            </span>
                          </div>
                          <span>Quiere agregarte a su lista de amigos</span>
                        </div>
                      </div>

                      <div className="pending-actions">
                        <button type="button" className="btn-accept-req" onClick={() => acceptFriendRequest(req.id)}>
                          <Check size={14} /> Aceptar
                        </button>
                        <button type="button" className="btn-reject-req" onClick={() => rejectFriendRequest(req.id)}>
                          <X size={14} /> Rechazar
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="pending-section">
                <h4 className="pending-subtitle">Solicitudes Enviadas ({outgoingPending.length})</h4>
                {outgoingPending.length === 0 ? (
                  <p className="pending-empty-text">No tienes solicitudes enviadas esperando respuesta.</p>
                ) : (
                  outgoingPending.map((req) => (
                    <div key={req.id} className="dock-friend-card">
                      <div className="friend-user-cell" onClick={() => inspectUserById(req.addressee?.id)}>
                        <div className="dock-room-avatar">
                          {req.addressee?.avatar_url ? (
                            <img src={req.addressee.avatar_url} alt={req.addressee.username} referrerPolicy="no-referrer" />
                          ) : (
                            <Disc size={18} className="icon-neon" />
                          )}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <strong>@{req.addressee?.username || 'Raver'}</strong>
                            <span className={`chat-role-mini-badge role-${(req.addressee?.role || 'Raver').toLowerCase()}`}>
                              {formatRoleLabel(req.addressee?.role)}
                            </span>
                          </div>
                          <span>Esperando a que acepte tu solicitud...</span>
                        </div>
                      </div>

                      <button type="button" className="btn-reject-req" onClick={() => rejectFriendRequest(req.id)}>
                        Cancelar
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {tab === 'my_events' && (
            <div className="dock-list-view">
              {myAttendingEvents.length === 0 ? (
                <div className="dock-empty">
                  Aún no te has apuntado a ningún evento. Abre una fiesta en el mapa y pulsa &quot;Voy a ir&quot; o &quot;Busco Rave Squad&quot;.
                </div>
              ) : (
                myAttendingEvents.map((ev) => (
                  <button
                    type="button"
                    key={ev.id}
                    className="dock-event-row"
                    onClick={() => {
                      selectEvent(ev);
                      setModal('isSocialDockOpen', false);
                    }}
                  >
                    <img src={ev.image_url} alt={ev.name} />
                    <div className="dock-event-info">
                      <strong>{ev.name}</strong>
                      <span><MapPin size={11} /> {ev.venue_name || ev.city} · {ev.start_date}</span>
                    </div>
                    {ev.my_status === 'looking_for_squad' ? (
                      <span className="my-ev-badge squad"><Zap size={11} /> Rave Squad</span>
                    ) : (
                      <span className="my-ev-badge going"><CheckCircle2 size={11} /> Voy a ir</span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
};
