import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Map, User, BarChart3, Plus, MoreHorizontal, Clock, ArrowRight, Copy, Archive, Trash2, Layout, GraduationCap } from 'lucide-react'
import { Link } from 'react-router-dom'
import ConfirmModal from '../ConfirmModal'
import { getAuthToken } from '../services/auth'
import { API_BASE_URL } from '../config/api'
import { useQueryClient } from '@tanstack/react-query'

const API_URL = API_BASE_URL;

// Ми передаємо функцію onNewJourney, щоб знати, коли юзер хоче створити карту
const MATERIAL_TONE_STYLES = {
  cobalt: {
    hero: 'from-sky-500/18 via-indigo-500/10 to-white',
    badge: 'bg-sky-100 text-sky-700 border-sky-200',
  },
  emerald: {
    hero: 'from-emerald-500/16 via-teal-500/10 to-white',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  },
  amber: {
    hero: 'from-amber-400/18 via-orange-400/10 to-white',
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
  },
  rose: {
    hero: 'from-rose-400/16 via-fuchsia-400/10 to-white',
    badge: 'bg-rose-100 text-rose-700 border-rose-200',
  },
};

const getMaterialTone = (tone) => MATERIAL_TONE_STYLES[tone] || MATERIAL_TONE_STYLES.cobalt;

export default function Dashboard({ journeys = [], learningMaterials = [], currentUserId, isWorkspaceOwner, onNewJourney, onNewPersona, onViewAllJourneys, onNewMetric }) {
  const { t } = useTranslation();
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, action: null, item: null });
  const queryClient = useQueryClient();
  const visibleJourneys = [...journeys]
    .filter((journey) => journey.status !== 'archived')
    .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
    .slice(0, 3);

  const handleConfirmAction = async () => {
      const { action, item } = confirmConfig;
      if (action === 'delete') {
          try {
              const token = await getAuthToken();
              const response = await fetch(`${API_URL}/journeys/${item.id}`, {
                  method: 'DELETE',
                  headers: { 'Authorization': `Bearer ${token}` }
              });
              if (!response.ok) {
                  throw new Error('Failed to delete journey');
              }
              // Invalidate queries to refresh list
              queryClient.invalidateQueries(['journeys']);
          } catch (error) {
              console.error("Failed to delete journey:", error);
          }
      }
      if (action === 'duplicate') {
          try {
              const token = await getAuthToken();
              const response = await fetch(`${API_URL}/journeys/${item.id}/duplicate`, {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${token}` }
              });
              if (!response.ok) throw new Error('Failed to duplicate journey');
              await response.json();
              // Refresh list
              queryClient.invalidateQueries(['journeys']);
          } catch (error) {
              console.error("Failed to duplicate journey:", error);
          }
      }
      setConfirmConfig({ isOpen: false, action: null, item: null });
  };

  const handleArchive = async (id) => {
      try {
          const token = await getAuthToken();
          const response = await fetch(`${API_URL}/journeys/${id}/archive`, {
              method: 'PUT',
              headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!response.ok) throw new Error('Failed to archive journey');
          queryClient.invalidateQueries(['journeys']);
      } catch (error) {
          console.error("Failed to archive journey:", error);
      }
  };

  const openConfirm = (action, item) => {
      setConfirmConfig({ isOpen: true, action, item });
  };

  return (
    <div className="p-8 h-full overflow-auto app-shell-bg" data-testid="dashboard-page">
      <header className="mb-8 flex items-center justify-between">
        <div>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">{t('dashboard.title')}</h2>
            <p className="text-gray-500 text-sm mt-1">{t('dashboard.subtitle')}</p>
        </div>
      </header>

      {/* Action Bar */}
      <section className="mb-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ActionCard 
          icon={Map} 
          label={t('dashboard.journeysLabel')} 
          subLabel={t('dashboard.newJourneySub')}
          actionText={t('dashboard.journeysAction')}
          iconColor="text-orange-600"
          iconBg="bg-orange-50"
          glow="from-orange-300/30 via-amber-200/15 to-transparent"
          onClick={onNewJourney}
        />
        <ActionCard 
          icon={User} 
          label={t('dashboard.personasLabel')} 
          subLabel={t('dashboard.newPersonaSub')}
          actionText={t('dashboard.personasAction')}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
          glow="from-blue-300/30 via-cyan-200/15 to-transparent"
          onClick={onNewPersona}
        />
        <ActionCard 
          icon={BarChart3} 
          label={t('dashboard.metricsLabel')} 
          subLabel={t('dashboard.newMetricSub')}
          actionText={t('dashboard.metricsAction')}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50"
          glow="from-emerald-300/30 via-teal-200/15 to-transparent"
          onClick={onNewMetric}
        />
        </div>
      </section>

      {/* Recents Section */}
      <section className="rounded-[30px] border border-slate-200/70 bg-white/80 p-5 shadow-[0_24px_60px_rgba(148,163,184,0.08)] backdrop-blur-sm">
        <div className="flex items-center justify-between mb-6">
            <div>
                <h3 className="text-lg font-bold text-gray-900">{t('dashboard.recentJourneys')}</h3>
                <p className="mt-1 text-sm text-gray-500">{t('dashboard.recentJourneysSub')}</p>
            </div>
            <button onClick={() => onViewAllJourneys && onViewAllJourneys()} className="text-sm text-gray-500 hover:text-gray-900 font-medium flex items-center gap-1">
                {t('dashboard.viewAll')} <ArrowRight size={14} />
            </button>
        </div>
        
        <div className="grid items-start grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {visibleJourneys
                .map((journey, index) => (
                <Link key={journey.id} to={`/journey/${journey.id}`} className="block self-start">
                    <JourneyCard 
                        journey={journey}
                        featured={index === 0}
                        canDelete={currentUserId != null && (journey.user_id === currentUserId || isWorkspaceOwner)}
                        onDuplicate={() => openConfirm('duplicate', journey)}
                        onArchive={() => handleArchive(journey.id)}
                        onDelete={() => openConfirm('delete', journey)}
                    />
                </Link>
            ))}
            
            {/* Create New Placeholder Card */}
            <button 
                type="button"
                onClick={onNewJourney}
            className="group flex h-[232px] flex-col items-center justify-center rounded-[24px] border-2 border-dashed border-slate-200 bg-gradient-to-br from-white via-slate-50/80 to-orange-50/40 text-gray-400 transition-all hover:-translate-y-1 hover:border-orange-300 hover:text-orange-600"
            >
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-gray-200 bg-white shadow-sm transition-colors group-hover:border-orange-200 group-hover:bg-orange-100">
                    <Plus size={20} />
                </div>
                <span className="text-sm font-semibold">{t('dashboard.createNew')}</span>
            </button>
        </div>
      </section>

      <section className="mt-14">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-gray-800">{t('dashboard.learningMaterials')}</h3>
            <p className="mt-1 text-sm text-gray-500">{t('dashboard.learningMaterialsSub')}</p>
          </div>
          <Link to="/materials" className="text-sm text-gray-500 hover:text-gray-900 font-medium flex items-center gap-1">
            {t('dashboard.viewAll')} <ArrowRight size={14} />
          </Link>
        </div>

        {learningMaterials.length > 0 ? (
          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <LearningFeaturedCard material={learningMaterials[0]} t={t} />
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-1">
              {learningMaterials.slice(1, 3).map((material) => (
                <LearningCompactCard key={material.id} material={material} t={t} />
              ))}
            </div>
          </div>
        ) : (
          <div className="app-empty-state rounded-2xl px-8 py-14 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/80 text-sky-600 shadow-sm">
              <GraduationCap size={24} />
            </div>
            <h4 className="text-xl font-bold text-gray-900">{t('dashboard.learningMaterialsEmptyTitle')}</h4>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-7 text-gray-600">{t('dashboard.learningMaterialsEmptyDesc')}</p>
          </div>
        )}
      </section>

      <ConfirmModal 
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
        onConfirm={handleConfirmAction}
        title={confirmConfig.action === 'delete' ? t('dashboard.deleteThisMap') : t('dashboard.duplicateMap')}
        message={confirmConfig.action === 'delete' ? t('dashboard.areYouSureDelete') : t('dashboard.duplicateCopyOf', { title: confirmConfig.item?.title })}
        isDestructive={confirmConfig.action === 'delete'}
        confirmText={confirmConfig.action === 'delete' ? t('common.delete') : t('common.duplicate')}
      />
    </div>
  )
}

function LearningFeaturedCard({ material, t }) {
    const tone = getMaterialTone(material.heroTone);

    return (
        <Link to={`/materials/${material.slug}`} className={`app-surface group relative overflow-hidden rounded-2xl bg-gradient-to-br ${tone.hero} p-7 transition-all duration-300 hover:-translate-y-1`}>
            <div className="relative flex h-full flex-col justify-between gap-6">
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] ${tone.badge}`}>
                            {material.category}
                        </span>
                        {material.featured && (
                            <span className="inline-flex items-center rounded-full border border-white/80 bg-white/70 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-gray-500">
                                {t('dashboard.featuredMaterial')}
                            </span>
                        )}
                    </div>
                    <div className="space-y-2">
                        <h4 className="max-w-2xl text-3xl font-black tracking-tight text-gray-900">{material.title}</h4>
                        {material.subtitle && <p className="text-base font-medium text-gray-700">{material.subtitle}</p>}
                        <p className="max-w-2xl text-sm leading-7 text-gray-600">{material.excerpt}</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/80 pt-4 text-sm text-gray-600">
                    <div className="flex flex-wrap items-center gap-4">
                        <span>{material.authorName}</span>
                        <span>{material.publishedAtLabel}</span>
                    </div>
                    <span className="inline-flex items-center gap-2 font-semibold text-sky-700">
                        {t('dashboard.readMaterial')}
                        <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-1" />
                    </span>
                </div>
            </div>
        </Link>
    );
}

function LearningCompactCard({ material, t }) {
    const tone = getMaterialTone(material.heroTone);

    return (
        <Link to={`/materials/${material.slug}`} className={`app-surface group rounded-2xl bg-gradient-to-br ${tone.hero} p-6 transition-all duration-300 hover:-translate-y-1`}>
            <div className="space-y-4">
                <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] ${tone.badge}`}>
                    {material.category}
                </span>
                <div className="space-y-2">
                    <h4 className="text-xl font-bold tracking-tight text-gray-900">{material.title}</h4>
                    <p className="text-sm leading-7 text-gray-600">{material.excerpt}</p>
                </div>
                <div className="flex items-center justify-between gap-4 text-sm text-gray-600">
                    <span>{material.authorName}</span>
                    <span className="inline-flex items-center gap-2 font-semibold text-sky-700">
                        {t('dashboard.openMaterial')}
                        <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-1" />
                    </span>
                </div>
            </div>
        </Link>
    );
}

function ActionCard({ icon, label, subLabel, actionText, iconColor, iconBg, glow, onClick }) {
    const IconComponent = icon;

    return (
        <button 
            type="button"
            onClick={onClick}
            className="group relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/90 p-5 text-left shadow-[0_22px_50px_rgba(15,23,42,0.05)] transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_30px_70px_rgba(15,23,42,0.09)]"
        >
            <div className={`pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-r ${glow} opacity-80`} />
            <div className="relative flex h-full flex-col justify-between gap-8">
              <div className="flex items-start justify-between gap-4">
                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${iconBg} shadow-sm transition-transform group-hover:scale-105`}>
                    <IconComponent className={iconColor} size={26} />
                </div>
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/90 bg-white/75 text-slate-400 shadow-sm transition-colors group-hover:text-slate-700">
                    <Plus size={18} />
                </div>
              </div>
              <div className="relative space-y-3">
                <div>
                  <div className="text-xl font-black tracking-tight text-gray-900">{label}</div>
                  <div className="mt-2 max-w-[26ch] text-sm leading-6 text-gray-600">{subLabel}</div>
                </div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <span>{actionText}</span>
                    <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-1" />
                </div>
              </div>
            </div>
        </button>
    )
}

function JourneyCard({ journey, featured = false, canDelete = true, onDuplicate, onArchive, onDelete }) {
    const { t } = useTranslation();
    const date = getRelativeTime(journey.updated_at || journey.created_at, t);
    
    // Calculate real stage count from map_data
    let stageCount = 0;
    try {
        const md = typeof journey.map_data === 'string' ? JSON.parse(journey.map_data) : journey.map_data;
        if (md?.gridColumns) stageCount = md.gridColumns.length;
    } catch {
        stageCount = 0;
    }

    // Отримуємо унікальний стиль на основі ID
    const style = getJourneyStyle(journey.id); 
    const [showMenu, setShowMenu] = useState(false);
    const menuRef = useRef(null);

    // Закриття меню при кліку поза межами
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setShowMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleMenuClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setShowMenu((prev) => !prev);
    };

    const handleAction = (e, action) => {
        e.preventDefault();
        e.stopPropagation();
        if (action) action();
        setShowMenu(false);
    };

    return (
        <div 
            className={`group relative overflow-hidden rounded-[24px] border border-slate-200/80 bg-white transition-all duration-300 ease-out hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_22px_54px_rgba(15,23,42,0.10)] ${featured ? 'sm:col-span-2 xl:col-span-2' : ''} h-[232px]`}
            onMouseLeave={() => setShowMenu(false)}
        >
            {/* Preview Area (The "Tech" Look) */}
            <div className={`relative h-32 overflow-hidden border-b border-gray-100 ${featured ? 'bg-gradient-to-br from-indigo-50 via-slate-50 to-white' : 'bg-gray-50/50'}`}>
                {/* Dot Grid Pattern - фон у крапочку */}
                <div className="absolute inset-0 opacity-[0.4]" 
                     style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '16px 16px' }}>
                </div>
                
                {/* Mockup of a Map (Miniature) - малює схему */}
                <div className={`absolute inset-0 flex flex-col justify-center items-center opacity-80 transition-transform duration-500 group-hover:scale-[1.02] ${featured ? 'p-5' : 'p-4'}`}>
                    <MockMapPreview colorClass={style.accent} />
                </div>

                {/* Badge Type */}
                <div className="absolute top-3 left-3 px-2.5 py-1 bg-white/90 backdrop-blur border border-gray-200 rounded-full text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500 shadow-sm z-10">
                    CJM
                </div>
            </div>

            {/* Menu Button */}
            <div className={`absolute top-2 right-2 z-20 transition-opacity duration-200 ${showMenu ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} ref={menuRef}>
                <div className="relative">
                    <button 
                        onClick={handleMenuClick} 
                        className={`p-1.5 rounded-md transition-colors shadow-sm border ${showMenu ? 'bg-white text-gray-900 border-gray-200' : 'bg-white/80 hover:bg-white text-gray-500 hover:text-gray-900 border-transparent hover:border-gray-200'}`}
                    >
                        <MoreHorizontal size={16} />
                    </button>
                    
                    {showMenu && (
                        <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg shadow-xl border border-gray-100 overflow-hidden py-1 z-30 animate-in fade-in zoom-in-95 duration-100 origin-top-right">
                            <button title={t('dashboard.duplicateJourney')} onClick={(e) => handleAction(e, onDuplicate)} className="w-full text-left px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"><Copy size={13} /> {t('common.duplicate')}</button>
                            <button title={t('dashboard.archiveJourney')} onClick={(e) => handleAction(e, onArchive)} className="w-full text-left px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"><Archive size={13} /> {t('common.archive')}</button>
                            {canDelete && (
                              <>
                                <div className="h-px bg-gray-100 my-1"></div>
                                <button title={t('dashboard.deleteJourney')} onClick={(e) => handleAction(e, onDelete)} className="w-full text-left px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 flex items-center gap-2"><Trash2 size={13} /> {t('common.delete')}</button>
                              </>
                            )}
                        </div>
                    )}
                </div>
            </div>
            
            {/* Content Area */}
            <div className="flex flex-1 flex-col justify-between bg-white p-5">
                <div>
                    <h4 className="pr-4 text-base font-bold leading-snug tracking-tight text-gray-900 transition-colors group-hover:text-indigo-600">
                        {journey.title}
                    </h4>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                         <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">
                            <Layout size={11} />
                            <span>{stageCount} {stageCount === 1 ? t('dashboard.stage') : t('dashboard.stages')}</span>
                         </div>
                         <div className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-600">
                            <Clock size={11} />
                            <span>{t('dashboard.edited')} {date}</span>
                         </div>
                    </div>
                </div>
                
                {!featured && (
                  <div className="mt-4 flex items-center gap-1.5 border-t border-gray-100 pt-3 text-xs text-gray-400">
                    <Clock size={11} />
                    <span>{t('dashboard.edited')} {date}</span>
                  </div>
                )}
            </div>
        </div>
    )
}

function getRelativeTime(dateString, t) {
    if (!dateString || !t) return t ? t('dashboard.justNow') : 'Just now';
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    let interval = Math.floor(seconds / 31536000);
    if (interval >= 1) return t(interval === 1 ? 'dashboard.yearAgo' : 'dashboard.yearsAgo', { count: interval });
    
    interval = Math.floor(seconds / 2592000);
    if (interval >= 1) return t(interval === 1 ? 'dashboard.monthAgo' : 'dashboard.monthsAgo', { count: interval });
    
    interval = Math.floor(seconds / 86400);
    if (interval >= 1) return t(interval === 1 ? 'dashboard.dayAgo' : 'dashboard.daysAgo', { count: interval });
    
    interval = Math.floor(seconds / 3600);
    if (interval >= 1) return t(interval === 1 ? 'dashboard.hourAgo' : 'dashboard.hoursAgo', { count: interval });
    
    interval = Math.floor(seconds / 60);
    if (interval >= 1) return t(interval === 1 ? 'dashboard.minuteAgo' : 'dashboard.minutesAgo', { count: interval });
    
    return t('dashboard.justNow');
}

// Компонент, що малює міні-схему (щоб карта виглядала як інтерфейс)
function MockMapPreview({ colorClass }) {
    return (
        <div className="w-full max-w-[180px] flex flex-col gap-2 transform rotate-0">
             {/* Header Blocks */}
             <div className="flex gap-2 w-full">
                <div className={`h-2 w-1/3 rounded-sm opacity-40 ${colorClass}`}></div>
                <div className={`h-2 w-1/3 rounded-sm opacity-30 ${colorClass}`}></div>
                <div className={`h-2 w-1/3 rounded-sm opacity-20 ${colorClass}`}></div>
             </div>
             {/* Body Lines */}
             <div className="flex gap-2 w-full mt-1">
                 <div className="w-1/3 flex flex-col gap-1.5">
                    <div className="h-1.5 w-full bg-gray-200 rounded-sm"></div>
                    <div className="h-1.5 w-2/3 bg-gray-100 rounded-sm"></div>
                 </div>
                 <div className="w-1/3 flex flex-col gap-1.5 pt-2">
                    <div className="h-1.5 w-full bg-gray-200 rounded-sm"></div>
                 </div>
                 <div className="w-1/3 flex flex-col gap-1.5 pt-1">
                    <div className="h-1.5 w-3/4 bg-gray-200 rounded-sm"></div>
                    <div className="h-1.5 w-full bg-gray-100 rounded-sm"></div>
                 </div>
             </div>
             {/* Curve Line (SVG) */}
             <svg className="w-full h-8 mt-1 text-gray-300" viewBox="0 0 100 20" fill="none" preserveAspectRatio="none">
                 <path d="M0 15 C 20 15, 30 5, 50 5 C 70 5, 80 12, 100 12" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round"/>
                 <circle cx="50" cy="5" r="2" className={colorClass.replace('bg-', 'text-')} fill="currentColor" />
             </svg>
        </div>
    )
}

const JOURNEY_STYLES = [
    { accent: 'bg-blue-400' },
    { accent: 'bg-indigo-400' },
    { accent: 'bg-violet-400' },
    { accent: 'bg-emerald-400' },
    { accent: 'bg-orange-400' },
    { accent: 'bg-rose-400' },
];

function getJourneyStyle(id) {
  if (!id) return JOURNEY_STYLES[0];
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % JOURNEY_STYLES.length;
  return JOURNEY_STYLES[index];
}
