// src/components/ProUpgradeModal/ProUpgradeModal.jsx
import React from 'react';
import { X, Crown, Zap, Settings } from 'lucide-react';
import {
  PRO_FEATURES_ENABLED, PRO_PRICE_LABEL, PRO_PRICE_NOTE, getProBenefitsForUser, isProUser
} from '../../constants/proConfig';
import { useRaveStore } from '../../store/useRaveStore';
import './ProUpgradeModal.css';

const ROLE_LABEL = { DJ: 'DJ / Producer', Club: 'Club', Promotor: 'Promotor', Raver: 'Raver' };
const ROLE_TONE = { DJ: 'dj', Club: 'club', Promotor: 'promoter', Raver: 'raver' };

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

export const ProUpgradeModal = () => {
  const {
    isProModalOpen, proModalReason, setModal, upgradeToPro, openBillingPortal,
    user, billing, isRedirectingToPayment
  } = useRaveStore();

  if (!isProModalOpen || !PRO_FEATURES_ENABLED) return null;

  const isPro = isProUser(user);
  const benefits = getProBenefitsForUser(user);
  const roleLabel = ROLE_LABEL[user?.role] || 'Raver';
  const roleTone = ROLE_TONE[user?.role] || 'raver';
  const hasStripeSubscription = Boolean(billing?.status);

  // Texto de estado de la suscripción
  let statusLine = '';
  if (isPro && billing?.current_period_end) {
    statusLine = billing.cancel_at_period_end
      ? `PRO activo hasta el ${formatDate(billing.current_period_end)} (no se renovará)`
      : `PRO activo · se renueva el ${formatDate(billing.current_period_end)}`;
  } else if (isPro) {
    statusLine = 'PRO activo';
  }
  if (billing?.status === 'past_due') {
    statusLine = 'No hemos podido cobrar tu suscripción. Actualiza tu tarjeta para no perder PRO.';
  }

  const close = () => setModal('isProModalOpen', false);

  return (
    <div className="modal-overlay">
      <div className="modal-card pro-upgrade-card">
        <button className="modal-close" onClick={close}>
          <X size={18} />
        </button>

        <div className="pro-badge-header">
          <Crown size={18} className="icon-neon" />
          <span>RAVEXRADAR <strong>PRO</strong></span>
        </div>

        <div className="pro-hero">
          <h2 className="modal-title">{benefits.headline}</h2>
          <span className={`pro-role-chip tone-${roleTone}`}>Para {roleLabel}</span>
        </div>

        {proModalReason && <p className="pro-reason-alert">{proModalReason}</p>}
        {statusLine && <p className="pro-status-line">{statusLine}</p>}

        <div className="pro-compare" role="table" aria-label="Comparativa Gratis vs PRO">
          <div className="pro-compare-head" role="row">
            <span role="columnheader" />
            <span role="columnheader">Gratis</span>
            <span role="columnheader" className="is-pro">PRO</span>
          </div>
          {benefits.rows.map((row) => (
            <div className="pro-compare-row" role="row" key={row.label}>
              <span className="pro-compare-label" role="cell">{row.label}</span>
              <span className="pro-compare-free" role="cell">{row.free}</span>
              <span className="pro-compare-pro" role="cell">{row.pro}</span>
            </div>
          ))}
        </div>

        {!isPro && (
          <div className="pro-price-box">
            <strong>{PRO_PRICE_LABEL}</strong>
            <span>{PRO_PRICE_NOTE}</span>
          </div>
        )}

        {isPro ? (
          hasStripeSubscription ? (
            <button
              type="button"
              className="btn-secondary-outline btn-pro-manage"
              disabled={isRedirectingToPayment}
              onClick={openBillingPortal}
            >
              <Settings size={15} />
              <span>{isRedirectingToPayment ? 'Abriendo…' : 'Gestionar suscripción'}</span>
            </button>
          ) : (
            <button type="button" className="btn-neon-full" onClick={close}>
              <Crown size={16} />
              <span>Ya eres miembro PRO</span>
            </button>
          )
        ) : (
          <button
            type="button"
            className="btn-neon-full"
            disabled={isRedirectingToPayment}
            onClick={upgradeToPro}
          >
            <Zap size={16} />
            <span>{isRedirectingToPayment ? 'Abriendo pago seguro…' : 'Hazte PRO'}</span>
          </button>
        )}

        {!isPro && (
          <p className="pro-legal-note">
            Pago seguro con Stripe. Puedes cancelar cuando quieras desde aquí mismo. Al suscribirte aceptas las{' '}
            <a href="/condiciones.html" target="_blank" rel="noopener" className="legal-inline-link">condiciones</a> (4,99 €/mes,
            se renueva cada mes) y pides que PRO empiece ya.
          </p>
        )}
      </div>
    </div>
  );
};
