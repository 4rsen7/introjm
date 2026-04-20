import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Trash2, Plus, Mic, X, UploadCloud, Video, Folder, FolderOpen, FolderPlus, Inbox, GripVertical } from 'lucide-react';
import { getAuthToken } from '../services/auth';
import { useQueryClient } from '@tanstack/react-query';
import Tooltip from '../components/common/Tooltip';
import ConfirmModal from '../ConfirmModal';
import { API_BASE_URL } from '../config/api';

const API_URL = API_BASE_URL;

export default function InterviewsList({ interviews = [], folders = [], userProfile, currentWorkspace, onLimitReached }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [showCreationModal, setShowCreationModal] = useState(false);
  const [creationMode, setCreationMode] = useState(null); // 'select' | 'live' | 'upload'
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, action: null, item: null });
  const [activeFolderId, setActiveFolderId] = useState('all');
  const [dragOverFolderId, setDragOverFolderId] = useState(null);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [folderError, setFolderError] = useState('');
  const [isFolderCreating, setIsFolderCreating] = useState(false);

  const folderCounts = folders.reduce((acc, folder) => {
    acc[folder.id] = interviews.filter((interview) => interview.folder_id === folder.id).length;
    return acc;
  }, {});
  const rootCount = interviews.filter((interview) => !interview.folder_id).length;

  const filteredInterviews = interviews.filter((int) => {
    const matchesSearch = (int.title?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    const matchesFolder = activeFolderId === 'all'
      ? true
      : activeFolderId === 'root'
        ? !int.folder_id
        : int.folder_id === activeFolderId;
    return matchesSearch && matchesFolder;
  });

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
          type: type,
          folder_id: activeFolderId !== 'all' && activeFolderId !== 'root' ? activeFolderId : null
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
    if (action === 'deleteFolder') {
      try {
        const token = await getAuthToken();
        const res = await fetch(`${API_URL}/interview-folders/${item.id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          if (activeFolderId === item.id) setActiveFolderId('all');
          queryClient.invalidateQueries(['interview_folders']);
          queryClient.invalidateQueries(['interviews']);
        } else {
          const json = await res.json();
          alert(json.message || json.error || 'Failed to delete folder');
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

  const openFolderModal = () => {
    setFolderName('');
    setFolderError('');
    setIsFolderModalOpen(true);
  };

  const closeFolderModal = () => {
    if (isFolderCreating) return;
    setIsFolderModalOpen(false);
    setFolderName('');
    setFolderError('');
  };

  const handleCreateFolder = async (event) => {
    event?.preventDefault();
    const nextFolderName = folderName.trim();
    if (!nextFolderName) {
      setFolderError(t('interviews.folderNameRequired') || 'Folder name is required');
      return;
    }

    setIsFolderCreating(true);
    setFolderError('');
    try {
      const token = await getAuthToken();
      const res = await fetch(`${API_URL}/interview-folders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: nextFolderName,
          workspace_id: currentWorkspace?.id,
        })
      });
      const json = await res.json();
      if (res.ok && json.data) {
        queryClient.invalidateQueries(['interview_folders']);
        setActiveFolderId(json.data.id);
        setIsFolderModalOpen(false);
        setFolderName('');
        setFolderError('');
      } else {
        setFolderError(json.message || json.error || t('interviews.folderCreateFailed') || 'Failed to create folder');
      }
    } catch (err) {
      console.error(err);
      setFolderError(t('common.networkError') || 'Network error');
    } finally {
      setIsFolderCreating(false);
    }
  };

  const moveInterviewToFolder = async (interviewId, folderId) => {
    try {
      const token = await getAuthToken();
      const res = await fetch(`${API_URL}/interviews/${interviewId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ folder_id: folderId === 'root' ? null : folderId })
      });
      if (res.ok) {
        queryClient.invalidateQueries(['interviews']);
        return;
      }
      const json = await res.json();
      alert(json.message || json.error || 'Failed to move interview');
    } catch (err) {
      console.error(err);
      alert('Network error');
    }
  };

  const handleFolderDrop = (event, folderId) => {
    event.preventDefault();
    setDragOverFolderId(null);
    const interviewId = event.dataTransfer.getData('text/plain');
    if (!interviewId) return;
    moveInterviewToFolder(interviewId, folderId);
  };

  const renderFolderButton = ({ id, name, count, icon: Icon, isSystem = false }) => {
    const isActive = activeFolderId === id;
    const isDragOver = dragOverFolderId === id;
    return (
      <div
        key={id}
        role="button"
        tabIndex={0}
        onClick={() => setActiveFolderId(id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setActiveFolderId(id);
          }
        }}
        onDragOver={(event) => { event.preventDefault(); setDragOverFolderId(id); }}
        onDragLeave={() => setDragOverFolderId((current) => current === id ? null : current)}
        onDrop={(event) => handleFolderDrop(event, id)}
        className={`group w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
          isActive
            ? 'bg-blue-50 text-blue-700 border border-blue-100'
            : isDragOver
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
              : 'text-gray-600 hover:bg-gray-50 border border-transparent'
        }`}
      >
        <Icon size={17} className={isActive ? 'text-blue-600' : 'text-gray-400'} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
        <span className="text-xs text-gray-400">{count}</span>
        {!isSystem && (
          <span
            role="button"
            tabIndex={0}
            onClick={(event) => { event.stopPropagation(); openConfirm('deleteFolder', { id, name }); }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                openConfirm('deleteFolder', { id, name });
              }
            }}
            className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
          >
            <Trash2 size={14} />
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="p-8 app-shell-bg min-h-screen font-sans text-gray-900" data-testid="interviews-page">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
           <Mic className="text-gray-400" /> {t('interviews.title')}
        </h1>
        <button 
          onClick={openCreationModal}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm transition-colors"
          data-testid="new-interview-button"
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
              className="app-input w-full pl-10 pr-4 py-2 rounded-lg focus:outline-none transition-all"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="app-surface rounded-xl p-4 h-fit">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="text-xs font-bold uppercase tracking-wider text-gray-500">{t('interviews.folders')}</div>
            <Tooltip content={t('interviews.newFolder') || 'New folder'}>
              <button
                type="button"
                onClick={openFolderModal}
                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <FolderPlus size={17} />
              </button>
            </Tooltip>
          </div>
          <div className="space-y-1">
            {renderFolderButton({ id: 'all', name: t('interviews.allInterviews'), count: interviews.length, icon: Inbox, isSystem: true })}
            {renderFolderButton({ id: 'root', name: t('interviews.noFolder'), count: rootCount, icon: FolderOpen, isSystem: true })}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-1">
            {folders.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-gray-400">{t('interviews.noFolders')}</div>
            ) : folders.map((folder) => (
              renderFolderButton({
                id: folder.id,
                name: folder.name,
                count: folderCounts[folder.id] || 0,
                icon: Folder,
              })
            ))}
          </div>
        </aside>

        <div className="app-surface rounded-xl overflow-hidden min-w-0">
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
                    className="app-surface-soft flex items-center gap-2 px-4 py-2 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm font-medium"
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
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/plain', interview.id);
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                  className="hover:bg-gray-50/80 transition-colors group cursor-pointer"
                  onClick={() => navigate(`/interviews/${interview.id}`)}
                  data-testid="interview-row"
                  data-interview-id={interview.id}
                  data-interview-title={interview.title}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-4">
                      <div className="opacity-0 group-hover:opacity-100 text-gray-300 transition-opacity">
                        <GripVertical size={16} />
                      </div>
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
                    {userProfile != null && (interview.user_id === userProfile.id || (currentWorkspace?.role === 'owner' && interview.workspace_id === currentWorkspace?.id)) && (
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
      </div>

      <ConfirmModal 
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
        onConfirm={handleConfirmAction}
        title={confirmConfig.action === 'deleteFolder' ? t('interviews.deleteFolderTitle') : t('interviews.deleteTitle')}
        message={
          confirmConfig.action === 'deleteFolder'
            ? t('interviews.deleteFolderMessage', { name: confirmConfig.item?.name })
            : t('interviews.deleteMessage', { title: confirmConfig.item?.title })
        }
        confirmText={t('interviews.deleteConfirm')}
        isDestructive={true}
      />

      {isFolderModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={closeFolderModal}
            aria-label={t('common.cancel')}
          />
          <form
            onSubmit={handleCreateFolder}
            className="app-modal-panel relative w-full max-w-md overflow-hidden rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shrink-0">
                  <FolderPlus size={20} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-gray-900">{t('interviews.createFolderTitle')}</h2>
                  <p className="text-sm text-gray-500 mt-0.5">{t('interviews.createFolderDesc')}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeFolderModal}
                disabled={isFolderCreating}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('interviews.folderName')}</label>
                <input
                  autoFocus
                  value={folderName}
                  onChange={(event) => {
                    setFolderName(event.target.value);
                    if (folderError) setFolderError('');
                  }}
                  placeholder={t('interviews.folderNamePlaceholder')}
                  className="app-input w-full px-3 py-2.5 rounded-lg outline-none transition"
                  disabled={isFolderCreating}
                  maxLength={80}
                />
              </div>
              {folderError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {folderError}
                </div>
              ) : null}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 app-surface-soft flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeFolderModal}
                disabled={isFolderCreating}
                className="px-4 py-2 rounded-lg text-gray-700 font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={!folderName.trim() || isFolderCreating}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white font-medium transition-colors ${
                  !folderName.trim() || isFolderCreating
                    ? 'bg-blue-300 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {isFolderCreating ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <FolderPlus size={16} />
                )}
                {t('interviews.createFolderAction')}
              </button>
            </div>
          </form>
        </div>
      )}

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
