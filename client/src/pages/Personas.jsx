import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Archive, ArrowRight, Copy, Filter, Layers3, Mic, Plus, Search, Sparkles, Trash2, User, Users, X } from 'lucide-react';
import ConfirmModal from '../ConfirmModal';
import Tooltip from '../components/common/Tooltip';
import LinkedMapsModal from '../components/common/LinkedMapsModal';
import PortraitGenerationModal from '../components/personas/PortraitGenerationModal';

const dominantForceLabel = (value, t) => {
  if (!value) return t('personas.portraits.dominantForces.unknown');
  return t(`personas.portraits.dominantForces.${value}`, { defaultValue: value });
};

const Personas = ({
  personas = [],
  portraits = [],
  interviews = [],
  interviewFolders = [],
  currentUserId,
  isWorkspaceOwner,
  onCreate,
  onEdit,
  onDelete,
  onDuplicate,
  onArchive,
  onGeneratePortrait,
  onDeletePortrait,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'portraits' ? 'portraits' : 'personas';
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, action: null, item: null });
  const [linkedMapsConfig, setLinkedMapsConfig] = useState({ isOpen: false, items: [], title: '' });
  const [isGeneratePortraitModalOpen, setIsGeneratePortraitModalOpen] = useState(false);

  const roles = useMemo(() => [...new Set(personas.map((p) => p.role).filter(Boolean))], [personas]);
  const locations = useMemo(() => [...new Set(personas.map((p) => p.location).filter(Boolean))], [personas]);

  const filteredPersonas = useMemo(() => personas.filter((persona) => {
    const matchesSearch =
      persona.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (persona.role || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = selectedRole ? persona.role === selectedRole : true;
    const matchesLocation = selectedLocation ? persona.location === selectedLocation : true;
    return matchesSearch && matchesRole && matchesLocation;
  }), [personas, searchTerm, selectedRole, selectedLocation]);

  const filteredPortraits = useMemo(() => portraits.filter((portrait) => {
    const portraitData = portrait.portraitData || {};
    const searchable = [
      portrait.title,
      portraitData.archetype,
      portraitData.summary,
      portrait.sourceInterviewTitle,
      ...(portrait.sourceInterviewTitles || []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return searchable.includes(searchTerm.toLowerCase());
  }), [portraits, searchTerm]);

  const handleConfirmAction = async () => {
    const { action, item } = confirmConfig;

    if (action === 'delete' && onDelete) {
      onDelete(item.id);
    }
    if (action === 'duplicate' && onDuplicate) {
      onDuplicate(item);
    }
    if (action === 'deletePortrait' && onDeletePortrait) {
      await onDeletePortrait(item.id);
    }

    setConfirmConfig({ isOpen: false, action: null, item: null });
  };

  const openConfirm = (action, item) => {
    setConfirmConfig({ isOpen: true, action, item });
  };

  const openCreateAction = () => {
    if (activeTab === 'personas') {
      onCreate?.();
      return;
    }
    setIsGeneratePortraitModalOpen(true);
  };

  const switchTab = (tabKey) => {
    const nextParams = new URLSearchParams(searchParams);
    if (tabKey === 'portraits') {
      nextParams.set('tab', 'portraits');
    } else {
      nextParams.delete('tab');
    }
    setSearchParams(nextParams, { replace: true });
  };

  return (
    <div className="p-8 app-shell-bg min-h-screen font-sans text-gray-900" data-testid="personas-page">
      <header className="flex flex-col gap-4 mb-6">
        <div className="flex justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
              <Users className="text-gray-400" /> {t('personas.title')}
            </h1>
            <p className="text-sm text-gray-500 mt-1">{t('personas.workspaceDesc')}</p>
          </div>
          <button
            onClick={openCreateAction}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm transition-colors"
            data-testid={activeTab === 'personas' ? 'new-persona-button' : 'generate-portrait-button'}
          >
            {activeTab === 'personas' ? <Plus size={18} /> : <Sparkles size={18} />}
            {activeTab === 'personas' ? t('personas.createPersona') : t('personas.portraits.generateButton')}
          </button>
        </div>

        <div className="inline-flex p-1 app-surface-soft rounded-xl w-fit">
          {[
            ['personas', t('personas.tabs.personas')],
            ['portraits', t('personas.tabs.portraits')],
          ].map(([tabKey, label]) => (
            <button
              key={tabKey}
              type="button"
              onClick={() => switchTab(tabKey)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tabKey ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
              data-testid={`personas-tab-${tabKey}`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-col mb-6">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder={activeTab === 'personas' ? t('personas.searchPersonas') : t('personas.portraits.searchPortraits')}
              className="app-input w-full pl-10 pr-4 py-2 rounded-lg focus:outline-none transition-all"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>

          {activeTab === 'personas' ? (
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium shadow-sm transition-colors ${showFilters ? 'bg-blue-50 border-blue-200 text-blue-600' : 'app-surface-soft text-gray-600 hover:bg-gray-50'}`}
            >
              <Filter size={16} />
              <span>{t('personas.filters')}</span>
            </button>
          ) : null}
        </div>

        {activeTab === 'personas' ? (
          <div className={`grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${showFilters ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
            <div className="overflow-hidden">
              <div className={`pt-4 transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${showFilters ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`}>
                <div className="app-surface-soft flex items-center gap-4 p-4 rounded-lg">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-gray-500">{t('personas.role')}</label>
                    <select
                      className="app-select text-sm rounded-md px-2 py-1.5 outline-none min-w-[150px]"
                      value={selectedRole}
                      onChange={(event) => setSelectedRole(event.target.value)}
                    >
                      <option value="">{t('personas.allRoles')}</option>
                      {roles.map((role) => <option key={role} value={role}>{role}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-gray-500">{t('personas.location')}</label>
                    <select
                      className="app-select text-sm rounded-md px-2 py-1.5 outline-none min-w-[150px]"
                      value={selectedLocation}
                      onChange={(event) => setSelectedLocation(event.target.value)}
                    >
                      <option value="">{t('personas.allLocations')}</option>
                      {locations.map((location) => <option key={location} value={location}>{location}</option>)}
                    </select>
                  </div>
                  {(selectedRole || selectedLocation) ? (
                    <button
                      onClick={() => { setSelectedRole(''); setSelectedLocation(''); }}
                      className="mt-auto mb-1 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition"
                      title={t('common.clearFilters')}
                    >
                      <X size={16} />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {activeTab === 'personas' ? (
        <div className="app-surface rounded-xl overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">{t('common.name')}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">{t('common.usedIn')}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">{t('common.updated')}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">{t('common.createdBy')}</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredPersonas.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center justify-center">
                      <User size={48} className="text-gray-200 mb-4" />
                      <p className="text-lg font-medium text-gray-900">{t('personas.noPersonasFound')}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredPersonas.map((persona) => (
                  <tr
                    key={persona.id}
                    className="hover:bg-gray-50/80 transition-colors group cursor-pointer"
                    onClick={() => onEdit && onEdit(persona)}
                    data-testid="persona-row"
                    data-persona-id={persona.id}
                    data-persona-name={persona.name}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 flex items-center justify-center text-blue-600 font-bold overflow-hidden shrink-0 shadow-sm">
                          {persona.image && persona.image.startsWith('http') ? (
                            <img src={persona.image} alt={persona.name} className="w-full h-full object-cover" />
                          ) : (
                            persona.name.charAt(0)
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-gray-900">{persona.name}</div>
                          <div className="text-sm text-gray-500">{persona.role}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {persona.usedIn > 0 ? (
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            setLinkedMapsConfig({
                              isOpen: true,
                              items: persona.linkedJourneys || [],
                              title: `Maps using ${persona.name}`,
                            });
                          }}
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 hover:border-blue-200 transition-colors cursor-pointer"
                        >
                          {t('personas.linkedMapsCount', { count: persona.usedIn })}
                        </button>
                      ) : (
                        <span className="text-sm text-gray-400">{t('personas.notUsed')}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {persona.updatedAt || t('common.justNow')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-600 border border-white shadow-sm">
                          {(persona.owner || 'U').charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm text-gray-600">{persona.owner || t('common.unknown')}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right flex items-center justify-end gap-2">
                      <Tooltip content={t('common.duplicate')}>
                        <button
                          onClick={(event) => { event.stopPropagation(); openConfirm('duplicate', persona); }}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Copy size={18} />
                        </button>
                      </Tooltip>
                      <Tooltip content={t('common.archive')}>
                        <button
                          onClick={(event) => { event.stopPropagation(); onArchive && onArchive(persona.id); }}
                          className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                        >
                          <Archive size={18} />
                        </button>
                      </Tooltip>
                      {currentUserId != null && (persona.user_id === currentUserId || isWorkspaceOwner) ? (
                        <Tooltip content={t('common.delete')}>
                          <button
                            onClick={(event) => { event.stopPropagation(); openConfirm('delete', persona); }}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={18} />
                          </button>
                        </Tooltip>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPortraits.length === 0 ? (
            <div className="app-empty-state rounded-2xl px-6 py-14 text-center">
              <Sparkles size={40} className="text-gray-300 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-gray-900">{t('personas.portraits.emptyTitle')}</h2>
              <p className="text-sm text-gray-500 mt-2 max-w-xl mx-auto">{t('personas.portraits.emptyDesc')}</p>
            </div>
          ) : (
            <>
              <section className="rounded-[2rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(15,23,42,0.06),_transparent_24%),linear-gradient(135deg,_#fffdf8_0%,_#f8fafc_46%,_#eef2ff_100%)] shadow-sm overflow-hidden">
                <div className="px-8 py-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div>
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 border border-slate-200 text-slate-700 text-xs font-semibold uppercase tracking-[0.2em]">
                      <Layers3 size={12} />
                      {t('personas.portraits.galleryLabel')}
                    </div>
                    <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">{t('personas.portraits.galleryTitle')}</h2>
                    <p className="mt-3 text-base leading-7 text-slate-600 max-w-3xl">{t('personas.portraits.galleryDesc')}</p>
                  </div>
                  <div className="rounded-2xl border border-white/70 bg-white/80 p-5 shadow-sm">
                    <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">{t('personas.portraits.galleryStats')}</div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-slate-950 text-white p-4">
                        <div className="text-2xl font-bold">{filteredPortraits.length}</div>
                        <div className="text-xs text-slate-300 mt-1">{t('personas.portraits.tabsLabel')}</div>
                      </div>
                      <div className="rounded-2xl bg-slate-100 text-slate-900 p-4">
                        <div className="text-2xl font-bold">{new Set(filteredPortraits.flatMap((portrait) => portrait.sourceInterviewIds || [])).size}</div>
                        <div className="text-xs text-slate-500 mt-1">{t('personas.portraits.interviewsCovered')}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
                {filteredPortraits.map((portrait) => {
              const portraitData = portrait.portraitData || {};
              const canDelete = currentUserId != null && (portrait.user_id === currentUserId || isWorkspaceOwner);
              const sourceTitles = portrait.sourceInterviewTitles?.length > 0
                ? portrait.sourceInterviewTitles
                : (portrait.sourceInterviewTitle ? [portrait.sourceInterviewTitle] : []);
              const sourceSummary = sourceTitles.length > 1
                ? t('personas.portraits.sourceInterviewsSummary', { count: sourceTitles.length })
                : sourceTitles[0];
              const topSignals = [
                ...(portraitData.forcesOfProgress?.pushes || []),
                ...(portraitData.forcesOfProgress?.pulls || []),
                ...(portraitData.forcesOfProgress?.anxieties || []),
                ...(portraitData.forcesOfProgress?.habits || []),
              ].filter(Boolean).slice(0, 3);

              return (
                <article
                  key={portrait.id}
                  className="group cursor-pointer rounded-[1.75rem] overflow-hidden border border-slate-200 bg-white shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all"
                  onClick={() => navigate(`/portraits/${portrait.id}`)}
                >
                  <div className="px-6 py-5 bg-[linear-gradient(135deg,_#fff7ed_0%,_#f8fafc_38%,_#eef2ff_100%)] border-b border-slate-200">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-3 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/90 text-blue-700 border border-blue-100 text-xs font-semibold uppercase tracking-wide">
                            <Sparkles size={12} />
                            {portraitData.archetype || t('personas.portraits.generatedLabel')}
                          </span>
                          {portraitData.dominantForce ? (
                            <span className="inline-flex items-center px-3 py-1 rounded-full bg-slate-900 text-white text-xs font-medium">
                              {dominantForceLabel(portraitData.dominantForce, t)}
                            </span>
                          ) : null}
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-slate-950 truncate">{portrait.title || portraitData.title || t('personas.portraits.untitled')}</h2>
                          <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-slate-600">
                            {sourceSummary ? (
                              <span className="inline-flex items-center gap-1.5" title={sourceTitles.join(', ')}>
                                <Mic size={14} />
                                {sourceSummary}
                              </span>
                            ) : null}
                            <span>{portrait.updatedAt}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {canDelete ? (
                          <Tooltip content={t('common.delete')}>
                            <button
                              onClick={(event) => { event.stopPropagation(); openConfirm('deletePortrait', portrait); }}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 size={18} />
                            </button>
                          </Tooltip>
                        ) : null}
                        <div className="w-10 h-10 rounded-2xl bg-white/90 border border-slate-200 flex items-center justify-center text-slate-500 group-hover:text-slate-900 transition-colors">
                          <ArrowRight size={18} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 space-y-5">
                    {portraitData.summary ? (
                      <p className="text-sm text-slate-700 leading-7 line-clamp-4">{portraitData.summary}</p>
                    ) : null}

                    <div className="grid gap-3 md:grid-cols-2">
                      {portraitData.jobToBeDone ? (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-1">{t('interviews.jobToBeDone')}</div>
                          <div className="text-sm text-slate-900 line-clamp-2">{portraitData.jobToBeDone}</div>
                        </div>
                      ) : null}
                      {portraitData.progressMoment ? (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-1">{t('personas.portraits.progressMoment')}</div>
                          <div className="text-sm text-slate-900 line-clamp-2">{portraitData.progressMoment}</div>
                        </div>
                      ) : null}
                    </div>

                    {topSignals.length > 0 ? (
                      <div className="space-y-2">
                        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{t('personas.portraits.signalPreview')}</div>
                        <div className="flex flex-wrap gap-2">
                          {topSignals.map((signal, index) => (
                            <span key={`${signal}-${index}`} className="inline-flex rounded-full bg-amber-50 border border-amber-100 px-3 py-1 text-xs text-amber-900">
                              {signal}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="pt-2 flex items-center justify-between text-sm">
                      <span className="text-slate-500">{t('personas.portraits.createdByShort', { owner: portrait.owner || t('common.unknown') })}</span>
                      <span className="font-medium text-slate-900">{t('personas.portraits.openPortrait')}</span>
                    </div>
                  </div>
                </article>
              );
                })}
              </div>
            </>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
        onConfirm={handleConfirmAction}
        title={
          confirmConfig.action === 'delete'
            ? t('personas.deletePersona')
            : confirmConfig.action === 'deletePortrait'
              ? t('personas.portraits.deleteTitle')
              : t('personas.duplicatePersona')
        }
        message={
          confirmConfig.action === 'delete'
            ? t('personas.deleteConfirm')
            : confirmConfig.action === 'deletePortrait'
              ? t('personas.portraits.deleteConfirm', { name: confirmConfig.item?.title || confirmConfig.item?.portraitData?.title })
              : t('personas.duplicateCopyOf', { name: confirmConfig.item?.name })
        }
        confirmText={
          confirmConfig.action === 'duplicate'
            ? t('common.duplicate')
            : t('common.delete')
        }
        isDestructive={confirmConfig.action !== 'duplicate'}
      />

      <LinkedMapsModal
        isOpen={linkedMapsConfig.isOpen}
        onClose={() => setLinkedMapsConfig({ ...linkedMapsConfig, isOpen: false })}
        title={linkedMapsConfig.title}
        items={linkedMapsConfig.items}
        onOpenJourney={(id) => navigate(`/journey/${id}`)}
      />

      <PortraitGenerationModal
        isOpen={isGeneratePortraitModalOpen}
        onClose={() => setIsGeneratePortraitModalOpen(false)}
        interviews={interviews}
        interviewFolders={interviewFolders}
        onGenerate={onGeneratePortrait}
      />
    </div>
  );
};

export default Personas;
