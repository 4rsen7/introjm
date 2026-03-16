import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Filter, Copy, Trash2, Plus, Map, ArrowRight, X, Archive, RotateCcw } from 'lucide-react';
import ConfirmModal from '../ConfirmModal';
import { getAuthToken } from '../services/auth';
import Tooltip from '../components/common/Tooltip';

// Fallback to localhost:5005 if env var is missing
const API_URL = import.meta.env.VITE_API_URL || '/api';

const JourneyMaps = ({ journeys = [], currentUserId, isWorkspaceOwner, onCreate, onEdit, onDelete, onDuplicate, onArchive }) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedOwner, setSelectedOwner] = useState('');
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, action: null, item: null });

  const statuses = useMemo(() => [...new Set(journeys.map(j => j.status).filter(Boolean))], [journeys]);
  const owners = useMemo(() => [...new Set(journeys.map(j => j.owner).filter(Boolean))], [journeys]);

  const filteredJourneys = journeys.filter(j => {
    const matchesSearch = j.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = selectedStatus ? j.status === selectedStatus : true;
    const matchesOwner = selectedOwner ? j.owner === selectedOwner : true;
    
    return matchesSearch && matchesStatus && matchesOwner;
  });

  const openConfirm = (action, item) => {
      setConfirmConfig({ isOpen: true, action, item });
  };

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
              if (onDelete) onDelete(item.id);
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
              if (onDuplicate) onDuplicate(data);
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
          if (onArchive) onArchive(id);
      } catch (error) {
          console.error("Failed to archive journey:", error);
      }
  };

  const handleRestore = async (id) => {
      try {
          const token = await getAuthToken();
          const url = `${API_URL}/journeys/${id}/restore`;
          
          console.log(`[CLIENT] Sending PUT request to: ${url}`, { token: !!token });
          
          const response = await fetch(url, {
              method: 'PUT',
              headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!response.ok) throw new Error('Failed to restore journey');
          if (onArchive) onArchive(id); // Trigger refresh in parent
      } catch (error) {
          console.error("Failed to restore journey:", error);
          alert(t('common.failedRestoreJourney'));
      }
  };

  return (
    <div className="p-8 bg-gray-50 min-h-screen font-sans text-gray-900">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
           <Map className="text-gray-400" /> {t('journeys.title')}
        </h1>
        <button 
            onClick={onCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm transition-colors"
        >
          <Plus size={18} />
          {t('journeys.createMap')}
        </button>
      </header>

      <div className="flex flex-col mb-6">
       <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
                type="text" 
                placeholder={t('journeys.searchMaps')} 
                className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>
        <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 border rounded-lg font-medium shadow-sm transition-colors ${showFilters ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
        >
            <Filter size={16} />
            <span>{t('dashboard.filters')}</span>
        </button>
      </div>

      <div className={`grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${showFilters ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className={`pt-4 transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${showFilters ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`}>
            <div className="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
            <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-gray-500">{t('journeys.status')}</label>
                <select 
                    className="text-sm border border-gray-200 rounded-md px-2 py-1.5 outline-none focus:border-blue-500 min-w-[150px] bg-white"
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                >
                    <option value="">{t('journeys.allStatuses')}</option>
                    {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>
            <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-gray-500">{t('journeys.owner')}</label>
                <select 
                    className="text-sm border border-gray-200 rounded-md px-2 py-1.5 outline-none focus:border-blue-500 min-w-[150px] bg-white"
                    value={selectedOwner}
                    onChange={(e) => setSelectedOwner(e.target.value)}
                >
                    <option value="">{t('journeys.allOwners')}</option>
                    {owners.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
            </div>
            {(selectedStatus || selectedOwner) && (
                <button onClick={() => { setSelectedStatus(''); setSelectedOwner(''); }} className="mt-auto mb-1 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition" title={t('common.clearFilters')}>
                    <X size={16} />
                </button>
            )}
            </div>
          </div>
        </div>
      </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">{t('common.name')}</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">{t('common.status')}</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">{t('common.updated')}</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">{t('common.createdBy')}</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredJourneys.length === 0 ? (
                <tr>
                    <td colSpan="5" className="px-6 py-12 text-center text-gray-500">
                        <div className="flex flex-col items-center justify-center">
                            <Map size={48} className="text-gray-200 mb-4" />
                            <p className="text-lg font-medium text-gray-900">{t('journeys.noMapsFound')}</p>
                        </div>
                    </td>
                </tr>
            ) : (
                filteredJourneys.map((journey) => (
              <tr 
                key={journey.id} 
                className="hover:bg-gray-50/80 transition-colors group cursor-pointer"
                onClick={() => onEdit && onEdit(journey)}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg ${journey.color || 'bg-blue-100'} flex items-center justify-center text-blue-600 font-bold shrink-0 shadow-sm`}>
                        <Map size={20} className="text-gray-700 opacity-50" />
                    </div>
                    <div>
                      <div className="font-bold text-gray-900">{journey.title}</div>
                      <div className="text-sm text-gray-500">{journey.description || t('common.noDescription')}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                   <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                       journey.status === 'live' ? 'bg-green-50 text-green-700 border border-green-100' : 
                       journey.status === 'archived' ? 'bg-gray-100 text-gray-600 border border-gray-200' : 
                       'bg-yellow-50 text-yellow-700 border border-yellow-100'
                   }`}>
                     {journey.status || t('common.draft')}
                   </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {journey.updatedAt || t('common.justNow')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-600 border border-white shadow-sm">
                            {(journey.owner || 'You').charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm text-gray-600">{journey.owner || 'You'}</span>
                    </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right flex items-center justify-end gap-2">
                    <Tooltip content={t('common.duplicate')}>
                        <button 
                            onClick={(e) => { e.stopPropagation(); openConfirm('duplicate', journey); }}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                            <Copy size={18} />
                        </button>
                    </Tooltip>
                    
                    {journey.status === 'archived' ? (
                        <Tooltip content={t('common.restore')}>
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleRestore(journey.id); }}
                                className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            >
                                <RotateCcw size={18} />
                            </button>
                        </Tooltip>
                    ) : (
                        <Tooltip content={t('common.archive')}>
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleArchive(journey.id); }}
                                className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                            >
                                <Archive size={18} />
                            </button>
                        </Tooltip>
                    )}

                    {currentUserId != null && (journey.user_id === currentUserId || isWorkspaceOwner) && (
                        <Tooltip content={t('common.delete')}>
                            <button 
                                onClick={(e) => { e.stopPropagation(); openConfirm('delete', journey); }}
                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                                <Trash2 size={18} />
                            </button>
                        </Tooltip>
                    )}
                </td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>

      <ConfirmModal 
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
        onConfirm={handleConfirmAction}
        title={confirmConfig.action === 'delete' ? t('journeys.deleteThisMap') : t('journeys.duplicateMap')}
        message={confirmConfig.action === 'delete' 
            ? t('journeys.deleteMapMessage') 
            : t('journeys.createCopyOf', { title: confirmConfig.item?.title })}
        isDestructive={confirmConfig.action === 'delete'}
        confirmText={confirmConfig.action === 'delete' ? t('common.delete') : t('common.duplicate')}
      />
    </div>
  );
};

export default JourneyMaps;