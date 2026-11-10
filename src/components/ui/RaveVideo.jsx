// RUTA COMPLETA: houseoftechno/src/components/ui/RaveVideo.jsx
// ============================================================================
// Reproductor de vídeo propio de RAVEXRADAR (sustituye a los controles del
// navegador). Se usa igual que un <video>:
//   <RaveVideo ref={miRef} src={url} className="dj-session-video" accent="#ff5500" onPlay={...} />
// · El ref apunta al <video> real: pause(), currentTime… siguen funcionando,
//   igual que la sincronización con el visor ampliado (lib/mediaSync.js).
// · Barra con progreso arrastrable, tiempo, volumen, pantalla completa.
// · Los controles se esconden solos mientras se reproduce.
// · Teclado (con el reproductor enfocado): espacio/K play, M silencio, F pantalla completa.
// ============================================================================
import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize2, Minimize2, RotateCcw } from 'lucide-react';
import './RaveVideo.css';

const VOL_KEY = 'rv-volume';
const readVolume = () => {
  try {
    const v = parseFloat(localStorage.getItem(VOL_KEY));
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
  } catch {
    return 1;
  }
};
const saveVolume = (v) => {
  try {
    localStorage.setItem(VOL_KEY, String(v));
  } catch {
    /* almacenamiento no disponible: no pasa nada */
  }
};

const fmt = (s) => {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return h ? `${h}:${m.toString().padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;

export const RaveVideo = forwardRef(function RaveVideo(
  { src, poster, className = '', accent = '#facc15', autoPlay = false, muted = false, loop = false,
    preload = 'metadata', onPlay, onPause, onTimeUpdate, onLoadedMetadata, onEnded, ...rest },
  ref
) {
  const wrapRef = useRef(null);
  const videoRef = useRef(null);
  const barRef = useRef(null);
  const hideTimer = useRef(null);
  const scrubbing = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [isMuted, setIsMuted] = useState(muted);
  const [volume, setVolume] = useState(1);
  const [idle, setIdle] = useState(false);
  const [isFs, setIsFs] = useState(false);
  const [hover, setHover] = useState(null); // { x, t } al pasar por la barra
  const [compact, setCompact] = useState(false);

  // El ref del componente padre apunta al <video> real
  const setRefs = useCallback(
    (el) => {
      videoRef.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) ref.current = el;
    },
    [ref]
  );

  // Volumen recordado entre vídeos
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const saved = readVolume();
    v.volume = saved;
    setVolume(saved);
  }, []);

  // Tamaño pequeño (tarjetas del panel): oculta el deslizador de volumen
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width < 380));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onFs = () => setIsFs(fsElement() === wrapRef.current);
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('webkitfullscreenchange', onFs);
    };
  }, []);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  // Los controles se esconden a los 2,5 s sin mover el ratón mientras suena
  const wake = useCallback(() => {
    setIdle(false);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused && !scrubbing.current) setIdle(true);
    }, 2500);
  }, []);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused || v.ended) {
      const p = v.play();
      if (p && p.catch) p.catch(() => {});
    } else {
      v.pause();
    }
    wake();
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    if (!v.muted && v.volume === 0) v.volume = 0.6;
    wake();
  };

  const changeVolume = (e) => {
    const v = videoRef.current;
    if (!v) return;
    const val = parseFloat(e.target.value);
    v.volume = val;
    v.muted = val === 0;
    saveVolume(val);
  };

  const toggleFullscreen = () => {
    const wrap = wrapRef.current;
    const v = videoRef.current;
    if (!wrap || !v) return;
    if (fsElement()) {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    } else if (wrap.requestFullscreen || wrap.webkitRequestFullscreen) {
      const p = (wrap.requestFullscreen || wrap.webkitRequestFullscreen).call(wrap);
      if (p && p.catch) p.catch(() => {});
    } else if (v.webkitEnterFullscreen) {
      // iPhone: solo deja pantalla completa con el reproductor del sistema
      v.webkitEnterFullscreen();
    }
  };

  // ----- Barra de progreso (ratón y dedo) -----
  const ratioAt = (clientX) => {
    const r = barRef.current.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  };
  const seekTo = (clientX) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    const t = ratioAt(clientX) * duration;
    v.currentTime = t;
    setTime(t);
  };
  const onBarDown = (e) => {
    if (!duration) return;
    scrubbing.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    seekTo(e.clientX);
    wake();
  };
  const onBarMove = (e) => {
    if (duration && e.pointerType === 'mouse') {
      const ratio = ratioAt(e.clientX);
      setHover({ x: ratio * 100, t: ratio * duration });
    }
    if (scrubbing.current) seekTo(e.clientX);
  };
  const onBarUp = (e) => {
    scrubbing.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };
  const onBarKey = (e) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      e.stopPropagation();
      v.currentTime = Math.min(duration, Math.max(0, v.currentTime + (e.key === 'ArrowRight' ? 5 : -5)));
    }
  };

  const onKeyDown = (e) => {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'k') {
      if (e.target.tagName === 'BUTTON' && k === ' ') return; // el botón ya se pulsa solo
      e.preventDefault();
      e.stopPropagation();
      togglePlay();
    } else if (k === 'm') {
      e.stopPropagation();
      toggleMute();
    } else if (k === 'f') {
      e.stopPropagation();
      toggleFullscreen();
    }
  };

  // ----- Eventos del <video> (también llegan si otro código lo pausa) -----
  const readBuffered = (v) => {
    if (!v.duration || !v.buffered?.length) return;
    let end = 0;
    for (let i = 0; i < v.buffered.length; i++) {
      if (v.buffered.start(i) <= v.currentTime + 0.5) end = Math.max(end, v.buffered.end(i));
    }
    setBuffered(Math.min(1, end / v.duration));
  };

  const progress = duration ? Math.min(1, time / duration) : 0;
  const showVolumeSlider = !compact;
  const BigIcon = ended ? RotateCcw : Play;

  return (
    <div
      ref={wrapRef}
      className={`rv${playing ? ' is-playing' : ''}${idle && playing ? ' is-idle' : ''}${compact ? ' is-compact' : ''}${isFs ? ' is-fs' : ''}`}
      style={{ '--rv-accent': accent }}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerMove={wake}
      onPointerDown={wake}
      onMouseLeave={() => playing && setIdle(true)}
    >
      <video
        {...rest}
        ref={setRefs}
        src={src}
        poster={poster}
        className={className}
        autoPlay={autoPlay}
        muted={muted}
        loop={loop}
        preload={preload}
        playsInline
        disablePictureInPicture
        controlsList="nodownload noplaybackrate"
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        onPlay={(e) => { setPlaying(true); setEnded(false); wake(); onPlay?.(e); }}
        onPause={(e) => { setPlaying(false); setIdle(false); onPause?.(e); }}
        onEnded={(e) => { setPlaying(false); setEnded(true); setIdle(false); onEnded?.(e); }}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
        onSeeked={() => setWaiting(false)}
        onTimeUpdate={(e) => {
          if (!scrubbing.current) setTime(e.currentTarget.currentTime);
          readBuffered(e.currentTarget);
          onTimeUpdate?.(e);
        }}
        onProgress={(e) => readBuffered(e.currentTarget)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration || 0)}
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration || 0);
          setTime(e.currentTarget.currentTime || 0);
          onLoadedMetadata?.(e);
        }}
        onVolumeChange={(e) => {
          setIsMuted(e.currentTarget.muted);
          setVolume(e.currentTarget.volume);
        }}
      />

      {waiting && playing && <span className="rv-spinner" aria-hidden="true" />}

      {!playing && !waiting && (
        <button type="button" className="rv-big" onClick={togglePlay} aria-label={ended ? 'Volver a ver' : 'Reproducir'}>
          <BigIcon size={compact ? 22 : 28} fill={ended ? 'none' : 'currentColor'} />
        </button>
      )}

      <div className="rv-bar" onClick={(e) => e.stopPropagation()}>
        <div
          ref={barRef}
          className="rv-track"
          role="slider"
          tabIndex={0}
          aria-label="Progreso del vídeo"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration) || 0}
          aria-valuenow={Math.round(time)}
          aria-valuetext={`${fmt(time)} de ${fmt(duration)}`}
          onPointerDown={onBarDown}
          onPointerMove={onBarMove}
          onPointerUp={onBarUp}
          onPointerCancel={onBarUp}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onBarKey}
        >
          <div className="rv-track-bg">
            <div className="rv-buffer" style={{ width: `${buffered * 100}%` }} />
            <div className="rv-fill" style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="rv-knob" style={{ left: `${progress * 100}%` }} />
          {hover && (
            <span className="rv-hover-time" style={{ left: `${hover.x}%` }}>{fmt(hover.t)}</span>
          )}
        </div>

        <div className="rv-row">
          <button type="button" className="rv-btn" onClick={togglePlay} aria-label={playing ? 'Pausar' : 'Reproducir'}>
            {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
          </button>

          <div className="rv-vol">
            <button type="button" className="rv-btn" onClick={toggleMute} aria-label={isMuted ? 'Activar sonido' : 'Silenciar'}>
              {isMuted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
            </button>
            {showVolumeSlider && (
              <input
                type="range"
                className="rv-vol-range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={changeVolume}
                aria-label="Volumen"
                style={{ '--rv-vol': `${(isMuted ? 0 : volume) * 100}%` }}
              />
            )}
          </div>

          <span className="rv-time">
            {fmt(time)} <i>/</i> {fmt(duration)}
          </span>

          <span className="rv-spacer" />

          <button type="button" className="rv-btn" onClick={toggleFullscreen} aria-label={isFs ? 'Salir de pantalla completa' : 'Pantalla completa'}>
            {isFs ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
});