// src/components/ui/OwnerDeleteButton.jsx
// Botón de papelera que solo ve el dueño del perfil sobre su propio contenido
// (vídeos, canciones, fotos). Pide confirmación en el propio botón (sin ventanas
// emergentes del navegador) y muestra "Borrando…" mientras se guarda.
import React, { useEffect, useState } from 'react';
import { Trash2, Check, X } from 'lucide-react';
import './OwnerDeleteButton.css';

export const OwnerDeleteButton = ({ onDelete, label = 'Borrar', className = '' }) => {
  const [step, setStep] = useState('idle'); // 'idle' | 'confirm' | 'busy'

  // Si no confirmas en unos segundos, vuelve a la papelera
  useEffect(() => {
    if (step !== 'confirm') return undefined;
    const t = setTimeout(() => setStep('idle'), 4000);
    return () => clearTimeout(t);
  }, [step]);

  const stop = (e) => {
    e.stopPropagation();
    e.preventDefault();
  };

  const confirmDelete = async (e) => {
    stop(e);
    setStep('busy');
    try {
      await onDelete();
    } catch (err) {
      console.error('No se pudo borrar:', err);
      alert(err?.message || 'No se pudo borrar. Inténtalo de nuevo.');
      setStep('idle');
    }
  };

  if (step === 'busy') {
    return (
      <span className={`owner-delete-btn is-busy ${className}`} role="status">
        <span className="owner-delete-spinner" aria-hidden="true" />
        <span>Borrando…</span>
      </span>
    );
  }

  if (step === 'confirm') {
    return (
      <span className={`owner-delete-confirm ${className}`} onClick={stop}>
        <button type="button" className="owner-delete-yes" onClick={confirmDelete}>
          <Check size={13} /> <span>{label}</span>
        </button>
        <button
          type="button"
          className="owner-delete-no"
          onClick={(e) => { stop(e); setStep('idle'); }}
          aria-label="Cancelar"
          title="Cancelar"
        >
          <X size={13} />
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`owner-delete-btn ${className}`}
      onClick={(e) => { stop(e); setStep('confirm'); }}
      aria-label={label}
      title={`${label} (solo lo ves tú)`}
    >
      <Trash2 size={14} />
    </button>
  );
};
