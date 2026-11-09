// src/components/RankingModal/RankingModal.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  X, Trophy, MapPin, SlidersHorizontal, Flame, Check,
  Headphones, Activity, Disc, Search, Crown, Medal,
  Calendar, Users, Zap, Building2, ChevronDown
} from 'lucide-react';
import { useRaveStore } from '../../store/useRaveStore';
import { SPAIN_LOCATIONS } from '../../constants/spainLocations';
import { ELECTRONIC_GENRES } from '../../constants/electronicGenres';
import { ProSelect } from '../ui/ProSelect';
import './RankingModal.css';

// Cuántas filas se pintan de cada ranking (y cuántas más añade "Mostrar más")
const RANKING_PAGE_SIZE = 50;

// Ejecuta fn justo después del siguiente pintado (para no bloquear la apertura del panel)
const afterPaint = (fn) => {
  if (typeof window === 'undefined' || !window.requestAnimationFrame) return fn();
  window.requestAnimationFrame(() => setTimeout(fn, 0));
};

export const RankingModal = () => {
  // Suscripciones finas: el modal solo se repinta cuando cambia lo que usa
  const lang = useRaveStore((s) => s.lang);
  const isRankingOpen = useRaveStore((s) => s.isRankingOpen);
  const setModal = useRaveStore((s) => s.setModal);
  const djs = useRaveStore((s) => s.djs);
  const filteredEvents = useRaveStore((s) => s.filteredEvents);
  const filteredClubs = useRaveStore((s) => s.filteredClubs);
  const filteredPromoters = useRaveStore((s) => s.filteredPromoters);
  const myHypedDjIds = useRaveStore((s) => s.myHypedDjIds);
  const giveHypeToDj = useRaveStore((s) => s.giveHypeToDj);
  const selectDj = useRaveStore((s) => s.selectDj);
  const selectEvent = useRaveStore((s) => s.selectEvent);
  const selectClub = useRaveStore((s) => s.selectClub);
  const selectPromoter = useRaveStore((s) => s.selectPromoter);

  // PUNTO 2: 4 pestañas en orden: 'DJS' | 'EVENTS' | 'PROMOTERS' | 'CLUBS'
  const [rankingTab, setRankingTab] = useState('DJS');
  const [cityFilter, setCityFilter] = useState('ALL');
  const [genreFilter, setGenreFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(RANKING_PAGE_SIZE);

  // Al cambiar de pestaña, filtros, búsqueda o al reabrir: volvemos a los 50 primeros
  useEffect(() => {
    setVisibleCount(RANKING_PAGE_SIZE);
  }, [rankingTab, cityFilter, genreFilter, search, isRankingOpen]);

  const cityOptions = [
    { value: 'ALL', label: lang === 'es' ? 'Toda España' : 'All Spain' },
    ...SPAIN_LOCATIONS
  ];

  const genreOptions = [
    { value: 'ALL', label: lang === 'es' ? 'Todos los géneros' : 'All genres' },
    ...ELECTRONIC_GENRES.map((g) => ({ value: g, label: g }))
  ];

  const searchLc = search.toLowerCase();

  // Solo se calcula la pestaña visible (y nada si el modal está cerrado)
  const rankedDjs = useMemo(() => rankingTab !== 'DJS' || !isRankingOpen ? [] : (djs || [])
    .filter((dj) => {
      const matchCity = cityFilter === 'ALL' || dj.city === cityFilter;
      const matchGenre =
        genreFilter === 'ALL' ||
        dj.favorite_subgenre === genreFilter ||
        (Array.isArray(dj.secondary_subgenres) && dj.secondary_subgenres.includes(genreFilter));
      const matchSearch = dj.username?.toLowerCase().includes(searchLc);
      return matchCity && matchGenre && matchSearch;
    })
    .sort((a, b) => (b.hype_score || 0) - (a.hype_score || 0)),
  [rankingTab, isRankingOpen, djs, cityFilter, genreFilter, searchLc]);

  const rankedEvents = useMemo(() => rankingTab !== 'EVENTS' || !isRankingOpen ? [] : (filteredEvents || [])
    .filter((ev) => {
      const matchCity = cityFilter === 'ALL' || ev.city === cityFilter;
      const matchGenre = genreFilter === 'ALL' || ev.subgenre === genreFilter;
      const matchSearch =
        ev.name?.toLowerCase().includes(searchLc) ||
        ev.venue_name?.toLowerCase().includes(searchLc);
      return matchCity && matchGenre && matchSearch;
    })
    .sort((a, b) => (b.attendees_count || 0) - (a.attendees_count || 0)),
  [rankingTab, isRankingOpen, filteredEvents, cityFilter, genreFilter, searchLc]);

  // PUNTO 2: Promotores ordenados por la suma total de "Voy a ir" de sus fiestas asociadas
  const rankedPromoters = useMemo(() => rankingTab !== 'PROMOTERS' || !isRankingOpen ? [] : (filteredPromoters || [])
    .filter((prom) => {
      const matchCity = cityFilter === 'ALL' || prom.city === cityFilter;
      const matchGenre =
        genreFilter === 'ALL' ||
        prom.favorite_subgenre === genreFilter ||
        (Array.isArray(prom.secondary_subgenres) && prom.secondary_subgenres.includes(genreFilter)) ||
        (prom.hosted_events || []).some((e) => e.subgenre === genreFilter);
      const matchSearch = prom.username?.toLowerCase().includes(searchLc);
      return matchCity && matchGenre && matchSearch;
    })
    .sort((a, b) => {
      if ((b.total_attendees_count || 0) !== (a.total_attendees_count || 0)) {
        return (b.total_attendees_count || 0) - (a.total_attendees_count || 0);
      }
      return (b.events_count || 0) - (a.events_count || 0);
    }),
  [rankingTab, isRankingOpen, filteredPromoters, cityFilter, genreFilter, searchLc]);

  // PUNTO 2: Clubs ordenados por la suma total de "Voy a ir" de sus fiestas asociadas
  const rankedClubs = useMemo(() => rankingTab !== 'CLUBS' || !isRankingOpen ? [] : (filteredClubs || [])
    .filter((club) => {
      const matchCity = cityFilter === 'ALL' || club.city === cityFilter;
      const matchGenre =
        genreFilter === 'ALL' ||
        club.favorite_subgenre === genreFilter ||
        (Array.isArray(club.secondary_subgenres) && club.secondary_subgenres.includes(genreFilter)) ||
        (club.hosted_events || []).some((e) => e.subgenre === genreFilter);
      const matchSearch =
        club.username?.toLowerCase().includes(searchLc) ||
        club.street_address?.toLowerCase().includes(searchLc);
      return matchCity && matchGenre && matchSearch;
    })
    .sort((a, b) => {
      if ((b.total_attendees_count || 0) !== (a.total_attendees_count || 0)) {
        return (b.total_attendees_count || 0) - (a.total_attendees_count || 0);
      }
      return (b.events_count || 0) - (a.events_count || 0);
    }),
  [rankingTab, isRankingOpen, filteredClubs, cityFilter, genreFilter, searchLc]);

  if (!isRankingOpen) return null;

  // Click en una fila: el ranking se cierra y el panel se abre en el mismo frame,
  // mostrando "cargando" mientras llegan sus datos. Encender la capa del mapa
  // (lo costoso) se hace justo después de pintar. Se puede pulsar otro elemento
  // o cerrar el panel en cualquier momento: las respuestas antiguas se descartan.
  const openFromRanking = (layerKey, selectFn, item) => {
    setModal('isRankingOpen', false);
    selectFn(item);
    afterPaint(() => {
      const st = useRaveStore.getState();
      if (!st.mapLayers?.[layerKey]) st.toggleMapLayer(layerKey);
    });
  };

  const handleGoToDjOnMap = (dj) => openFromRanking('djs', selectDj, dj);

  const handleGoToEventOnMap = (ev) => openFromRanking('events', selectEvent, ev);

  const handleGoToPromoterOnMap = (prom) => openFromRanking('promoters', selectPromoter, prom);

  const handleGoToClubOnMap = (club) => openFromRanking('clubs', selectClub, club);

  // Pie de lista: "Mostrando X de Y" + botón para cargar 50 más
  const renderLoadMore = (total) => {
    if (total <= visibleCount) return null;
    const nextBatch = Math.min(RANKING_PAGE_SIZE, total - visibleCount);
    return (
      <div className="ranking-load-more">
        <span className="ranking-load-more-count">
          {lang === 'es' ? `Mostrando ${visibleCount} de ${total}` : `Showing ${visibleCount} of ${total}`}
        </span>
        <button
          type="button"
          className="btn-ranking-load-more"
          onClick={() => setVisibleCount((c) => c + RANKING_PAGE_SIZE)}
        >
          <ChevronDown size={16} />
          <span>{lang === 'es' ? `Mostrar ${nextBatch} más` : `Show ${nextBatch} more`}</span>
        </button>
      </div>
    );
  };

  const renderRankBadge = (rank) => {
    if (rank === 1) return <Crown size={18} style={{ color: '#facc15' }} />;
    if (rank === 2) return <Medal size={18} style={{ color: '#e4e4e7' }} />;
    if (rank === 3) return <Medal size={18} style={{ color: '#fb923c' }} />;
    return `#${rank}`;
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card ranking-modal-card">
        <button className="modal-close" onClick={() => setModal('isRankingOpen', false)}>
          <X size={18} />
        </button>

        <div className="ranking-header">
          <div className="ranking-top-switch-row">
            <div className="ranking-title-row modal-icon-header">
              <Trophy size={24} className="icon-neon" />
              <div>
                <h2 className="modal-title">
                  {lang === 'es' ? 'RANKING OFICIAL' : 'OFFICIAL RANKING'}
                </h2>
                <p className="modal-subtitle" style={{ marginBottom: 0 }}>
                  {rankingTab === 'DJS'
                    ? (lang === 'es' ? 'Clasificación de DJs & Producers por Hype.' : 'DJs & Producers ranked by Hype.')
                    : rankingTab === 'EVENTS'
                    ? (lang === 'es' ? 'Eventos activos y próximos con más asistentes confirmados.' : 'Upcoming & live events ranked by confirmed attendees.')
                    : rankingTab === 'PROMOTERS'
                    ? (lang === 'es' ? 'Promotores ordenados por la suma de asistentes ("Voy a ir") en sus fiestas activas.' : 'Promoters ranked by total confirmed attendees across their upcoming events.')
                    : (lang === 'es' ? 'Clubs ordenados por la suma de asistentes ("Voy a ir") en sus próximas fiestas.' : 'Clubs ranked by total confirmed attendees across their upcoming parties.')}
                </p>
              </div>
            </div>

            {/* PUNTO 2: 1. DJs | 2. Eventos | 3. Promotores | 4. Clubs */}
            <div className="ranking-mode-pills">
              <button
                type="button"
                className={rankingTab === 'DJS' ? 'active' : ''}
                onClick={() => setRankingTab('DJS')}
              >
                <Headphones size={14} />
                <span>DJs</span>
              </button>
              <button
                type="button"
                className={rankingTab === 'EVENTS' ? 'active' : ''}
                onClick={() => setRankingTab('EVENTS')}
              >
                <Zap size={14} />
                <span>{lang === 'es' ? 'Eventos' : 'Events'}</span>
              </button>
              <button
                type="button"
                className={rankingTab === 'PROMOTERS' ? 'active' : ''}
                onClick={() => setRankingTab('PROMOTERS')}
              >
                <Disc size={14} />
                <span>{lang === 'es' ? 'Promotores' : 'Promoters'}</span>
              </button>
              <button
                type="button"
                className={rankingTab === 'CLUBS' ? 'active' : ''}
                onClick={() => setRankingTab('CLUBS')}
              >
                <Building2 size={14} />
                <span>Clubs</span>
              </button>
            </div>
          </div>

          <div className="ranking-filters-bar">
            <div className="ranking-search-input">
              <Search size={14} className="icon-neon" />
              <input
                type="text"
                placeholder={
                  rankingTab === 'DJS'
                    ? (lang === 'es' ? 'Buscar DJ por @alias...' : 'Search DJ by @handle...')
                    : rankingTab === 'EVENTS'
                    ? (lang === 'es' ? 'Buscar fiesta o sala...' : 'Search event or venue...')
                    : rankingTab === 'PROMOTERS'
                    ? (lang === 'es' ? 'Buscar promotor o colectivo...' : 'Search promoter...')
                    : (lang === 'es' ? 'Buscar club o calle...' : 'Search club or street...')
                }
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <ProSelect
              icon={MapPin}
              value={cityFilter}
              options={cityOptions}
              onChange={setCityFilter}
            />

            <ProSelect
              icon={SlidersHorizontal}
              value={genreFilter}
              options={genreOptions}
              onChange={setGenreFilter}
            />
          </div>
        </div>

        <div className="ranking-list-container">
          {rankingTab === 'DJS' && (
            rankedDjs.length === 0 ? (
              <div className="ranking-empty">
                {lang === 'es' ? 'No hay DJs registrados con estos filtros.' : 'No DJs found for these filters.'}
              </div>
            ) : (
              <>
              {rankedDjs.slice(0, visibleCount).map((dj, index) => {
                const rank = index + 1;
                const alreadyHyped = myHypedDjIds.includes(dj.id);

                return (
                  <div key={dj.id} className={`ranking-row ${rank <= 3 ? `top-${rank}` : ''}`}>
                    <div className="rank-number">{renderRankBadge(rank)}</div>

                    <div className="rank-avatar" onClick={() => handleGoToDjOnMap(dj)}>
                      {dj.avatar_url ? (
                        <img src={dj.avatar_url} alt={dj.username} referrerPolicy="no-referrer" />
                      ) : (
                        <Disc size={22} className="icon-neon" />
                      )}
                    </div>

                    <div className="rank-info" onClick={() => handleGoToDjOnMap(dj)}>
                      <strong>@{dj.username}</strong>
                      <div className="rank-meta-pills">
                        <span><MapPin size={11} /> {dj.city || 'Madrid'}</span>
                        <span><SlidersHorizontal size={11} /> {dj.favorite_subgenre || 'Hard Techno'}</span>
                        <span><Activity size={11} /> {dj.favorite_bpm || 155} BPM</span>
                      </div>
                    </div>

                    <div className="rank-actions">
                      <button
                        type="button"
                        className="btn-rank-listen"
                        onClick={() => handleGoToDjOnMap(dj)}
                      >
                        <Headphones size={14} />
                        <span>{lang === 'es' ? 'Ver en Mapa' : 'View on Map'}</span>
                      </button>

                      <button
                        type="button"
                        className={`btn-rank-hype ${alreadyHyped ? 'is-hyped' : ''}`}
                        disabled={alreadyHyped}
                        onClick={() => giveHypeToDj(dj.id)}
                      >
                        {alreadyHyped ? <Check size={14} /> : <Flame size={14} />}
                        <span>{dj.hype_score || 10} Hype</span>
                      </button>
                    </div>
                  </div>
                );
              })}
              {renderLoadMore(rankedDjs.length)}
              </>
            )
          )}

          {rankingTab === 'EVENTS' && (
            rankedEvents.length === 0 ? (
              <div className="ranking-empty">
                {lang === 'es' ? 'No hay eventos activos o futuros con estos filtros.' : 'No upcoming or live events found.'}
              </div>
            ) : (
              <>
              {rankedEvents.slice(0, visibleCount).map((ev, index) => {
                const rank = index + 1;
                return (
                  <div key={ev.id} className={`ranking-row ${rank <= 3 ? `top-${rank}` : ''}`}>
                    <div className="rank-number">{renderRankBadge(rank)}</div>

                    <div
                      className="rank-avatar square-event-thumb"
                      onClick={() => handleGoToEventOnMap(ev)}
                    >
                      <img src={ev.image_url} alt={ev.name} />
                    </div>

                    <div className="rank-info" onClick={() => handleGoToEventOnMap(ev)}>
                      <strong>{ev.name}</strong>
                      <div className="rank-meta-pills">
                        <span><MapPin size={11} /> {ev.venue_name || ev.city} ({ev.city})</span>
                        <span><Calendar size={11} /> {ev.start_date}</span>
                        <span><SlidersHorizontal size={11} /> {ev.subgenre}</span>
                      </div>
                    </div>

                    <div className="rank-actions">
                      <span className="event-att-score">
                        <Users size={14} className="icon-neon" />
                        <strong>{ev.attendees_count || 0}</strong> {lang === 'es' ? 'van a ir' : 'going'}
                      </span>

                      <button
                        type="button"
                        className="btn-rank-listen"
                        onClick={() => handleGoToEventOnMap(ev)}
                      >
                        <Zap size={14} className="icon-neon" />
                        <span>{lang === 'es' ? 'Ir al Evento' : 'View Event'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
              {renderLoadMore(rankedEvents.length)}
              </>
            )
          )}

          {/* PUNTO 2: 3ª Pestaña - Promotores ordenados por suma de "Voy a ir" */}
          {rankingTab === 'PROMOTERS' && (
            rankedPromoters.length === 0 ? (
              <div className="ranking-empty">
                {lang === 'es' ? 'No hay promotores registrados con estos filtros.' : 'No promoters found for these filters.'}
              </div>
            ) : (
              <>
              {rankedPromoters.slice(0, visibleCount).map((prom, index) => {
                const rank = index + 1;
                return (
                  <div key={prom.id} className={`ranking-row ${rank <= 3 ? `top-${rank}` : ''}`}>
                    <div className="rank-number">{renderRankBadge(rank)}</div>

                    <div
                      className="rank-avatar square-event-thumb"
                      style={{ borderColor: '#f43f5e' }}
                      onClick={() => handleGoToPromoterOnMap(prom)}
                    >
                      {prom.avatar_url ? (
                        <img src={prom.avatar_url} alt={prom.username} referrerPolicy="no-referrer" />
                      ) : (
                        <Disc size={22} style={{ color: '#f43f5e' }} />
                      )}
                    </div>

                    <div className="rank-info" onClick={() => handleGoToPromoterOnMap(prom)}>
                      <strong>@{prom.username}</strong>
                      <div className="rank-meta-pills">
                        <span><MapPin size={11} /> {prom.city || 'Madrid'}</span>
                        <span><Calendar size={11} /> {prom.events_count || 0} {lang === 'es' ? 'fiestas activas' : 'active events'}</span>
                        <span><SlidersHorizontal size={11} /> {prom.favorite_subgenre || 'Hard Techno'}</span>
                      </div>
                    </div>

                    <div className="rank-actions">
                      <span className="event-att-score" style={{ borderColor: 'rgba(244, 63, 94, 0.45)', background: 'rgba(244, 63, 94, 0.14)' }}>
                        <Users size={14} style={{ color: '#f43f5e' }} />
                        <strong style={{ color: '#fda4af' }}>{prom.total_attendees_count || 0}</strong> {lang === 'es' ? 'van a ir' : 'going'}
                      </span>

                      <button
                        type="button"
                        className="btn-rank-listen"
                        onClick={() => handleGoToPromoterOnMap(prom)}
                      >
                        <Disc size={14} style={{ color: '#f43f5e' }} />
                        <span>{lang === 'es' ? 'Ver Promotor' : 'View Promoter'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
              {renderLoadMore(rankedPromoters.length)}
              </>
            )
          )}

          {/* PUNTO 2: 4ª Pestaña - Clubs (Sin la palabra Trending) */}
          {rankingTab === 'CLUBS' && (
            rankedClubs.length === 0 ? (
              <div className="ranking-empty">
                {lang === 'es' ? 'No hay clubs registrados con estos filtros.' : 'No clubs found for these filters.'}
              </div>
            ) : (
              <>
              {rankedClubs.slice(0, visibleCount).map((club, index) => {
                const rank = index + 1;
                return (
                  <div key={club.id} className={`ranking-row ${rank <= 3 ? `top-${rank}` : ''}`}>
                    <div className="rank-number">{renderRankBadge(rank)}</div>

                    <div
                      className="rank-avatar square-event-thumb"
                      style={{ borderColor: '#06b6d4' }}
                      onClick={() => handleGoToClubOnMap(club)}
                    >
                      {club.avatar_url ? (
                        <img src={club.avatar_url} alt={club.username} referrerPolicy="no-referrer" />
                      ) : (
                        <Building2 size={22} style={{ color: '#06b6d4' }} />
                      )}
                    </div>

                    <div className="rank-info" onClick={() => handleGoToClubOnMap(club)}>
                      <strong>@{club.username}</strong>
                      <div className="rank-meta-pills">
                        <span><MapPin size={11} /> {club.street_address ? `${club.street_address}, ` : ''}{club.city || 'Madrid'}</span>
                        <span><Calendar size={11} /> {club.events_count || 0} {lang === 'es' ? 'fiestas activas' : 'active events'}</span>
                        <span><SlidersHorizontal size={11} /> {club.favorite_subgenre || 'Techno'}</span>
                      </div>
                    </div>

                    <div className="rank-actions">
                      <span className="event-att-score" style={{ borderColor: 'rgba(6, 182, 212, 0.45)', background: 'rgba(6, 182, 212, 0.14)' }}>
                        <Users size={14} style={{ color: '#06b6d4' }} />
                        <strong style={{ color: '#67e8f9' }}>{club.total_attendees_count || 0}</strong> {lang === 'es' ? 'van a ir' : 'going'}
                      </span>

                      <button
                        type="button"
                        className="btn-rank-listen"
                        onClick={() => handleGoToClubOnMap(club)}
                      >
                        <Building2 size={14} style={{ color: '#06b6d4' }} />
                        <span>{lang === 'es' ? 'Ver Club' : 'View Club'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
              {renderLoadMore(rankedClubs.length)}
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
};
