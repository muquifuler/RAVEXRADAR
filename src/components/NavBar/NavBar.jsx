// src/components/Navbar/Navbar.jsx
import React, { useState, useRef, useEffect } from 'react';
import {
  Zap, SlidersHorizontal, Calendar, Globe, User,
  Trophy, Bell, Check, X, Disc, LifeBuoy, ShieldAlert,
  Plus, LocateFixed, Handshake, Sparkles, LayoutGrid, ChevronRight, Users, Download,
  Crown, Megaphone, Ghost
} from 'lucide-react';
import { openInstallPrompt, isAppInstalled } from '../ui/InstallAppPrompt';
import { useRaveStore } from '../../store/useRaveStore';
import { translations } from '../../i18n/translations';
import { ELECTRONIC_GENRES } from '../../constants/electronicGenres';
import { ProSelect } from '../ui/ProSelect';
import { ProSearchAutocomplete } from '../ui/ProSearchAutocomplete';

import './Navbar.css';

export const Navbar = ({ onOpenAdmin }) => {
  const {
    lang, setLang, filteredEvents, djs, activeSubgenre, activeTimeFilter,
    applyFilters, searchQuery, selectEvent, selectDj, user, setModal,
    friends, acceptFriendRequest, rejectFriendRequest, inspectUserById,
    mySupportNotifications, markSupportReplyRead, focusMyPinOnMap,
    appNotifications, dismissAppNotification, openAppNotification,
    autoApproveRoles, myRoleRequest, dismissRoleRequestNotification,
    markWelcomeNotifReadAndOpenProfile, myEventInvitations, respondToEventInvitation, 
    dismissEventInviteNotification, incomingAccessRequests, resolveEventAccessRequest,
    groupInvitations, respondToGroupInvitation, collabApplications, openCollabApplication
  } = useRaveStore();

  const [isBellOpen, setIsBellOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false); // Panel "Más" (solo móvil)
  const bellRef = useRef(null);
  const t = translations[lang];

  useEffect(() => {
    const handleOutside = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) {
        setIsBellOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Ejecuta una acción del panel "Más" y lo cierra
  const runMoreAction = (fn) => {
    setIsMoreOpen(false);
    fn();
  };

  // PUNTO 4: Declarar isAdmin ANTES de usarlo en canPublishEvent y canAccessCollabs
  const isAdmin = Boolean(user?.is_admin || user?.role === 'Admin');

  const canPublishEvent = Boolean(
    user && (user.role === 'Club' || user.role === 'Promotor' || isAdmin)
  );

  const canAccessCollabs = Boolean(
    user && (user.role === 'DJ' || user.role === 'Promotor' || user.role === 'Club' || isAdmin)
  );

  const hasMapPinConfigured = Boolean(
    user &&
      (user.role === 'DJ' || user.role === 'Club' || user.role === 'Promotor') &&
      user.lat !== null &&
      user.lat !== undefined &&
      user.lng !== null &&
      user.lng !== undefined
  );

  const pendingIncomingRequests = user
    ? friends.filter((f) => f.addressee_id === user.id && f.status === 'pending')
    : [];

  const hasActiveRoleNotif = Boolean(
    !autoApproveRoles &&
      myRoleRequest &&
      (myRoleRequest.status === 'pending' || !myRoleRequest.user_read_resolution)
  );

  const showWelcomeNotif = Boolean(user && user.welcome_notif_read === false);

  // Invitaciones a fiestas que me han enviado y están pendientes de que yo acepte o rechace
  const pendingPartyInvites = (myEventInvitations || []).filter(
    (inv) => inv.direction === 'invited' && inv.status === 'pending'
  );

  // Solicitudes de permiso que yo pedí y que el organizador ya ha resuelto (aceptado/rechazado)
  const resolvedAccessRequests = (myEventInvitations || []).filter(
    (inv) => inv.direction === 'requested' && inv.status !== 'pending' && !inv.user_read_notification
  );

  const totalNotifsCount =
    pendingIncomingRequests.length +
    (mySupportNotifications?.length || 0) +
    (appNotifications?.length || 0) +
    (hasActiveRoleNotif ? 1 : 0) +
    (showWelcomeNotif ? 1 : 0) +
    pendingPartyInvites.length +
    resolvedAccessRequests.length +
    (incomingAccessRequests?.length || 0) +
    (groupInvitations?.length || 0) +
    (collabApplications?.length || 0);

  const genreOptions = [
    { value: 'ALL', label: t.allGenres },
    ...ELECTRONIC_GENRES.map((g) => ({ value: g, label: g }))
  ];

  const timeOptions = [
    { value: 'ALL', label: t.allDates },
    { value: 'ACTIVE_NOW', label: t.activeNow },
    { value: 'TODAY', label: t.today },
    { value: 'WEEKEND', label: t.weekend },
    { value: 'MONTH', label: t.month }
  ];

  return (
    <header className="navbar-pro">
      <div className="navbar-brand" aria-label="RAVEXRADAR">
        <span className="brand-mark" aria-hidden="true">
          <span className="brand-mark-ring" />
          <span className="brand-mark-ring" />
          <svg viewBox="18 18 84 100" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M60 106 C44 88 30 72 30 50 A30 30 0 0 1 90 50 C90 72 76 88 60 106 Z M60 37 A13 13 0 1 0 60 63 A13 13 0 1 0 60 37 Z"
              fill="#FACC15"
              fillRule="evenodd"
            />
            <circle cx="60" cy="50" r="6" fill="#FACC15" />
          </svg>
        </span>
      </div>

      <ProSearchAutocomplete
        value={searchQuery}
        placeholder={t.searchPlaceholder}
        events={filteredEvents}
        djs={djs}
        onChange={(q) => applyFilters({ query: q })}
        onSelectEvent={(ev) => selectEvent(ev)}
        onSelectDj={(dj) => selectDj(dj)}
      />

      <div className="navbar-filters">
        <ProSelect
          icon={SlidersHorizontal}
          value={activeSubgenre}
          options={genreOptions}
          onChange={(val) => applyFilters({ subgenre: val })}
        />

        <ProSelect
          icon={Calendar}
          value={activeTimeFilter}
          options={timeOptions}
          onChange={(val) => applyFilters({ timeFilter: val })}
        />
      </div>

      <div className="navbar-actions">
        {canPublishEvent && (
          <button
            type="button"
            className="nav-btn-publish"
            onClick={() => {
              useRaveStore.setState({ editingEvent: null });
              setModal('isAddEventOpen', true);
            }}
          >
            <Plus size={16} strokeWidth={2.5} />
            <span className="nav-desktop-label">{t.publishRave}</span>
            <span className="nav-mobile-label">{lang === 'es' ? 'Publicar' : 'Post'}</span>
          </button>
        )}

        {canAccessCollabs && (
          <button
            type="button"
            className="nav-btn-ranking nav-extra"
            style={{ borderColor: '#06b6d4', color: '#67e8f9', background: 'rgba(6, 182, 212, 0.12)' }}
            onClick={() => setModal('isCollabOpen', true)}
          >
            <Handshake size={15} />
            <span>{lang === 'es' ? 'Colaboraciones' : 'Collaborations'}</span>
          </button>
        )}

        <button
          type="button"
          className="nav-btn-ranking"
          onClick={() => setModal('isRankingOpen', true)}
        >
          <Trophy size={15} />
          <span className="nav-desktop-label">{t.rankingBtn}</span>
          <span className="nav-mobile-label">Ranking</span>
        </button>

        <button
          type="button"
          className="nav-btn-ranking nav-extra"
          style={{ borderColor: 'rgba(250, 204, 21, 0.55)', color: '#fde68a' }}
          onClick={() => setModal('isStudioOpen', true)}
          title={lang === 'es' ? 'Crea stories y posts con tu info' : 'Create stories and posts'}
        >
          <Sparkles size={15} />
          <span>{lang === 'es' ? 'Estudio' : 'Studio'}</span>
        </button>

        <button
          type="button"
          className="nav-btn-lang nav-extra"
          onClick={() => (user ? setModal('isSupportOpen', true) : setModal('isAuthOpen', true))}
          title={lang === 'es' ? 'Contacto / Soporte' : 'Contact / Support'}
        >
          <LifeBuoy size={15} className="icon-neon" />
          <span className="hide-mobile">{lang === 'es' ? 'Soporte' : 'Support'}</span>
        </button>

        {isAdmin && (
          <button
            type="button"
            className="nav-btn-lang nav-extra"
            style={{ borderColor: '#ef4444', color: '#f87171' }}
            onClick={onOpenAdmin}
          >
            <ShieldAlert size={15} />
            <span>Admin</span>
          </button>
        )}

        {user && (
          <div className="nav-bell-wrapper" ref={bellRef}>
            <button
              type="button"
              className={`nav-btn-bell ${totalNotifsCount > 0 ? 'has-notifs' : ''}`}
              onClick={() => {
                setIsBellOpen(!isBellOpen);
                setIsMoreOpen(false);
              }}
              title={lang === 'es' ? 'Notificaciones' : 'Notifications'}
            >
              <Bell size={16} />
              <span className="nav-mobile-label">{lang === 'es' ? 'Avisos' : 'Alerts'}</span>
              {totalNotifsCount > 0 && (
                <span className="nav-bell-badge">{totalNotifsCount}</span>
              )}
            </button>

            {isBellOpen && (
              <div className="nav-notifications-dropdown">
                <div className="notif-header">
                  <strong>{lang === 'es' ? 'Notificaciones' : 'Notifications'}</strong>
                  <span>{totalNotifsCount} {lang === 'es' ? 'nuevas' : 'new'}</span>
                </div>

                {totalNotifsCount === 0 ? (
                  <p className="notif-empty">
                    {lang === 'es' ? 'No tienes notificaciones pendientes.' : 'No pending notifications.'}
                  </p>
                ) : (
                  <div className="notif-list">
                    {/* Notificación de primera vez al registrarse */}
                    {showWelcomeNotif && (
                      <div
                        className="notif-item"
                        style={{
                          cursor: 'pointer',
                          borderColor: 'var(--accent-neon)',
                          background: 'rgba(250, 204, 21, 0.12)'
                        }}
                        onClick={() => {
                          setIsBellOpen(false);
                          markWelcomeNotifReadAndOpenProfile();
                        }}
                      >
                        <div className="notif-support-body">
                          <span className="notif-support-tag">
                            <Sparkles size={12} /> ¡Bienvenido a RaveRadar! (Haz clic para configurar)
                          </span>
                          <p>
                            Recuerda que puedes personalizar tu perfil completo y, si eres DJ, Promotor o Club, elegir tu ubicación en el mapa para salir en el radar.
                          </p>
                        </div>
                      </div>
                    )}

                                        {/* Avisos: DJ fundador y avisos del equipo de RAVEXRADAR */}
                    {(appNotifications || []).map((n) => (
                      <div
                        key={`app_${n.id}`}
                        className={`notif-item app-notif kind-${n.kind}${n.action ? ' is-actionable' : ''}`}
                        onClick={
                          n.action
                            ? () => {
                                setIsBellOpen(false);
                                openAppNotification(n);
                              }
                            : undefined
                        }
                      >
                        <div className="notif-support-body">
                          <span className="notif-support-tag">
                            {n.kind === 'founder' ? <Crown size={12} /> : n.kind === 'claim' ? <Ghost size={12} /> : <Megaphone size={12} />} {n.title}
                          </span>
                          {n.body && <p>{n.body}</p>}
                        </div>
                        <button
                          type="button"
                          className="btn-notif-accept"
                          onClick={(e) => {
                            e.stopPropagation();
                            dismissAppNotification(n.id);
                          }}
                          title="Marcar como leído"
                        >
                          <Check size={14} />
                        </button>
                      </div>
                    ))}

                    {/* Notificación de estado de Solicitud de Verificación de Rol */}
                    {hasActiveRoleNotif && (
                      <div
                        className="notif-item"
                        style={{
                          borderColor:
                            myRoleRequest.status === 'approved'
                              ? '#22c55e'
                              : myRoleRequest.status === 'rejected'
                              ? '#ef4444'
                              : 'var(--accent-neon)',
                          background:
                            myRoleRequest.status === 'approved'
                              ? 'rgba(34, 197, 94, 0.12)'
                              : myRoleRequest.status === 'rejected'
                              ? 'rgba(239, 68, 68, 0.12)'
                              : 'rgba(250, 204, 21, 0.08)'
                        }}
                      >
                        <div className="notif-support-body">
                          <span
                            className="notif-support-tag"
                            style={{
                              color:
                                myRoleRequest.status === 'approved'
                                  ? '#4ade80'
                                  : myRoleRequest.status === 'rejected'
                                  ? '#f87171'
                                  : 'var(--accent-neon)'
                            }}
                          >
                            <ShieldAlert size={12} />{' '}
                            {myRoleRequest.status === 'pending'
                              ? 'Solicitud en Proceso de Revisión'
                              : myRoleRequest.status === 'approved'
                              ? '¡Solicitud de Rol Aceptada!'
                              : 'Solicitud de Rol Rechazada'}
                          </span>
                          <p>
                            {myRoleRequest.status === 'pending'
                              ? `Tu petición para ser ${myRoleRequest.requested_role === 'Club' ? 'Club / Sala' : myRoleRequest.requested_role} está siendo revisada por un administrador.`
                              : myRoleRequest.status === 'approved'
                              ? `Tu perfil ha sido verificado y actualizado a ${myRoleRequest.requested_role === 'Club' ? 'Club / Sala' : myRoleRequest.requested_role}.`
                              : `Tu solicitud para cambiar a ${myRoleRequest.requested_role} fue denegada. Continúas como Raver.`}
                          </p>
                        </div>

                        {myRoleRequest.status !== 'pending' && (
                          <button
                            type="button"
                            className="btn-notif-accept"
                            onClick={() => dismissRoleRequestNotification(myRoleRequest.id)}
                            title="Entendido"
                          >
                            <Check size={14} />
                          </button>
                        )}
                      </div>
                    )}

                    {/* Respuestas de Soporte */}
                    {(mySupportNotifications || []).map((ticket) => (
                      <div key={`sup_${ticket.id}`} className="notif-item support-reply-notif">
                        <div className="notif-support-body">
                          <span className="notif-support-tag">
                            <LifeBuoy size={11} /> Respuesta de Soporte ({ticket.subject})
                          </span>
                          <p>{ticket.admin_reply}</p>
                        </div>
                        <button
                          type="button"
                          className="btn-notif-accept"
                          onClick={() => markSupportReplyRead(ticket.id)}
                          title="Marcar como leído"
                        >
                          <Check size={14} />
                        </button>
                      </div>
                    ))}

                    {/* Alguien ha aplicado a tu oferta: al pulsar se marca leída y se abre su chat */}
                    {(collabApplications || []).map((link) => (
                      <button
                        type="button"
                        key={`collab_app_${link.id}`}
                        className="notif-item notif-clickable"
                        onClick={() => {
                          openCollabApplication(link);
                          setIsBellOpen(false);
                        }}
                      >
                        <div className="notif-user-info">
                          <div className="notif-avatar">
                            {link.target?.avatar_url ? (
                              <img src={link.target.avatar_url} alt={link.target.username} referrerPolicy="no-referrer" />
                            ) : (
                              <Handshake size={16} className="icon-neon" />
                            )}
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <strong>@{link.target?.username || 'Usuario'}</strong>
                              <span className={`chat-role-mini-badge role-${(link.target?.role || 'Raver').toLowerCase()}`}>
                                {link.target?.role === 'Club' ? 'Club / Sala' : link.target?.role || 'Raver'}
                              </span>
                            </div>
                            <span>
                              {lang === 'es' ? 'Ha aplicado a' : 'Applied to'} «{link.offer?.title || 'tu oferta'}» · {lang === 'es' ? 'Abrir chat' : 'Open chat'}
                            </span>
                          </div>
                        </div>
                        <ChevronRight size={16} className="icon-neon" />
                      </button>
                    ))}

                    {/* Invitaciones a grupos privados: aceptar abre el grupo */}
                    {(groupInvitations || []).map((inv) => (
                      <div key={`grp_inv_${inv.id}`} className="notif-item">
                        <div className="notif-user-info">
                          <div className="notif-avatar">
                            {inv.inviter?.avatar_url ? (
                              <img src={inv.inviter.avatar_url} alt={inv.inviter.username} referrerPolicy="no-referrer" />
                            ) : (
                              <Users size={16} className="icon-neon" />
                            )}
                          </div>
                          <div>
                            <strong>{inv.room_name}</strong>
                            <span>
                              @{inv.inviter?.username || 'Alguien'} {lang === 'es' ? 'te invita a su grupo privado' : 'invited you to a private group'}
                            </span>
                          </div>
                        </div>
                        <div className="notif-actions">
                          <button
                            type="button"
                            className="btn-notif-accept"
                            title={lang === 'es' ? 'Unirme y abrir el grupo' : 'Join and open'}
                            onClick={() => {
                              respondToGroupInvitation(inv, 'accepted');
                              setIsBellOpen(false);
                            }}
                          >
                            <Check size={14} />
                          </button>
                          <button
                            type="button"
                            className="btn-notif-reject"
                            title={lang === 'es' ? 'Rechazar' : 'Decline'}
                            onClick={() => respondToGroupInvitation(inv, 'rejected')}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    ))}

                    {pendingIncomingRequests.map((req) => (
                      <div key={req.id} className="notif-item">
                        <div
                          className="notif-user-info"
                          onClick={() => {
                            inspectUserById(req.requester?.id);
                            setIsBellOpen(false);
                          }}
                        >
                          <div className="notif-avatar">
                            {req.requester?.avatar_url ? (
                              <img src={req.requester.avatar_url} alt={req.requester.username} referrerPolicy="no-referrer" />
                            ) : (
                              <Disc size={16} className="icon-neon" />
                            )}
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <strong>@{req.requester?.username || 'Raver'}</strong>
                              <span className={`chat-role-mini-badge role-${(req.requester?.role || 'Raver').toLowerCase()}`}>
                                {req.requester?.role === 'Club' ? 'Club / Sala' : req.requester?.role || 'Raver'}
                              </span>
                            </div>
                            <span>{lang === 'es' ? 'Quiere agregarte como amigo' : 'Sent you a friend request'}</span>
                          </div>
                        </div>

                        <div className="notif-actions">
                          <button
                            type="button"
                            className="btn-notif-accept"
                            onClick={() => acceptFriendRequest(req.id)}
                          >
                            <Check size={14} />
                          </button>
                          <button
                            type="button"
                            className="btn-notif-reject"
                            onClick={() => rejectFriendRequest(req.id)}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* PUNTO 5: Invitaciones a Fiestas recibidas (Aceptar o Rechazar directamente) */}
                    {pendingPartyInvites.map((inv) => (
                      <div
                        key={`ev_inv_${inv.id}`}
                        className="notif-item"
                        style={{ borderColor: 'var(--accent-neon)', background: 'rgba(250, 204, 21, 0.1)' }}
                      >
                        <div
                          className="notif-user-info"
                          onClick={() => {
                            if (inv.event) selectEvent(inv.event);
                            setIsBellOpen(false);
                          }}
                        >
                          <div className="notif-avatar" style={{ borderRadius: '8px' }}>
                            {inv.event?.image_url ? (
                              <img src={inv.event.image_url} alt={inv.event?.name} />
                            ) : (
                              <Zap size={16} className="icon-neon" />
                            )}
                          </div>
                          <div>
                            <strong>Invitación: {inv.event?.name || 'Fiesta Privada'}</strong>
                            <span>
                              De @{inv.inviter?.username || 'Organizador'} · {inv.event?.start_date}
                            </span>
                          </div>
                        </div>

                        <div className="notif-actions">
                          <button
                            type="button"
                            className="btn-notif-accept"
                            title="Aceptar invitación (Se marcará Voy a ir)"
                            onClick={() => respondToEventInvitation(inv.id, 'accepted')}
                          >
                            <Check size={14} />
                          </button>
                          <button
                            type="button"
                            className="btn-notif-reject"
                            title="Rechazar invitación"
                            onClick={() => respondToEventInvitation(inv.id, 'rejected')}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* PUNTO 1: Solicitudes de usuarios que piden permiso para ir a tu fiesta (Aceptar / Rechazar desde notificaciones) */}
                    {(incomingAccessRequests || []).map((req) => (
                      <div
                        key={`inc_ev_req_${req.id}`}
                        className="notif-item"
                        style={{ borderColor: '#a855f7', background: 'rgba(168, 85, 247, 0.12)' }}
                      >
                        <div
                          className="notif-user-info"
                          onClick={() => {
                            inspectUserById(req.user_id);
                            setIsBellOpen(false);
                          }}
                        >
                          <div className="notif-avatar">
                            {req.profile?.avatar_url ? (
                              <img src={req.profile.avatar_url} alt={req.profile.username} referrerPolicy="no-referrer" />
                            ) : (
                              <Disc size={16} className="icon-neon" />
                            )}
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <strong>@{req.profile?.username || 'Raver'}</strong>
                              <span className={`chat-role-mini-badge role-${(req.profile?.role || 'Raver').toLowerCase()}`}>
                                {req.profile?.role === 'Club' ? 'Club / Sala' : req.profile?.role || 'Raver'}
                              </span>
                            </div>
                            <span>
                              Pide permiso para ir a <strong>{req.event?.name}</strong>
                            </span>
                          </div>
                        </div>

                        <div className="notif-actions">
                          <button
                            type="button"
                            className="btn-notif-accept"
                            title="Aceptar permiso (Le habilitará y marcará Voy a ir)"
                            onClick={() => resolveEventAccessRequest(req, 'accepted')}
                          >
                            <Check size={14} />
                          </button>
                          <button
                            type="button"
                            className="btn-notif-reject"
                            title="Rechazar permiso"
                            onClick={() => resolveEventAccessRequest(req, 'rejected')}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* PUNTO 3 y 5: Cuando te han aceptado en una fiesta, al hacer click te lleva al evento (y abre [Evento] <- [Club] si pertenece a un club) */}
                    {resolvedAccessRequests.map((req) => (
                      <div
                        key={`ev_req_${req.id}`}
                        className="notif-item"
                        style={{
                          cursor: 'pointer',
                          borderColor: req.status === 'accepted' ? '#22c55e' : '#ef4444',
                          background: req.status === 'accepted' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)'
                        }}
                        onClick={() => {
                          if (req.event) {
                            selectEvent(req.event);
                          }
                          dismissEventInviteNotification(req.id);
                          setIsBellOpen(false);
                        }}
                      >
                        <div className="notif-support-body">
                          <span
                            className="notif-support-tag"
                            style={{ color: req.status === 'accepted' ? '#4ade80' : '#f87171' }}
                          >
                            <Zap size={11} />{' '}
                            {req.status === 'accepted'
                              ? '¡Acceso Aceptado a la Fiesta! (Click para ir)'
                              : 'Solicitud de Acceso Rechazada'}
                          </span>
                          <p>
                            {req.status === 'accepted'
                              ? `Te han aceptado en "${req.event?.name}". Haz clic aquí para ver el evento y su ubicación.`
                              : `Tu solicitud para asistir a "${req.event?.name}" fue rechazada.`}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="btn-notif-accept"
                          onClick={(e) => {
                            e.stopPropagation();
                            dismissEventInviteNotification(req.id);
                          }}
                          title="Marcar como leído"
                        >
                          <Check size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          className="nav-btn-lang nav-extra"
          onClick={() => setLang(lang === 'es' ? 'en' : 'es')}
        >
          <Globe size={15} />
          <span>{lang.toUpperCase()}</span>
        </button>

        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              className="nav-btn-profile"
              onClick={() => setModal('isProfileOpen', true)}
            >
              {user.avatar_url ? (
                <img src={user.avatar_url} alt={user.username} className="nav-avatar-img" referrerPolicy="no-referrer" />
              ) : (
                <User size={15} className="icon-neon" />
              )}
              <span className="nav-desktop-label">@{user.username}</span>
              <span className="nav-mobile-label">{lang === 'es' ? 'Perfil' : 'Profile'}</span>
            </button>

            {hasMapPinConfigured && (
              <button
                type="button"
                className={`nav-btn-locate-me nav-extra role-${user.role.toLowerCase()}`}
                onClick={focusMyPinOnMap}
                title={lang === 'es' ? 'Ir a mi posición en el mapa' : 'Go to my position on map'}
              >
                <LocateFixed size={16} />
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            className="nav-btn-login"
            onClick={() => setModal('isAuthOpen', true)}
          >
            <User size={15} />
            <span className="nav-desktop-label">{t.connectAccount}</span>
            <span className="nav-mobile-label">{lang === 'es' ? 'Entrar' : 'Log in'}</span>
          </button>
        )}

        {/* ===== Solo móvil: botón "Más" + panel con las funciones extra ===== */}
        <button
          type="button"
          className={`nav-btn-more ${isMoreOpen ? 'is-active' : ''}`}
          onClick={() => {
            setIsMoreOpen(!isMoreOpen);
            setIsBellOpen(false);
          }}
          aria-expanded={isMoreOpen}
        >
          {isMoreOpen ? <X size={16} /> : <LayoutGrid size={16} />}
          <span className="nav-mobile-label">{lang === 'es' ? 'Más' : 'More'}</span>
        </button>
      </div>

      {isMoreOpen && (
        <>
          <div className="nav-more-backdrop" onClick={() => setIsMoreOpen(false)} />
          <div className="nav-more-sheet" role="menu">
            <div className="nav-more-head">
              <strong>{lang === 'es' ? 'Más opciones' : 'More options'}</strong>
              <span>RAVEXRADAR</span>
            </div>

            <div className="nav-more-grid">
              {canAccessCollabs && (
                <button
                  type="button"
                  className="nav-more-item tone-cyan"
                  onClick={() => runMoreAction(() => setModal('isCollabOpen', true))}
                >
                  <span className="nav-more-icon"><Handshake size={18} /></span>
                  <span className="nav-more-text">
                    <strong>{lang === 'es' ? 'Colaboraciones' : 'Collaborations'}</strong>
                    <small>{lang === 'es' ? 'Ofertas y bookings' : 'Offers & bookings'}</small>
                  </span>
                  <ChevronRight size={15} className="nav-more-chevron" />
                </button>
              )}

              {hasMapPinConfigured && (
                <button
                  type="button"
                  className={`nav-more-item tone-${user.role.toLowerCase()}`}
                  onClick={() => runMoreAction(focusMyPinOnMap)}
                >
                  <span className="nav-more-icon"><LocateFixed size={18} /></span>
                  <span className="nav-more-text">
                    <strong>{lang === 'es' ? 'Mi posición' : 'My position'}</strong>
                    <small>{lang === 'es' ? 'Ir a mi pin en el mapa' : 'Go to my map pin'}</small>
                  </span>
                  <ChevronRight size={15} className="nav-more-chevron" />
                </button>
              )}

              <button
                type="button"
                className="nav-more-item tone-yellow"
                onClick={() => runMoreAction(() => setModal('isStudioOpen', true))}
              >
                <span className="nav-more-icon"><Sparkles size={18} /></span>
                <span className="nav-more-text">
                  <strong>{lang === 'es' ? 'Estudio' : 'Studio'}</strong>
                  <small>{lang === 'es' ? 'Stories y posts con tu info' : 'Stories & posts with your info'}</small>
                </span>
                <ChevronRight size={15} className="nav-more-chevron" />
              </button>

              <button
                type="button"
                className="nav-more-item tone-yellow"
                onClick={() =>
                  runMoreAction(() =>
                    user ? setModal('isSupportOpen', true) : setModal('isAuthOpen', true)
                  )
                }
              >
                <span className="nav-more-icon"><LifeBuoy size={18} /></span>
                <span className="nav-more-text">
                  <strong>{lang === 'es' ? 'Soporte' : 'Support'}</strong>
                  <small>{lang === 'es' ? 'Contacto y ayuda' : 'Contact & help'}</small>
                </span>
                <ChevronRight size={15} className="nav-more-chevron" />
              </button>

              {!isAppInstalled() && (
                <button
                  type="button"
                  className="nav-more-item tone-yellow"
                  onClick={() => runMoreAction(openInstallPrompt)}
                >
                  <span className="nav-more-icon"><Download size={18} /></span>
                  <span className="nav-more-text">
                    <strong>{lang === 'es' ? 'Instalar app' : 'Install app'}</strong>
                    <small>{lang === 'es' ? 'En tu pantalla de inicio' : 'On your home screen'}</small>
                  </span>
                  <ChevronRight size={15} className="nav-more-chevron" />
                </button>
              )}

              <button
                type="button"
                className="nav-more-item tone-neutral"
                onClick={() => setLang(lang === 'es' ? 'en' : 'es')}
              >
                <span className="nav-more-icon"><Globe size={18} /></span>
                <span className="nav-more-text">
                  <strong>{lang === 'es' ? 'Idioma' : 'Language'}</strong>
                  <small>{lang === 'es' ? 'Español' : 'English'}</small>
                </span>
                <span className="nav-more-lang-pill">{lang === 'es' ? 'ES → EN' : 'EN → ES'}</span>
              </button>

              {isAdmin && (
                <button
                  type="button"
                  className="nav-more-item tone-red"
                  onClick={() => runMoreAction(onOpenAdmin)}
                >
                  <span className="nav-more-icon"><ShieldAlert size={18} /></span>
                  <span className="nav-more-text">
                    <strong>Admin</strong>
                    <small>{lang === 'es' ? 'Panel de control' : 'Control panel'}</small>
                  </span>
                  <ChevronRight size={15} className="nav-more-chevron" />
                </button>
              )}
            </div>

            <p className="legal-mini-links nav-more-legal">
              <a href="/privacidad.html" target="_blank" rel="noopener">Privacidad</a> ·{' '}
              <a href="/condiciones.html" target="_blank" rel="noopener">Condiciones</a>
            </p>
          </div>
        </>
      )}
    </header>
  );
};