import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Search, Filter, Plus, BarChart3, MoreHorizontal, ArrowUpRight, Hash, LineChart, Trash2, Edit, X } from 'lucide-react';
import Tooltip from '../components/common/Tooltip';
import ConfirmModal from '../ConfirmModal';
import LinkedMapsModal from '../components/common/LinkedMapsModal';

const Metrics = ({ metrics = [], currentUserId, isWorkspaceOwner, onCreate, onEdit, onDelete }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [integrationBanner, setIntegrationBanner] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedType, setSelectedType] = useState('');
  const integration = searchParams.get('integration');
  const integrationMessage = searchParams.get('message');

  useEffect(() => {
    if (integration !== 'connected' && integration !== 'error') return;

    const nextBanner = integration === 'connected'
      ? { type: 'success', text: t('metrics.integrationConnected') }
      : { type: 'error', text: integrationMessage || t('metrics.integrationError') };

    queueMicrotask(() => {
      setIntegrationBanner(nextBanner);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('integration');
        next.delete('message');
        next.delete('provider');
        return next;
      }, { replace: true });
    });
  }, [integration, integrationMessage, setSearchParams, t]);

  const filteredMetrics = metrics.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = selectedType ? m.type === selectedType : true;
    return matchesSearch && matchesType;
  });

  const getTypeIcon = (type) => {
    switch(type) {
      case 'Series': return <LineChart size={16} className="text-blue-600" />;
      case 'Comparison': return <ArrowUpRight size={16} className="text-green-600" />;
      default: return <Hash size={16} className="text-orange-600" />;
    }
  };

  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, item: null });
  const [linkedMapsConfig, setLinkedMapsConfig] = useState({ isOpen: false, items: [], title: '' });

  const handleDeleteClick = (metric) => {
      setConfirmConfig({ isOpen: true, item: metric });
  };

  const handleConfirmDelete = () => {
      if (onDelete && confirmConfig.item) onDelete(confirmConfig.item.id);
      setConfirmConfig({ isOpen: false, item: null });
  };

  return (
    <div className="p-8 app-shell-bg min-h-screen font-sans text-gray-900" data-testid="metrics-page">
      {integrationBanner && (
        <div className={`mb-4 px-4 py-3 rounded-lg flex items-center justify-between ${integrationBanner.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          <span>{integrationBanner.text}</span>
          <button onClick={() => setIntegrationBanner(null)} className="p-1 hover:opacity-70"><X size={18} /></button>
        </div>
      )}
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
           <BarChart3 className="text-gray-400" /> {t('metrics.title')}
        </h1>
        <button 
            onClick={onCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm transition-colors"
            data-testid="new-metric-button"
        >
          <Plus size={18} />
          {t('metrics.newMetric')}
        </button>
      </header>

      <div className="flex flex-col mb-6">
       <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
                type="text" 
                placeholder={t('metrics.searchMetrics')} 
                className="app-input w-full pl-10 pr-4 py-2 rounded-lg focus:outline-none transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>
        <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium shadow-sm transition-colors ${showFilters ? 'bg-blue-50 border-blue-200 text-blue-600' : 'app-surface-soft text-gray-600 hover:bg-gray-50'}`}
        >
            <Filter size={16} />
            <span>{t('dashboard.filters')}</span>
        </button>
      </div>

      <div className={`grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${showFilters ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className={`pt-4 transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${showFilters ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`}>
            <div className="app-surface-soft flex items-center gap-4 p-4 rounded-lg">
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-gray-500">{t('metrics.type')}</label>
                    <select 
                        className="app-select text-sm rounded-md px-2 py-1.5 outline-none min-w-[150px]"
                        value={selectedType}
                        onChange={(e) => setSelectedType(e.target.value)}
                    >
                        <option value="">{t('metrics.allTypes')}</option>
                        <option value="Number">{t('metrics.typeNumber')}</option>
                        <option value="Comparison">{t('metrics.typeComparison')}</option>
                        <option value="Series">{t('metrics.typeSeries')}</option>
                    </select>
                </div>
                {selectedType && (
                    <button onClick={() => setSelectedType('')} className="mt-auto mb-1 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition" title={t('common.clearFilters')}>
                        <X size={16} />
                    </button>
                )}
            </div>
          </div>
        </div>
      </div>
      </div>

      <div className="app-surface rounded-xl overflow-hidden">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">{t('common.name')}</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">{t('common.type')}</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">{t('common.updated')}</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">{t('common.usedIn')}</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredMetrics.length === 0 ? (
                <tr>
                    <td colSpan="5" className="px-6 py-12 text-center text-gray-500">
                        <div className="flex flex-col items-center justify-center">
                            <BarChart3 size={48} className="text-gray-200 mb-4" />
                            <p className="text-lg font-medium text-gray-900">{t('metrics.noMetricsYet')}</p>
                            <p className="text-sm text-gray-400 mt-1">{t('metrics.createFirstMetric')}</p>
                        </div>
                    </td>
                </tr>
            ) : (
                filteredMetrics.map((metric) => (
              <tr 
                key={metric.id} 
                className="hover:bg-gray-50/80 transition-colors group cursor-pointer"
                onClick={() => onEdit && onEdit(metric)}
                data-testid="metric-row"
                data-metric-id={metric.id}
                data-metric-name={metric.name}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center text-gray-500">
                        <BarChart3 size={16} />
                    </div>
                    <div className="font-bold text-gray-900">{metric.name}</div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                   <div className="flex items-center gap-2 text-sm text-gray-600">
                     {getTypeIcon(metric.type)}
                     {metric.type}
                   </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {metric.updatedAt}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                   {metric.linkedMaps > 0 ? (
                      <button 
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          setLinkedMapsConfig({ 
                            isOpen: true, 
                            items: metric.linkedJourneys || [], 
                            title: `Maps using ${metric.name}` 
                          }); 
                        }}
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 hover:border-blue-200 transition-colors cursor-pointer"
                      >
                        Linked to {metric.linkedMaps} {metric.linkedMaps === 1 ? 'map' : 'maps'}
                      </button>
                  ) : (
                      <span className="text-sm text-gray-400">(not used)</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right flex items-center justify-end gap-2">
                    <Tooltip content={t('metrics.edit')}>
                        <button onClick={(e) => { e.stopPropagation(); onEdit && onEdit(metric); }} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                            <Edit size={18} />
                        </button>
                    </Tooltip>
                    {currentUserId != null && (metric.user_id === currentUserId || isWorkspaceOwner) && (
                        <Tooltip content={t('common.delete')}>
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteClick(metric); }} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
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
        onClose={() => setConfirmConfig({ isOpen: false, item: null })}
        onConfirm={handleConfirmDelete}
        title={t('metrics.deleteMetricConfirm')}
        message={t('metrics.deleteMetricMessage', { name: confirmConfig.item?.name })}
        isDestructive={true}
        confirmText={t('common.delete')}
      />

      <LinkedMapsModal 
        isOpen={linkedMapsConfig.isOpen}
        onClose={() => setLinkedMapsConfig({ ...linkedMapsConfig, isOpen: false })}
        title={linkedMapsConfig.title}
        items={linkedMapsConfig.items}
        onOpenJourney={(id) => navigate(`/journey/${id}`)}
      />
    </div>
  );
};

export default Metrics;
