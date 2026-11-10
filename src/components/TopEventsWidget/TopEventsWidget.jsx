// src/components/TopEventsWidget/TopEventsWidget.jsx
import React, { useState, useEffect } from 'react';
import { Flame, Clock, Users, ChevronDown, ChevronUp, Radio } from 'lucide-react';
import { useRaveStore } from '../../store/useRaveStore';
import { translations } from '../../i18n/translations';
import './TopEventsWidget.css';

function formatCountdown(targetMs, nowMs) {
  const diff = targetMs - nowMs;
  if (diff <= 0) return 'LIVE';
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  return `${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
}

export const TopEventsWidget = () => {
  const { lang, topTrendingEvents, selectEvent } = useRaveStore();
  const [nowMs, setNowMs] = useState(Date.now());
  const [collapsed, setCollapsed] = useState(true);
  const t = translations[lang];

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!topTrendingEvents || topTrendingEvents.length === 0) return null;

  return (
    <aside className={`top-events-widget ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="top-widget-header" onClick={() => setCollapsed(!collapsed)}>
        <div className="top-widget-title">
          <Flame size={15} className="icon-trending-flame" />
          <strong>{t.topTrendingTitle}</strong>
        </div>
        <button type="button" className="top-widget-toggle">
          {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </button>
      </div>

      {!collapsed && (
        <div className="top-widget-list">
          {topTrendingEvents.map((ev, index) => {
            const rank = index + 1;
            const countdownStr = ev.is_active_now ? 'LIVE' : formatCountdown(ev.startMs, nowMs);

            return (
              <button
                type="button"
                key={ev.id}
                className={`top-widget-item rank-${rank}`}
                onClick={() => selectEvent(ev)}
              >
                <span className="top-widget-rank">#{rank}</span>
                <img src={ev.image_url} alt={ev.name} className="top-widget-thumb" />

                <div className="top-widget-info">
                  <strong>{ev.name}</strong>
                  <div className="top-widget-meta">
                    <span className="top-widget-att">
                      <Users size={10} /> {ev.attendees_count || 0}
                    </span>
                    <span className={`top-widget-timer ${countdownStr === 'LIVE' ? 'is-live' : ''}`}>
                      {countdownStr === 'LIVE' ? <Radio size={10} /> : <Clock size={10} />}
                      {countdownStr}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
};