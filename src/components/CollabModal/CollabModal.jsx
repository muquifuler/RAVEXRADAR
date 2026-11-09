// src/components/CollabModal/CollabModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import {
  X, Handshake, Plus, Check, Edit3, Users, Send, Image as ImageIcon,
  Search, MapPin, SlidersHorizontal, Disc, Building2, Headphones,
  MessageSquare, Lock, Unlock, UserCheck
} from 'lucide-react';
import { useRaveStore } from '../../store/useRaveStore';
import { SPAIN_LOCATIONS } from '../../constants/spainLocations';
import { ELECTRONIC_GENRES } from '../../constants/electronicGenres';
import { ProSelect } from '../ui/ProSelect';
import { EmojiPicker } from '../ui/EmojiPicker';
import { OfferDetailsFields, OfferDetailsChips, EMPTY_OFFER_DETAILS, normalizeOfferDetails, cleanOfferDetails } from './OfferDetails';
import './CollabModal.css';

const ROLE_LABELS = {
  DJ: 'DJs / Producers',
  Club: 'Clubs / Salas',
  Promotor: 'Promotores'
};

export const CollabModal = () => {
  const {
    isCollabOpen, setModal, user, djs, clubs, promoters,
    collabOffers, fetchCollabData, saveCollabOffer, toggleCollabOfferStatus,
    initiateCollabRelation, inspectUserById, selectChatRoom, chatRooms
  } = useRaveStore();

  const canSendOffers = Boolean(
    user && (user.role === 'Club' || user.role === 'Promotor' || user.is_admin || user.role === 'Admin')
  );
  const isDjCreator = Boolean(user && user.role === 'DJ' && !canSendOffers);
  const canManageOffers = canSendOffers || isDjCreator;
  const DJ_MAX_ACTIVE_OFFERS = 1;

  const [activeTab, setActiveTab] = useState('feed'); // 'feed' | 'directory' | 'manage'
  const [searchQuery, setSearchQuery] = useState('');
  const [dirRoleFilter, setDirRoleFilter] = useState('ALL');
  const [dirCityFilter, setDirCityFilter] = useState('ALL');
  const [dirGenreFilter, setDirGenreFilter] = useState('ALL');

  // Estado para Crear / Editar Oferta (Clubs y Promotores)
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState(null);
  const [offerTitle, setOfferTitle] = useState('');
  const [offerDesc, setOfferDesc] = useState('');
  const [offerDetails, setOfferDetails] = useState(EMPTY_OFFER_DETAILS);
  const offerDescRef = useRef(null);
  const [offerTargets, setOfferTargets] = useState(['DJ']);
  const [offerImageFile, setOfferImageFile] = useState(null);
  const [isSavingOffer, setIsSavingOffer] = useState(false);
  const [formError, setFormError] = useState('');

  // Submodal para Aplicar a una oferta (mensaje adjunto obligatorio)
  const [applyingOffer, setApplyingOffer] = useState(null);
  const [applyMessage, setApplyMessage] = useState('');
  const [isSubmittingLink, setIsSubmittingLink] = useState(false);

  // Submodal para Enviar Oferta a un perfil del Directorio
  const [invitingProfile, setInvitingProfile] = useState(null);
  const [selectedOfferIdToSend, setSelectedOfferIdToSend] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');

  useEffect(() => {
    if (isCollabOpen && user) {
      fetchCollabData();
    }
  }, [isCollabOpen, user, fetchCollabData]);

  if (!isCollabOpen || !user) return null;

  const myOffers = (collabOffers || []).filter((o) => String(o.creator_id) === String(user.id));
  const myActiveOffers = myOffers.filter((o) => o.status === 'active');

  // Ofertas activas dirigidas al rol del usuario actual (excluyendo las creadas por uno mismo)
  const availableOffersForMe = (collabOffers || []).filter((o) => {
    if (o.status !== 'active') return false;
    if (String(o.creator_id) === String(user.id)) return false;
    const targets = Array.isArray(o.target_roles) ? o.target_roles : [];
    const matchesMyRole =
      user.is_admin || user.role === 'Admin' || targets.includes(user.role);
    const matchesSearch =
      !searchQuery.trim() ||
      o.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.creator?.username?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesMyRole && matchesSearch;
  });

  // Directorio unificado de DJs, Clubs y Promotores para que Clubs y Promotoras envíen ofertas
  const allDirectoryProfiles = [...(djs || []), ...(clubs || []), ...(promoters || [])]
    .filter((p) => String(p.id) !== String(user.id))
    .filter((p) => {
      const matchRole = dirRoleFilter === 'ALL' || p.role === dirRoleFilter;
      const matchCity = dirCityFilter === 'ALL' || p.city === dirCityFilter;
      const matchGenre =
        dirGenreFilter === 'ALL' ||
        p.favorite_subgenre === dirGenreFilter ||
        (Array.isArray(p.secondary_subgenres) && p.secondary_subgenres.includes(dirGenreFilter));
      const matchQuery =
        !searchQuery.trim() ||
        p.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.city?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchRole && matchCity && matchGenre && matchQuery;
    });

  const openCreateOfferForm = () => {
    if (isDjCreator && myActiveOffers.length >= DJ_MAX_ACTIVE_OFFERS) {
      alert('Como DJ puedes tener 1 oferta activa. Finaliza la que tienes para publicar otra.');
      return;
    }
    setEditingOffer(null);
    setOfferTitle('');
    setOfferDesc('');
    setOfferDetails(EMPTY_OFFER_DETAILS);
    setOfferTargets(['DJ']);
    setOfferImageFile(null);
    setFormError('');
    setIsFormOpen(true);
  };

  const openEditOfferForm = (offer) => {
    setEditingOffer(offer);
    setOfferTitle(offer.title || '');
    setOfferDesc(offer.description || '');
    setOfferDetails(normalizeOfferDetails(offer.details));
    setOfferTargets(Array.isArray(offer.target_roles) && offer.target_roles.length > 0 ? offer.target_roles : ['DJ']);
    setOfferImageFile(null);
    setFormError('');
    setIsFormOpen(true);
  };

  const toggleTargetRole = (roleKey) => {
    if (offerTargets.includes(roleKey)) {
      if (offerTargets.length === 1) return; // Al menos un destinatario marcado
      setOfferTargets(offerTargets.filter((r) => r !== roleKey));
    } else {
      setOfferTargets([...offerTargets, roleKey]);
    }
  };

  const handleSaveOffer = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!offerTitle.trim() || !offerDesc.trim()) {
      setFormError('Completa el título y la descripción de la oferta.');
      return;
    }
    setIsSavingOffer(true);
    try {
      await saveCollabOffer(
        {
          id: editingOffer?.id || null,
          title: offerTitle,
          description: offerDesc,
          target_roles: offerTargets,
          details: cleanOfferDetails(offerDetails, offerTargets),
          image_url: editingOffer?.image_url || null
        },
        offerImageFile
      );
      setIsFormOpen(false);
      setEditingOffer(null);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setIsSavingOffer(false);
    }
  };

  const handleConfirmApply = async (e) => {
    e.preventDefault();
    if (!applyingOffer || !applyMessage.trim()) return;
    setIsSubmittingLink(true);
    try {
      const room = await initiateCollabRelation({
        offer: applyingOffer,
        targetUser: user,
        direction: 'applied',
        message: applyMessage
      });
      setApplyingOffer(null);
      setApplyMessage('');
      if (room) {
        await selectChatRoom(room);
        setModal('isCollabOpen', false);
        setModal('isSocialDockOpen', true);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setIsSubmittingLink(false);
    }
  };

  const handleConfirmInvite = async (e) => {
    e.preventDefault();
    const chosenOffer = myActiveOffers.find((o) => String(o.id) === String(selectedOfferIdToSend));
    if (!chosenOffer || !invitingProfile || !inviteMessage.trim()) return;
    setIsSubmittingLink(true);
    try {
      const room = await initiateCollabRelation({
        offer: chosenOffer,
        targetUser: invitingProfile,
        direction: 'invited',
        message: inviteMessage
      });
      setInvitingProfile(null);
      setInviteMessage('');
      if (room) {
        await selectChatRoom(room);
        setModal('isCollabOpen', false);
        setModal('isSocialDockOpen', true);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setIsSubmittingLink(false);
    }
  };

  const handleOpenCollabChat = async (roomId) => {
    const foundRoom = (chatRooms || []).find((r) => String(r.id) === String(roomId));
    if (foundRoom) {
      await selectChatRoom(foundRoom);
    }
    setModal('isCollabOpen', false);
    setModal('isSocialDockOpen', true);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card collab-modal-card">
        <button className="modal-close" onClick={() => setModal('isCollabOpen', false)}>
          <X size={18} />
        </button>

        <div className="collab-header">
          <div className="collab-title-group modal-icon-header">
            <Handshake size={24} className="icon-neon" />
            <div>
              <h2 className="modal-title">CENTRAL DE COLABORACIONES</h2>
              <p className="modal-subtitle" style={{ marginBottom: 0 }}>
                Conecta con Clubs, Promotores y DJs mediante ofertas directas y salas de colaboración dedicadas.
              </p>
            </div>
          </div>

          <div className="ranking-mode-pills">
            <button
              type="button"
              className={activeTab === 'feed' ? 'active' : ''}
              onClick={() => setActiveTab('feed')}
            >
              <Handshake size={14} />
              <span>Ofertas para {user.role} ({availableOffersForMe.length})</span>
            </button>

            {canManageOffers && (
              <>
                {canSendOffers && (
                  <button
                    type="button"
                    className={activeTab === 'directory' ? 'active' : ''}
                    onClick={() => setActiveTab('directory')}
                  >
                    <Users size={14} />
                    <span>Buscar DJs / Clubs / Promotores</span>
                  </button>
                )}

                <button
                  type="button"
                  className={activeTab === 'manage' ? 'active' : ''}
                  onClick={() => setActiveTab('manage')}
                >
                  <Edit3 size={14} />
                  <span>Mis Ofertas ({myOffers.length})</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* PESTAÑA 1: OFERTAS ACTIVAS DIRIGIDAS A MI TIPO DE USUARIO */}
        {activeTab === 'feed' && (
          <div className="collab-tab-body">
            <div className="collab-search-bar">
              <Search size={15} className="icon-neon" />
              <input
                type="text"
                placeholder="Buscar ofertas por título, descripción o creador..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="collab-offers-grid">
              {availableOffersForMe.length === 0 ? (
                <div className="ranking-empty">
                  No hay ofertas activas dirigidas a {user.role} en este momento.
                </div>
              ) : (
                availableOffersForMe.map((offer) => {
                  const myLink = (offer.links || []).find(
                    (l) => String(l.target_user_id) === String(user.id)
                  );
                  const creatorRole = offer.creator?.role || 'Promotor';

                  return (
                    <div key={offer.id} className="collab-offer-card">
                      {offer.image_url && (
                        <img src={offer.image_url} alt={offer.title} className="collab-offer-banner" />
                      )}

                      <div className="collab-offer-content">
                        <div className="collab-offer-top">
                          <button
                            type="button"
                            className="collab-creator-pill"
                            onClick={() => {
                              setModal('isCollabOpen', false);
                              inspectUserById(offer.creator_id);
                            }}
                          >
                            {offer.creator?.avatar_url ? (
                              <img src={offer.creator.avatar_url} alt={offer.creator.username} referrerPolicy="no-referrer" />
                            ) : (
                              <Disc size={14} className="icon-neon" />
                            )}
                            <strong>@{offer.creator?.username || 'Organizador'}</strong>
                            <span className={`chat-role-mini-badge role-${creatorRole.toLowerCase()}`}>
                              {creatorRole === 'Club' ? 'Club / Sala' : creatorRole}
                            </span>
                          </button>

                          <div className="collab-targets-row">
                            {(offer.target_roles || []).map((tr) => (
                              <span key={tr} className="collab-target-tag">
                                Busca: {tr}
                              </span>
                            ))}
                          </div>
                        </div>

                        <h3 className="collab-offer-title">{offer.title}</h3>
                        <OfferDetailsChips details={offer.details} />
                        <p className="collab-offer-desc">{offer.description}</p>

                        <div className="collab-offer-footer">
                          {myLink ? (
                            <button
                              type="button"
                              className="btn-collab-chat-open"
                              onClick={() => handleOpenCollabChat(myLink.room_id)}
                            >
                              <MessageSquare size={14} />
                              <span>
                                {myLink.direction === 'applied' ? '✓ Ya aplicaste' : '✓ Te enviaron esta oferta'} · Abrir Chat de Colaboración
                              </span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn-neon-full"
                              onClick={() => {
                                setApplyingOffer(offer);
                                setApplyMessage('');
                              }}
                            >
                              <Send size={14} />
                              <span>Aplicar a esta Oferta</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* PESTAÑA 2 (SOLO CLUBS Y PROMOTORES): DIRECTORIO DE DJS, CLUBS Y PROMOTORES PARA ENVIAR OFERTA */}
        {activeTab === 'directory' && canSendOffers && (
          <div className="collab-tab-body">
            <div className="ranking-filters-bar">
              <div className="ranking-search-input">
                <Search size={14} className="icon-neon" />
                <input
                  type="text"
                  placeholder="Buscar DJ, Club o Promotor por @nombre..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <ProSelect
                icon={Users}
                value={dirRoleFilter}
                options={[
                  { value: 'ALL', label: 'Todos (DJs, Clubs, Promotores)' },
                  { value: 'DJ', label: 'Solo DJs / Producers' },
                  { value: 'Club', label: 'Solo Clubs / Salas' },
                  { value: 'Promotor', label: 'Solo Promotores' }
                ]}
                onChange={setDirRoleFilter}
              />

              <ProSelect
                icon={MapPin}
                value={dirCityFilter}
                options={[{ value: 'ALL', label: 'Toda España' }, ...SPAIN_LOCATIONS]}
                onChange={setDirCityFilter}
              />

              <ProSelect
                icon={SlidersHorizontal}
                value={dirGenreFilter}
                options={[
                  { value: 'ALL', label: 'Todos los géneros' },
                  ...ELECTRONIC_GENRES.map((g) => ({ value: g, label: g }))
                ]}
                onChange={setDirGenreFilter}
              />
            </div>

            <div className="collab-directory-list">
              {allDirectoryProfiles.length === 0 ? (
                <div className="ranking-empty">No se encontraron perfiles con estos filtros.</div>
              ) : (
                allDirectoryProfiles.map((prof) => (
                  <div key={prof.id} className="ranking-row">
                    <div
                      className="rank-avatar"
                      onClick={() => {
                        setModal('isCollabOpen', false);
                        inspectUserById(prof.id);
                      }}
                    >
                      {prof.avatar_url ? (
                        <img src={prof.avatar_url} alt={prof.username} referrerPolicy="no-referrer" />
                      ) : (
                        <Disc size={20} className="icon-neon" />
                      )}
                    </div>

                    <div
                      className="rank-info"
                      onClick={() => {
                        setModal('isCollabOpen', false);
                        inspectUserById(prof.id);
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <strong>@{prof.username}</strong>
                        <span className={`chat-role-mini-badge role-${(prof.role || 'DJ').toLowerCase()}`}>
                          {prof.role === 'Club' ? 'Club / Sala' : prof.role === 'DJ' ? 'DJ / Producer' : 'Promotor'}
                        </span>
                      </div>
                      <div className="rank-meta-pills">
                        <span><MapPin size={11} /> {prof.city || 'Madrid'}</span>
                        <span><SlidersHorizontal size={11} /> {prof.favorite_subgenre || 'Techno'}</span>
                      </div>
                    </div>

                    <div className="rank-actions">
                      <button
                        type="button"
                        className="btn-rank-listen"
                        onClick={() => {
                          setModal('isCollabOpen', false);
                          inspectUserById(prof.id);
                        }}
                      >
                        <span>Ver Perfil</span>
                      </button>

                      <button
                        type="button"
                        className="btn-rank-hype"
                        onClick={() => {
                          const matchingOffers = myActiveOffers.filter((o) =>
                            (o.target_roles || []).includes(prof.role)
                          );
                          const defaultOffer = matchingOffers[0] || myActiveOffers[0] || null;
                          setSelectedOfferIdToSend(defaultOffer ? defaultOffer.id : '');
                          setInvitingProfile(prof);
                          setInviteMessage('');
                        }}
                      >
                        <Send size={13} />
                        <span>Enviar Oferta</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* PESTAÑA 3 (SOLO CLUBS Y PROMOTORES): MIS OFERTAS Y GESTIÓN DE VINCULADOS */}
        {activeTab === 'manage' && canManageOffers && (
          <div className="collab-tab-body">
            <div className="collab-manage-topbar">
              <span>
                {isDjCreator
                  ? 'Publica una oferta para otros DJs (B2B, warm-up, producción…). Puedes tener 1 activa; los DJs interesados aplicarán y se abrirá un chat.'
                  : 'Gestiona tus ofertas publicadas, edítalas o revisa quiénes han aplicado o recibido tu invitación.'}
              </span>
              <button
                type="button"
                className="btn-neon-full"
                style={{ width: 'auto', padding: '9px 16px' }}
                onClick={openCreateOfferForm}
                disabled={isDjCreator && myActiveOffers.length >= DJ_MAX_ACTIVE_OFFERS}
                title={isDjCreator && myActiveOffers.length >= DJ_MAX_ACTIVE_OFFERS ? 'Ya tienes 1 oferta activa' : ''}
              >
                <Plus size={15} /> Crear Nueva Oferta
              </button>
            </div>

            {isFormOpen && (
              <form onSubmit={handleSaveOffer} className="collab-offer-form-box">
                <div className="collab-form-header">
                  <strong>{editingOffer ? 'Editar Oferta de Colaboración' : 'Nueva Oferta de Colaboración'}</strong>
                  <button type="button" onClick={() => setIsFormOpen(false)}><X size={15} /></button>
                </div>

                {formError && <div className="add-event-error">{formError}</div>}

                <div className="pro-form-grid-2">
                  <input
                    type="text"
                    className="pro-input"
                    required
                    placeholder="Título de la oferta (ej. Buscamos Warm-up DJ 155 BPM / Co-producción Sala)..."
                    value={offerTitle}
                    onChange={(e) => setOfferTitle(e.target.value)}
                  />

                  <label className="avatar-upload-label" style={{ margin: 0 }}>
                    <ImageIcon size={15} />
                    <span>
                      {offerImageFile
                        ? offerImageFile.name
                        : editingOffer?.image_url
                        ? '✓ Imagen subida (Cambiar)'
                        : 'Subir Imagen Opcional'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setOfferImageFile(e.target.files?.[0] || null)}
                    />
                  </label>
                </div>

                <div className="collab-target-checkboxes">
                  <span className="mini-field-label">Dirigido a (selecciona uno o varios):</span>
                  <div className="collab-checks-row">
                    {(isDjCreator ? ['DJ'] : ['DJ', 'Club', 'Promotor']).map((rKey) => {
                      const isChecked = offerTargets.includes(rKey);
                      return (
                        <label key={rKey} className={`collab-check-pill ${isChecked ? 'checked' : ''}`}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleTargetRole(rKey)}
                          />
                          {isChecked && <Check size={12} />}
                          <span>{ROLE_LABELS[rKey]}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <OfferDetailsFields value={offerDetails} onChange={setOfferDetails} targets={offerTargets} />

                <div className="rich-textarea-wrap">
                  <textarea
                    ref={offerDescRef}
                    rows="4"
                    className="pro-input"
                    required
                    placeholder="Describe la propuesta: qué buscáis, condiciones, ambiente de la fiesta…"
                    value={offerDesc}
                    onChange={(e) => setOfferDesc(e.target.value)}
                  />
                  <EmojiPicker targetRef={offerDescRef} value={offerDesc} onChange={setOfferDesc} />
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn-secondary-outline" onClick={() => setIsFormOpen(false)}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn-neon-full" style={{ width: 'auto', padding: '10px 20px' }} disabled={isSavingOffer}>
                    <Check size={15} />
                    <span>{isSavingOffer ? 'Guardando...' : editingOffer ? 'Guardar Cambios' : 'Publicar Oferta'}</span>
                  </button>
                </div>
              </form>
            )}

            <div className="collab-offers-grid">
              {myOffers.length === 0 ? (
                <div className="ranking-empty">
                  Aún no has creado ninguna oferta de colaboración. Pulsa &quot;Crear Nueva Oferta&quot; arriba.
                </div>
              ) : (
                myOffers.map((offer) => {
                  const links = offer.links || [];
                  return (
                    <div key={offer.id} className={`collab-offer-card ${offer.status === 'closed' ? 'is-closed' : ''}`}>
                      <div className="collab-offer-content">
                        <div className="collab-offer-top">
                          <div className="collab-targets-row">
                            <span className={`collab-status-pill ${offer.status}`}>
                              {offer.status === 'active' ? '● ACTIVA' : '■ FINALIZADA'}
                            </span>
                            {(offer.target_roles || []).map((tr) => (
                              <span key={tr} className="collab-target-tag">
                                Dirigido a: {tr}
                              </span>
                            ))}
                          </div>

                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              className="btn-collab-mini"
                              onClick={() => openEditOfferForm(offer)}
                            >
                              <Edit3 size={13} /> Editar
                            </button>
                            <button
                              type="button"
                              className="btn-collab-mini"
                              onClick={() => {
                                if (isDjCreator && offer.status !== 'active' && myActiveOffers.length >= DJ_MAX_ACTIVE_OFFERS) {
                                  alert('Como DJ solo puedes tener 1 oferta activa. Finaliza la otra para reabrir esta.');
                                  return;
                                }
                                toggleCollabOfferStatus(offer);
                              }}
                            >
                              {offer.status === 'active' ? <><Lock size={13} /> Finalizar</> : <><Unlock size={13} /> Reabrir</>}
                            </button>
                          </div>
                        </div>

                        <h3 className="collab-offer-title">{offer.title}</h3>
                        <OfferDetailsChips details={offer.details} />
                        <p className="collab-offer-desc">{offer.description}</p>

                        {/* Listado de usuarios vinculados a esta oferta (Aplicaron o Invitados) */}
                        <div className="collab-linked-users-box">
                          <span className="mini-field-label">
                            <UserCheck size={12} className="icon-neon" /> Usuarios vinculados a esta oferta ({links.length}):
                          </span>

                          {links.length === 0 ? (
                            <p className="collab-no-links">Aún no hay aplicaciones ni envíos para esta oferta.</p>
                          ) : (
                            <div className="collab-links-list">
                              {links.map((lk) => {
                                const tProf = lk.target;
                                const tRole = tProf?.role || 'DJ';
                                return (
                                  <div key={lk.id} className="collab-link-row">
                                    <div
                                      className="collab-link-user"
                                      onClick={() => {
                                        setModal('isCollabOpen', false);
                                        inspectUserById(lk.target_user_id);
                                      }}
                                    >
                                      {tProf?.avatar_url ? (
                                        <img src={tProf.avatar_url} alt={tProf.username} referrerPolicy="no-referrer" />
                                      ) : (
                                        <Disc size={16} className="icon-neon" />
                                      )}
                                      <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          <strong>@{tProf?.username || 'Usuario'}</strong>
                                          <span className={`chat-role-mini-badge role-${tRole.toLowerCase()}`}>
                                            {tRole === 'Club' ? 'Club / Sala' : tRole}
                                          </span>
                                          <span className={`collab-dir-badge ${lk.direction}`}>
                                            {lk.direction === 'applied' ? 'Ha aplicado' : 'Oferta enviada'}
                                          </span>
                                        </div>
                                        <p className="collab-link-msg">&ldquo;{lk.initial_message}&rdquo;</p>
                                      </div>
                                    </div>

                                    <button
                                      type="button"
                                      className="btn-collab-mini neon"
                                      onClick={() => handleOpenCollabChat(lk.room_id)}
                                    >
                                      <MessageSquare size={13} /> Abrir Chat
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* SUBMODAL 1: APLICAR A UNA OFERTA CON MENSAJE ADJUNTO */}
        {applyingOffer && (
          <div className="collab-submodal-backdrop" onClick={() => setApplyingOffer(null)}>
            <form
              onSubmit={handleConfirmApply}
              className="collab-submodal-card"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="collab-form-header">
                <strong>Aplicar a: {applyingOffer.title}</strong>
                <button type="button" onClick={() => setApplyingOffer(null)}><X size={16} /></button>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Escribe un mensaje de presentación para <strong>@{applyingOffer.creator?.username}</strong>. Se abrirá un chat de colaboración directo entre ambos.
              </p>
              <textarea
                rows="3"
                required
                className="pro-input"
                placeholder="Escribe tu propuesta, disponibilidad o enlaces para esta oferta..."
                value={applyMessage}
                onChange={(e) => setApplyMessage(e.target.value)}
              />
              <button type="submit" className="btn-neon-full" disabled={isSubmittingLink || !applyMessage.trim()}>
                <Send size={15} />
                <span>{isSubmittingLink ? 'Iniciando colaboración...' : 'Enviar Aplicación y Abrir Chat'}</span>
              </button>
            </form>
          </div>
        )}

        {/* SUBMODAL 2: ENVIAR UNA DE MIS OFERTAS ACTIVAS A UN PERFIL DEL DIRECTORIO */}
        {invitingProfile && (
          <div className="collab-submodal-backdrop" onClick={() => setInvitingProfile(null)}>
            <form
              onSubmit={handleConfirmInvite}
              className="collab-submodal-card"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="collab-form-header">
                <strong>Enviar Oferta a @{invitingProfile.username} ({invitingProfile.role})</strong>
                <button type="button" onClick={() => setInvitingProfile(null)}><X size={16} /></button>
              </div>

              {myActiveOffers.length === 0 ? (
                <div className="ranking-empty" style={{ padding: '16px' }}>
                  Primero debes crear una oferta activa en la pestaña &quot;Mis Ofertas&quot; para poder enviársela a un perfil.
                  <button
                    type="button"
                    className="btn-neon-full"
                    style={{ marginTop: '10px' }}
                    onClick={() => {
                      setInvitingProfile(null);
                      setActiveTab('manage');
                      openCreateOfferForm();
                    }}
                  >
                    <Plus size={15} /> Crear Mi Primera Oferta
                  </button>
                </div>
              ) : (
                <>
                  <label className="mini-field-label">Selecciona cuál de tus ofertas activas quieres enviarle:</label>
                  <select
                    className="pro-input"
                    required
                    value={selectedOfferIdToSend}
                    onChange={(e) => setSelectedOfferIdToSend(e.target.value)}
                  >
                    {myActiveOffers.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.title} (Dirigido a: {(o.target_roles || []).join(', ')})
                      </option>
                    ))}
                  </select>

                  <label className="mini-field-label">Mensaje personalizado adjunto:</label>
                  <textarea
                    rows="3"
                    required
                    className="pro-input"
                    placeholder={`Hola @${invitingProfile.username}, te enviamos esta propuesta de colaboración...`}
                    value={inviteMessage}
                    onChange={(e) => setInviteMessage(e.target.value)}
                  />

                  <button
                    type="submit"
                    className="btn-neon-full"
                    disabled={isSubmittingLink || !selectedOfferIdToSend || !inviteMessage.trim()}
                  >
                    <Send size={15} />
                    <span>{isSubmittingLink ? 'Enviando oferta...' : 'Enviar Oferta e Iniciar Chat de Colaboración'}</span>
                  </button>
                </>
              )}
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
