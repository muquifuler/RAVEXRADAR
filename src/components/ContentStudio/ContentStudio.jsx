// src/components/ContentStudio/ContentStudio.jsx
// ----------------------------------------------------------------------------
// ESTUDIO: crea stories y posts animados con tu info de RAVEXRADAR.
//  · Plantillas según tu tipo de perfil (y las que valen para todos).
//  · Se rellenan solas con tu fiesta, tu lineup, tu agenda o tu perfil.
//  · Música opcional: por defecto la canción de la fiesta (o la de tu perfil).
//    Se analiza en el móvil (BPM y drop) y el vídeo se monta para que el drop
//    caiga justo en el momento fuerte de la plantilla.
//  · Exporta vídeo (MP4/WebM) o imagen, y se puede compartir directamente.
// ----------------------------------------------------------------------------
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Sparkles, RotateCcw, Download, Share2, Smartphone, Square, Headphones,
  CalendarDays, Megaphone, Flame, Users, Radio, Lock, Play, Pause, Music,
  Upload, VolumeX, Loader2, Image as ImageIcon, Film, CalendarHeart, Radar, ListMusic, Check,
  Timer, CalendarRange, Scale, BadgeCheck, Trophy, Disc3, Heart, Clock, Ticket, EyeOff
} from 'lucide-react';
import { useRaveStore, evaluateEventTiming } from '../../store/useRaveStore';
import { TEMPLATES, templatesFor, accentFor } from '../../lib/studio/templates';
import { StudioPlayer, FORMATS, canRecordVideo } from '../../lib/studio/player';
import { analyzeTrack } from '../../lib/studio/beatAnalysis';
import { fmtDate } from '../../lib/studio/kit';
import './ContentStudio.css';

const ICONS = {
  Radio, Users, CalendarHeart, Headphones, CalendarDays, Megaphone, Radar, Flame, ListMusic,
  Timer, CalendarRange, Scale, BadgeCheck, Trophy, Disc3, Heart, Clock, Ticket, EyeOff
};
const ACCENTS = ['#facc15', '#ff5500', '#06b6d4', '#f43f5e', '#22c55e', '#a78bfa'];
const MAX_UPLOAD_MB = import.meta.env?.VITE_STUDIO_API_URL ? 200 : 60; // con el servidor del estudio caben sesiones enteras
const ANALYSIS_ERRORS = {
  download: 'No he podido descargar la canción para analizarla.',
  host_not_allowed: 'Esa canción está en una web desde la que no se permite analizar.',
  format: 'No se puede leer el formato de esta canción.',
  size: 'La canción es demasiado grande para analizarla.',
  server: 'El servidor del estudio no responde y la canción es grande para analizarla en el móvil.',
  auth: 'Inicia sesión de nuevo para analizar canciones.',
  rate: 'Has analizado muchas canciones seguidas: espera unos minutos.',
  busy: 'El servidor del estudio está ocupado: prueba en un momento.',
  other: 'No he podido analizar esta canción.'
};

// ---------------------------------------------------------------------------
// Fiestas del usuario según la plantilla
// ---------------------------------------------------------------------------
function upcoming(list) {
  return (list || [])
    .map((ev) => ({ ev, t: evaluateEventTiming(ev.start_date, ev.start_time, ev.duration_hours) }))
    .filter(({ t }) => t.status !== 'FINISHED')
    .sort((a, b) => a.t.startMs - b.t.startMs)
    .map(({ ev }) => ev);
}

function buildSources({ user, events, myAttendingEvents, mySquadEventIds }) {
  if (!user) return null;
  const uname = String(user.username || '').trim().toLowerCase();
  const inLineup = (ev) =>
    (Array.isArray(ev.lineup) ? ev.lineup : []).some(
      (s) => (s.dj_id && String(s.dj_id) === String(user.id)) || (s.name && s.name.trim().toLowerCase() === uname)
    );
  const hosts = (ev) =>
    String(ev.venue_id) === String(user.id) ||
    String(ev.created_by) === String(user.id) ||
    String(ev.linked_club_id) === String(user.id) ||
    (Array.isArray(ev.promoters_list) && ev.promoters_list.some((p) => String(p?.id) === String(user.id)));
  const all = upcoming(events);
  const going = upcoming(myAttendingEvents);
  const squadIds = new Set((mySquadEventIds || []).map(String));
  const squad = going.filter((ev) => squadIds.has(String(ev.id)));
  const lineup = all.filter(inLineup);
  const hosted = all.filter(hosts);
  const own = (Array.isArray(user.dj_private_events) ? user.dj_private_events : [])
    .filter((e) => e?.date)
    .map((e) => ({ id: `own_${e.id}`, name: e.name, start_date: e.date, venue_name: e.venue, city: e.city, _own: true }));
  const popular = [...all].sort((a, b) => (b.attendees_count || 0) - (a.attendees_count || 0)).slice(0, 30);
  const work = user.role === 'DJ' ? lineup : hosted;
  const workList = [...work, ...(user.role === 'DJ' ? upcoming(own) : [])].sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
  const uniq = (list) => {
    const seen = new Set();
    return list.filter((e) => (seen.has(String(e.id)) ? false : seen.add(String(e.id))));
  };
  // las tuyas: a las que vas, las que organizas y donde pinchas
  const mineUpcoming = uniq([...going, ...hosted, ...lineup]).sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
  // este finde (o los próximos 7 días) en tu ciudad, las más populares primero
  const now = new Date();
  const dow = now.getDay(); // 0 dom … 6 sáb
  const toSun = dow === 0 ? 0 : 7 - dow;
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + toSun, 23, 59); // hasta el domingo
  const city = String(user.city || '').trim().toLowerCase();
  const soon = all.filter((e) => new Date(`${e.start_date}T00:00:00`) <= end);
  const inCity = city ? soon.filter((e) => String(e.city || '').trim().toLowerCase() === city) : soon;
  const weekend = (inCity.length >= 2 ? inCity : soon).slice().sort((a, b) => (b.attendees_count || 0) - (a.attendees_count || 0)).slice(0, 6)
    .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
  // fiestas que ya han pasado (para dar las gracias)
  const goingIds = new Set((myAttendingEvents || []).map((e) => String(e.id)));
  const finished = uniq([...(events || []), ...(myAttendingEvents || [])])
    .filter((ev) => evaluateEventTiming(ev.start_date, ev.start_time, ev.duration_hours).status === 'FINISHED')
    .sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)));
  const past = finished.filter((ev) => goingIds.has(String(ev.id)) || hosts(ev) || inLineup(ev)).slice(0, 20);
  return { all, going, squad, lineup, hosted, own, popular, work, workList, mineUpcoming, weekend, past, finished: finished.slice(0, 20), uniq };
}

/** Lista de fiestas para elegir + lista para las plantillas de agenda */
function eventsFor(tpl, src) {
  if (!tpl || !src) return { pick: [], list: [], note: '' };
  switch (tpl.source) {
    case 'going':
      return src.going.length
        ? { pick: src.going, list: [] }
        : { pick: src.popular, list: [], note: 'Aún no has marcado «Voy a ir» en ninguna fiesta: elige una.' };
    case 'squad': {
      const pick = src.squad.length ? src.squad : src.going.length ? src.going : src.popular;
      return { pick, list: [], note: src.squad.length ? '' : 'Elige la fiesta para la que buscas squad.' };
    }
    case 'lineup':
      return src.lineup.length
        ? { pick: src.lineup, list: [] }
        : { pick: src.own.length ? upcoming(src.own) : [], list: [], note: 'No estás en ningún lineup próximo: rellena los datos a mano o usa un evento propio.' };
    case 'hosted':
      return src.hosted.length ? { pick: src.hosted, list: [] } : { pick: [], list: [], note: 'No tienes fiestas próximas publicadas: rellena los datos a mano.' };
    case 'work':
      return src.work.length ? { pick: src.work, list: [] } : { pick: src.popular, list: [], note: 'No tienes fiestas próximas: elige cualquiera o escribe el lineup.' };
    case 'going-list':
      return { pick: [], list: src.going, note: src.going.length ? '' : 'Marca «Voy a ir» en algunas fiestas y aparecerán aquí.' };
    case 'work-list':
      return { pick: [], list: src.workList, note: src.workList.length ? '' : 'Aún no tienes fechas próximas: escríbelas a mano.' };
    case 'countdown':
      return src.mineUpcoming.length
        ? { pick: src.mineUpcoming, list: [] }
        : { pick: src.popular, list: [], note: 'No tienes fiestas marcadas: elige cualquiera.' };
    case 'weekend':
      return { pick: [], list: src.weekend, note: src.weekend.length ? '' : 'No hay fiestas esta semana en el mapa: escríbelas a mano.' };
    case 'pair': {
      const list = src.uniq([...src.going, ...src.popular]).slice(0, 2);
      return { pick: [], list, note: src.going.length >= 2 ? 'Tus 2 próximas fiestas. Cámbialas en los textos si quieres.' : 'Se usan las fiestas más populares. Cámbialas en los textos si quieres.' };
    }
    case 'raver':
      return { pick: [], list: src.going };
    case 'recent':
      return src.past.length
        ? { pick: src.past, list: [] }
        : { pick: src.finished, list: [], note: src.finished.length ? 'No vemos fiestas recientes tuyas: elige una o escribe los datos.' : 'Escribe los datos de la fiesta a mano.' };
    default:
      return { pick: [], list: [] };
  }
}

function profileAudioOf(user) {
  if (!user) return null;
  if (user.role === 'DJ') return user.dj_audio_source === 'upload' && user.dj_audio_url ? user.dj_audio_url : null;
  return user.club_audio_url || null;
}

const fmtSec = (s) => {
  if (!Number.isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ---------------------------------------------------------------------------
// Forma de la canción con los drops (se puede pinchar para elegir el drop)
// ---------------------------------------------------------------------------
const SongCurve = ({ analysis, drop, onPick, start, length }) => {
  if (!analysis?.curve?.length) return null;
  const n = analysis.curve.length;
  const dur = analysis.duration || n / 2;
  const W = 600, H = 54;
  const pick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = ((e.clientX - r.left) / r.width) * dur;
    const near = analysis.drops.find((d) => Math.abs(d.time - t) < 1.5);
    if (near) return onPick(near.time);
    const P = analysis.beatPeriod || 60 / analysis.bpm;
    const ph = analysis.phase || 0;
    onPick(+(ph + Math.round((t - ph) / P) * P).toFixed(3));
  };
  return (
    <svg className="cs-curve" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onClick={pick} role="img" aria-label="Forma de la canción: pulsa para elegir el drop">
      {Number.isFinite(start) && <rect x={(start / dur) * W} y="0" width={Math.max(2, (length / dur) * W)} height={H} className="cs-curve-window" />}
      {analysis.curve.map((v, i) => (
        <rect key={i} x={(i / n) * W} y={H - v * H} width={W / n + 0.4} height={Math.max(1, v * H)} className="cs-curve-bar" />
      ))}
      {analysis.drops.map((d) => (
        <line key={d.time} x1={(d.time / dur) * W} x2={(d.time / dur) * W} y1="0" y2={H} className="cs-curve-drop" />
      ))}
      {Number.isFinite(drop) && <line x1={(drop / dur) * W} x2={(drop / dur) * W} y1="0" y2={H} className="cs-curve-pick" />}
    </svg>
  );
};

// ---------------------------------------------------------------------------
export const ContentStudio = () => {
  const isOpen = useRaveStore((s) => s.isStudioOpen);
  const setModal = useRaveStore((s) => s.setModal);
  const user = useRaveStore((s) => s.user);
  const events = useRaveStore((s) => s.events);
  const myAttendingEvents = useRaveStore((s) => s.myAttendingEvents);
  const mySquadEventIds = useRaveStore((s) => s.mySquadEventIds);

  const isAdmin = user?.role === 'Admin';
  const role = isAdmin ? 'DJ' : user?.role || 'Raver';
  const mine = useMemo(() => (isAdmin ? TEMPLATES : templatesFor(role)), [isAdmin, role]);
  const others = useMemo(() => TEMPLATES.filter((t) => !mine.includes(t)), [mine]);
  const sources = useMemo(
    () => buildSources({ user, events, myAttendingEvents, mySquadEventIds }),
    [user, events, myAttendingEvents, mySquadEventIds]
  );

  const [tplId, setTplId] = useState(null);
  const tpl = mine.find((t) => t.id === tplId) || mine[0] || TEMPLATES[0];
  const [format, setFormat] = useState('story');
  const [accent, setAccent] = useState(null);
  const effAccent = accent || (tpl.id === 'going' ? '#22c55e' : accentFor(role));
  const evInfo = useMemo(() => eventsFor(tpl, sources), [tpl, sources]);
  const [eventId, setEventId] = useState(null);
  const ev = evInfo.pick.find((e) => String(e.id) === String(eventId)) || evInfo.pick[0] || null;
  const [data, setData] = useState({});

  // Música
  const profileAudio = profileAudioOf(user);
  const tracks = useMemo(
    () => (Array.isArray(user?.dj_media) ? user.dj_media.filter((m) => m?.type === 'track' && m.url) : []).slice(0, 8),
    [user?.dj_media]
  );
  const eventAudio = ev?.audio_url || evInfo.list.find((e) => e.audio_url)?.audio_url || null;
  const [musicMode, setMusicMode] = useState(null); // null = automático
  const [upload, setUpload] = useState(null); // { file, url }
  // si la plantilla no tiene canción propia, se usa la de alguna fiesta del radar (siempre con música)
  const radarAudio = useMemo(() => {
    if (!sources) return null;
    const pool = [...sources.going, ...sources.mineUpcoming, ...sources.popular, ...sources.all];
    return pool.find((e) => e.audio_url)?.audio_url || null;
  }, [sources]);
  const firstTrack = tracks[0]?.url ? `track:${tracks[0].url}` : null;
  const fallbackMode = firstTrack || (radarAudio && radarAudio !== eventAudio && radarAudio !== profileAudio ? 'radar' : 'none');
  const autoMode =
    tpl.music === 'event'
      ? eventAudio ? 'event' : profileAudio ? 'profile' : fallbackMode
      : profileAudio ? 'profile' : eventAudio ? 'event' : fallbackMode;
  const mode = musicMode || autoMode;
  const musicSrc =
    mode === 'event' ? eventAudio : mode === 'profile' ? profileAudio : mode === 'radar' ? radarAudio : mode === 'upload' ? upload?.url : mode?.startsWith('track:') ? mode.slice(6) : null;
  const [analysis, setAnalysis] = useState({ status: 'idle', data: null, src: null });
  const [dropPick, setDropPick] = useState(null);

  // Reproductor
  const canvasRef = useRef(null);
  const playerRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState({ t: 0, end: 10 });
  const [ready, setReady] = useState(false);
  const [audioInfo, setAudioInfo] = useState({ state: 'none', src: null }); // carga del audio en el reproductor
  const [busy, setBusy] = useState(null); // null | { kind: 'video'|'image', progress }
  const [result, setResult] = useState(null); // { blob, name, url, kind }
  const [error, setError] = useState('');

  // Crear / destruir el reproductor
  useEffect(() => {
    if (!isOpen) return undefined;
    const p = new StudioPlayer(canvasRef.current);
    p.onTick = (t, end) => setPos({ t, end });
    p.onState = setPlaying;
    p.onAudioState = setAudioInfo;
    p.setBpmFallback(130); // sin canción: ritmo fijo (el BPM del perfil es solo decorativo)
    playerRef.current = p;
    return () => {
      p.destroy();
      playerRef.current = null;
      setReady(false);
      setAudioInfo({ state: 'none', src: null });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Rellenar al cambiar de plantilla o de fiesta
  const autofill = useCallback(() => {
    if (!sources) return {};
    return tpl.autofill({ user }, ev, evInfo.list);
  }, [tpl, ev, evInfo.list, sources, user]);
  useEffect(() => {
    if (isOpen && user) setData(autofill());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, tpl.id, ev?.id, evInfo.list.length]);

  // Cargar plantilla (imágenes) cuando cambia algo visual
  const assetKey = `${tpl.id}|${format}|${effAccent}|${data.image || ''}|${data.image2 || ''}|${data.avatar || ''}`;
  useEffect(() => {
    const p = playerRef.current;
    if (!isOpen || !p || !Object.keys(data).length) return;
    let alive = true;
    setReady(false);
    p.pause();
    p.load({ tpl, S: data, format, accent: effAccent }).then((ok) => {
      if (alive && ok) setReady(true);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, assetKey]);

  // Textos: sin recargar imágenes
  useEffect(() => {
    if (ready) playerRef.current?.setTexts(data);
  }, [data, ready]);

  // Analizar la canción
  useEffect(() => {
    if (!isOpen) return;
    setDropPick(null);
    if (!musicSrc) {
      setAnalysis({ status: 'idle', data: null, src: null });
      return;
    }
    let alive = true;
    setAnalysis({ status: 'loading', data: null, src: musicSrc });
    const source = mode === 'upload' && upload?.file ? upload.file : musicSrc;
    analyzeTrack(source, musicSrc)
      .then((a) => alive && setAnalysis({ status: a ? 'ready' : 'error', data: a, src: musicSrc }))
      .catch((err) => alive && setAnalysis({ status: 'error', data: null, src: musicSrc, reason: err?.code || 'other', detail: err?.message || '' }));
    return () => {
      alive = false;
    };
  }, [isOpen, musicSrc, mode, upload]);

  // ¿Está la canción lista? Analizada (BPM y drop) y cargada en el reproductor.
  // Si el análisis o la carga fallan también cuenta como "lista": suena sin cuadrar
  // el drop o en silencio, y el aviso correspondiente lo explica.
  const analysisSettled = !musicSrc || (analysis.src === musicSrc && analysis.status !== 'loading');
  const audioSettled = !musicSrc || (audioInfo.src === musicSrc && audioInfo.state !== 'loading');
  const musicReady = analysisSettled && audioSettled;

  // Al cambiar de canción se para: no se puede volver a dar al play hasta que la nueva esté lista
  useEffect(() => {
    playerRef.current?.pause();
  }, [musicSrc]);

  // Pasar la música al reproductor
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    if (!musicSrc) p.setMusic(null);
    else p.setMusic({ src: musicSrc, analysis: analysis.src === musicSrc ? analysis.data : null, drop: dropPick ?? undefined });
  }, [musicSrc, analysis, dropPick, ready]);

  // Al cerrar
  useEffect(() => {
    if (!isOpen) {
      setResult(null);
      setError('');
      setBusy(null);
    }
  }, [isOpen]);

  // Liberar URLs
  useEffect(() => () => result?.url && URL.revokeObjectURL(result.url), [result]);
  useEffect(() => () => upload?.url && URL.revokeObjectURL(upload.url), [upload]);

  if (!isOpen || !user || !sources) return null;

  const close = () => {
    playerRef.current?.pause();
    setModal('isStudioOpen', false);
  };

  const pickTemplate = (id) => {
    setTplId(id);
    setEventId(null);
    setMusicMode(null);
    setAccent(null);
    setResult(null);
    setError('');
  };

  const canPlay = ready && musicReady && !busy;

  const togglePlay = () => {
    const p = playerRef.current;
    if (!p) return;
    if (playing) p.pause();
    else if (canPlay) p.play({ loop: true });
  };

  const onUpload = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setError(`La canción pesa más de ${MAX_UPLOAD_MB} MB. Usa un MP3 más ligero.`);
      return;
    }
    setError('');
    setUpload({ file, url: URL.createObjectURL(file) });
    setMusicMode('upload');
  };

  const baseName = `ravexradar-${tpl.id}-${new Date().toISOString().slice(0, 10)}`;

  const makeVideo = async () => {
    const p = playerRef.current;
    if (!p || busy) return;
    setError('');
    setResult(null);
    setBusy({ kind: 'video', progress: 0 });
    try {
      const out = await p.recordVideo((progress) => setBusy({ kind: 'video', progress }));
      const name = `${baseName}.${out.ext}`;
      setResult({ blob: out.blob, name, url: URL.createObjectURL(out.blob), kind: 'video', type: out.type });
    } catch (err) {
      console.error(err);
      setError(err?.message || 'No se pudo crear el vídeo.');
    } finally {
      setBusy(null);
    }
  };

  const makeImage = async () => {
    const p = playerRef.current;
    if (!p || busy) return;
    setError('');
    setBusy({ kind: 'image', progress: 0 });
    try {
      const blob = await p.exportPng();
      const name = `${baseName}.png`;
      setResult({ blob, name, url: URL.createObjectURL(blob), kind: 'image', type: 'image/png' });
    } catch (err) {
      console.error(err);
      setError('No se pudo crear la imagen (alguna foto no permite exportarse). Prueba con otra plantilla o cambia la foto.');
    } finally {
      setBusy(null);
    }
  };

  const share = async () => {
    if (!result) return;
    const file = new File([result.blob], result.name, { type: result.type });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'RAVEXRADAR' });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    download(result.blob, result.name);
  };

  const a = analysis.data;
  const timing = playerRef.current?.timing;
  const autoDrop = Number.isFinite(timing?.drop) && dropPick == null ? timing.drop : analysis.data?.suggestedDrop ?? null;
  const canShareFiles = typeof navigator !== 'undefined' && Boolean(navigator.canShare);
  const videoOk = canRecordVideo();

  const musicChips = [
    eventAudio && { id: 'event', label: tpl.multi ? 'De tus fiestas' : 'De la fiesta', icon: Flame },
    profileAudio && { id: 'profile', label: 'De tu perfil', icon: Headphones },
    radarAudio && radarAudio !== eventAudio && radarAudio !== profileAudio && { id: 'radar', label: 'Del radar', icon: Radar },
    ...tracks.map((tr, i) => ({ id: `track:${tr.url}`, label: tr.title || `Tema ${i + 1}`, icon: Music })),
    upload && { id: 'upload', label: upload.file.name.replace(/\.[^.]+$/, '').slice(0, 22), icon: Upload },
    { id: 'none', label: 'Sin música', icon: VolumeX }
  ].filter(Boolean);

  return (
    <div className="cs-overlay" role="dialog" aria-modal="true">
      <div className="cs-shell">
        <header className="cs-head">
          <div className="cs-head-title">
            <Sparkles size={18} />
            <div>
              <strong>Estudio</strong>
              <span>Stories y posts con tu info, al ritmo de tu música</span>
            </div>
          </div>
          <button type="button" className="cs-x" onClick={close} title="Cerrar">
            <X size={18} />
          </button>
        </header>

        <div className="cs-body">
          {/* ---------------- Plantillas ---------------- */}
          <aside className="cs-gallery">
            <span className="cs-label">Plantillas para ti</span>
            <div className="cs-tpl-list">
              {mine.map((t) => {
                const Icon = ICONS[t.icon] || Sparkles;
                return (
                  <button
                    type="button"
                    key={t.id}
                    className={`cs-tpl-btn ${t.id === tpl.id ? 'is-active' : ''}`}
                    style={{ '--cs-accent': t.id === 'going' ? '#22c55e' : accentFor(role) }}
                    onClick={() => pickTemplate(t.id)}
                  >
                    <Icon size={16} />
                    <span className="cs-tpl-text">
                      <strong>{t.name}</strong>
                      <small>{t.roles === 'all' ? 'Para todos' : t.desc}</small>
                    </span>
                  </button>
                );
              })}
            </div>
            {others.length > 0 && (
              <>
                <span className="cs-label cs-label-muted">De otros perfiles</span>
                <div className="cs-tpl-list cs-tpl-locked">
                  {others.map((t) => (
                    <button type="button" key={t.id} className="cs-tpl-btn is-locked" disabled title={`Para ${t.roles === 'all' ? 'todos' : t.roles.join(', ')}`}>
                      <Lock size={14} />
                      <span className="cs-tpl-text">
                        <strong>{t.name}</strong>
                        <small>{t.roles === 'all' ? 'Todos' : t.roles.join(' · ')}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </aside>

          {/* ---------------- Vista previa ---------------- */}
          <section className="cs-preview">
            <div className="cs-format-toggle">
              {Object.entries(FORMATS).map(([k, v]) => (
                <button type="button" key={k} className={format === k ? 'is-active' : ''} onClick={() => setFormat(k)}>
                  {k === 'story' ? <Smartphone size={13} /> : <Square size={13} />} {v.label}
                </button>
              ))}
            </div>
            <div className="cs-stage">
              <div className={`cs-canvas-wrap cs-fmt-${format}`}>
                <canvas ref={canvasRef} width="1080" height="1920" className="cs-canvas" onClick={togglePlay} />
                {!ready && (
                  <div className="cs-canvas-loading">
                    <Loader2 size={22} className="cs-spin" />
                  </div>
                )}
                {busy?.kind === 'video' && (
                  <div className="cs-rec-badge">
                    <i /> GRABANDO {Math.round(busy.progress * 100)}%
                  </div>
                )}
              </div>
            </div>
            <div className="cs-transport">
              <button
                type="button"
                className="cs-play"
                onClick={togglePlay}
                disabled={playing ? Boolean(busy) : !canPlay}
                title={playing ? 'Pausa' : canPlay ? 'Reproducir' : 'Preparando la canción…'}
              >
                {playing ? (
                  <Pause size={16} />
                ) : ready && !musicReady ? (
                  <Loader2 size={16} className="cs-spin" />
                ) : (
                  <Play size={16} />
                )}
              </button>
              <input
                type="range"
                className="cs-seek"
                min="0"
                max={pos.end || 1}
                step="0.01"
                value={Math.min(pos.t, pos.end)}
                disabled={!canPlay}
                onChange={(e) => playerRef.current?.seek(Number(e.target.value))}
                style={{ '--p': `${(Math.min(pos.t, pos.end) / (pos.end || 1)) * 100}%` }}
              />
              <span className="cs-time">
                {fmtSec(pos.t)} / {fmtSec(pos.end)}
              </span>
            </div>
            {ready && !musicReady && (
              <p className="cs-hint cs-hint-row cs-wait">
                <Loader2 size={12} className="cs-spin" />
                {analysisSettled ? 'Cargando la canción…' : 'Analizando la canción (BPM y drop)…'} El play se activa en cuanto esté lista.
              </p>
            )}
          </section>

          {/* ---------------- Ajustes ---------------- */}
          <aside className="cs-form">
            {(evInfo.pick.length > 0 || evInfo.note) && (
              <div className="cs-section">
                <span className="cs-label">{tpl.multi ? 'Fiestas' : 'Fiesta'}</span>
                {evInfo.pick.length > 0 && (
                  <select className="cs-select" value={ev?.id || ''} onChange={(e) => setEventId(e.target.value)}>
                    {evInfo.pick.map((e) => (
                      <option key={e.id} value={e.id}>
                        {fmtDate(e.start_date)} · {e.name}
                      </option>
                    ))}
                  </select>
                )}
                {evInfo.note && <p className="cs-hint">{evInfo.note}</p>}
              </div>
            )}

            <div className="cs-section">
              <span className="cs-label">
                <Music size={12} /> Música
              </span>
              <div className="cs-chips">
                {musicChips.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    className={`cs-chip ${mode === c.id ? 'is-active' : ''}`}
                    onClick={() => setMusicMode(c.id)}
                    title={c.label}
                  >
                    <c.icon size={12} /> <span>{c.label}</span>
                  </button>
                ))}
                <label className="cs-chip cs-chip-upload" title="Usar una canción de tu dispositivo (no se sube a ningún sitio)">
                  <Upload size={12} /> <span>Subir canción</span>
                  <input type="file" accept="audio/*" onChange={onUpload} />
                </label>
              </div>

              {musicSrc && analysis.status === 'loading' && (
                <p className="cs-hint cs-hint-row">
                  <Loader2 size={12} className="cs-spin" /> Buscando el BPM y el drop de la canción…
                </p>
              )}
              {musicSrc && audioInfo.src === musicSrc && audioInfo.state === 'error' && (
                <p className="cs-hint cs-hint-warn">No he podido cargar el audio de esta canción: el vídeo irá en silencio. Prueba con otra.</p>
              )}
              {musicSrc && analysis.status === 'error' && (
                <p className="cs-hint cs-hint-warn">
                  {ANALYSIS_ERRORS[analysis.reason] || ANALYSIS_ERRORS.other} Suena desde el principio y sin cuadrar el drop.
                  {analysis.detail ? <span className="cs-hint-detail"> ({analysis.detail})</span> : null}
                </p>
              )}
              {musicSrc && a && (
                <>
                  <div className="cs-music-meta">
                    <span className="cs-bpm">{a.bpm} BPM</span>
                    <span className="cs-hint-inline">Drop:</span>
                    <button
                      type="button"
                      className={`cs-drop ${dropPick == null ? 'is-active' : ''}`}
                      onClick={() => setDropPick(null)}
                      title="El que mejor encaja"
                    >
                      Auto{autoDrop != null ? ` · ${fmtSec(autoDrop)}` : ''}
                    </button>
                    {a.drops
                      .filter((d) => dropPick != null || Math.abs(d.time - (autoDrop ?? -1)) > 0.05)
                      .slice()
                      .sort((x, y) => (x.kind === 'subida') - (y.kind === 'subida') || y.strength - x.strength)
                      .slice(0, 4)
                      .sort((x, y) => x.time - y.time)
                      .map((d) => (
                        <button
                          type="button"
                          key={d.time}
                          className={`cs-drop ${dropPick === d.time ? 'is-active' : ''}`}
                          onClick={() => setDropPick(d.time)}
                          title={d.kind === 'subida' ? 'Subida de energía' : 'Drop después de un breakdown'}
                        >
                          {d.kind === 'subida' ? '↗ ' : ''}
                          {fmtSec(d.time)}
                        </button>
                      ))}
                  </div>
                  <SongCurve
                    analysis={a}
                    drop={dropPick ?? autoDrop}
                    onPick={setDropPick}
                    start={timing?.start}
                    length={timing?.END}
                  />
                  {Number.isFinite(timing?.drop) ? (
                    <p className="cs-hint">
                      El vídeo rompe en el segundo <b>{(timing.drop - timing.start).toFixed(1)}</b> justo con{' '}
                      {timing.dropKind === 'subida' ? 'la subida' : 'el drop'} de la canción (<b>{fmtSec(timing.drop)}</b>). Pulsa en la forma para
                      elegir otro momento.
                    </p>
                  ) : (
                    <p className="cs-hint">No encuentro un drop claro en esta canción: pulsa en la forma para elegir dónde quieres que rompa.</p>
                  )}
                </>
              )}
              {!musicSrc && <p className="cs-hint">Sin música el vídeo va en silencio (o descarga solo la imagen).</p>}
            </div>

            <div className="cs-section">
              <div className="cs-form-head">
                <span className="cs-label">Textos</span>
                <button type="button" className="cs-reset" onClick={() => setData(autofill())} title="Volver a rellenar con tu info">
                  <RotateCcw size={12} /> Rellenar con mi info
                </button>
              </div>
              {tpl.fields.map((fl) => (
                <label key={fl.key} className="cs-field">
                  <span>{fl.label}</span>
                  {fl.type === 'textarea' ? (
                    <textarea rows={fl.rows || 3} value={data[fl.key] || ''} onChange={(e) => setData({ ...data, [fl.key]: e.target.value })} />
                  ) : (
                    <input
                      type="text"
                      maxLength={fl.max || 60}
                      value={data[fl.key] || ''}
                      onChange={(e) => setData({ ...data, [fl.key]: e.target.value })}
                    />
                  )}
                </label>
              ))}
            </div>

            <div className="cs-section">
              <span className="cs-label">Color</span>
              <div className="cs-colors">
                {ACCENTS.map((c) => (
                  <button
                    type="button"
                    key={c}
                    className={`cs-color ${effAccent === c ? 'is-active' : ''}`}
                    style={{ background: c }}
                    onClick={() => setAccent(c)}
                    aria-label={`Color ${c}`}
                  >
                    {effAccent === c && <Check size={14} />}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="cs-error">{error}</p>}

          </aside>
        </div>

        <footer className="cs-actions">
          <button type="button" className="cs-btn" onClick={makeImage} disabled={!ready || Boolean(busy)}>
            {busy?.kind === 'image' ? <Loader2 size={15} className="cs-spin" /> : <ImageIcon size={15} />} Imagen
          </button>
          <button
            type="button"
            className="cs-btn is-main"
            onClick={makeVideo}
            disabled={!ready || Boolean(busy) || !videoOk || !musicReady}
            title={!videoOk ? 'Tu navegador no puede grabar vídeo' : !musicReady ? 'Espera a que la canción esté lista' : ''}
          >
            {busy?.kind === 'video' ? (
              <>
                <Loader2 size={15} className="cs-spin" /> Grabando {Math.round(busy.progress * 100)}%
              </>
            ) : (
              <>
                <Film size={15} /> Crear vídeo
              </>
            )}
          </button>
          {busy?.kind === 'video' && <span className="cs-actions-note">No cambies de pestaña mientras se graba ({fmtSec(pos.end)}).</span>}
        </footer>
        {result && (
          <div className="cs-result-overlay" onClick={() => setResult(null)}>
            <div className="cs-result" onClick={(e) => e.stopPropagation()}>
              <div className="cs-result-head">
                <strong>{result.kind === 'video' ? '¡Tu vídeo está listo!' : '¡Tu imagen está lista!'}</strong>
                <button type="button" className="cs-x" onClick={() => setResult(null)} title="Cerrar">
                  <X size={16} />
                </button>
              </div>
              {result.kind === 'video' ? (
                <video src={result.url} controls playsInline autoPlay loop className="cs-result-media" />
              ) : (
                <img src={result.url} alt="Tu imagen" className="cs-result-media" />
              )}
              <div className="cs-result-actions">
                <button type="button" className="cs-btn" onClick={() => download(result.blob, result.name)}>
                  <Download size={15} /> Guardar
                </button>
                {canShareFiles && (
                  <button type="button" className="cs-btn is-main" onClick={share}>
                    <Share2 size={15} /> Compartir
                  </button>
                )}
              </div>
              {result.kind === 'video' && result.type.includes('webm') && (
                <p className="cs-hint">Tu navegador graba en WebM. Para subirlo a Instagram desde el iPhone, créalo desde Safari o Chrome actualizados (graban en MP4).</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContentStudio;