// src/components/OnboardingModal/OnboardingModal.jsx
import React, { useState, useEffect } from 'react';
import { Zap, Headphones, Disc, Flame, CheckCircle2, Sparkles, Building2, ShieldAlert } from 'lucide-react';
import { useRaveStore } from '../../store/useRaveStore';
import './OnboardingModal.css';

const ROLE_CARDS = [
  {
    id: 'Raver',
    title: 'Usuario / Raver',
    subtitle: 'Descubre raves, desbloquea Secret Locations, busca Rave Squad y chatea con amigos.',
    icon: Flame,
    accent: '#facc15'
  },
  {
    id: 'DJ',
    title: 'DJ / Productor',
    subtitle: 'Aparece en el mapa, sube tus sesiones y canciones, comparte tus redes y compite en el Ranking.',
    icon: Headphones,
    accent: '#ff5500'
  },
  {
    id: 'Promotor',
    title: 'Promotor / Colectivo',
    subtitle: 'Aparece en el mapa, publica tus fiestas o Secret Locations, sube vídeos/fotos y arma el Lineup.',
    icon: Disc,
    accent: '#f43f5e'
  },
  {
    id: 'Club',
    title: 'Club / Sala',
    subtitle: 'Registra tu sala oficial en el mapa para agrupar tus eventos, subir vídeos/fotos y vincular promotores.',
    icon: Building2,
    accent: '#06b6d4'
  }
];

export const OnboardingModal = () => {
  const { isOnboardingOpen, user, autoApproveRoles, completeOnboardingRole, fetchAppSettings } = useRaveStore();
  const [selectedRole, setSelectedRole] = useState('Raver');
  const [verificationMsg, setVerificationMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // PUNTO 4: Todos los Hooks (incluido useEffect) DEBEN ejecutarse antes de cualquier return condicional
  useEffect(() => {
    if (isOnboardingOpen) {
      fetchAppSettings();
    }
  }, [isOnboardingOpen, fetchAppSettings]);

  if (!isOnboardingOpen || !user) return null;

  const requiresVerification = selectedRole !== 'Raver' && !autoApproveRoles;

  const handleConfirm = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    await completeOnboardingRole(selectedRole, verificationMsg);
    setIsSaving(false);
  };

  return (
    <div className="modal-overlay">
      <form onSubmit={handleConfirm} className="modal-card onboarding-card">
        <div className="onboarding-badge">
          <Sparkles size={14} className="icon-neon" />
          <span>BIENVENIDO A RAVERADAR, @{user.username}</span>
        </div>

        <h2 className="modal-title">¿Cuál es tu rol en la escena?</h2>
        <p className="onboarding-reassure">
          Si eliges <strong>Usuario / Raver</strong> podrás solicitar cambiar de rol más adelante desde tu perfil. <strong>Importante:</strong> los perfiles de <strong>DJ, Promotor y Club</strong> son definitivos una vez activados y no pueden cambiar de rol después.
        </p>

        <div className="onboarding-roles-grid">
          {ROLE_CARDS.map((card) => {
            const IconComponent = card.icon;
            const isSelected = selectedRole === card.id;
            return (
              <button
                type="button"
                key={card.id}
                className={`onboarding-role-option ${isSelected ? 'selected' : ''}`}
                style={{ '--role-color': card.accent }}
                onClick={() => setSelectedRole(card.id)}
              >
                <div className="role-option-icon">
                  <IconComponent size={22} />
                </div>
                <div className="role-option-text">
                  <strong>{card.title}</strong>
                  <span>{card.subtitle}</span>
                </div>
                {isSelected && <CheckCircle2 size={18} className="role-check-icon" />}
              </button>
            );
          })}
        </div>

        {requiresVerification && (
          <div className="verification-request-box">
            <div className="verification-request-header">
              <ShieldAlert size={15} className="icon-neon" />
              <span>
                <strong>Verificación requerida para {selectedRole === 'DJ' ? 'DJ / Productor' : selectedRole === 'Club' ? 'Club / Sala' : 'Promotor'}:</strong> Mientras revisamos tu solicitud entrarás como <strong>Raver</strong> y verás el estado en tu campanita de notificaciones.
              </span>
            </div>
            <textarea
              rows="2"
              required
              className="pro-input"
              placeholder="Escribe un mensaje para el administrador (enlaces a tu Instagram, SoundCloud, web del club o colectivo para verificarte)..."
              value={verificationMsg}
              onChange={(e) => setVerificationMsg(e.target.value)}
            />
          </div>
        )}

        <button
          type="submit"
          className="btn-neon-full"
          disabled={isSaving}
        >
          <Zap size={16} />
          <span>
            {isSaving
              ? 'Procesando...'
              : requiresVerification
              ? `Enviar Solicitud de ${selectedRole} y Entrar`
              : `Continuar como ${selectedRole === 'DJ' ? 'DJ / Productor' : selectedRole}`}
          </span>
        </button>
      </form>
    </div>
  );
};