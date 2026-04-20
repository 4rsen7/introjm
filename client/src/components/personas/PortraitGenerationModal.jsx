import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Folder, FolderOpen, Loader2, Sparkles, X } from 'lucide-react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';

export default function PortraitGenerationModal({ isOpen, onClose, interviews = [], interviewFolders = [], onGenerate }) {
  const { t } = useTranslation();
  useBodyScrollLock(isOpen);

  const availableInterviews = useMemo(
    () => interviews.filter((interview) => (interview.transcript_data?.length || 0) > 0),
    [interviews]
  );

  const [selectedInterviewIds, setSelectedInterviewIds] = useState([]);
  const [title, setTitle] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [expandedFolderIds, setExpandedFolderIds] = useState([]);

  const interviewGroups = useMemo(() => {
    const folderMap = new Map(interviewFolders.map((folder) => [folder.id, { ...folder, interviews: [] }]));
    const rootGroup = { id: 'root', name: t('interviews.noFolder'), isRoot: true, interviews: [] };

    availableInterviews.forEach((interview) => {
      if (interview.folder_id && folderMap.has(interview.folder_id)) {
        folderMap.get(interview.folder_id).interviews.push(interview);
        return;
      }
      rootGroup.interviews.push(interview);
    });

    return [
      rootGroup,
      ...Array.from(folderMap.values()),
    ].filter((group) => group.interviews.length > 0);
  }, [availableInterviews, interviewFolders, t]);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedInterviewIds([]);
    setTitle('');
    setError('');
    setIsGenerating(false);
    setExpandedFolderIds([]);
  }, [availableInterviews, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (selectedInterviewIds.length === 0 || isGenerating) return;
    setIsGenerating(true);
    setError('');
    try {
      await onGenerate({
        interviewIds: selectedInterviewIds,
        title: title.trim(),
      });
      onClose();
    } catch (err) {
      setError(err.message || t('personas.portraits.generateFailed'));
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleInterview = (interviewId) => {
    setSelectedInterviewIds((current) => (
      current.includes(interviewId)
        ? current.filter((id) => id !== interviewId)
        : [...current, interviewId]
    ));
  };

  const toggleFolderExpanded = (folderId) => {
    setExpandedFolderIds((current) => (
      current.includes(folderId)
        ? current.filter((id) => id !== folderId)
        : [...current, folderId]
    ));
  };

  const toggleFolderSelection = (group) => {
    const ids = group.interviews.map((interview) => interview.id);
    const allSelected = ids.every((id) => selectedInterviewIds.includes(id));
    setSelectedInterviewIds((current) => {
      if (allSelected) {
        return current.filter((id) => !ids.includes(id));
      }
      return Array.from(new Set([...current, ...ids]));
    });
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}></div>
      <div className="app-modal-panel relative rounded-2xl w-full max-w-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{t('personas.portraits.generateTitle')}</h2>
            <p className="text-sm text-gray-500 mt-1">{t('personas.portraits.generateDesc')}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {availableInterviews.length === 0 ? (
            <div className="app-empty-state rounded-xl px-4 py-8 text-center">
              <div className="text-sm font-medium text-gray-900">{t('personas.portraits.noInterviewsTitle')}</div>
              <p className="text-sm text-gray-500 mt-2">{t('personas.portraits.noInterviewsDesc')}</p>
            </div>
          ) : (
            <>
              <div>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <label className="block text-sm font-medium text-gray-700">{t('personas.portraits.sourceInterviews')}</label>
                  <span className="text-xs font-medium text-gray-500">
                    {t('personas.portraits.selectedInterviewsCount', { count: selectedInterviewIds.length })}
                  </span>
                </div>
                <div className="app-surface-soft max-h-64 overflow-y-auto rounded-xl divide-y divide-gray-100">
                  {interviewGroups.map((group) => {
                    const isExpanded = expandedFolderIds.includes(group.id);
                    const selectedInGroup = group.interviews.filter((interview) => selectedInterviewIds.includes(interview.id)).length;
                    const allSelected = selectedInGroup === group.interviews.length;
                    const partiallySelected = selectedInGroup > 0 && !allSelected;
                    const GroupIcon = group.isRoot ? FolderOpen : Folder;

                    return (
                      <div key={group.id}>
                        <div className="flex items-center gap-3 px-4 py-3 bg-white/70">
                          <button
                            type="button"
                            onClick={() => toggleFolderExpanded(group.id)}
                            className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                          >
                            <ChevronDown size={16} className={`transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                          </button>
                          <input
                            type="checkbox"
                            checked={allSelected}
                            ref={(node) => {
                              if (node) node.indeterminate = partiallySelected;
                            }}
                            onChange={() => toggleFolderSelection(group)}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <GroupIcon size={16} className="text-gray-400" />
                          <button
                            type="button"
                            onClick={() => toggleFolderExpanded(group.id)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="truncate text-sm font-semibold text-gray-900">{group.name}</div>
                          </button>
                          <span className="text-xs text-gray-400">{group.interviews.length}</span>
                        </div>

                        {isExpanded ? (
                          <div className="divide-y divide-gray-100">
                            {group.interviews.map((interview) => {
                              const checked = selectedInterviewIds.includes(interview.id);
                              return (
                                <label key={interview.id} className="flex items-start gap-3 pl-14 pr-4 py-3 hover:bg-gray-50 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleInterview(interview.id)}
                                    className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium text-gray-900">{interview.title}</div>
                                    <div className="text-xs text-gray-500 mt-1">
                                      {(interview.transcript_data?.length || 0)} {t('interviews.transcriptLines')}
                                    </div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-500 mt-2">{t('personas.portraits.sourceInterviewsHint')}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('personas.portraits.customTitle')}</label>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={t('personas.portraits.customTitlePlaceholder')}
                  className="app-input w-full px-3 py-2 rounded-lg outline-none transition"
                />
                <p className="text-xs text-gray-500 mt-2">{t('personas.portraits.customTitleHint')}</p>
              </div>

              <div className="app-surface-soft rounded-xl p-4 space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('personas.portraits.methodology')}</div>
                <p className="text-sm text-slate-700 leading-relaxed">{t('personas.portraits.methodologyDesc')}</p>
              </div>
            </>
          )}

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 app-surface-soft flex items-center justify-end gap-3">
          <button onClick={onClose} className="app-surface-soft px-4 py-2 rounded-lg text-gray-700 hover:bg-gray-200 transition-colors">
            {t('interviews.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={selectedInterviewIds.length === 0 || availableInterviews.length === 0 || isGenerating}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white font-medium transition-colors ${
              selectedInterviewIds.length === 0 || availableInterviews.length === 0 || isGenerating
                ? 'bg-blue-300 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {isGenerating ? t('personas.portraits.generating') : t('personas.portraits.generateButton')}
          </button>
        </div>
      </div>
    </div>
  );
}
