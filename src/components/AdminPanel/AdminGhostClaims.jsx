// src/components/AdminPanel/AdminGhostClaims.jsx
// ----------------------------------------------------------------------------
// /admin → "Reclamaciones": usuarios que dicen ser el club/promotora de un
// perfil fantasma. "Fusionar" convierte su cuenta en ese perfil (nombre, rol,
// ubicación y fiestas) y borra el fantasma; "Rechazar" le avisa con tu nota.
// Lo hacen las funciones de Supabase de la migración 10 (comprueban que eres admin).
// ----------------------------------------------------------------------------
import React, { useEffect, useMemo, useState } from 'react';
import { Ghost, GitMerge, X, Mail, ArrowRight, Building2, Disc, User, Clock, CheckCircle2 } from 'lucide-react';
import { useRaveStore } from '../../store/useRaveStore';
import './AdminGhostClaims.css';

const STATUS = {
  pending: { label: 'Pendiente', cls: 'is-pending' },
  approved: { label: 'Fusionado', cls: 'is-approved' },
  rejected: { label: 'Rechazado', cls: 'is-rejected' }
};

const Avatar = ({ p, Fallback }) =>
  p?.avatar_url ? <img src={p.avatar_url} alt="" referrerPolicy="no-referrer" /> : <Fallback size={18} />;

export const AdminGhostClaims = ({ filterStatus = 'ALL' }) => {
  const ghostClaims = useRaveStore((s) => s.ghostClaims);
  const fetchGhostClaims = useRaveStore((s) => s.fetchGhostClaims);
  const resolveGhostClaim = useRaveStore((s) => s.resolveGhostClaim);
  const events = useRaveStore((s) => s.events);

  const [notes, setNotes] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchGhostClaims();
  }, [fetchGhostClaims]);

  const eventsByProfile = useMemo(() => {
    const m = new Map();
    (events || []).forEach((ev) => {
      const ids = [ev.venue_id, ...(Array.isArray(ev.promoters_list) ? ev.promoters_list.map((p) => p?.id) : [])];
      ids.filter(Boolean).forEach((id) => m.set(String(id), (m.get(String(id)) || 0) + 1));
    });
    return m;
  }, [events]);

  const list = (ghostClaims || []).filter((c) =>
    filterStatus === 'ALL' ? true : filterStatus === 'open' ? c.status === 'pending' : c.status !== 'pending'
  );

  const act = async (claim, approve) => {
    if (approve) {
      const ok = window.confirm(
        `¿Fusionar? La cuenta @${claim.username} pasará a ser "${claim.ghost_username}" (${claim.ghost_role}) con sus fiestas. El perfil fantasma se borrará.`
      );
      if (!ok) return;
    }
    setBusyId(claim.id);
    setError('');
    try {
      await resolveGhostClaim(claim.id, approve, notes[claim.id] || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="admin-ghost-claims">
      <div className="agc-intro">
        <Ghost size={18} />
        <div>
          <strong>Reclamaciones de perfiles fantasma</strong>
          <span>
            Clubs y promotoras creados automáticamente con las fiestas importadas. Comprueba que quien reclama es quien dice
            (email del dominio del club, Instagram oficial…) antes de fusionar.
          </span>
        </div>
      </div>

      {error && <p className="agc-error">{error}</p>}

      {list.length === 0 && <p className="agc-empty">No hay reclamaciones {filterStatus === 'open' ? 'pendientes' : ''}.</p>}

      {list.map((c) => {
        const st = STATUS[c.status] || STATUS.pending;
        const GhostIcon = c.ghost_role === 'Promotor' ? Disc : Building2;
        const evCount = c.ghost_id ? eventsByProfile.get(String(c.ghost_id)) || 0 : 0;
        return (
          <div key={c.id} className={`agc-card ${st.cls}`}>
            <div className="agc-row">
              <div className="agc-who">
                <span className="agc-avatar">
                  <Avatar p={c.claimant} Fallback={User} />
                </span>
                <div>
                  <strong>@{c.claimant?.username || c.username}</strong>
                  <small>
                    {c.claimant?.role || 'Usuario'} · <Mail size={10} /> {c.contact_email}
                  </small>
                </div>
              </div>
              <ArrowRight size={18} className="agc-arrow" />
              <div className="agc-who">
                <span className="agc-avatar is-ghost">
                  <Avatar p={c.ghost} Fallback={GhostIcon} />
                </span>
                <div>
                  <strong>{c.ghost?.username || c.ghost_username}</strong>
                  <small>
                    {c.ghost_role} {c.ghost?.city ? `· ${c.ghost.city}` : ''} · {evCount} fiestas
                  </small>
                </div>
              </div>
              <span className={`agc-status ${st.cls}`}>{st.label}</span>
            </div>

            <p className="agc-message">“{c.message}”</p>
            <small className="agc-date">
              <Clock size={10} /> {new Date(c.created_at).toLocaleString('es-ES')}
              {c.resolved_at ? ` · resuelta ${new Date(c.resolved_at).toLocaleDateString('es-ES')}` : ''}
            </small>

            {c.status === 'pending' ? (
              <div className="agc-actions">
                <input
                  type="text"
                  placeholder="Nota para el usuario (opcional; se le envía al rechazar o aprobar)"
                  value={notes[c.id] || ''}
                  onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })}
                />
                <button type="button" className="agc-btn is-reject" disabled={busyId === c.id} onClick={() => act(c, false)}>
                  <X size={14} /> Rechazar
                </button>
                <button
                  type="button"
                  className="agc-btn is-merge"
                  disabled={busyId === c.id || !c.ghost?.is_ghost}
                  onClick={() => act(c, true)}
                  title={!c.ghost?.is_ghost ? 'Este perfil ya no es fantasma' : 'Fusionar cuentas'}
                >
                  <GitMerge size={14} /> {busyId === c.id ? 'Fusionando…' : 'Fusionar'}
                </button>
              </div>
            ) : (
              c.admin_note && (
                <p className="agc-note">
                  <CheckCircle2 size={12} /> {c.admin_note}
                </p>
              )
            )}
          </div>
        );
      })}
    </div>
  );
};

export default AdminGhostClaims;
