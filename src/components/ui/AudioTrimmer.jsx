// src/components/ui/AudioTrimmer.jsx
// ----------------------------------------------------------------------------
// Editor para recortar la canción principal cuando pesa más de lo que permite
// el plan del usuario. Eliges inicio y fin sobre la onda, lo escuchas y se
// genera un archivo nuevo que ya cabe (sin subir nada hasta Guardar Perfil).
// ----------------------------------------------------------------------------
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Scissors, Play, Square, X, Check, Crown, Loader2 } from 'lucide-react';
import {
  analyzeAudioFile,
  computePeaks,
  cutAudio,
  estimateBytes,
  formatMb,
  formatTime,
  maxEndFor,
  minStartFor
} from '../../lib/audioTrim';
import './AudioTrimmer.css';

const SAFETY = 0.985; // un pelín por debajo del límite

export const AudioTrimmer = ({ file, maxMb, isPro = false, proMaxMb = null, accent = '#ff5500', onDone, onCancel }) => {
  const maxBytes = Math.floor(maxMb * 1024 * 1024 * SAFETY);
  const [plan, setPlan] = useState(null);
  const [peaks, setPeaks] = useState(null);
  const [error, setError] = useState('');
  const [range, setRange] = useState({ start: 0, end: 0 });
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(null);
  const [busy, setBusy] = useState(false);

  const canvasRef = useRef(null);
  const trackRef = useRef(null);
  const ctxRef = useRef(null);
  const srcRef = useRef(null);
  const rafRef = useRef(0);
  const dragRef = useRef(null);

  // 1) Analizar + decodificar (para la onda y para escuchar)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const p = await analyzeAudioFile(file);
        const AC = window.AudioContext || window.webkitAudioContext;
        const ctx = new AC();
        ctxRef.current = ctx;
        const audioBuffer = await new Promise((res, rej) => {
          // slice(0): decodeAudioData se queda el buffer en algunos navegadores
          const pr = ctx.decodeAudioData(p.buf.slice(0), res, rej);
          if (pr && pr.then) pr.then(res, rej);
        });
        if (!alive) return;
        p.audioBuffer = audioBuffer;
        if (!p.duration) p.duration = audioBuffer.duration;
        p.duration = Math.min(p.duration, audioBuffer.duration + 0.05);
        setPeaks(computePeaks(audioBuffer, 720));
        setPlan(p);
        setRange({ start: 0, end: maxEndFor(p, 0, maxBytes) });
      } catch (err) {
        console.error(err);
        if (alive) setError('No se ha podido leer este audio. Prueba con un MP3 o un WAV.');
      }
    })();
    return () => {
      alive = false;
      try {
        srcRef.current?.stop();
      } catch {
        /* nada */
      }
      cancelAnimationFrame(rafRef.current);
      ctxRef.current?.close?.();
    };
  }, [file, maxBytes]);

  const duration = plan?.duration || 0;
  const bytes = plan ? estimateBytes(plan, range.start, range.end) : 0;
  const maxLen = useMemo(() => (plan ? maxEndFor(plan, 0, maxBytes) : 0), [plan, maxBytes]);

  // 2) Dibujar la onda
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !peaks) return;
    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      if (!w || !h) return;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      const g = cv.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const bars = Math.floor(w / 3);
      const mid = h / 2;
      for (let b = 0; b < bars; b++) {
        const p = peaks[Math.floor((b / bars) * peaks.length)] || 0;
        const bh = Math.max(2, p * (h * 0.92));
        const t = (b / bars) * duration;
        const inSel = t >= range.start && t <= range.end;
        g.fillStyle = inSel ? accent : 'rgba(255,255,255,0.18)';
        g.fillRect(b * 3, mid - bh / 2, 2, bh);
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(cv);
    return () => ro.disconnect();
  }, [peaks, range, duration, accent]);

  // 3) Escuchar la selección
  const stop = useCallback(() => {
    try {
      srcRef.current?.stop();
    } catch {
      /* ya parado */
    }
    srcRef.current = null;
    cancelAnimationFrame(rafRef.current);
    setPlaying(false);
    setPlayhead(null);
  }, []);

  const play = async () => {
    const ctx = ctxRef.current;
    if (!ctx || !plan?.audioBuffer) return;
    stop();
    if (ctx.state === 'suspended') await ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = plan.audioBuffer;
    src.connect(ctx.destination);
    const len = Math.max(0.05, range.end - range.start);
    const t0 = ctx.currentTime;
    src.start(0, range.start, len);
    src.onended = () => {
      if (srcRef.current === src) stop();
    };
    srcRef.current = src;
    setPlaying(true);
    const tick = () => {
      setPlayhead(range.start + Math.min(len, ctx.currentTime - t0));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  // Al mover la selección, se para la escucha
  useEffect(() => {
    if (playing) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end]);

  // 4) Arrastrar asas / mover la ventana
  const timeAt = (clientX) => {
    const r = trackRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(duration, ((clientX - r.left) / r.width) * duration));
  };

  const applyDrag = (clientX) => {
    const d = dragRef.current;
    if (!d || !plan) return;
    const t = timeAt(clientX);
    setRange((cur) => {
      if (d.mode === 'start') {
        const start = Math.max(minStartFor(plan, cur.end, maxBytes), Math.min(t, cur.end - 1));
        return { ...cur, start };
      }
      if (d.mode === 'end') {
        const end = Math.min(maxEndFor(plan, cur.start, maxBytes), Math.max(t, cur.start + 1));
        return { ...cur, end };
      }
      // mover: conserva la duración (si en esa zona pesa más, se acorta)
      const len = d.len;
      let start = Math.max(0, Math.min(duration - len, t - d.grab));
      let end = start + len;
      end = Math.min(end, maxEndFor(plan, start, maxBytes));
      return { start, end };
    });
  };

  const onPointerDown = (mode) => (e) => {
    if (!plan) return;
    e.preventDefault();
    e.stopPropagation();
    const t = timeAt(e.clientX);
    dragRef.current = { mode, grab: t - range.start, len: range.end - range.start };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (dragRef.current) applyDrag(e.clientX);
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  // Click en la onda fuera de la selección: la mueve ahí
  const onTrackPointerDown = (e) => {
    if (!plan) return;
    const t = timeAt(e.clientX);
    const len = range.end - range.start;
    const start = Math.max(0, Math.min(duration - len, t - len / 2));
    setRange({ start, end: Math.min(start + len, maxEndFor(plan, start, maxBytes)) });
  };

  const nudge = (which, delta) => {
    if (!plan) return;
    setRange((cur) => {
      if (which === 'start') {
        const start = Math.max(minStartFor(plan, cur.end, maxBytes), Math.min(cur.end - 1, cur.start + delta));
        return { ...cur, start };
      }
      const end = Math.min(maxEndFor(plan, cur.start, maxBytes), Math.max(cur.start + 1, cur.end + delta));
      return { ...cur, end };
    });
  };

  const onKey = (which) => (e) => {
    const step = e.shiftKey ? 5 : 0.5;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      nudge(which, -step);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      nudge(which, step);
    }
  };

  const confirm = () => {
    if (!plan) return;
    stop();
    setBusy(true);
    setTimeout(() => {
      try {
        const out = cutAudio(plan, range.start, range.end, file.name);
        if (out.size > maxMb * 1024 * 1024) throw new Error('too-big');
        onDone(out);
      } catch (err) {
        console.error(err);
        setError('No se ha podido recortar. Acorta un poco más la selección.');
        setBusy(false);
      }
    }, 20);
  };

  const pct = (t) => (duration ? (t / duration) * 100 : 0);
  const fits = bytes <= maxMb * 1024 * 1024;

  return (
    <div className="audio-trimmer-overlay" role="dialog" aria-modal="true">
      <div className="audio-trimmer-card" style={{ '--trim-accent': accent }}>
        <div className="audio-trimmer-head">
          <strong>
            <Scissors size={16} /> Recorta tu canción
          </strong>
          <button type="button" className="audio-trimmer-x" onClick={onCancel} title="Cancelar">
            <X size={16} />
          </button>
        </div>

        <p className="audio-trimmer-sub">
          <b>{file.name}</b> pesa <b>{formatMb(file.size)}</b> y tu plan permite <b>{maxMb} MB</b>. Elige el trozo que
          quieres que suene al abrir tu panel.
        </p>

        {error && <p className="audio-trimmer-error">{error}</p>}

        {!plan && !error && (
          <div className="audio-trimmer-loading">
            <Loader2 size={18} className="audio-trimmer-spin" /> Leyendo el audio…
          </div>
        )}

        {plan && (
          <>
            <div
              className="audio-trimmer-track"
              ref={trackRef}
              onPointerDown={onTrackPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <canvas ref={canvasRef} className="audio-trimmer-wave" />
              <div className="audio-trimmer-shade" style={{ left: 0, width: `${pct(range.start)}%` }} />
              <div className="audio-trimmer-shade" style={{ left: `${pct(range.end)}%`, right: 0 }} />
              <div
                className="audio-trimmer-sel"
                style={{ left: `${pct(range.start)}%`, width: `${pct(range.end - range.start)}%` }}
                onPointerDown={onPointerDown('move')}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                title="Arrastra para mover la selección"
              />
              <button
                type="button"
                className="audio-trimmer-handle is-start"
                style={{ left: `${pct(range.start)}%` }}
                onPointerDown={onPointerDown('start')}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onKeyDown={onKey('start')}
                aria-label="Inicio del recorte"
              >
                <span />
              </button>
              <button
                type="button"
                className="audio-trimmer-handle is-end"
                style={{ left: `${pct(range.end)}%` }}
                onPointerDown={onPointerDown('end')}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onKeyDown={onKey('end')}
                aria-label="Fin del recorte"
              >
                <span />
              </button>
              {playhead != null && <div className="audio-trimmer-playhead" style={{ left: `${pct(playhead)}%` }} />}
            </div>

            <div className="audio-trimmer-times">
              <span>{formatTime(0)}</span>
              <span>{formatTime(duration)}</span>
            </div>

            <div className="audio-trimmer-stats">
              <div>
                <small>Empieza</small>
                <strong>{formatTime(range.start)}</strong>
              </div>
              <div>
                <small>Termina</small>
                <strong>{formatTime(range.end)}</strong>
              </div>
              <div>
                <small>Dura</small>
                <strong>{formatTime(range.end - range.start)}</strong>
              </div>
              <div className={fits ? 'is-ok' : 'is-bad'}>
                <small>Pesará</small>
                <strong>
                  {formatMb(bytes)} / {maxMb} MB
                </strong>
              </div>
            </div>

            <div className="audio-trimmer-meter">
              <i style={{ width: `${Math.min(100, (bytes / (maxMb * 1024 * 1024)) * 100)}%` }} />
            </div>

            <p className="audio-trimmer-hint">
              Arrastra los bordes o la zona de color. Con tu plan caben como máximo <b>{formatTime(maxLen)}</b>
              {plan.kind === 'decode' ? ' (este formato se guarda como WAV; con un MP3 caben bastantes minutos más)' : ''}.
              {plan.kind === 'mp3' ? ' Se corta sin perder calidad.' : ''}
            </p>

            {!isPro && proMaxMb && (
              <p className="audio-trimmer-pro">
                <Crown size={13} /> Con PRO puedes subir hasta {proMaxMb} MB sin recortar tanto.
              </p>
            )}
          </>
        )}

        <div className="audio-trimmer-actions">
          <button type="button" className="audio-trimmer-btn is-ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="audio-trimmer-btn is-ghost"
            onClick={playing ? stop : play}
            disabled={!plan}
          >
            {playing ? <Square size={14} /> : <Play size={14} />} {playing ? 'Parar' : 'Escuchar'}
          </button>
          <button
            type="button"
            className="audio-trimmer-btn is-main"
            onClick={confirm}
            disabled={!plan || !fits || busy || range.end - range.start < 1}
          >
            {busy ? <Loader2 size={14} className="audio-trimmer-spin" /> : <Check size={14} />} Usar este trozo
          </button>
        </div>
      </div>
    </div>
  );
};

export default AudioTrimmer;
