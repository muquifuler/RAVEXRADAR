// src/lib/studio/player.js
// ----------------------------------------------------------------------------
// Motor del Estudio en el navegador:
//  · prepara la plantilla (imágenes) y calcula el reloj de golpes,
//  · coloca la canción para que su drop caiga en el golpe fuerte de la plantilla,
//  · reproduce la vista previa sincronizada con el audio,
//  · exporta PNG y vídeo (MediaRecorder: MP4 si el navegador puede, si no WebM).
// Todo ocurre en el dispositivo: no se sube nada a ningún servidor.
// ----------------------------------------------------------------------------
import { beatClock, palette, loadFonts } from './kit';
import { durationOf } from './templates';

const FPS = 30;
const FADE_OUT = 1.2;

export const FORMATS = {
  story: { label: 'Story 9:16', w: 1080, h: 1920 },
  post: { label: 'Post 4:5', w: 1080, h: 1350 }
};

function pickMime(withAudio) {
  if (typeof MediaRecorder === 'undefined') return null;
  const list = withAudio
    ? ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['video/mp4;codecs=avc1.42E01F', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return list.find((m) => {
    try {
      return MediaRecorder.isTypeSupported(m);
    } catch {
      return false;
    }
  }) || null;
}

export function canRecordVideo() {
  return Boolean(pickMime(false) && HTMLCanvasElement.prototype.captureStream);
}

/**
 * El mejor momento de la canción para el "drop" de esta plantilla: primero
 * los drops de verdad (después de un breakdown), luego las subidas. Se prefiere
 * uno que deje sitio a la entrada (lead) y al resto del vídeo (tail).
 */
function pickDrop(a, lead, tail, songDur) {
  const list = (a.drops || []).filter((d) => Number.isFinite(d.time));
  if (!list.length) return Number.isFinite(a.suggestedDrop) ? { time: a.suggestedDrop, kind: 'drop' } : null;
  const weight = (d) => (d.kind === 'subida' ? 1 : 4) * (d.strength || 0.1);
  const fitsAll = (d) => d.time >= lead - 0.01 && (!songDur || d.time + tail <= songDur + 0.3);
  const fitsLead = (d) => d.time >= lead * 0.5;
  const longSong = songDur > 90;
  const pref = (d) => (longSong && d.kind !== 'subida' && d.time > 20 ? 1.5 : 1); // en temas largos, saltar la intro
  for (const ok of [fitsAll, fitsLead, () => true]) {
    const c = list.filter(ok).sort((x, y) => weight(y) * pref(y) - weight(x) * pref(x));
    if (c.length) return c[0];
  }
  return null;
}

export class StudioPlayer {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.tpl = null;
    this.S = {};
    this.A = {};
    this.format = 'story';
    this.accent = '#facc15';
    this.music = null; // { src, analysis, drop }
    this.bpmFallback = 128;
    this.t = 0;
    this.playing = false;
    this.recording = false;
    this.onTick = null; // (t, END) => void
    this.onState = null; // (playing) => void
    // Estado del audio de la canción: avisa cuándo se puede reproducir de verdad
    this.onAudioState = null; // ({ state: 'none'|'loading'|'ready'|'error', src }) => void
    this.audioState = { state: 'none', src: null };
    this.audioTimer = 0;
    this.metaSeen = false;
    this.blobPending = false;
    this.audio = null;
    this.ctx = null;
    this.gain = null;
    this.recDest = null;
    this.raf = 0;
    this.prepSeq = 0;
    this.userSeek = false; // si el usuario ha movido la barra o pausado, se sigue desde ahí
    this.timing = { P: 60 / 128, END: 10, start: 0, bpm: 128 };
  }

  // ---------------------------------------------------------------------------
  // Configuración
  // ---------------------------------------------------------------------------
  async load({ tpl, S, format, accent }) {
    const seq = ++this.prepSeq;
    const f = FORMATS[format] || FORMATS.story;
    await loadFonts();
    const R = this.rctx(f.h, format === 'post', accent);
    const A = await tpl.prepare(S, R);
    if (seq !== this.prepSeq) return false; // llegó otra configuración mientras tanto
    this.tpl = tpl;
    this.S = S;
    this.format = format;
    this.accent = accent;
    this.A = A || {};
    if (this.canvas.width !== f.w || this.canvas.height !== f.h) {
      this.canvas.width = f.w;
      this.canvas.height = f.h;
    }
    this.computeTiming();
    // en reposo se ve la "portada" (el momento en que ya se ve todo)
    this.userSeek = false;
    this.renderAt(this.posterTime());
    return true;
  }

  /** Cambia solo los textos (sin recargar imágenes, salvo que cambien) */
  setTexts(S) {
    this.S = S;
    this.computeTiming();
    if (!this.playing) this.renderAt(Math.min(this.t, this.timing.END - 0.01));
  }

  setMusic(music) {
    // music: null | { src, analysis, drop }
    const prevSrc = this.music?.src;
    this.music = music;
    if (music?.src && music.src !== prevSrc) {
      if (this.playing) this.pause();
      const el = this.ensureAudio();
      this.dropBlob();
      this.metaSeen = false;
      this.setAudioState('loading', music.src);
      // Si el navegador no carga nada sin un toque del usuario (algunos iPhone),
      // no se bloquea el play para siempre.
      clearTimeout(this.audioTimer);
      const src = music.src;
      this.audioTimer = setTimeout(() => {
        if (this.music?.src === src && !this.metaSeen && this.audioState.state === 'loading') {
          this.setAudioState('ready', src);
        }
      }, 25000);
      el.src = music.src;
      el.load();
    } else if (!music) {
      if (this.audio) this.audio.pause();
      clearTimeout(this.audioTimer);
      this.setAudioState('none', null);
    }
    this.computeTiming();
    if (!this.playing) this.renderAt(Math.min(this.t, this.timing.END - 0.01));
  }

  setAudioState(state, src = this.music?.src || null) {
    if (this.audioState.state === state && this.audioState.src === src) return;
    if (state !== 'loading') clearTimeout(this.audioTimer);
    this.audioState = { state, src };
    this.onAudioState?.(this.audioState);
  }

  setBpmFallback(bpm) {
    this.bpmFallback = Number(bpm) || 128;
    this.computeTiming();
  }

  rctx(H, post, accent) {
    return { W: 1080, H, post, ...palette(accent), canvas: this.canvas };
  }

  /**
   * Cuadra la canción con el vídeo: el drop (o la subida más fuerte) de la
   * canción tiene que sonar EXACTAMENTE cuando la plantilla "rompe"
   * (golpe tpl.dropBeat). Se calcula en qué segundo de la canción empezar.
   *  · Si el drop está tan al principio que no da tiempo a la entrada, el vídeo
   *    empieza ya avanzado (offset) en vez de descuadrarse.
   *  · Si la canción se acaba antes que el vídeo, se apaga suave al final.
   */
  computeTiming() {
    if (!this.tpl) return;
    const a = this.music?.analysis;
    const bpm = a?.bpm || this.bpmFallback;
    const clock = beatClock(bpm, FPS);
    const P = clock.P;
    const full = Math.min(40, durationOf(this.tpl, this.S, P));
    const lead = this.tpl.dropBeat * P;
    let start = 0;
    let offset = 0;
    let drop = null;
    let dropKind = null;
    if (this.music?.src && a) {
      const songDur = (this.audio && Number.isFinite(this.audio.duration) && this.audio.duration) || a.duration || 0;
      if (Number.isFinite(this.music.drop)) {
        drop = this.music.drop;
        dropKind = (a.drops || []).find((d) => Math.abs(d.time - drop) < 0.05)?.kind || 'manual';
      } else {
        const best = pickDrop(a, lead, full - lead, songDur);
        if (best) {
          drop = best.time;
          dropKind = best.kind || 'drop';
        }
      }
      if (Number.isFinite(drop)) {
        if (drop >= lead) start = drop - lead;
        else offset = lead - drop; // el vídeo arranca ya metido en la entrada
      } else start = a.phase || 0;
    }
    this.timing = { P, END: Math.max(1, full - offset), start, offset, bpm, drop, dropKind, lead };
    this.clock = clock;
  }

  // ---------------------------------------------------------------------------
  // Dibujo
  // ---------------------------------------------------------------------------
  renderAt(t) {
    if (!this.tpl) return;
    const f = FORMATS[this.format] || FORMATS.story;
    const R = { ...this.rctx(f.h, this.format === 'post', this.accent), clock: this.clock, S: this.S, A: this.A };
    const tt = Math.max(0, Math.min(t, this.timing.END - 1 / FPS)) + (this.timing.offset || 0);
    this.g.save();
    // Pulso de toda la imagen con cada bombo (más fuerte desde el drop y en el
    // primer golpe de cada compás): así todas las plantillas "respiran" con la música.
    const c = this.clock;
    if (c) {
      const tp = tt + 0.5 / FPS;
      const kk = Math.exp(-((tp % c.Pb) / 0.09));
      const bar = Math.floor(tp / c.Pb + 1e-6) % 4 === 0 ? 1.6 : 1;
      const dropT = this.tpl.dropBeat * c.P;
      const amp = (tp >= dropT ? 0.016 : 0.007) * bar;
      // en el drop, un golpe de zoom que se recoge en ~0,3 s
      const punch = tp >= dropT ? 0.05 * Math.exp(-(tp - dropT) / 0.16) : 0;
      const s = 1 + amp * kk + punch;
      if (s > 1.002) {
        // (solo cuando se nota: dibujar escalado cuesta más en móviles sin GPU)
        this.g.translate(540, f.h / 2);
        this.g.scale(s, s);
        this.g.translate(-540, -f.h / 2);
      }
    }
    try {
      this.tpl.render(this.g, tt, R);
    } catch (err) {
      console.error('[estudio] error al dibujar', err);
    }
    this.g.restore();
    this.t = t;
    this.onTick?.(t, this.timing.END);
  }

  /** Instante "portada" para la imagen fija */
  posterTime() {
    const tpl = this.tpl;
    if (!tpl) return 0;
    const beats = tpl.beats(this.S);
    const beat = tpl.posterBeat ? tpl.posterBeat(this.S) : tpl.multi ? beats - 2 : Math.min(beats - 2, tpl.dropBeat + 6);
    return Math.max(0, Math.min(this.timing.END - 0.1, beat * this.timing.P + 0.05 - (this.timing.offset || 0)));
  }

  // ---------------------------------------------------------------------------
  // Audio
  // ---------------------------------------------------------------------------
  ensureAudio() {
    if (!this.audio) {
      const el = new Audio();
      el.crossOrigin = 'anonymous';
      el.preload = 'auto';
      el.playsInline = true;
      el.addEventListener('loadedmetadata', () => {
        this.metaSeen = true;
        this.ensureSeekable();
        this.computeTiming();
        if (!this.playing) this.renderAt(Math.min(this.t, this.timing.END - 0.01));
        // Lista cuando ya se puede saltar al drop (si hay que descargarla entera, al terminar)
        if (this.music?.src && !this.blobPending) this.setAudioState('ready');
      });
      el.addEventListener('error', () => {
        // MEDIA_ERR_ABORTED (1) salta al cambiar de canción: no es un error real
        if (!this.music?.src || !el.getAttribute('src') || el.error?.code === 1) return;
        this.blobPending = false;
        this.setAudioState('error');
      });
      this.audio = el;
    }
    return this.audio;
  }

  /**
   * Para empezar la canción en el segundo del drop hay que poder "saltar" dentro
   * del archivo. Si el servidor del archivo no lo permite (sin peticiones por
   * rangos), se descarga entera una vez y se reproduce desde la memoria.
   */
  ensureSeekable() {
    const el = this.audio;
    const src = this.music?.src;
    if (!el || !src || !/^https?:/i.test(src) || this.blobFor === src) return;
    const dur = el.duration;
    const ok = el.seekable && el.seekable.length > 0 && Number.isFinite(dur) && el.seekable.end(el.seekable.length - 1) >= dur - 1;
    if (ok) return;
    this.blobFor = src;
    this.blobPending = true;
    const stillCurrent = () => this.music?.src === src && this.blobFor === src && this.audio;
    fetch(src, { mode: 'cors' })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (!stillCurrent()) return;
        this.blobPending = false;
        if (!blob) {
          this.setAudioState('error', src);
          return;
        }
        this.blobUrl = URL.createObjectURL(blob);
        const wasPlaying = !this.audio.paused;
        this.audio.src = this.blobUrl;
        this.audio.load();
        if (wasPlaying) this.audio.play().catch(() => {});
      })
      .catch((err) => {
        console.warn('[estudio] no se puede saltar dentro de la canción', err);
        if (!stillCurrent()) return;
        this.blobPending = false;
        this.setAudioState('error', src);
      });
  }

  dropBlob() {
    if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
    this.blobUrl = null;
    this.blobFor = null;
    this.blobPending = false;
  }

  ensureGraph() {
    if (this.ctx || !this.audio) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      const src = this.ctx.createMediaElementSource(this.audio);
      this.gain = this.ctx.createGain();
      src.connect(this.gain);
      this.gain.connect(this.ctx.destination);
      if (this.ctx.createMediaStreamDestination) {
        this.recDest = this.ctx.createMediaStreamDestination();
        this.gain.connect(this.recDest);
      }
    } catch (err) {
      console.warn('[estudio] sin grafo de audio', err);
      this.ctx = null;
    }
  }

  async startAudioAt(t) {
    const el = this.audio;
    if (!el || !this.music?.src) return false;
    // si ese trozo ya no tiene canción (se acabó antes que el vídeo), en silencio
    if (Number.isFinite(el.duration) && this.timing.start + t >= el.duration - 0.05) return false;
    // iPhone: play() y resume() tienen que salir del mismo toque del usuario, así que
    // se arranca ya (en silencio) y después se coloca en su sitio.
    this.ensureGraph();
    if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
    if (this.gain && this.ctx) {
      const now = this.ctx.currentTime;
      this.gain.gain.cancelScheduledValues(now);
      this.gain.gain.setValueAtTime(0.0001, now);
    } else el.muted = true;
    const playing = el.play().then(() => true, (err) => {
      console.warn('[estudio] no se pudo reproducir', err);
      return false;
    });
    const target = this.timing.start + t;
    await new Promise((resolve) => {
      if (Math.abs(el.currentTime - target) < 0.02) return resolve();
      const done = () => {
        el.removeEventListener('seeked', done);
        resolve();
      };
      el.addEventListener('seeked', done);
      el.currentTime = target;
      setTimeout(done, 1500);
    });
    let ok = await playing;
    if (ok && Math.abs(el.currentTime - target) > 0.35) {
      // no se ha podido colocar la canción: mejor seguir sin música que quedarse parado
      console.warn('[estudio] la canción no permite saltar al drop todavía; sigue sin música');
      el.pause();
      ok = false;
    }
    el.muted = false;
    if (this.gain && this.ctx) {
      const now = this.ctx.currentTime;
      this.gain.gain.cancelScheduledValues(now);
      this.gain.gain.setValueAtTime(0.0001, now);
      this.gain.gain.linearRampToValueAtTime(1, now + 0.04);
      const songLeft = Number.isFinite(el.duration) ? el.duration - target : Infinity;
      const remaining = Math.min(this.timing.END - t, songLeft);
      if (remaining > FADE_OUT) {
        this.gain.gain.setValueAtTime(1, now + remaining - FADE_OUT);
        this.gain.gain.linearRampToValueAtTime(0.0001, now + remaining);
      }
    }
    return ok;
  }

  // ---------------------------------------------------------------------------
  // Reproducción
  // ---------------------------------------------------------------------------
  async play({ from = null, loop = false } = {}) {
    if (!this.tpl || this.playing) return;
    const t0 = from ?? (this.userSeek && this.t < this.timing.END - 0.05 ? this.t : 0);
    this.playing = true;
    this.onState?.(true);
    const withAudio = await this.startAudioAt(t0);
    const perf0 = performance.now();
    let lastMedia = -1;
    let lastPerf = perf0;
    let lastT = t0;
    const step = () => {
      if (!this.playing) return;
      const nowPerf = performance.now();
      let t;
      if (withAudio) {
        const media = this.audio.currentTime - this.timing.start;
        if (media !== lastMedia) {
          lastMedia = media;
          lastPerf = nowPerf;
          t = media;
        } else t = lastMedia + (nowPerf - lastPerf) / 1000; // el reloj del audio avanza a saltos
        if (t < lastT) t = lastT; // nunca hacia atrás
      } else t = t0 + (nowPerf - perf0) / 1000;
      lastT = t;
      if (t >= this.timing.END) {
        if (loop && !this.recording) {
          this.stopLoop();
          this.play({ from: 0, loop: true });
          return;
        }
        this.renderAt(this.timing.END - 1 / FPS);
        this.stopLoop();
        this.userSeek = false;
        this.finishCb?.();
        return;
      }
      this.renderAt(t);
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  stopLoop() {
    cancelAnimationFrame(this.raf);
    this.playing = false;
    if (this.audio && !this.audio.paused) this.audio.pause();
    this.onState?.(false);
  }

  pause() {
    if (this.playing) this.userSeek = true;
    this.stopLoop();
  }

  seek(t) {
    this.userSeek = true;
    const wasPlaying = this.playing;
    if (wasPlaying) this.stopLoop();
    this.renderAt(Math.max(0, Math.min(t, this.timing.END - 1 / FPS)));
    if (wasPlaying) this.play({ from: this.t });
  }

  // ---------------------------------------------------------------------------
  // Exportar
  // ---------------------------------------------------------------------------
  exportPng() {
    const keep = this.t;
    this.renderAt(this.posterTime());
    return new Promise((resolve, reject) => {
      try {
        this.canvas.toBlob((b) => {
          this.renderAt(keep);
          if (b) resolve(b);
          else reject(new Error('No se pudo crear la imagen'));
        }, 'image/png');
      } catch (err) {
        this.renderAt(keep);
        reject(err);
      }
    });
  }

  /** Graba el vídeo en tiempo real (lo que dura la plantilla). onProgress(0..1) */
  async recordVideo(onProgress) {
    if (!this.tpl) throw new Error('Elige una plantilla');
    if (!this.canvas.captureStream) throw new Error('Tu navegador no puede grabar vídeo. Prueba con Chrome, Edge o Safari actualizados.');
    this.stopLoop();
    const withAudio = Boolean(this.music?.src && this.audio);
    if (withAudio) this.ensureGraph();
    const mime = pickMime(withAudio && Boolean(this.recDest));
    if (!mime) throw new Error('Tu navegador no puede grabar vídeo. Prueba con Chrome, Edge o Safari actualizados.');
    const stream = this.canvas.captureStream(FPS);
    if (withAudio && this.recDest) this.recDest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 192_000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
    const stopped = new Promise((res) => {
      rec.onstop = res;
    });
    this.recording = true;
    this.renderAt(0);
    const prevTick = this.onTick;
    this.onTick = (t, END) => {
      prevTick?.(t, END);
      onProgress?.(Math.min(1, t / END));
    };
    const finished = new Promise((res) => {
      this.finishCb = res;
    });
    try {
      rec.start(250);
      await this.play({ from: 0 });
      await finished;
      // un pelín más para que el último fotograma entre en el archivo
      await new Promise((r) => setTimeout(r, 180));
    } finally {
      this.finishCb = null;
      this.recording = false;
      this.onTick = prevTick;
      if (rec.state !== 'inactive') rec.stop();
      stream.getVideoTracks().forEach((tr) => tr.stop());
    }
    await stopped;
    const type = mime.split(';')[0];
    return { blob: new Blob(chunks, { type }), ext: type.includes('mp4') ? 'mp4' : 'webm', type };
  }

  destroy() {
    this.stopLoop();
    this.prepSeq += 1;
    clearTimeout(this.audioTimer);
    this.onAudioState = null;
    this.music = null;
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
    }
    this.dropBlob();
    this.ctx?.close?.().catch(() => {});
    this.ctx = null;
  }
}