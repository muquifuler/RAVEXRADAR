// src/components/ui/DjSixMonthCalendar.jsx
import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import './DjSixMonthCalendar.css';

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export const DjSixMonthCalendar = ({
  manuallyBusyDates = [],
  autoBookedDatesMap = {},
  onToggleBusyDate,
  readOnly = false,
  // Eventos propios del DJ (fuera del mapa): [{ id, date, name, venue, street, city, club_id }]
  ownEvents = [],
  // Modo "elegir fecha" (mientras se crea/edita un evento propio)
  pickMode = false,
  pickedIso = null,
  onPickDate,
  onOwnEventClick,
  // Click en un día ocupado por Lineup / evento (para ver su info)
  onAutoBookedClick
}) => {
  // 0 = mes actual, hasta 5 = dentro de 6 meses
  const [monthOffset, setMonthOffset] = useState(0);

  const todayIso = useMemo(() => new Date().toISOString().split('T')[0], []);

  const currentViewData = useMemo(() => {
    const now = new Date();
    const viewDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    const monthTitle = viewDate.toLocaleDateString('es-ES', {
      month: 'long',
      year: 'numeric'
    });

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Convertir domingo (0) a 6, y lunes (1) a 0
    const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7;

    const cells = [];
    for (let i = 0; i < firstDayIndex; i++) {
      cells.push(null);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      cells.push({ day, iso });
    }

    return { monthTitle, cells };
  }, [monthOffset]);

  const ownEventsByDate = useMemo(() => {
    const map = {};
    (Array.isArray(ownEvents) ? ownEvents : []).forEach((ev) => {
      if (ev?.date && !map[ev.date]) map[ev.date] = ev;
    });
    return map;
  }, [ownEvents]);
  const hasOwnEvents = Object.keys(ownEventsByDate).length > 0;

  return (
    <div className="dj-six-month-calendar">
      <div className="dj-cal-top-nav">
        <div className="dj-cal-title">
          <Calendar size={14} className="icon-neon" />
          <strong style={{ textTransform: 'capitalize' }}>{currentViewData.monthTitle}</strong>
        </div>

        <div className="dj-cal-arrows">
          <span className="dj-cal-step-indicator">Mes {monthOffset + 1}/6</span>
          <button
            type="button"
            disabled={monthOffset <= 0}
            onClick={() => setMonthOffset((m) => Math.max(0, m - 1))}
            title="Mes anterior"
          >
            <ChevronLeft size={15} />
          </button>
          <button
            type="button"
            disabled={monthOffset >= 5}
            onClick={() => setMonthOffset((m) => Math.min(5, m + 1))}
            title="Mes siguiente (hasta 6 meses)"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      <div className="dj-cal-legend">
        <span className="legend-item free">● Libre</span>
        <span className="legend-item busy">● Ocupado (Manual)</span>
        <span className="legend-item event">● Ocupado (Evento/Lineup)</span>
        {(hasOwnEvents || !readOnly) && <span className="legend-item own">● Evento propio</span>}
      </div>

      <div className="dj-cal-weekdays">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>

      <div className="dj-cal-month-grid">
        {currentViewData.cells.map((cell, idx) => {
          if (!cell) {
            return <div key={`empty_${idx}`} className="dj-cal-cell empty" />;
          }

          const isPast = cell.iso < todayIso;
          const autoReason = autoBookedDatesMap[cell.iso];
          const isManualBusy = manuallyBusyDates.includes(cell.iso);
          const ownEv = ownEventsByDate[cell.iso];
          const ownLabel = ownEv
            ? `Evento: ${ownEv.name}${ownEv.venue ? ` · ${ownEv.venue}` : ''}${ownEv.city ? ` (${ownEv.city})` : ''}`
            : '';

          let statusClass = 'is-free';
          let statusLabel = 'LIBRE';
          if (isPast) {
            statusClass = 'is-past';
            statusLabel = '—';
          } else if (autoReason) {
            statusClass = 'is-auto-booked';
            statusLabel = 'EVENTO';
          } else if (ownEv) {
            statusClass = 'is-own-event';
            statusLabel = 'EVENTO';
          } else if (isManualBusy) {
            statusClass = 'is-manual-busy';
            statusLabel = 'OCUPADO';
          }

          const isInteractive =
            !readOnly && !isPast && (pickMode || !autoReason || Boolean(onAutoBookedClick));
          const isPicked = pickedIso === cell.iso;

          const handleClick = () => {
            if (!isInteractive) return;
            if (pickMode) {
              if (onPickDate) onPickDate(cell.iso);
              return;
            }
            if (autoReason && onAutoBookedClick) {
              onAutoBookedClick(cell.iso);
              return;
            }
            if (ownEv && onOwnEventClick) {
              onOwnEventClick(ownEv);
              return;
            }
            if (onToggleBusyDate) onToggleBusyDate(cell.iso);
          };

          return (
            <button
              type="button"
              key={cell.iso}
              disabled={!isInteractive}
              className={`dj-cal-cell ${statusClass} ${readOnly ? 'read-only' : ''} ${pickMode ? 'is-pick-mode' : ''} ${isPicked ? 'is-picked' : ''}`}
              onClick={handleClick}
              title={
                pickMode
                  ? 'Elegir este día para el evento'
                  : autoReason
                  ? `${autoReason}${onAutoBookedClick && !readOnly ? ' (Click para ver la info)' : ''}`
                  : ownEv
                  ? `${ownLabel}${readOnly ? '' : ' (Click para editarlo)'}`
                  : isManualBusy
                  ? 'Ocupado (Click para volver a poner Libre)'
                  : 'Fecha Libre (Click para marcar como Ocupado)'
              }
            >
              <span className="dj-cal-day-num">{cell.day}</span>
              <span className="dj-cal-day-tag">{statusLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
