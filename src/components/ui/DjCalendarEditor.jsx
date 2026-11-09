// src/components/ui/DjCalendarEditor.jsx
// ----------------------------------------------------------------------------
// Calendario editable del DJ (Editar perfil):
//  · Click en un día libre → OCUPADO (como siempre). Los días con Lineup salen solos.
//  · "Añadir evento propio": fiesta que NO está en el mapa (fecha, nombre, sala,
//    calle y provincia). La sala se puede buscar entre los clubs de la app: si eliges
//    uno, la calle y la provincia se rellenan solas y no se pueden editar.
//  · Los cambios se guardan al pulsar "Guardar Perfil" (columna dj_private_events).
// ----------------------------------------------------------------------------
import React, { useMemo, useState } from 'react';
import { CalendarPlus, MapPin, Search, X, Pencil, Trash2, Building2, Check, Disc3, Clock } from 'lucide-react';
import { useRaveStore } from '../../store/useRaveStore';
import { SPAIN_LOCATIONS } from '../../constants/spainLocations';
import { MAX_OWN_EVENTS, sanitizeOwnEvents, newOwnEventId as newId, toIsoDate as toIso, normText as norm } from '../../lib/djOwnEvents';
import { DjSixMonthCalendar } from './DjSixMothCalendar';
import { ProSelect } from './ProSelect';
import './DjCalendarEditor.css';

const prettyDate = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  return {
    day: d.getDate(),
    month: d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', ''),
    weekday: d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '')
  };
};

export const DjCalendarEditor = ({
  manuallyBusyDates = [],
  autoBookedDatesMap = {},
  // { 'YYYY-MM-DD': [{ ev, kind: 'lineup' | 'attending', slot }] } → info al pinchar el día
  autoBookedEvents = {},
  onToggleBusyDate,
  ownEvents = [],
  onOwnEventsChange,
  defaultCity = 'Madrid'
}) => {
  const clubs = useRaveStore((s) => s.clubs);
  const [draft, setDraft] = useState(null); // null = cerrado
  const [clubQuery, setClubQuery] = useState('');
  const [showClubResults, setShowClubResults] = useState(false);
  const [infoIso, setInfoIso] = useState(null); // día de Lineup cuya info se está viendo

  const todayIso = useMemo(() => toIso(new Date()), []);
  const maxIso = useMemo(() => {
    const now = new Date();
    return toIso(new Date(now.getFullYear(), now.getMonth() + 6, 0));
  }, []);

  const list = useMemo(() => sanitizeOwnEvents(ownEvents), [ownEvents]);
  const draftClub = draft?.club_id ? (clubs || []).find((c) => String(c.id) === String(draft.club_id)) : null;
  const isLocked = Boolean(draft?.club_id);

  const clubResults = useMemo(() => {
    const q = norm(clubQuery);
    if (q.length < 2) return [];
    return (clubs || [])
      .filter((c) => norm(c.username).includes(q) || norm(c.street_address).includes(q))
      .sort((a, b) => Number(!norm(a.username).startsWith(q)) - Number(!norm(b.username).startsWith(q)))
      .slice(0, 6);
  }, [clubQuery, clubs]);

  const infoItems = infoIso ? autoBookedEvents[infoIso] || [] : [];

  const openNew = (iso = '') => {
    setInfoIso(null);
    setDraft({ id: null, date: iso, name: '', venue: '', street: '', city: defaultCity, club_id: null });
    setClubQuery('');
    setShowClubResults(false);
  };

  const openEdit = (ev) => {
    setInfoIso(null);
    setDraft({ ...ev });
    setClubQuery(ev.club_id ? '' : ev.venue || '');
    setShowClubResults(false);
  };

  const close = () => {
    setDraft(null);
    setClubQuery('');
    setShowClubResults(false);
  };

  const pickClub = (club) => {
    const prov = SPAIN_LOCATIONS.find((p) => p.value === club.city);
    setDraft((d) => ({
      ...d,
      club_id: club.id,
      venue: club.username || '',
      street: club.street_address || '',
      city: prov ? prov.value : club.city || d.city
    }));
    setClubQuery('');
    setShowClubResults(false);
  };

  const unpickClub = () => {
    setDraft((d) => ({ ...d, club_id: null, venue: '', street: '' }));
    setClubQuery('');
  };

  const canSave =
    draft &&
    /^\d{4}-\d{2}-\d{2}$/.test(draft.date || '') &&
    draft.date >= todayIso &&
    (draft.name || '').trim().length > 0 &&
    (draft.venue || '').trim().length > 0 &&
    (draft.city || '').trim().length > 0 &&
    (draft.id || list.length < MAX_OWN_EVENTS);

  const save = () => {
    if (!canSave || !onOwnEventsChange) return;
    const item = { ...draft, id: draft.id || newId() };
    const next = draft.id ? list.map((e) => (e.id === draft.id ? item : e)) : [...list, item];
    onOwnEventsChange(sanitizeOwnEvents(next));
    close();
  };

  const remove = (id) => {
    if (!onOwnEventsChange) return;
    onOwnEventsChange(list.filter((e) => e.id !== id));
    if (draft?.id === id) close();
  };

  return (
    <div className="dj-cal-editor">
      <DjSixMonthCalendar
        manuallyBusyDates={manuallyBusyDates}
        autoBookedDatesMap={autoBookedDatesMap}
        onToggleBusyDate={onToggleBusyDate}
        readOnly={false}
        ownEvents={list}
        pickMode={Boolean(draft)}
        pickedIso={draft?.date || infoIso || null}
        onPickDate={(iso) => setDraft((d) => ({ ...d, date: iso }))}
        onOwnEventClick={openEdit}
        onAutoBookedClick={(iso) => setInfoIso((cur) => (cur === iso ? null : iso))}
      />

      {!draft && infoIso && (
        <div className="dj-lineup-info">
          <div className="dj-own-form-head">
            <strong className="dj-lineup-info-title">
              <Disc3 size={14} /> {(() => {
                const s = new Date(`${infoIso}T00:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
                return s.charAt(0).toUpperCase() + s.slice(1);
              })()}
            </strong>
            <button type="button" className="dj-own-icon-btn" onClick={() => setInfoIso(null)} title="Cerrar">
              <X size={15} />
            </button>
          </div>
          {infoItems.length === 0 && <p className="dj-own-hint">{autoBookedDatesMap[infoIso]}</p>}
          {infoItems.map(({ ev, kind, slot }) => (
            <div key={ev.id} className="dj-lineup-card">
              {ev.image_url ? <img src={ev.image_url} alt="" className="dj-lineup-flyer" /> : <span className="dj-lineup-flyer" />}
              <div className="dj-lineup-body">
                <span className={`dj-lineup-kind is-${kind}`}>{kind === 'lineup' ? 'Estás en el lineup' : 'Vas a ir'}</span>
                <strong>{ev.name}</strong>
                <small>
                  <MapPin size={10} /> {[ev.venue_name || ev.venue_profile?.username, ev.city].filter(Boolean).join(' · ') || 'Ubicación en el mapa'}
                </small>
                <small>
                  <Clock size={10} /> Abre {(ev.start_time || '23:00').slice(0, 5)}
                  {slot?.set_time ? ` · Tu set: ${String(slot.set_time).slice(0, 5)}` : ''}
                  {slot?.stage || slot?.stage_or_genre ? ` · ${slot.stage || slot.stage_or_genre}` : ''}
                </small>
              </div>
            </div>
          ))}
          <p className="dj-own-hint">Este día lo ocupa la fiesta automáticamente. Si dejas de estar en el lineup, se libera solo.</p>
        </div>
      )}

      {!draft && (
        <button
          type="button"
          className="dj-own-add-btn"
          onClick={() => openNew()}
          disabled={list.length >= MAX_OWN_EVENTS}
        >
          <CalendarPlus size={15} /> Añadir evento propio (no está en el mapa)
        </button>
      )}

      {draft && (
        <div
          className="dj-own-form"
          onKeyDown={(e) => {
            // Está dentro del <form> de Editar perfil: Enter NO debe guardar el perfil
            if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
              e.preventDefault();
              if (canSave) save();
            }
          }}
        >
          <div className="dj-own-form-head">
            <strong>
              <CalendarPlus size={14} /> {draft.id ? 'Editar evento propio' : 'Nuevo evento propio'}
            </strong>
            <button type="button" className="dj-own-icon-btn" onClick={close} title="Cerrar">
              <X size={15} />
            </button>
          </div>
          <p className="dj-own-hint">Toca un día del calendario de arriba o elige la fecha aquí.</p>

          <div className="dj-own-row">
            <label className="dj-own-field dj-own-date">
              <span>Fecha</span>
              <input
                type="date"
                min={todayIso}
                max={maxIso}
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              />
            </label>
            <label className="dj-own-field dj-own-grow">
              <span>Nombre del evento</span>
              <input
                type="text"
                maxLength={80}
                placeholder="Ej. Closing Night"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
          </div>

          <div className="dj-own-field">
            <span>Sala / Club</span>
            {isLocked ? (
              <div className="dj-own-club-chip">
                {draftClub?.avatar_url ? (
                  <img src={draftClub.avatar_url} alt="" />
                ) : (
                  <Building2 size={16} />
                )}
                <div className="dj-own-club-chip-info">
                  <strong>{draft.venue}</strong>
                  <small>Club de RAVEXRADAR</small>
                </div>
                <button type="button" className="dj-own-icon-btn" onClick={unpickClub} title="Cambiar de sala">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="dj-own-club-search">
                <Search size={14} className="dj-own-search-icon" />
                <input
                  type="text"
                  maxLength={80}
                  placeholder="Busca el club o escribe el nombre de la sala"
                  value={clubQuery}
                  onFocus={() => setShowClubResults(true)}
                  onBlur={() => setTimeout(() => setShowClubResults(false), 120)}
                  onChange={(e) => {
                    setClubQuery(e.target.value);
                    setDraft({ ...draft, venue: e.target.value });
                    setShowClubResults(true);
                  }}
                />
                {showClubResults && clubResults.length > 0 && (
                  <div className="dj-own-club-results">
                    {clubResults.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        className="dj-own-club-option"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          pickClub(c);
                        }}
                      >
                        {c.avatar_url ? (
                          <img src={c.avatar_url} alt="" className="dj-own-club-thumb" />
                        ) : (
                          <span className="dj-own-club-fallback"><Building2 size={16} /></span>
                        )}
                        <div className="dj-own-club-option-info">
                          <strong>{c.username}</strong>
                          <small>
                            <MapPin size={10} /> {[c.street_address, c.city].filter(Boolean).join(' · ') || 'Club'}
                          </small>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="dj-own-row">
            <label className={`dj-own-field dj-own-grow ${isLocked ? 'is-locked' : ''}`}>
              <span>Calle y número</span>
              <input
                type="text"
                maxLength={120}
                placeholder="Ej. Calle de Atocha 125"
                value={draft.street}
                readOnly={isLocked}
                disabled={isLocked}
                onChange={(e) => setDraft({ ...draft, street: e.target.value })}
              />
            </label>
            <div className={`dj-own-field dj-own-prov ${isLocked ? 'is-locked' : ''}`}>
              <span>Provincia</span>
              {isLocked ? (
                <input type="text" value={draft.city} readOnly disabled />
              ) : (
                <ProSelect
                  icon={MapPin}
                  value={draft.city}
                  options={SPAIN_LOCATIONS}
                  onChange={(val) => setDraft({ ...draft, city: val })}
                />
              )}
            </div>
          </div>

          <div className="dj-own-actions">
            {draft.id && (
              <button type="button" className="dj-own-delete" onClick={() => remove(draft.id)}>
                <Trash2 size={14} /> Borrar
              </button>
            )}
            <button type="button" className="dj-own-cancel" onClick={close}>
              Cancelar
            </button>
            <button type="button" className="dj-own-save" onClick={save} disabled={!canSave}>
              <Check size={14} /> {draft.id ? 'Actualizar' : 'Añadir al calendario'}
            </button>
          </div>
        </div>
      )}

      {list.length > 0 && (
        <div className="dj-own-list">
          <span className="dj-own-list-title">Tus eventos propios ({list.length})</span>
          {list.map((ev) => {
            const d = prettyDate(ev.date);
            return (
              <div key={ev.id} className={`dj-own-item ${draft?.id === ev.id ? 'is-editing' : ''}`}>
                <div className="dj-own-item-date">
                  <small>{d.weekday}</small>
                  <strong>{d.day}</strong>
                  <small>{d.month}</small>
                </div>
                <div className="dj-own-item-info">
                  <strong>{ev.name}</strong>
                  <small>
                    {ev.club_id && <Building2 size={10} />} {ev.venue}
                    {ev.city ? ` · ${ev.city}` : ''}
                  </small>
                </div>
                <button type="button" className="dj-own-icon-btn" onClick={() => openEdit(ev)} title="Editar">
                  <Pencil size={14} />
                </button>
                <button type="button" className="dj-own-icon-btn is-danger" onClick={() => remove(ev.id)} title="Borrar">
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
          <p className="dj-own-hint">Se guardan al pulsar «Guardar Perfil». Promotores y clubs los verán en tu calendario.</p>
        </div>
      )}
    </div>
  );
};

export default DjCalendarEditor;
