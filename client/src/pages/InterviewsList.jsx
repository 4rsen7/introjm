import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Trash2, Plus, Mic, X, UploadCloud, Video, Folder, FolderOpen, FolderPlus, Inbox, GripVertical, Layers3 } from 'lucide-react';
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
  const activeFolder = folders.find((folder) => folder.id === activeFolderId);
  const activeFolderName = activeFolderId === 'all'
    ? t('interviews.allInterviews')
    : activeFolderId === 'root'
      ? t('interviews.noFolder')
      : activeFolder?.name || t('interviews.folders');
  const activeFolderCount = activeFolderId === 'all'
    ? interviews.length
    : activeFolderId === 'root'
      ? rootCount
      : folderCounts[activeFolderId] || 0;

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
      const wasActiveFolder = activeFolderId === item.id;
      setConfirmConfig({ isOpen: false, action: null, item: null });
      if (wasActiveFolder) setActiveFolderId('all');

      const previousFolders = queryClient.getQueryData(['interview_folders']);
      const previousInterviews = queryClient.getQueryData(['interviews']);
      void queryClient.cancelQueries({ queryKey: ['interview_folders'] });
      void queryClient.cancelQueries({ queryKey: ['interviews'] });

      queryClient.setQueryData(['interview_folders'], (current = []) => (
        Array.isArray(current) ? current.filter((folder) => folder.id !== item.id) : current
      ));
      queryClient.setQueryData(['interviews'], (current = []) => (
        Array.isArray(current)
          ? current.map((interview) => (
              interview.folder_id === item.id ? { ...interview, folder_id: null } : interview
            ))
          : current
      ));

      try {
        const token = await getAuthToken();
        const res = await fetch(`${API_URL}/interview-folders/${item.id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          queryClient.invalidateQueries({ queryKey: ['interview_folders'] });
          queryClient.invalidateQueries({ queryKey: ['interviews'] });
        } else {
          const json = await res.json();
          queryClient.setQueryData(['interview_folders'], previousFolders);
          queryClient.setQueryData(['interviews'], previousInterviews);
          if (wasActiveFolder) setActiveFolderId(item.id);
          alert(json.message || json.error || 'Failed to delete folder');
        }
      } catch (err) {
        console.error(err);
        queryClient.setQueryData(['interview_folders'], previousFolders);
        queryClient.setQueryData(['interviews'], previousInterviews);
        if (wasActiveFolder) setActiveFolderId(item.id);
        alert('Network error');
      }
      return;
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
    const nextFolderId = folderId === 'root' ? null : folderId;
    const interview = interviews.find((item) => item.id === interviewId);
    if (!interview || interview.folder_id === nextFolderId) return;

    const previousInterviews = queryClient.getQueryData(['interviews']);
    void queryClient.cancelQueries({ queryKey: ['interviews'] });

    queryClient.setQueryData(['interviews'], (current = []) => (
      Array.isArray(current)
        ? current.map((item) => (
            item.id === interviewId ? { ...item, folder_id: nextFolderId } : item
          ))
        : current
    ));

    try {
      const token = await getAuthToken();
      const res = await fetch(`${API_URL}/interviews/${interviewId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ folder_id: nextFolderId })
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['interviews'] });
        return;
      }
      const json = await res.json();
      queryClient.setQueryData(['interviews'], previousInterviews);
      alert(json.message || json.error || 'Failed to move interview');
    } catch (err) {
      console.error(err);
      queryClient.setQueryData(['interviews'], previousInterviews);
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

  const getInterviewFolderName = (folderId) => {
    if (!folderId) return t('interviews.noFolder');
    return folders.find((folder) => folder.id === folderId)?.name || t('interviews.folders');
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
        className={`group grid w-full grid-cols-[32px_minmax(0,1fr)_44px_28px] items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
          isActive
            ? 'bg-blue-600 text-white border border-blue-600 shadow-sm shadow-blue-600/20'
            : isDragOver
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 ring-4 ring-emerald-100'
              : 'text-gray-600 hover:bg-white hover:text-gray-900 border border-transparent'
        }`}
      >
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          isActive ? 'bg-white/15 text-white' : 'bg-gray-100 text-gray-400 group-hover:text-blue-600'
        }`}>
          <Icon size={17} />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
        <span className={`inline-flex h-7 w-11 items-center justify-center rounded-full text-xs font-semibold ${
          isActive ? 'bg-white/15 text-white' : 'bg-gray-100 text-gray-500'
        }`}>{count}</span>
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
            className={`p-1 rounded transition ${
              isActive
                ? 'text-white/60 hover:text-white hover:bg-white/15'
                : 'text-gray-400 opacity-0 group-hover:opacity-100 hover:text-red-600 hover:bg-red-50'
            }`}
          >
            <Trash2 size={14} />
          </span>
        )}
        {isSystem && (
          <span aria-hidden="true" className="h-7 w-7" />
        )}
      </div>
    );
  };

  return (
    <div className="p-8 app-shell-bg min-h-screen font-sans text-gray-900" data-testid="interviews-page">
      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <Mic className="text-gray-400" />
            {t('interviews.title')}
          </h1>
        </div>
        <button 
          onClick={openCreationModal}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm transition-colors"
          data-testid="new-interview-button"
        >
          <Plus size={18} />
          {t('interviews.newInterview')}
        </button>
      </header>

      <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="app-surface h-fit overflow-hidden rounded-2xl">
          <div className="border-b border-gray-100 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-gray-500">{t('interviews.folders')}</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">
                  {t('interviews.allInterviews')}
                </div>
              </div>
              <Tooltip content={t('interviews.newFolder') || 'New folder'}>
                <button
                  type="button"
                  onClick={openFolderModal}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600 transition-colors hover:border-blue-200 hover:bg-blue-100"
                >
                  <FolderPlus size={18} />
                </button>
              </Tooltip>
            </div>
          </div>

          <div className="space-y-1 p-3">
            {renderFolderButton({ id: 'all', name: t('interviews.allInterviews'), count: interviews.length, icon: Inbox, isSystem: true })}
            {renderFolderButton({ id: 'root', name: t('interviews.noFolder'), count: rootCount, icon: FolderOpen, isSystem: true })}
          </div>

          <div className="border-t border-gray-100 p-3">
            {folders.length === 0 ? (
              <button
                type="button"
                onClick={openFolderModal}
                className="app-empty-state flex w-full flex-col items-center justify-center rounded-2xl px-4 py-7 text-center transition-colors hover:border-blue-200 hover:bg-blue-50/50"
              >
                <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm">
                  <FolderPlus size={20} />
                </span>
                <span className="text-sm font-bold text-gray-900">{t('interviews.noFolders')}</span>
                <span className="mt-1 text-xs font-medium text-gray-500">{t('interviews.newFolder')}</span>
              </button>
            ) : (
              <div className="space-y-1">
                {folders.map((folder) => (
                  renderFolderButton({
                    id: folder.id,
                    name: folder.name,
                    count: folderCounts[folder.id] || 0,
                    icon: Folder,
                  })
                ))}
              </div>
            )}
          </div>
        </aside>

        <section className="app-surface min-w-0 overflow-hidden rounded-2xl">
          <div className="border-b border-gray-100 px-5 py-4 lg:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-lg font-semibold tracking-tight text-gray-900">{activeFolderName}</h2>
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">
                    <Layers3 size={13} />
                    {activeFolderCount}
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium text-gray-500">
                  {filteredInterviews.length} {t('interviews.visibleInterviews')}
                </p>
              </div>
              <div className="relative w-full lg:w-80">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder={t('interviews.search')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="app-input w-full rounded-xl py-3 pl-11 pr-4 text-sm font-medium outline-none transition-all"
                />
              </div>
            </div>
          </div>

          <div className="hidden grid-cols-[minmax(260px,1.5fr)_130px_130px_180px_64px] gap-4 border-b border-gray-100 bg-gray-50/70 px-5 py-3 text-xs font-semibold text-gray-500 lg:grid lg:px-6">
            <div>{t('common.name')}</div>
            <div>{t('common.type')}</div>
            <div>{t('common.updated')}</div>
            <div>{t('common.createdBy')}</div>
            <div className="text-right">{t('common.actions')}</div>
          </div>

          {filteredInterviews.length === 0 ? (
            <div className="px-5 py-14 lg:px-6">
              <div className="app-empty-state mx-auto flex max-w-lg flex-col items-center justify-center rounded-3xl px-8 py-12 text-center">
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm">
                  <Mic size={30} />
                </div>
                <p className="text-lg font-medium text-gray-900">{t('interviews.noInterviewsMsg')}</p>
                <p className="mt-2 max-w-sm text-sm leading-6 text-gray-500">{t('interviews.noInterviewsDesc')}</p>
                <button
                  onClick={openCreationModal}
                  className="mt-7 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
                >
                  <Plus size={18} />
                  {t('interviews.startFirst')}
                </button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredInterviews.map((interview) => (
                <div
                  key={interview.id}
                  role="button"
                  tabIndex={0}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/plain', interview.id);
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      navigate(`/interviews/${interview.id}`);
                    }
                  }}
                  className="group grid gap-4 px-5 py-4 transition-colors hover:bg-white lg:grid-cols-[minmax(260px,1.5fr)_130px_130px_180px_64px] lg:items-center lg:px-6"
                  onClick={() => navigate(`/interviews/${interview.id}`)}
                  data-testid="interview-row"
                  data-interview-id={interview.id}
                  data-interview-title={interview.title}
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="hidden text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 lg:block">
                      <GripVertical size={16} />
                    </div>
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-blue-600 shadow-sm">
                      <Mic size={21} className="text-blue-500" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-bold text-gray-900">{interview.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm font-medium text-gray-500">
                        <span>{interview.transcript_data?.length || 0} {t('interviews.transcriptLines')}</span>
                        {activeFolderId === 'all' && (
                          <span className="inline-flex max-w-[180px] items-center gap-1 truncate rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                            <Folder size={12} />
                            <span className="truncate">{getInterviewFolderName(interview.folder_id)}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                      interview.type === 'upload' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-blue-50 text-blue-700 ring-1 ring-blue-100'
                    }`}>
                      {interview.type === 'upload' ? <UploadCloud size={12} /> : <Video size={12} />}
                      {interview.type === 'upload' ? t('interviews.typeUpload') : t('interviews.typeLive')}
                    </span>
                  </div>

                  <div className="text-sm text-gray-500">{interview.updatedAt}</div>

                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white bg-gray-200 text-[10px] font-bold text-gray-600 shadow-sm">
                      {(interview.owner || 'U').charAt(0).toUpperCase()}
                    </div>
                    <span className="truncate text-sm text-gray-600">{interview.owner || 'Unknown'}</span>
                  </div>

                  <div className="flex items-center justify-end">
                    {userProfile != null && (interview.user_id === userProfile.id || (currentWorkspace?.role === 'owner' && interview.workspace_id === currentWorkspace?.id)) && (
                      <Tooltip content={t('common.delete') || 'Delete'}>
                        <button 
                          onClick={(e) => { e.stopPropagation(); openConfirm('delete', interview); }}
                          className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={17} />
                        </button>
                      </Tooltip>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
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
