// src/components/MediaLightboxModal/MediaLightboxModal.jsx
import React, { useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, Film, Image as ImageIcon } from 'lucide-react';
import { useRaveStore } from '../../store/useRaveStore';
import { announceMediaTakeover, syncInlineVideoTime } from '../../lib/mediaSync';
import { RaveVideo } from '../ui/RaveVideo';
import './MediaLightboxModal.css';

export const MediaLightboxModal = () => {
  const {
    isLightboxOpen,
    lightboxMediaList,
    lightboxIndex,
    lightboxResumeTimes,
    closeMediaLightbox: closeStoreLightbox,
    nextLightboxMedia,
    prevLightboxMedia
  } = useRaveStore();

  const videoRef = useRef(null);
  // Último segundo visto de cada vídeo dentro del visor (por si navegas y vuelves)
  const watchedTimesRef = useRef({});

  const currentItem = isLightboxOpen && lightboxMediaList?.length
    ? lightboxMediaList[lightboxIndex] || lightboxMediaList[0]
    : null;
  const isVideo = currentItem?.type === 'video';

  // Al abrir el visor se olvidan los tiempos de la vez anterior
  useEffect(() => {
    if (isLightboxOpen) watchedTimesRef.current = {};
  }, [isLightboxOpen]);

  // Si lo que se ve ampliado es un vídeo, para todo lo que suene en los paneles
  useEffect(() => {
    if (isVideo) announceMediaTakeover();
  }, [isVideo, currentItem?.url]);

  // Al cerrar: el vídeo del panel se queda en el segundo por el que ibas aquí
  const closeMediaLightbox = () => {
    Object.entries(watchedTimesRef.current).forEach(([url, t]) => syncInlineVideoTime(url, t));
    closeStoreLightbox();
  };

  const handleVideoLoaded = (e) => {
    const el = e.currentTarget;
    const url = currentItem?.url;
    const resumeAt = watchedTimesRef.current[url] ?? lightboxResumeTimes?.[url] ?? 0;
    if (resumeAt > 0.5 && (!el.duration || resumeAt < el.duration - 0.5)) {
      el.currentTime = resumeAt;
    }
  };

  const rememberVideoTime = (e) => {
    if (currentItem?.url) watchedTimesRef.current[currentItem.url] = e.currentTarget.currentTime;
  };

  useEffect(() => {
    if (!isLightboxOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') closeMediaLightbox();
      if (e.key === 'ArrowRight') nextLightboxMedia();
      if (e.key === 'ArrowLeft') prevLightboxMedia();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLightboxOpen, closeMediaLightbox, nextLightboxMedia, prevLightboxMedia]);

  if (!currentItem) return null;

  const hasMultiple = lightboxMediaList.length > 1;

  return (
    <div className="lightbox-overlay" onClick={closeMediaLightbox}>
      <div className="lightbox-container" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="lightbox-close-btn" onClick={closeMediaLightbox}>
          <X size={20} />
        </button>

        {hasMultiple && (
          <button
            type="button"
            className="lightbox-nav-btn prev"
            onClick={prevLightboxMedia}
            title="Anterior"
          >
            <ChevronLeft size={28} />
          </button>
        )}

        <div className="lightbox-stage">
          {currentItem.type === 'video' ? (
            <RaveVideo
              ref={videoRef}
              key={currentItem.url}
              src={currentItem.url}
              autoPlay
              className="lightbox-media-element"
              onLoadedMetadata={handleVideoLoaded}
              onTimeUpdate={rememberVideoTime}
              onPause={rememberVideoTime}
              onPlay={announceMediaTakeover}
            />
          ) : (
            <img
              key={currentItem.url}
              src={currentItem.url}
              alt={currentItem.title || 'Galería'}
              className="lightbox-media-element"
            />
          )}

          <div className="lightbox-caption-bar">
            <span className="lightbox-type-badge">
              {currentItem.type === 'video' ? (
                <><Film size={13} /> VÍDEO</>
              ) : (
                <><ImageIcon size={13} /> IMAGEN</>
              )}
            </span>
            <strong>{currentItem.title || 'Galería Multimedia'}</strong>
            <span className="lightbox-counter">
              {lightboxIndex + 1} / {lightboxMediaList.length}
            </span>
          </div>
        </div>

        {hasMultiple && (
          <button
            type="button"
            className="lightbox-nav-btn next"
            onClick={nextLightboxMedia}
            title="Siguiente"
          >
            <ChevronRight size={28} />
          </button>
        )}
      </div>
    </div>
  );
};
