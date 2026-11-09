// src/components/ui/InstallAppPrompt.jsx
// Aviso "Instala RAVEXRADAR".
// - Chrome / Edge / Android: botón que abre la instalación del navegador.
// - iPhone / iPad: guía de 2 pasos (Compartir › Añadir a pantalla de inicio), porque Safari
//   no permite instalar desde un botón de la web.
// Sale solo tras un rato de uso, no vuelve en 14 días si lo cierras y nunca si ya está instalada.
// Se puede abrir a mano desde cualquier sitio con openInstallPrompt().
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Share, PlusSquare, Zap, Maximize2 } from 'lucide-react';
import './InstallAppPrompt.css';

const DISMISS_KEY = 'rr_install_dismissed_at';
const DISMISS_DAYS = 14;
const AUTO_SHOW_AFTER_MS = 30000;
const OPEN_EVENT = 'rr:open-install';

/** Abre el aviso desde un botón ("Instalar app" del menú, por ejemplo) */
export const openInstallPrompt = () => window.dispatchEvent(new CustomEvent(OPEN_EVENT));

export const isAppInstalled = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);

const isIOS = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

const recentlyDismissed = () => {
  try {
    const t = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return t && Date.now() - t < DISMISS_DAYS * 86400000;
  } catch {
    return false;
  }
};

export const InstallAppPrompt = ({ lang = 'es' }) => {
  const [deferred, setDeferred] = useState(null); // evento beforeinstallprompt guardado
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState(null); // 'native' | 'ios' | 'manual'
  const [installed, setInstalled] = useState(isAppInstalled);
  const es = lang !== 'en';

  // Chrome / Edge / Android avisan cuando la web se puede instalar
  useEffect(() => {
    const onBeforeInstall = (e) => {
      e.preventDefault(); // sin la mini-barra del navegador: usamos nuestro aviso
      setDeferred(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setVisible(false);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // Aparición automática tras un rato de uso
  useEffect(() => {
    if (installed || recentlyDismissed()) return undefined;
    const t = setTimeout(() => {
      if (deferred) {
        setMode('native');
        setVisible(true);
      } else if (isIOS()) {
        setMode('ios');
        setVisible(true);
      }
    }, AUTO_SHOW_AFTER_MS);
    return () => clearTimeout(t);
  }, [deferred, installed]);

  // Apertura manual desde un botón
  useEffect(() => {
    const onOpen = () => {
      setMode(deferred ? 'native' : isIOS() ? 'ios' : 'manual');
      setVisible(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [deferred]);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* sin almacenamiento: no pasa nada */
    }
  };

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    const { outcome } = await deferred.userChoice.catch(() => ({ outcome: 'dismissed' }));
    setDeferred(null); // el navegador solo deja usarlo una vez
    if (outcome === 'accepted') setVisible(false);
    else dismiss();
  };

  if (!visible) return null;

  return createPortal(
    <div className="install-prompt" role="dialog" aria-label={es ? 'Instalar la app' : 'Install the app'}>
      <button type="button" className="install-prompt-close" onClick={dismiss} aria-label={es ? 'Cerrar' : 'Close'}>
        <X size={16} />
      </button>

      <div className="install-prompt-head">
        <img src="/icons/icon-192.png" alt="" className="install-prompt-icon" />
        <div>
          <strong>{installed ? (es ? 'Ya tienes la app' : 'App installed') : es ? 'Instala RAVEXRADAR' : 'Install RAVEXRADAR'}</strong>
          <span>
            {installed
              ? es ? 'Ábrela desde el icono de tu pantalla de inicio.' : 'Open it from your home screen.'
              : es ? 'Abre el mapa con un toque, a pantalla completa.' : 'Open the map in one tap, full screen.'}
          </span>
        </div>
      </div>

      {!installed && mode === 'native' && (
        <>
          <ul className="install-prompt-perks">
            <li><Zap size={13} /> {es ? 'Acceso directo en tu móvil u ordenador' : 'Shortcut on your phone or computer'}</li>
            <li><Maximize2 size={13} /> {es ? 'Sin barra del navegador' : 'No browser bar'}</li>
          </ul>
          <div className="install-prompt-actions">
            <button type="button" className="install-btn-secondary" onClick={dismiss}>
              {es ? 'Ahora no' : 'Not now'}
            </button>
            <button type="button" className="install-btn-primary" onClick={install}>
              <Download size={16} /> {es ? 'Instalar' : 'Install'}
            </button>
          </div>
        </>
      )}

      {!installed && mode === 'ios' && (
        <ol className="install-prompt-steps">
          <li>
            <span className="install-step-num">1</span>
            <span>
              {es ? 'Pulsa' : 'Tap'} <Share size={15} className="install-inline-icon" /> <strong>{es ? 'Compartir' : 'Share'}</strong>{' '}
              {es ? 'en la barra del navegador' : 'in the browser bar'}
            </span>
          </li>
          <li>
            <span className="install-step-num">2</span>
            <span>
              {es ? 'Elige' : 'Choose'} <PlusSquare size={15} className="install-inline-icon" />{' '}
              <strong>{es ? 'Añadir a pantalla de inicio' : 'Add to Home Screen'}</strong>
            </span>
          </li>
        </ol>
      )}

      {!installed && mode === 'manual' && (
        <p className="install-prompt-manual">
          {es
            ? 'Abre el menú de tu navegador (⋮ o ⋯) y elige «Instalar app» o «Añadir a pantalla de inicio». En Firefox de ordenador no está disponible: prueba con Chrome o Edge.'
            : 'Open your browser menu (⋮ or ⋯) and choose “Install app” or “Add to Home Screen”. Not available in desktop Firefox: try Chrome or Edge.'}
        </p>
      )}
    </div>,
    document.body
  );
};
