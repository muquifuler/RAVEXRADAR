// src/components/ui/ProSearchAutocomplete.jsx
import React, { useState, useRef, useEffect } from 'react';
import { Search, MapPin, Calendar, X, Headphones, Disc } from 'lucide-react';
import './ProSearchAutocomplete.css';

export const ProSearchAutocomplete = ({
  value,
  onChange,
  events = [],
  djs = [],
  onSelectEvent,
  onSelectDj,
  placeholder
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const q = value.trim().toLowerCase();

  const matchedDjs = q.length > 0
    ? djs.filter(
        (dj) =>
          dj.username?.toLowerCase().includes(q) ||
          dj.city?.toLowerCase().includes(q) ||
          dj.favorite_subgenre?.toLowerCase().includes(q)
      ).slice(0, 4)
    : [];

  const matchedEvents = q.length > 0
    ? events.filter(
        (ev) =>
          ev.name.toLowerCase().includes(q) ||
          (ev.city && ev.city.toLowerCase().includes(q)) ||
          (ev.venue_name && ev.venue_name.toLowerCase().includes(q))
      ).slice(0, 5)
    : [];

  const hasResults = matchedDjs.length > 0 || matchedEvents.length > 0;

  useEffect(() => {
    const handleOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  return (
    <div className="pro-autocomplete" ref={containerRef}>
      <div className={`pro-search-input-wrap ${isOpen && hasResults ? 'active' : ''}`}>
        <Search size={15} className="pro-search-icon" />
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
          }}
        />
        {value && (
          <button type="button" className="pro-search-clear" onClick={() => onChange('')}>
            <X size={14} />
          </button>
        )}
      </div>

      {isOpen && hasResults && (
        <div className="pro-autocomplete-dropdown">
          {/* SECCIÓN DE DJs / PRODUCERS */}
          {matchedDjs.map((dj) => (
            <button
              type="button"
              key={`dj_${dj.id}`}
              className="autocomplete-option"
              onClick={() => {
                onSelectDj && onSelectDj(dj);
                setIsOpen(false);
              }}
            >
              {dj.avatar_url ? (
                <img src={dj.avatar_url} alt={dj.username} className="autocomplete-thumb round-dj" />
              ) : (
                <div className="autocomplete-thumb round-dj fallback">
                  <Disc size={18} className="icon-neon" />
                </div>
              )}
              <div className="autocomplete-info">
                <strong>@{dj.username}</strong>
                <span>
                  <Headphones size={11} /> DJ · <MapPin size={11} /> {dj.city || 'Madrid'}
                </span>
              </div>
              <span className="autocomplete-tag dj-tag">{dj.favorite_subgenre || 'DJ'}</span>
            </button>
          ))}

          {/* SECCIÓN DE EVENTOS */}
          {matchedEvents.map((ev) => (
            <button
              type="button"
              key={`ev_${ev.id}`}
              className="autocomplete-option"
              onClick={() => {
                onSelectEvent(ev);
                setIsOpen(false);
              }}
            >
              <img src={ev.image_url} alt={ev.name} className="autocomplete-thumb" />
              <div className="autocomplete-info">
                <strong>{ev.name}</strong>
                <span>
                  <MapPin size={11} /> {ev.venue_name || ev.city} · <Calendar size={11} /> {ev.start_date}
                </span>
              </div>
              <span className="autocomplete-tag">{ev.subgenre}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};