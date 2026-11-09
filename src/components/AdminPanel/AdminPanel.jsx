// src/components/AdminPanel/AdminPanel.jsx
import React, { useEffect, useState, useMemo } from 'react';
import {
  ShieldAlert, Mail, Clock, Send, CheckCircle2, ArrowLeft,
  RefreshCw, Check, X, UserCheck, LifeBuoy, BarChart3, Crown,
  Users, Calendar, Server, UserPlus, ChevronLeft, ChevronRight, Megaphone, GitMerge
} from 'lucide-react';
import { useRaveStore } from '../../store/useRaveStore';
import { AdminBroadcast } from './AdminBroadcast';
import { AdminGhostClaims } from './AdminGhostClaims';
import './AdminPanel.css';

export const AdminPanel = ({ onExitAdmin }) => {
  const {
    user,
    events,
    fetchEvents,
    supportTickets,
    fetchAllSupportTickets,
    replySupportTicket,
    autoApproveRoles,
    fetchAppSettings,
    toggleAutoApproveRoles,
    allRoleRequests,
    fetchAllRoleRequests,
    resolveRoleRequest,
    allProfilesAdmin,
    fetchAllProfilesForAdmin,
    toggleUserProStatusAdmin,
    ghostClaims
  } = useRaveStore();

  const [adminSection, setAdminSection] = useState('ANALYTICS'); // 'ANALYTICS' | 'ROLES' | 'SUPPORT'
  const [replyTexts, setReplyTexts] = useState({});
  const [sendingId, setSendingId] = useState(null);
  const [resolvingRoleId, setResolvingRoleId] = useState(null);
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [proFilterOnly, setProFilterOnly] = useState(true);
  const [userSearch, setUserSearch] = useState('');

  // PUNTO 1: Desplazamiento de mes para la gráfica de Eventos por Día (0 = este mes, -1 = mes pasado, +1 = mes siguiente)
  const [eventsMonthOffset, setEventsMonthOffset] = useState(0);

  const isAdmin = Boolean(user?.is_admin || user?.role === 'Admin');

  const refreshAllAdminData = () => {
    fetchAppSettings();
    fetchAllRoleRequests();
    fetchAllSupportTickets();
    useRaveStore.getState().fetchGhostClaims();
    fetchAllProfilesForAdmin();
    fetchEvents();
  };

  useEffect(() => {
    if (isAdmin) {
      refreshAllAdminData();
    }
  }, [isAdmin]);

  // PUNTO 1: Gráfica de Eventos por Día mostrando SIEMPRE todos los días del mes seleccionado con proporciones exactas
  const eventsPerDayStats = useMemo(() => {
    const now = new Date();
    const targetMonthDate = new Date(now.getFullYear(), now.getMonth() + eventsMonthOffset, 1);
    const year = targetMonthDate.getFullYear();
    const month = targetMonthDate.getMonth(); // 0 - 11
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const monthLabel = targetMonthDate.toLocaleDateString('es-ES', {
      month: 'long',
      year: 'numeric'
    });

    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

    // Inicializar todos los días del mes (del 01 al 28/30/31) con 0 eventos
    const byDate = {};
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${monthPrefix}-${String(d).padStart(2, '0')}`;
      byDate[dateStr] = {
        date: dateStr,
        dayNum: String(d).padStart(2, '0'),
        server: 0,
        user: 0,
        total: 0
      };
    }

    let globalServer = 0;
    let globalUser = 0;
    let monthServer = 0;
    let monthUser = 0;

    (events || []).forEach((ev) => {
      const rawDate = (ev.start_date || '').slice(0, 10);
      const isUserCreated =
        Boolean(ev.created_by) ||
        (typeof ev.external_id === 'string' && ev.external_id.startsWith('user_'));

      if (isUserCreated) globalUser += 1;
      else globalServer += 1;

      if (byDate[rawDate]) {
        if (isUserCreated) {
          byDate[rawDate].user += 1;
          monthUser += 1;
        } else {
          byDate[rawDate].server += 1;
          monthServer += 1;
        }
        byDate[rawDate].total += 1;
      }
    });

    const daysArray = Object.values(byDate);
    const maxDayTotal = daysArray.reduce((max, d) => Math.max(max, d.total), 1);

    return {
      monthLabel,
      daysArray,
      maxDayTotal,
      monthServer,
      monthUser,
      monthTotal: monthServer + monthUser,
      globalServer,
      globalUser
    };
  }, [events, eventsMonthOffset]);

  // Gráfica 2: Evolución de Usuarios a lo largo del Tiempo por Rol
  const usersOverTimeStats = useMemo(() => {
    const byDate = {};
    const roleTotals = { Raver: 0, DJ: 0, Promotor: 0, Club: 0 };

    (allProfilesAdmin || []).forEach((prof) => {
      const roleKey = ['DJ', 'Promotor', 'Club'].includes(prof.role) ? prof.role : 'Raver';
      roleTotals[roleKey] = (roleTotals[roleKey] || 0) + 1;

      const rawDate = prof.created_at
        ? prof.created_at.slice(0, 10)
        : new Date().toISOString().slice(0, 10);

      if (!byDate[rawDate]) {
        byDate[rawDate] = { date: rawDate, Raver: 0, DJ: 0, Promotor: 0, Club: 0 };
      }
      byDate[rawDate][roleKey] += 1;
    });

    const sortedDates = Object.keys(byDate).sort();
    let cumRaver = 0;
    let cumDJ = 0;
    let cumPromotor = 0;
    let cumClub = 0;

    const timeline = sortedDates.map((d) => {
      cumRaver += byDate[d].Raver;
      cumDJ += byDate[d].DJ;
      cumPromotor += byDate[d].Promotor;
      cumClub += byDate[d].Club;
      const total = cumRaver + cumDJ + cumPromotor + cumClub;
      return {
        date: d,
        Raver: cumRaver,
        DJ: cumDJ,
        Promotor: cumPromotor,
        Club: cumClub,
        total
      };
    });

    const maxTotal = timeline.reduce((m, item) => Math.max(m, item.total), 1);
    return { timeline, maxTotal, roleTotals };
  }, [allProfilesAdmin]);

  const proUsersCount = (allProfilesAdmin || []).filter((p) => p.is_pro).length;
  const displayedUsersList = (allProfilesAdmin || []).filter((p) => {
    if (proFilterOnly && !p.is_pro) return false;
    if (userSearch.trim()) {
      return (
        p.username?.toLowerCase().includes(userSearch.toLowerCase()) ||
        p.city?.toLowerCase().includes(userSearch.toLowerCase()) ||
        p.role?.toLowerCase().includes(userSearch.toLowerCase())
      );
    }
    return true;
  });

  if (!user || !isAdmin) {
    return (
      <div className="admin-page-shell">
        <div className="admin-denied-box">
          <ShieldAlert size={42} className="icon-neon" />
          <h2>Acceso Restringido (/admin)</h2>
          <p>
            Esta sección es exclusiva para administradores en base de datos (<code>is_admin = true</code> o <code>role = &apos;Admin&apos;</code> en la tabla <code>profiles</code> de Supabase).
          </p>
          <button type="button" className="btn-neon-full" onClick={onExitAdmin}>
            <ArrowLeft size={16} /> Volver al Mapa
          </button>
        </div>
      </div>
    );
  }

  const pendingRolesCount = (allRoleRequests || []).filter((r) => r.status === 'pending').length;
  const openTicketsCount = (supportTickets || []).filter((t) => t.status === 'open').length;
  const pendingClaimsCount = (ghostClaims || []).filter((c) => c.status === 'pending').length;

  const handleResolveRole = async (reqItem, decision) => {
    setResolvingRoleId(reqItem.id);
    try {
      await resolveRoleRequest(reqItem, decision);
    } catch (err) {
      alert(err.message);
    } finally {
      setResolvingRoleId(null);
    }
  };

  const handleSendReply = async (ticketId) => {
    const text = replyTexts[ticketId];
    if (!text || !text.trim()) return;
    setSendingId(ticketId);
    try {
      await replySupportTicket(ticketId, text);
      setReplyTexts({ ...replyTexts, [ticketId]: '' });
    } catch (err) {
      alert(err.message);
    } finally {
      setSendingId(null);
    }
  };

  const filteredTickets = (supportTickets || []).filter(
    (t) => filterStatus === 'ALL' || t.status === filterStatus
  );

  const filteredRoleReqs = (allRoleRequests || []).filter(
    (r) =>
      filterStatus === 'ALL' ||
      (filterStatus === 'open' ? r.status === 'pending' : r.status !== 'pending')
  );

  return (
    <div className="admin-page-shell">
      <header className="admin-topbar">
        <div className="admin-brand">
          <ShieldAlert size={22} className="icon-neon" />
          <div>
            <h1>RAVERADAR // ADMIN CONSOLE</h1>
            <span>Métricas de Eventos y Usuarios, Cuentas PRO, Verificación de Roles y Soporte</span>
          </div>
        </div>

        <div className="admin-top-actions">
          <label
            className="promoter-check-pill"
            style={{
              background: autoApproveRoles ? 'rgba(34, 197, 94, 0.16)' : '#18181b',
              borderColor: autoApproveRoles ? '#22c55e' : 'var(--border-subtle)',
              color: autoApproveRoles ? '#4ade80' : '#e4e4e7',
              padding: '8px 14px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: '12px'
            }}
          >
            <input
              type="checkbox"
              checked={autoApproveRoles}
              onChange={(e) => toggleAutoApproveRoles(e.target.checked)}
            />
            <span>Aceptar automáticamente todos los perfiles (DJ / Promotor / Club)</span>
          </label>

          <button type="button" className="btn-admin-refresh" onClick={refreshAllAdminData}>
            <RefreshCw size={15} /> Actualizar
          </button>
          <button type="button" className="btn-admin-back" onClick={onExitAdmin}>
            <ArrowLeft size={15} /> Volver al Mapa
          </button>
        </div>
      </header>

      <div className="admin-filter-tabs" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={adminSection === 'ANALYTICS' ? 'active' : ''}
            onClick={() => setAdminSection('ANALYTICS')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <BarChart3 size={15} />
            <span>Gráficas & Usuarios PRO ({proUsersCount} PRO)</span>
          </button>

          <button
            type="button"
            className={adminSection === 'ROLES' ? 'active' : ''}
            onClick={() => setAdminSection('ROLES')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <UserCheck size={15} />
            <span>Peticiones de Rol ({pendingRolesCount} pendientes)</span>
          </button>

          <button
            type="button"
            className={adminSection === 'SUPPORT' ? 'active' : ''}
            onClick={() => setAdminSection('SUPPORT')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <LifeBuoy size={15} />
            <span>Tickets de Soporte ({openTicketsCount} pendientes)</span>
          </button>

          <button
            type="button"
            className={adminSection === 'CLAIMS' ? 'active' : ''}
            onClick={() => setAdminSection('CLAIMS')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <GitMerge size={15} />
            <span>Reclamaciones ({pendingClaimsCount} pendientes)</span>
          </button>

          <button
            type="button"
            className={adminSection === 'NOTIFY' ? 'active' : ''}
            onClick={() => setAdminSection('NOTIFY')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Megaphone size={15} />
            <span>Enviar aviso</span>
          </button>
        </div>

        {(adminSection === 'ROLES' || adminSection === 'SUPPORT' || adminSection === 'CLAIMS') && (
          <div style={{ display: 'flex', gap: '6px' }}>
            <button className={filterStatus === 'ALL' ? 'active' : ''} onClick={() => setFilterStatus('ALL')}>
              Todos
            </button>
            <button className={filterStatus === 'open' ? 'active' : ''} onClick={() => setFilterStatus('open')}>
              Pendientes
            </button>
            <button className={filterStatus === 'answered' ? 'active' : ''} onClick={() => setFilterStatus('answered')}>
              Resueltos
            </button>
          </div>
        )}
      </div>

      {adminSection === 'ANALYTICS' && (
        <div className="admin-analytics-wrapper">
          <div className="admin-kpi-grid">
            <div className="admin-kpi-card">
              <span><Server size={14} style={{ color: '#38bdf8' }} /> Total Eventos Servidor</span>
              <strong style={{ color: '#38bdf8' }}>{eventsPerDayStats.globalServer}</strong>
            </div>
            <div className="admin-kpi-card">
              <span><UserPlus size={14} className="icon-neon" /> Total Eventos Usuarios</span>
              <strong style={{ color: 'var(--accent-neon)' }}>{eventsPerDayStats.globalUser}</strong>
            </div>
            <div className="admin-kpi-card">
              <span><Users size={14} style={{ color: '#a855f7' }} /> Total Usuarios Registrados</span>
              <strong>{(allProfilesAdmin || []).length}</strong>
            </div>
            <div className="admin-kpi-card">
              <span><Crown size={14} className="icon-neon" /> Miembros RaveRadar PRO</span>
              <strong style={{ color: 'var(--accent-neon)' }}>{proUsersCount}</strong>
            </div>
          </div>

          <div className="admin-charts-grid">
            {/* PUNTO 1: GRÁFICA DE EVENTOS POR DÍA (MES COMPLETO SIN SALIRSE DE LA PANTALLA Y NAVEGABLE) */}
            <div className="admin-chart-card">
              <div className="admin-chart-header">
                <div>
                  <h3><Calendar size={16} className="icon-neon" /> Eventos por Día ({eventsPerDayStats.monthLabel})</h3>
                  <p>
                    Este mes: <strong>{eventsPerDayStats.monthTotal}</strong> eventos ({eventsPerDayStats.monthServer} Servidor · {eventsPerDayStats.monthUser} Usuarios)
                  </p>
                </div>

                <div className="admin-month-nav">
                  <button
                    type="button"
                    className="admin-month-btn"
                    onClick={() => setEventsMonthOffset((m) => m - 1)}
                    title="Mes anterior"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <button
                    type="button"
                    className="admin-month-reset"
                    onClick={() => setEventsMonthOffset(0)}
                  >
                    {eventsPerDayStats.monthLabel}
                  </button>
                  <button
                    type="button"
                    className="admin-month-btn"
                    onClick={() => setEventsMonthOffset((m) => m + 1)}
                    title="Mes siguiente"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>

              <div className="admin-chart-legend">
                <span className="chart-leg-item server">■ Servidor ({eventsPerDayStats.monthServer} en el mes)</span>
                <span className="chart-leg-item user">■ Usuarios ({eventsPerDayStats.monthUser} en el mes)</span>
              </div>

              <div className="admin-month-bars-grid">
                {eventsPerDayStats.daysArray.map((dayItem) => {
                  // Altura proporcional exacta respecto al día con más eventos del mes
                  const totalHeightPct =
                    dayItem.total > 0
                      ? Math.max((dayItem.total / eventsPerDayStats.maxDayTotal) * 100, 8)
                      : 0;
                  const userSharePct = dayItem.total > 0 ? (dayItem.user / dayItem.total) * 100 : 0;
                  const serverSharePct = dayItem.total > 0 ? (dayItem.server / dayItem.total) * 100 : 0;

                  return (
                    <div
                      key={dayItem.date}
                      className="admin-month-bar-col"
                      title={`${dayItem.date}\nTotal: ${dayItem.total} eventos\n• Servidor: ${dayItem.server}\n• Usuarios: ${dayItem.user}`}
                    >
                      <span className="admin-bar-top-val">
                        {dayItem.total > 0 ? dayItem.total : ''}
                      </span>

                      <div className="admin-month-bar-track">
                        {dayItem.total > 0 && (
                          <div
                            className="admin-bar-stack-box"
                            style={{ height: `${totalHeightPct}%` }}
                          >
                            {dayItem.user > 0 && (
                              <div
                                className="admin-bar-fill user-fill"
                                style={{ height: `${userSharePct}%` }}
                              />
                            )}
                            {dayItem.server > 0 && (
                              <div
                                className="admin-bar-fill server-fill"
                                style={{ height: `${serverSharePct}%` }}
                              />
                            )}
                          </div>
                        )}
                      </div>

                      <span className="admin-bar-date-lbl">{dayItem.dayNum}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* GRÁFICA 2: EVOLUCIÓN DE USUARIOS EN EL TIEMPO POR TIPO (ESCALADO PROPORCIONAL REAL) */}
            <div className="admin-chart-card">
              <div className="admin-chart-header">
                <div>
                  <h3><Users size={16} className="icon-neon" /> Crecimiento de Usuarios en el Tiempo por Rol</h3>
                  <p>Evolución acumulada diferenciando entre Ravers, DJs, Promotores y Clubs.</p>
                </div>
                <div className="admin-chart-legend">
                  <span style={{ color: '#facc15' }}>● Ravers ({usersOverTimeStats.roleTotals.Raver})</span>
                  <span style={{ color: '#ff5500' }}>● DJs ({usersOverTimeStats.roleTotals.DJ})</span>
                  <span style={{ color: '#f43f5e' }}>● Promotores ({usersOverTimeStats.roleTotals.Promotor})</span>
                  <span style={{ color: '#06b6d4' }}>● Clubs ({usersOverTimeStats.roleTotals.Club})</span>
                </div>
              </div>

              {usersOverTimeStats.timeline.length === 0 ? (
                <div className="admin-empty">No hay datos de usuarios registrados.</div>
              ) : (
                <div className="admin-month-bars-grid">
                  {usersOverTimeStats.timeline.map((pt) => {
                    const totalHeightPct =
                      pt.total > 0
                        ? Math.max((pt.total / usersOverTimeStats.maxTotal) * 100, 8)
                        : 0;
                    const clubShare = pt.total > 0 ? (pt.Club / pt.total) * 100 : 0;
                    const promShare = pt.total > 0 ? (pt.Promotor / pt.total) * 100 : 0;
                    const djShare = pt.total > 0 ? (pt.DJ / pt.total) * 100 : 0;
                    const raverShare = pt.total > 0 ? (pt.Raver / pt.total) * 100 : 0;

                    return (
                      <div
                        key={pt.date}
                        className="admin-month-bar-col"
                        title={`Fecha: ${pt.date} (Total: ${pt.total})\n• Ravers: ${pt.Raver}\n• DJs: ${pt.DJ}\n• Promotores: ${pt.Promotor}\n• Clubs: ${pt.Club}`}
                      >
                        <span className="admin-bar-top-val">{pt.total}</span>
                        <div className="admin-month-bar-track">
                          <div className="admin-bar-stack-box" style={{ height: `${totalHeightPct}%` }}>
                            {pt.Club > 0 && (
                              <div className="admin-bar-fill role-club-fill" style={{ height: `${clubShare}%` }} />
                            )}
                            {pt.Promotor > 0 && (
                              <div className="admin-bar-fill role-prom-fill" style={{ height: `${promShare}%` }} />
                            )}
                            {pt.DJ > 0 && (
                              <div className="admin-bar-fill role-dj-fill" style={{ height: `${djShare}%` }} />
                            )}
                            {pt.Raver > 0 && (
                              <div className="admin-bar-fill role-raver-fill" style={{ height: `${raverShare}%` }} />
                            )}
                          </div>
                        </div>
                        <span className="admin-bar-date-lbl">{pt.date.slice(5)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* SECCIÓN DE USUARIOS PRO */}
          <div className="admin-pro-users-card">
            <div className="admin-chart-header">
              <div>
                <h3><Crown size={17} className="icon-neon" /> Listado de Usuarios PRO ({proUsersCount})</h3>
                <p>Visualiza qué cuentas tienen RaveRadar PRO activo o gestiona su estado PRO manualmente.</p>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="Buscar usuario por @nombre o ciudad..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="admin-pro-search-input"
                />
                <button
                  type="button"
                  className="btn-admin-refresh"
                  style={{
                    borderColor: proFilterOnly ? 'var(--accent-neon)' : 'var(--border-subtle)',
                    color: proFilterOnly ? 'var(--accent-neon)' : '#a1a1aa'
                  }}
                  onClick={() => setProFilterOnly(!proFilterOnly)}
                >
                  <Crown size={14} />
                  <span>{proFilterOnly ? 'Viendo Solo Usuarios PRO' : 'Viendo Todos los Usuarios'}</span>
                </button>
              </div>
            </div>

            {displayedUsersList.length === 0 ? (
              <div className="admin-empty">
                {proFilterOnly
                  ? 'Actualmente no hay ningún usuario con cuenta PRO activa. Pulsa "Viendo Solo Usuarios PRO" para ver todos los usuarios.'
                  : 'No se encontraron usuarios con ese criterio.'}
              </div>
            ) : (
              <div className="admin-pro-users-grid">
                {displayedUsersList.map((prof) => {
                  const pRole = prof.role || 'Raver';
                  return (
                    <div key={prof.id} className={`admin-pro-user-row ${prof.is_pro ? 'is-pro-active' : ''}`}>
                      <div className="admin-pro-user-info">
                        {prof.avatar_url ? (
                          <img src={prof.avatar_url} alt={prof.username} referrerPolicy="no-referrer" />
                        ) : (
                          <div className="admin-pro-avatar-fallback"><Users size={15} /></div>
                        )}
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <strong>@{prof.username}</strong>
                            <span className={`admin-role-badge role-${pRole.toLowerCase()}`}>
                              {pRole === 'Club' ? 'Club / Sala' : pRole}
                            </span>
                            {prof.is_pro && (
                              <span className="admin-vip-pill">
                                <Crown size={10} /> PRO
                              </span>
                            )}
                          </div>
                          <span>{prof.city || 'Madrid'} · Registro: {prof.created_at ? new Date(prof.created_at).toLocaleDateString() : 'Reciente'}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        className={`btn-toggle-user-pro ${prof.is_pro ? 'active' : ''}`}
                        onClick={() => toggleUserProStatusAdmin(prof.id, !prof.is_pro)}
                      >
                        <Crown size={13} />
                        <span>{prof.is_pro ? 'Quitar PRO' : 'Activar PRO'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECCIÓN 2: PETICIONES DE VERIFICACIÓN DE ROL */}
      {adminSection === 'ROLES' && (
        <div className="admin-tickets-list">
          {filteredRoleReqs.length === 0 ? (
            <div className="admin-empty">No hay solicitudes de verificación de rol en esta categoría.</div>
          ) : (
            filteredRoleReqs.map((req) => (
              <div
                key={req.id}
                className={`admin-ticket-card ${req.status === 'pending' ? 'open' : 'answered'}`}
              >
                <div className="ticket-top-meta">
                  <div className="ticket-user-pill">
                    <strong>@{req.profile?.username || req.username}</strong>
                    <span className={`admin-role-badge role-${req.requested_role.toLowerCase()}`}>
                      Solicita ser: {req.requested_role === 'Club' ? 'Club / Sala' : req.requested_role === 'DJ' ? 'DJ / Producer' : 'Promotor'}
                    </span>
                    {req.user_email && (
                      <span><Mail size={12} /> {req.user_email}</span>
                    )}
                  </div>

                  <div className="ticket-status-group">
                    <span className="ticket-date">
                      <Clock size={12} /> {new Date(req.created_at).toLocaleString()}
                    </span>
                    <span
                      className={`ticket-badge ${req.status === 'pending' ? 'open' : 'answered'}`}
                      style={
                        req.status === 'rejected'
                          ? { background: 'rgba(239, 68, 68, 0.16)', color: '#f87171' }
                          : {}
                      }
                    >
                      {req.status === 'pending'
                        ? 'Pendiente de Revisión'
                        : req.status === 'approved'
                        ? 'Aceptado'
                        : 'Rechazado'}
                    </span>
                  </div>
                </div>

                <p className="ticket-message">{req.message}</p>

                {req.status === 'pending' && (
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      disabled={resolvingRoleId === req.id}
                      onClick={() => handleResolveRole(req, 'rejected')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid #ef4444',
                        color: '#f87171',
                        padding: '8px 14px',
                        borderRadius: '9px',
                        fontWeight: 800,
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      <X size={14} /> Rechazar (Mantener como Raver)
                    </button>

                    <button
                      type="button"
                      disabled={resolvingRoleId === req.id}
                      onClick={() => handleResolveRole(req, 'approved')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: '#22c55e',
                        border: 'none',
                        color: '#09090b',
                        padding: '8px 16px',
                        borderRadius: '9px',
                        fontWeight: 900,
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      <Check size={14} /> Aceptar y Activar Rol {req.requested_role}
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* SECCIÓN 4: ENVIAR AVISO A LOS USUARIOS */}
      {adminSection === 'NOTIFY' && <AdminBroadcast />}

      {adminSection === 'CLAIMS' && <AdminGhostClaims filterStatus={filterStatus} />}

      {/* SECCIÓN 3: TICKETS DE SOPORTE */}
      {adminSection === 'SUPPORT' && (
        <div className="admin-tickets-list">
          {filteredTickets.length === 0 ? (
            <div className="admin-empty">No hay tickets de soporte en esta categoría.</div>
          ) : (
            filteredTickets.map((ticket) => (
              <div key={ticket.id} className={`admin-ticket-card ${ticket.status}`}>
                <div className="ticket-top-meta">
                  <div className="ticket-user-pill">
                    <strong>@{ticket.username}</strong>
                    <span className={`admin-role-badge role-${(ticket.profile?.role || ticket.user_role || 'Raver').toLowerCase()}`}>
                      {(ticket.profile?.role || ticket.user_role) === 'DJ'
                        ? 'DJ / Producer'
                        : (ticket.profile?.role || ticket.user_role) === 'Club'
                        ? 'Club / Sala'
                        : ticket.profile?.role || ticket.user_role || 'Raver'}
                    </span>
                    <span><Mail size={12} /> {ticket.user_email}</span>
                  </div>
                  <div className="ticket-status-group">
                    <span className="ticket-date">
                      <Clock size={12} /> {new Date(ticket.created_at).toLocaleString()}
                    </span>
                    <span className={`ticket-badge ${ticket.status}`}>
                      {ticket.status === 'answered' ? 'Contestado' : 'Pendiente'}
                    </span>
                  </div>
                </div>

                <h3 className="ticket-subject">{ticket.subject}</h3>
                <p className="ticket-message">{ticket.message}</p>

                {ticket.admin_reply && (
                  <div className="ticket-existing-reply">
                    <CheckCircle2 size={15} style={{ color: '#22c55e', flexShrink: 0 }} />
                    <div>
                      <strong>Respuesta enviada al usuario:</strong>
                      <p>{ticket.admin_reply}</p>
                    </div>
                  </div>
                )}

                <div className="ticket-reply-box">
                  <input
                    type="text"
                    placeholder={
                      ticket.admin_reply
                        ? 'Escribir nueva respuesta (actualizará su notificación)...'
                        : 'Escribe tu respuesta (le saldrá en su campanita de notificaciones)...'
                    }
                    value={replyTexts[ticket.id] || ''}
                    onChange={(e) => setReplyTexts({ ...replyTexts, [ticket.id]: e.target.value })}
                  />
                  <button
                    type="button"
                    disabled={sendingId === ticket.id || !replyTexts[ticket.id]?.trim()}
                    onClick={() => handleSendReply(ticket.id)}
                  >
                    <Send size={14} />
                    <span>{sendingId === ticket.id ? 'Enviando...' : 'Responder'}</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};