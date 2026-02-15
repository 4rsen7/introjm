import { useState, useRef, useEffect } from 'react'
import { Map, User, BarChart3, Plus, MoreHorizontal, Clock, ArrowRight, Copy, Archive, Trash2, Layout } from 'lucide-react'
import { Link } from 'react-router-dom'
import ConfirmModal from '../ConfirmModal'
import { getAuthToken } from '../services/auth'
import { useQueryClient } from '@tanstack/react-query'

// Fallback to localhost:5005 if env var is missing
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5005/api';

// Ми передаємо функцію onNewJourney, щоб знати, коли юзер хоче створити карту
export default function Dashboard({ journeys = [], currentUserId, isWorkspaceOwner, onNewJourney, onEditJourney, onNewPersona, onViewAllJourneys, onNewMetric, onDuplicate, onArchive, onDelete }) {
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, action: null, item: null });
  const queryClient = useQueryClient();

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
              const { data } = await response.json();
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
    <div className="p-8 h-full overflow-auto bg-gray-50/30">
      <header className="mb-8 flex items-center justify-between">
        <div>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Dashboard</h2>
            <p className="text-gray-500 text-sm mt-1">Manage your customer journeys and personas</p>
        </div>
      </header>

      {/* Action Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
        <ActionCard 
          icon={Map} 
          label="New Journey" 
          subLabel="Map a customer experience"
          color="text-orange-600" 
          bgColor="bg-orange-50"
          onClick={onNewJourney}
        />
        <ActionCard 
          icon={User} 
          label="New Persona" 
          subLabel="Define target audience"
          color="text-blue-600" 
          bgColor="bg-blue-50"
          onClick={onNewPersona}
        />
        <ActionCard 
          icon={BarChart3} 
          label="New Metric" 
          subLabel="Track KPIs & data"
          color="text-emerald-600" 
          bgColor="bg-emerald-50"
          onClick={onNewMetric}
        />
      </div>

      {/* Recents Section */}
      <section>
        <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-gray-800">Recent Journeys</h3>
            <button onClick={() => onViewAllJourneys && onViewAllJourneys()} className="text-sm text-gray-500 hover:text-gray-900 font-medium flex items-center gap-1">
                View all <ArrowRight size={14} />
            </button>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...journeys]
                .filter(j => j.status !== 'archived')
                .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
                .slice(0, 3)
                .map(journey => (
                <Link key={journey.id} to={`/journey/${journey.id}`} className="block">
                    <JourneyCard 
                        journey={journey}
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
                className="bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 hover:border-orange-300 hover:bg-orange-50/30 transition-all cursor-pointer flex flex-col items-center justify-center h-[220px] group text-gray-400 hover:text-orange-600"
            >
                <div className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center mb-2 group-hover:border-orange-200 group-hover:bg-orange-100 transition-colors">
                    <Plus size={20} />
                </div>
                <span className="text-sm font-medium">Create new</span>
            </button>
        </div>
      </section>

      <ConfirmModal 
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
        onConfirm={handleConfirmAction}
        title={confirmConfig.action === 'delete' ? "Delete this map?" : "Duplicate map?"}
        message={confirmConfig.action === 'delete' ? "Are you sure you want to delete this journey map? This action cannot be undone." : `Create a copy of "${confirmConfig.item?.title}"?`}
        isDestructive={confirmConfig.action === 'delete'}
        confirmText={confirmConfig.action === 'delete' ? "Delete" : "Duplicate"}
      />
    </div>
  )
}

function ActionCard({ icon: Icon, label, subLabel, color, bgColor, onClick }) {
    return (
        <button 
            type="button"
            onClick={onClick}
            className="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md hover:border-gray-300 transition-all text-left group h-24"
        >
            <div className={`w-12 h-12 rounded-lg ${bgColor} flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}>
                <Icon className={color} size={24} />
            </div>
            <div className="flex-1 min-w-0">
                <div className="font-bold text-gray-900 truncate">{label}</div>
                <div className="text-xs text-gray-500 truncate">{subLabel}</div>
            </div>
            <div className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 -mr-2">
                <Plus size={20} />
            </div>
        </button>
    )
}

function JourneyCard({ journey, canDelete = true, onDuplicate, onArchive, onDelete }) {
    const date = getRelativeTime(journey.updated_at || journey.created_at);
    
    // Calculate real stage count from map_data
    let stageCount = 0;
    try {
        const md = typeof journey.map_data === 'string' ? JSON.parse(journey.map_data) : journey.map_data;
        if (md?.gridColumns) stageCount = md.gridColumns.length;
    } catch (e) {}

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
            className="group relative bg-white rounded-xl border border-gray-200 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:border-gray-300 transition-all duration-200 ease-out h-[220px] flex flex-col"
            onMouseLeave={() => setShowMenu(false)}
        >
            {/* Preview Area (The "Tech" Look) */}
            <div className="h-32 relative overflow-hidden bg-gray-50/50 border-b border-gray-100 rounded-t-xl">
                {/* Dot Grid Pattern - фон у крапочку */}
                <div className="absolute inset-0 opacity-[0.4]" 
                     style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '16px 16px' }}>
                </div>
                
                {/* Mockup of a Map (Miniature) - малює схему */}
                <div className="absolute inset-0 p-4 flex flex-col justify-center items-center opacity-80 group-hover:scale-[1.02] transition-transform duration-500">
                    <MockMapPreview colorClass={style.accent} />
                </div>

                {/* Badge Type */}
                <div className="absolute top-3 left-3 px-2 py-0.5 bg-white/90 backdrop-blur border border-gray-200 rounded text-[10px] font-medium text-gray-500 shadow-sm z-10">
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
                            <button title="Duplicate journey" onClick={(e) => handleAction(e, onDuplicate)} className="w-full text-left px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"><Copy size={13} /> Duplicate</button>
                            <button title="Archive journey" onClick={(e) => handleAction(e, onArchive)} className="w-full text-left px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"><Archive size={13} /> Archive</button>
                            {canDelete && (
                              <>
                                <div className="h-px bg-gray-100 my-1"></div>
                                <button title="Delete journey" onClick={(e) => handleAction(e, onDelete)} className="w-full text-left px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 flex items-center gap-2"><Trash2 size={13} /> Delete</button>
                              </>
                            )}
                        </div>
                    )}
                </div>
            </div>
            
            {/* Content Area */}
            <div className="p-4 flex-1 flex flex-col justify-between bg-white rounded-b-xl">
                <div>
                    <h4 className="font-semibold text-gray-900 text-sm leading-snug truncate pr-4 group-hover:text-indigo-600 transition-colors">
                        {journey.title}
                    </h4>
                    {/* Fake stats to make it look pro */}
                    <div className="flex items-center gap-3 mt-2">
                         <div className="flex items-center gap-1 text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                            <Layout size={10} />
                            <span>{stageCount} {stageCount === 1 ? 'stage' : 'stages'}</span>
                         </div>
                    </div>
                </div>
                
                <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-3 pt-3 border-t border-gray-50">
                    <Clock size={11} />
                    <span>Edited {date}</span>
                </div>
            </div>
        </div>
    )
}

function getRelativeTime(dateString) {
    if (!dateString) return 'Just now';
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    let interval = Math.floor(seconds / 31536000);
    if (interval >= 1) return interval + (interval === 1 ? " year ago" : " years ago");
    
    interval = Math.floor(seconds / 2592000);
    if (interval >= 1) return interval + (interval === 1 ? " month ago" : " months ago");
    
    interval = Math.floor(seconds / 86400);
    if (interval >= 1) return interval + (interval === 1 ? " day ago" : " days ago");
    
    interval = Math.floor(seconds / 3600);
    if (interval >= 1) return interval + (interval === 1 ? " hour ago" : " hours ago");
    
    interval = Math.floor(seconds / 60);
    if (interval >= 1) return interval + (interval === 1 ? " minute ago" : " minutes ago");
    
    return "Just now";
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
