// src/components/CollabModal/OfferDetails.jsx
// Datos extra de una oferta de colaboración según a quién va dirigida (DJs, clubs, promotores),
// y las etiquetas que se ven en la tarjeta de la oferta.
import React from 'react';
import { MapPin, Calendar, Clock, SlidersHorizontal, Headphones, Building2, Disc, Euro, Plane, Users } from 'lucide-react';
import { ProSelect } from '../ui/ProSelect';
import { SPAIN_LOCATIONS } from '../../constants/spainLocations';
import { ELECTRONIC_GENRES } from '../../constants/electronicGenres';
import './OfferDetails.css';

export const EMPTY_OFFER_DETAILS = {
  city: '',
  genre: '',
  date: '',
  deadline: '',
  dj: { slot: '', set_length: '', bpm_min: '', bpm_max: '', fee_type: '', fee_amount: '', travel_covered: false },
  club: { deal: '', min_capacity: '' },
  promoter: { format: '', split: '' }
};

// Rellena con valores vacíos lo que falte (ofertas antiguas sin detalles)
export const normalizeOfferDetails = (d) => ({
  ...EMPTY_OFFER_DETAILS,
  ...(d || {}),
  dj: { ...EMPTY_OFFER_DETAILS.dj, ...(d?.dj || {}) },
  club: { ...EMPTY_OFFER_DETAILS.club, ...(d?.club || {}) },
  promoter: { ...EMPTY_OFFER_DETAILS.promoter, ...(d?.promoter || {}) }
});

// Guarda solo lo que aplica a los destinatarios marcados
export const cleanOfferDetails = (d, targets = []) => {
  const n = normalizeOfferDetails(d);
  return {
    city: n.city, genre: n.genre, date: n.date, deadline: n.deadline,
    ...(targets.includes('DJ') ? { dj: n.dj } : {}),
    ...(targets.includes('Club') ? { club: n.club } : {}),
    ...(targets.includes('Promotor') ? { promoter: n.promoter } : {})
  };
};

const SLOT_OPTIONS = [
  { value: '', label: 'Franja: sin especificar' },
  { value: 'warmup', label: 'Warm-up' },
  { value: 'peak', label: 'Peak time / main' },
  { value: 'closing', label: 'Closing' },
  { value: 'b2b', label: 'B2B' },
  { value: 'residency', label: 'Residencia' }
];
const FEE_OPTIONS = [
  { value: '', label: 'Caché: sin especificar' },
  { value: 'paid', label: 'Remunerado' },
  { value: 'negotiable', label: 'A convenir' },
  { value: 'unpaid', label: 'Sin caché (intercambio)' }
];
const CLUB_DEAL_OPTIONS = [
  { value: '', label: 'Acuerdo: sin especificar' },
  { value: 'rental', label: 'Alquiler de sala' },
  { value: 'door_split', label: 'Reparto de taquilla' },
  { value: 'coproduction', label: 'Coproducción' },
  { value: 'negotiable', label: 'A convenir' }
];
const PROMOTER_FORMAT_OPTIONS = [
  { value: '', label: 'Formato: sin especificar' },
  { value: 'series', label: 'Ciclo / residencia de colectivo' },
  { value: 'one_off', label: 'Fiesta puntual' },
  { value: 'coproduction', label: 'Coproducción' }
];
const PROMOTER_SPLIT_OPTIONS = [
  { value: '', label: 'Condiciones: sin especificar' },
  { value: 'door_split', label: 'Reparto de taquilla' },
  { value: 'fixed', label: 'Fijo por noche' },
  { value: 'negotiable', label: 'A convenir' }
];
const label = (opts, v) => opts.find((o) => o.value === v)?.label;

/** Campos del formulario */
export const OfferDetailsFields = ({ value, onChange, targets = [] }) => {
  const d = normalizeOfferDetails(value);
  const set = (patch) => onChange({ ...d, ...patch });
  const setDj = (patch) => onChange({ ...d, dj: { ...d.dj, ...patch } });
  const setClub = (patch) => onChange({ ...d, club: { ...d.club, ...patch } });
  const setProm = (patch) => onChange({ ...d, promoter: { ...d.promoter, ...patch } });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="offer-details-fields">
      <div className="offer-details-block">
        <span className="offer-details-block-title">Detalles generales</span>
        <div className="offer-details-grid">
          <ProSelect
            icon={MapPin}
            value={d.city || 'ALL'}
            options={[{ value: 'ALL', label: 'Toda España / online' }, ...SPAIN_LOCATIONS]}
            onChange={(v) => set({ city: v === 'ALL' ? '' : v })}
          />
          <ProSelect
            icon={SlidersHorizontal}
            value={d.genre || 'ALL'}
            options={[{ value: 'ALL', label: 'Cualquier género' }, ...ELECTRONIC_GENRES.map((g) => ({ value: g, label: g }))]}
            onChange={(v) => set({ genre: v === 'ALL' ? '' : v })}
          />
          <label className="offer-details-input">
            <span><Calendar size={12} /> Fecha del evento</span>
            <input type="date" className="pro-input" min={today} value={d.date} onChange={(e) => set({ date: e.target.value })} />
          </label>
          <label className="offer-details-input">
            <span><Clock size={12} /> Aplicar antes de</span>
            <input type="date" className="pro-input" min={today} value={d.deadline} onChange={(e) => set({ deadline: e.target.value })} />
          </label>
        </div>
      </div>

      {targets.includes('DJ') && (
        <div className="offer-details-block is-dj">
          <span className="offer-details-block-title"><Headphones size={12} /> Para DJs</span>
          <div className="offer-details-grid">
            <ProSelect icon={Clock} value={d.dj.slot} options={SLOT_OPTIONS} onChange={(v) => setDj({ slot: v })} />
            <label className="offer-details-input">
              <span>Duración del set</span>
              <input type="text" className="pro-input" placeholder="Ej. 2 h" maxLength={20} value={d.dj.set_length} onChange={(e) => setDj({ set_length: e.target.value })} />
            </label>
            <label className="offer-details-input">
              <span>BPM</span>
              <div className="offer-details-range">
                <input type="number" className="pro-input" placeholder="Mín." min={60} max={220} value={d.dj.bpm_min} onChange={(e) => setDj({ bpm_min: e.target.value })} />
                <span>–</span>
                <input type="number" className="pro-input" placeholder="Máx." min={60} max={220} value={d.dj.bpm_max} onChange={(e) => setDj({ bpm_max: e.target.value })} />
              </div>
            </label>
            <ProSelect icon={Euro} value={d.dj.fee_type} options={FEE_OPTIONS} onChange={(v) => setDj({ fee_type: v })} />
            {d.dj.fee_type === 'paid' && (
              <label className="offer-details-input">
                <span>Caché orientativo</span>
                <input type="text" className="pro-input" placeholder="Ej. 300 €" maxLength={30} value={d.dj.fee_amount} onChange={(e) => setDj({ fee_amount: e.target.value })} />
              </label>
            )}
            <label className={`offer-details-toggle ${d.dj.travel_covered ? 'on' : ''}`}>
              <input type="checkbox" checked={d.dj.travel_covered} onChange={(e) => setDj({ travel_covered: e.target.checked })} />
              <Plane size={13} /> Cubrimos viaje y alojamiento
            </label>
          </div>
        </div>
      )}

      {targets.includes('Club') && (
        <div className="offer-details-block is-club">
          <span className="offer-details-block-title"><Building2 size={12} /> Para clubs</span>
          <div className="offer-details-grid">
            <ProSelect icon={Building2} value={d.club.deal} options={CLUB_DEAL_OPTIONS} onChange={(v) => setClub({ deal: v })} />
            <label className="offer-details-input">
              <span><Users size={12} /> Aforo mínimo</span>
              <input type="number" className="pro-input" placeholder="Ej. 400" min={0} value={d.club.min_capacity} onChange={(e) => setClub({ min_capacity: e.target.value })} />
            </label>
          </div>
        </div>
      )}

      {targets.includes('Promotor') && (
        <div className="offer-details-block is-promoter">
          <span className="offer-details-block-title"><Disc size={12} /> Para promotores</span>
          <div className="offer-details-grid">
            <ProSelect icon={Disc} value={d.promoter.format} options={PROMOTER_FORMAT_OPTIONS} onChange={(v) => setProm({ format: v })} />
            <ProSelect icon={Euro} value={d.promoter.split} options={PROMOTER_SPLIT_OPTIONS} onChange={(v) => setProm({ split: v })} />
          </div>
        </div>
      )}
    </div>
  );
};

const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
};

/** Etiquetas en la tarjeta de la oferta */
export const OfferDetailsChips = ({ details }) => {
  if (!details) return null;
  const d = normalizeOfferDetails(details);
  const chips = [];
  if (d.city) chips.push({ k: 'city', icon: MapPin, t: d.city });
  if (d.genre) chips.push({ k: 'genre', icon: SlidersHorizontal, t: d.genre });
  if (d.date) chips.push({ k: 'date', icon: Calendar, t: fmtDate(d.date) });
  if (details.dj) {
    if (d.dj.slot) chips.push({ k: 'slot', icon: Headphones, t: label(SLOT_OPTIONS, d.dj.slot), c: 'dj' });
    if (d.dj.set_length) chips.push({ k: 'len', icon: Clock, t: `Set ${d.dj.set_length}`, c: 'dj' });
    if (d.dj.bpm_min || d.dj.bpm_max) chips.push({ k: 'bpm', t: `${d.dj.bpm_min || '?'}–${d.dj.bpm_max || '?'} BPM`, c: 'dj' });
    if (d.dj.fee_type) chips.push({ k: 'fee', icon: Euro, t: d.dj.fee_type === 'paid' && d.dj.fee_amount ? d.dj.fee_amount : label(FEE_OPTIONS, d.dj.fee_type), c: 'dj' });
    if (d.dj.travel_covered) chips.push({ k: 'travel', icon: Plane, t: 'Viaje cubierto', c: 'dj' });
  }
  if (details.club) {
    if (d.club.deal) chips.push({ k: 'deal', icon: Building2, t: label(CLUB_DEAL_OPTIONS, d.club.deal), c: 'club' });
    if (d.club.min_capacity) chips.push({ k: 'cap', icon: Users, t: `Aforo ${d.club.min_capacity}+`, c: 'club' });
  }
  if (details.promoter) {
    if (d.promoter.format) chips.push({ k: 'fmt', icon: Disc, t: label(PROMOTER_FORMAT_OPTIONS, d.promoter.format), c: 'promoter' });
    if (d.promoter.split) chips.push({ k: 'split', icon: Euro, t: label(PROMOTER_SPLIT_OPTIONS, d.promoter.split), c: 'promoter' });
  }
  if (d.deadline) chips.push({ k: 'deadline', icon: Clock, t: `Hasta el ${fmtDate(d.deadline)}`, c: 'deadline' });
  if (chips.length === 0) return null;

  return (
    <div className="offer-details-chips">
      {chips.map(({ k, icon: Icon, t, c }) => (
        <span key={k} className={`offer-chip ${c ? `is-${c}` : ''}`}>
          {Icon && <Icon size={11} />} {t}
        </span>
      ))}
    </div>
  );
};