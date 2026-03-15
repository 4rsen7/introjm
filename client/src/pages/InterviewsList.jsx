import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Filter, Copy, Trash2, Plus, Mic, X, UploadCloud, Video } from 'lucide-react';
import { useInterviews } from '../hooks/useQueries';
import { getAuthToken } from '../services/auth';
import { useQueryClient } from '@tanstack/react-query';
import Tooltip from '../components/common/Tooltip';
import ConfirmModal from '../ConfirmModal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5005/api';

export default function InterviewsList({ userProfile, currentWorkspace, onLimitReached }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: interviews = [], isLoading, isError } = useInterviews();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [showCreationModal, setShowCreationModal] = useState(false);
  const [creationMode, setCreationMode] = useState(null); // 'select' | 'live' | 'upload'
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, action: null, item: null });

  const filteredInterviews = interviews.filter(int => 
    (int.title?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  const handleCreateNew = async (type = 'live') => {
    setIsCreating(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${API_URL}/interviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          title: `Interview - ${new Date().toLocaleDateString()}`,
          workspace_id: currentWorkspace?.id,
          type: type
        })
      });
      
      const json = await res.json();

      if (res.status === 403 && json.code === 'LIMIT_REACHED') {
        onLimitReached?.('interviews');
        return;
      }

      if (res.ok && json.data) {
        queryClient.invalidateQueries(['interviews']);
        setShowCreationModal(false);
        setCreationMode(null);
        navigate(`/interviews/${json.data.id}${type === 'upload' ? '?mode=upload' : ''}`);
      } else {
        alert(json.error || 'Failed to create interview');
      }
    } catch (err) {
      console.error(err);
      alert('Network error');
    } finally {
      setIsCreating(false);
    }
  };

  const openCreationModal = () => {
    setCreationMode('select');
    setShowCreationModal(true);
  };

  const handleConfirmAction = async () => {
    const { action, item } = confirmConfig;
    if (action === 'delete') {
      try {
        const token = await getAuthToken();
        const res = await fetch(`${API_URL}/interviews/${item.id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          queryClient.invalidateQueries(['interviews']);
        } else {
          const json = await res.json();
          alert(json.message || json.error || 'Failed to delete');
        }
      } catch (err) {
        console.error(err);
      }
    }
    setConfirmConfig({ isOpen: false, action: null, item: null });
  };

  const openConfirm = (action, item) => {
    setConfirmConfig({ isOpen: true, action, item });
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-blue-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-red-500">
        <p>Error loading interviews. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="p-8 bg-gray-50 min-h-screen font-sans text-gray-900">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
           <Mic className="text-gray-400" /> {t('interviews.title')}
        </h1>
        <button 
          onClick={openCreationModal}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm transition-colors"
        >
          <Plus size={18} />
          {t('interviews.newInterview')}
        </button>
      </header>

      <div className="flex flex-col mb-6">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder={t('interviews.search')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
            />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">{t('common.name')}</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">{t('common.type')}</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">{t('common.updated')}</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">{t('common.createdBy')}</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredInterviews.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-6 py-12 text-center text-gray-500">
                  <div className="flex flex-col items-center justify-center">
                    <Mic size={48} className="text-gray-200 mb-4" />
                    <p className="text-lg font-medium text-gray-900">{t('interviews.noInterviewsMsg')}</p>
                    <p className="text-sm text-gray-500 mt-1 mb-6 text-center max-w-md">{t('interviews.noInterviewsDesc')}</p>
                    <button
                      onClick={openCreationModal}
                      className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm font-medium"
                    >
                      <Plus size={18} />
                      {t('interviews.startFirst')}
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              filteredInterviews.map((interview) => (
                <tr 
                  key={interview.id} 
                  className="hover:bg-gray-50/80 transition-colors group cursor-pointer"
                  onClick={() => navigate(`/interviews/${interview.id}`)}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 font-bold shrink-0 shadow-sm border border-blue-100">
                        <Mic size={20} className="text-blue-500 opacity-80" />
                      </div>
                      <div>
                        <div className="font-bold text-gray-900">{interview.title}</div>
                        <div className="text-sm text-gray-500">
                          {interview.transcript_data?.length || 0} {t('interviews.transcriptLines')}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold capitalize ${
                      interview.type === 'upload' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-blue-50 text-blue-700 border border-blue-100'
                    }`}>
                      {interview.type === 'upload' ? <UploadCloud size={12} /> : <Video size={12} />}
                      {interview.type === 'upload' ? t('interviews.typeUpload') : t('interviews.typeLive')}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {interview.updatedAt}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-600 border border-white shadow-sm">
                        {(interview.owner || 'U').charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm text-gray-600">{interview.owner || 'Unknown'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right flex items-center justify-end gap-2">
                    {userProfile != null && (interview.user_id === userProfile.id || currentWorkspace?.role === 'owner') && (
                      <Tooltip content={t('common.delete') || 'Delete'}>
                        <button 
                          onClick={(e) => { e.stopPropagation(); openConfirm('delete', interview); }}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      </Tooltip>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ConfirmModal 
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
        onConfirm={handleConfirmAction}
        title={t('interviews.deleteTitle')}
        message={t('interviews.deleteMessage', { title: confirmConfig.item?.title })}
        confirmText={t('interviews.deleteConfirm')}
        isDestructive={true}
      />

      {/* Creation Modal */}
      {showCreationModal && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900">
                {creationMode === 'select' && t('interviews.selectTypeModalTitle')}
                {creationMode === 'live' && t('interviews.liveTitle')}
                {creationMode === 'upload' && t('interviews.uploadTitle')}
              </h2>
              <button 
                onClick={() => { setShowCreationModal(false); setCreationMode(null); }}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                disabled={isCreating}
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-8">
              {creationMode === 'select' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Option 1: Live */}
                  <div 
                    onClick={() => setCreationMode('live')}
                    className="group border-2 border-transparent hover:border-blue-500 bg-gray-50 hover:bg-blue-50/50 rounded-xl p-6 cursor-pointer transition-all text-center flex flex-col items-center gap-4"
                  >
                    <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Mic size={32} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 mb-2">{t('interviews.liveTitle')}</h3>
                      <p className="text-sm text-gray-500 leading-relaxed">
                        {t('interviews.liveDesc')}
                      </p>
                    </div>
                  </div>

                  {/* Option 2: Upload */}
                  <div 
                    onClick={() => setCreationMode('upload')}
                    className="group border-2 border-transparent hover:border-emerald-500 bg-gray-50 hover:bg-emerald-50/50 rounded-xl p-6 cursor-pointer transition-all text-center flex flex-col items-center gap-4"
                  >
                    <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <UploadCloud size={32} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 mb-2">{t('interviews.uploadTitle')}</h3>
                      <p className="text-sm text-gray-500 leading-relaxed">
                        {t('interviews.uploadDesc')}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {creationMode === 'live' && (
                <div className="text-center py-6">
                  <div className="w-20 h-20 rounded-full bg-blue-50 border-4 border-white shadow-xl flex items-center justify-center mx-auto mb-6">
                    <Mic size={36} className="text-blue-600" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">{t('interviews.readyToStart')}</h3>
                  <p className="text-gray-500 max-w-sm mx-auto mb-8">
                    {t('interviews.readyToStartDesc')}
                  </p>
                  <div className="flex gap-3 justify-center">
                    <button onClick={() => setCreationMode('select')} className="px-6 py-2.5 rounded-lg text-gray-600 font-medium hover:bg-gray-100 transition-colors" disabled={isCreating}>
                      {t('interviews.back')}
                    </button>
                    <button 
                      onClick={() => handleCreateNew('live')} 
                      className="flex items-center gap-2 px-8 py-2.5 bg-blue-600 text-white rounded-lg font-medium shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
                      disabled={isCreating}
                    >
                      {isCreating ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Video size={18} />}
                      {t('interviews.createRoom')}
                    </button>
                  </div>
                </div>
              )}

              {creationMode === 'upload' && (
                <div className="text-center py-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-3">{t('interviews.almostThere')}</h3>
                  <p className="text-gray-500 max-w-sm mx-auto mb-8">
                    {t('interviews.almostThereDesc')}
                  </p>
                  <div className="flex gap-3 justify-center">
                    <button onClick={() => setCreationMode('select')} className="px-6 py-2.5 rounded-lg text-gray-600 font-medium hover:bg-gray-100 transition-colors" disabled={isCreating}>
                      {t('interviews.back')}
                    </button>
                    <button 
                      onClick={() => handleCreateNew('upload')} 
                      className="flex items-center gap-2 px-8 py-2.5 bg-emerald-600 text-white rounded-lg font-medium shadow-sm hover:bg-emerald-700 transition-colors disabled:opacity-50"
                      disabled={isCreating}
                    >
                      {isCreating ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : t('interviews.continue')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
