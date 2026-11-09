// src/components/EventAttendeesModal/EventAttendeesModal.jsx
import React from 'react';
import { X, Flame, Users, User, MapPin } from 'lucide-react';
import { useRaveStore } from '../../store/useRaveStore';

export const EventAttendeesModal = () => {
  const {
    selectedEvent,
    attendees,
    attendeesModalFilter,
    setAttendeesModalFilter,
    inspectUserById
  } = useRaveStore();

  if (!attendeesModalFilter || !selectedEvent) return null;

  const goingUsers = (attendees || []).filter((a) => a.is_going ?? a.status === 'going');
  const squadUsers = (attendees || []).filter((a) => a.looking_for_squad ?? a.status === 'looking_for_squad');

  const activeList = attendeesModalFilter === 'going' ? goingUsers : squadUsers;

  return (
    <div className="modal-overlay" onClick={() => setAttendeesModalFilter(null)}>
      <div
        className="modal-card"
        style={{ maxWidth: '460px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: '14px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={() => setAttendeesModalFilter(null)}>
          <X size={18} />
        </button>

        <div>
          <h2 className="modal-title" style={{ fontSize: '18px' }}>{selectedEvent.name}</h2>
          <p className="modal-subtitle" style={{ marginBottom: 0 }}>
            Conecta con otros ravers, DJs, promotores y clubs asistentes a esta fiesta.
          </p>
        </div>

        <div className="ranking-mode-pills" style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          <button
            type="button"
            className={attendeesModalFilter === 'going' ? 'active' : ''}
            style={{ justifyContent: 'center' }}
            onClick={() => setAttendeesModalFilter('going')}
          >
            <Flame size={14} />
            <span>Van a ir ({goingUsers.length})</span>
          </button>
          <button
            type="button"
            className={attendeesModalFilter === 'squad' ? 'active' : ''}
            style={{ justifyContent: 'center' }}
            onClick={() => setAttendeesModalFilter('squad')}
          >
            <Users size={14} />
            <span>Buscan Rave Squad ({squadUsers.length})</span>
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '50vh', paddingRight: '4px' }}>
          {activeList.length === 0 ? (
            <div className="ranking-empty" style={{ padding: '28px 16px' }}>
              Aún no hay usuarios apuntados en esta lista.
            </div>
          ) : (
            activeList.map((att) => {
              const prof = att.profile;
              const roleName = prof?.role || 'Raver';
              return (
                <button
                  type="button"
                  key={`${att.user_id}_${attendeesModalFilter}`}
                  className="attendee-user-row"
                  style={{ padding: '10px 12px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}
                  onClick={() => {
                    setAttendeesModalFilter(null);
                    inspectUserById(att.user_id);
                  }}
                >
                  <div className="attendee-row-avatar" style={{ width: '38px', height: '38px' }}>
                    {prof?.avatar_url ? (
                      <img src={prof.avatar_url} alt={prof.username} referrerPolicy="no-referrer" />
                    ) : (
                      <User size={16} className="icon-neon" />
                    )}
                  </div>
                  <div className="attendee-row-info">
                    <strong style={{ fontSize: '13.5px' }}>@{prof?.username || 'Raver'}</strong>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                      <MapPin size={10} /> {prof?.city || 'Madrid'} · {prof?.favorite_subgenre || 'Techno'}
                    </span>
                  </div>
                  <span className={`chat-role-mini-badge role-${roleName.toLowerCase()}`}>
                    {roleName === 'Club' ? 'Club / Sala' : roleName === 'DJ' ? 'DJ / Producer' : roleName}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};