import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, RotateCcw, Trash2, Map, User, Archive as ArchiveIcon } from 'lucide-react';
import { getAuthToken } from '../services/auth';
import Tooltip from '../components/common/Tooltip';
import ConfirmModal from '../ConfirmModal';
import { API_BASE_URL } from '../config/api';

const API_URL = API_BASE_URL;

const ArchivePage = ({ 
  archivedJourneys = [], 
  archivedPersonas = [], 
  currentUserId, 
  isWorkspaceOwner, 
  onRestoreJourney, 
  onDeleteJourney, 
  onRestorePersona, 
  onDeletePersona 
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('journeys');
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, type: null, item: null });

  const filteredJourneys = archivedJourneys.filter(j => 
    j.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredPersonas = archivedPersonas.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // --- API Handlers ---
  const handleRestoreJourneyClick = async (id) => {
      try {
          const token = await getAuthToken();
          console.log(`[Archive] Restoring journey ${id}...`);
          const response = await fetch(`${API_URL}/journeys/${id}/restore`, {
              method: 'PUT',
              headers: { 'Authorization': `Bearer ${token}` }
          });
          
          if (response.ok) {
              const { data } = await response.json();
              console.log('[Archive] Restore success', data);
              if (onRestoreJourney) onRestoreJourney(id);
          } else {
              console.error('[Archive] Failed to restore journey');
          }
      } catch (error) {
          console.error('[Archive] Error restoring journey:', error);
      }
  };

  const handleDeleteJourneyClick = async (id) => {
      try {
          const token = await getAuthToken();
          const response = await fetch(`${API_URL}/journeys/${id}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${token}` }
          });
          
          if (response.ok) {
              if (onDeleteJourney) onDeleteJourney(id);
          }
      } catch (error) {
          console.error('Error deleting journey:', error);
      }
  };

  const handleRestorePersonaClick = async (id) => {
      try {
          const token = await getAuthToken();
          const response = await fetch(`${API_URL}/personas/${id}/restore`, {
              method: 'PUT',
              headers: { 'Authorization': `Bearer ${token}` }
          });
          
          if (response.ok) {
              if (onRestorePersona) onRestorePersona(id);
          }
      } catch (error) {
          console.error('Error restoring persona:', error);
      }
  };

  const handleDeletePersonaClick = async (id) => {
      try {
          const token = await getAuthToken();
          const response = await fetch(`${API_URL}/personas/${id}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${token}` }
          });
          
          if (response.ok) {
              if (onDeletePersona) onDeletePersona(id);
          }
      } catch (error) {
          console.error('Error deleting persona:', error);
      }
  };

  const handleConfirmAction = async () => {
      const { type, item } = confirmConfig;
      if (!item) return;

      if (type === 'deleteJourney') {
        await handleDeleteJourneyClick(item.id);
      } else if (type === 'deletePersona') {
        await handleDeletePersonaClick(item.id);
      }

      setConfirmConfig({ isOpen: false, type: null, item: null });
  };

  return (
    <div className="p-8 app-shell-bg min-h-screen font-sans text-gray-900">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <ArchiveIcon className="text-gray-400" /> {t('archive.title')}
        </h1>
        <p className="text-gray-500 mt-1">{t('archive.subtitle')}</p>
      </header>

      {/* Tabs */}
      <div className="inline-flex p-1 app-surface-soft rounded-xl mb-6">
        <button
            onClick={() => setActiveTab('journeys')}
            className={`px-6 py-3 text-sm font-medium transition-colors relative rounded-lg ${activeTab === 'journeys' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
        >
            {t('nav.journeyMaps')} ({archivedJourneys.length})
        </button>
        <button
            onClick={() => setActiveTab('personas')}
            className={`px-6 py-3 text-sm font-medium transition-colors relative rounded-lg ${activeTab === 'personas' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
        >
            {t('nav.personas')} ({archivedPersonas.length})
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        <input 
            type="text" 
            placeholder={t('archive.searchPlaceholder', { tab: activeTab === 'journeys' ? t('nav.journeyMaps').toLowerCase() : t('nav.personas').toLowerCase() })} 
            className="app-input w-full pl-10 pr-4 py-2 rounded-lg focus:outline-none transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Content */}
      <div className="app-surface rounded-xl overflow-hidden">
        <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50/50">
                <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">{t('common.name')}</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">{t('common.updated')}</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500">{t('common.actions')}</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
                {activeTab === 'journeys' ? (
                    filteredJourneys.length === 0 ? (
                        <tr><td colSpan="3" className="px-6 py-12 text-center text-gray-500">{t('archive.noJourneysFound')}</td></tr>
                    ) : (
                        filteredJourneys.map(journey => (
                            <tr key={journey.id} className="hover:bg-gray-50/80 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-lg ${journey.color || 'bg-gray-100'} flex items-center justify-center text-gray-600`}>
                                            <Map size={16} />
                                        </div>
                                        <div>
                                            <div className="font-bold text-gray-900">{journey.title}</div>
                                            <div className="text-xs text-gray-500">{journey.description || t('common.noDescription')}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {journey.updated_at ? new Date(journey.updated_at).toLocaleDateString() : t('common.unknown')}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <Tooltip content={t('common.restore')}>
                                            <button onClick={() => handleRestoreJourneyClick(journey.id)} className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors">
                                                <RotateCcw size={18} />
                                            </button>
                                        </Tooltip>
                                        {currentUserId != null && (journey.user_id === currentUserId || isWorkspaceOwner) && (
                                            <Tooltip content={t('common.delete')}>
                                                <button onClick={() => setConfirmConfig({ isOpen: true, type: 'deleteJourney', item: journey })} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                                    <Trash2 size={18} />
                                                </button>
                                            </Tooltip>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))
                    )
                ) : (
                    filteredPersonas.length === 0 ? (
                        <tr><td colSpan="3" className="px-6 py-12 text-center text-gray-500">{t('archive.noPersonasFound')}</td></tr>
                    ) : (
                        filteredPersonas.map(persona => (
                            <tr key={persona.id} className="hover:bg-gray-50/80 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 overflow-hidden">
                                            {persona.image && persona.image.startsWith('http') ? (
                                                <img src={persona.image} alt={persona.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <User size={16} />
                                            )}
                                        </div>
                                        <div>
                                            <div className="font-bold text-gray-900">{persona.name}</div>
                                            <div className="text-xs text-gray-500">{persona.role}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {persona.updated_at ? new Date(persona.updated_at).toLocaleDateString() : t('common.unknown')}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <Tooltip content={t('common.restore')}>
                                            <button onClick={() => handleRestorePersonaClick(persona.id)} className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors">
                                                <RotateCcw size={18} />
                                            </button>
                                        </Tooltip>
                                        {currentUserId != null && (persona.user_id === currentUserId || isWorkspaceOwner) && (
                                            <Tooltip content={t('common.delete')}>
                                                <button onClick={() => setConfirmConfig({ isOpen: true, type: 'deletePersona', item: persona })} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                                    <Trash2 size={18} />
                                                </button>
                                            </Tooltip>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))
                    )
                )}
            </tbody>
        </table>
      </div>

      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig({ isOpen: false, type: null, item: null })}
        onConfirm={handleConfirmAction}
        title={
          confirmConfig.type === 'deleteJourney'
            ? t('archive.deleteJourneyTitle')
            : t('archive.deletePersonaTitle')
        }
        message={
          confirmConfig.type === 'deleteJourney'
            ? t('archive.deleteJourneyMessage', { title: confirmConfig.item?.title })
            : t('archive.deletePersonaMessage', { name: confirmConfig.item?.name })
        }
        confirmText={t('common.delete')}
        isDestructive
      />
    </div>
  );
};

export default ArchivePage;
