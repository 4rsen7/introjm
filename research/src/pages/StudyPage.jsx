import { useCallback, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowUpRight, BookOpen, Check, ClipboardList, FileAudio, ListChecks, Plus, Sparkles, Trash2, UploadCloud, X } from 'lucide-react';
import { useResearchContext } from '../app/App';
import { researchKey, researchRequest, uploadInterviewAudio, useResearchQuery } from '../hooks/useResearch';
import { EmptyState, ErrorState, Loading, Modal, ModalForm, Status } from '../components/UI';
import StudyForm from '../components/StudyForm';
import StudyPlanPanel from '../components/StudyPlanPanel';
import PreparationPanel from '../components/PreparationPanel';
import ResultsPanel from '../components/ResultsPanel';
import SynthesisPanel from '../components/SynthesisPanel';

export default function StudyPage() {
  const { t } = useTranslation();
  const { studyId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, workspace } = useResearchContext();
  const [dialog, setDialog] = useState(null);
  const [editingStudy, setEditingStudy] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const [page, setPage] = useState([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [sessionSearch, setSessionSearch] = useState('');
  const [sessionStatus, setSessionStatus] = useState('all');
  const [newTitle, setNewTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [createAutoSummary, setCreateAutoSummary] = useState(true);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef(null);
  const study = useResearchQuery(user.id, workspace.id, ['study', studyId], `/studies/${studyId}`);
  const interviews = useResearchQuery(user.id, workspace.id, ['interviews', studyId], `/studies/${studyId}/interviews`);
  const close = useCallback(() => {
    setDialog(null);
    setError(null);
    setNewTitle('');
    setSelectedFile(null);
    setIsDraggingFile(false);
  }, []);
  const handleSelectCreateFile = (file) => {
    if (!file) return;
    setSelectedFile(file);
    setError(null);
    if (!newTitle.trim()) {
      const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim();
      if (baseName) setNewTitle(baseName.slice(0, 240));
    }
  };
  const refresh = async () => {
    setPage([]); setHasMore(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: researchKey(user.id, workspace.id, 'study', studyId) }),
      queryClient.invalidateQueries({ queryKey: researchKey(user.id, workspace.id, 'interviews', studyId) }),
      queryClient.invalidateQueries({ queryKey: researchKey(user.id, workspace.id, 'studies') }),
      queryClient.invalidateQueries({ queryKey: researchKey(user.id, workspace.id, 'synthesis', studyId) }),
    ]);
  };
  const save = async (values) => {
    setBusy(true); setError(null);
    try {
      await researchRequest(`/studies/${studyId}`, { method: 'PATCH', body: JSON.stringify({ ...values, revision: editingStudy.revision }) });
      await refresh(); close(); setNotice('briefSaved');
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const create = async (event) => {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const formTitle = String(new FormData(event.currentTarget).get('title') || newTitle || '').trim();
      const fallbackTitle = selectedFile ? selectedFile.name.replace(/\.[^/.]+$/, '').trim() : '';
      const title = (formTitle || fallbackTitle || 'Interview').slice(0, 240);
      const interview = await researchRequest(`/studies/${studyId}/interviews`, { method: 'POST', body: JSON.stringify({ title }) });
      if (selectedFile) {
        await uploadInterviewAudio(interview.id, selectedFile, { autoSummary: createAutoSummary });
      }
      close();
      await refresh();
      navigate(`/studies/${studyId}/interviews/${interview.id}`, { state: { initialTab: 'transcript' } });
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const archive = async () => {
    setBusy(true); setError(null);
    try {
      await researchRequest(`/studies/${studyId}`, { method: 'DELETE', body: JSON.stringify({ revision: study.data.revision }) });
      close();
      await queryClient.invalidateQueries({ queryKey: researchKey(user.id, workspace.id, 'studies') });
      navigate('/');
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const duplicate = async (values) => {
    setBusy(true); setError(null);
    try {
      const created = await researchRequest('/studies', { method: 'POST', body: JSON.stringify({ ...values, workspace_id: workspace.id }) });
      const plan = study.data?.plan;
      const hasPlan = Boolean(plan && (plan.prototype?.name || plan.prototype?.url || plan.prototype?.version || plan.questions?.length || plan.hypotheses?.length || plan.tasks?.length || plan.guide?.length || plan.summary_sections?.length));
      if (hasPlan) {
        await researchRequest(`/studies/${created.id}/versions`, {
          method: 'POST',
          body: JSON.stringify({
            revision: created.revision ?? 0,
            plan: {
              ...plan,
              tasks: (plan.tasks || []).map((task) => ({ ...task, id: crypto.randomUUID() })),
            },
          }),
        });
      }
      close();
      await queryClient.invalidateQueries({ queryKey: researchKey(user.id, workspace.id, 'studies') });
      navigate(`/studies/${created.id}`);
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const loadMore = async () => {
    const rows = [...(interviews.data || []), ...page];
    if (!rows.length) return;
    setLoadingMore(true);
    try {
      const next = await researchRequest(`/studies/${studyId}/interviews?before=${encodeURIComponent(rows.at(-1).id)}`);
      setPage((previous) => [...previous, ...next]);
      setHasMore(next.length === 50);
    } catch (err) { setError(err); } finally { setLoadingMore(false); }
  };
  if (study.isPending) return <Loading />;
  if (study.isError) return <><Link to="/" className="research-back"><ArrowLeft size={16} />{t('research.returnStudies')}</Link><ErrorState error={study.error} onRetry={() => study.refetch()} /></>;
  if (study.data.workspace_id !== workspace.id) return <ErrorState error={{ status: 404 }} />;
  const item = study.data;
  const rows = [...(interviews.data || []), ...page];
  const sessionQuery = sessionSearch.trim().toLowerCase();
  const filteredRows = rows.filter((row) => {
    if (sessionStatus === 'stale' && !row.summary_stale) return false;
    if (sessionStatus !== 'all' && sessionStatus !== 'stale' && row.status !== sessionStatus) return false;
    if (sessionQuery && !String(row.title || '').toLowerCase().includes(sessionQuery)) return false;
    return true;
  });
  const interviewCount = interviews.isPending || interviews.isError ? '—' : `${rows.length}${hasMore && rows.length > 0 && rows.length % 50 === 0 ? '+' : ''}`;
  return <div className="mx-auto max-w-5xl min-w-0">
    <Link to="/" className="research-back"><ArrowLeft size={16} />{t('research.studies')}</Link>
    {notice && <p role="status" className="mb-5 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><Check size={16} />{t(`research.${notice}`)}</p>}
    <nav aria-label={t('research.studyNavigation')} className="research-section-nav mb-7">
      {[["plan", ClipboardList, 'researchPlan'], ["sessions", BookOpen, 'interviews'], ["results", ListChecks, 'taskComparison'], ["synthesis", Sparkles, 'studyResults']].map(([id, Icon, label]) => <a key={id} href={`#${id}`}><Icon size={16} />{t(`research.${label}`)}</a>)}
    </nav>
    <div className="space-y-7">
        <section className="research-card">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <div className="research-eyebrow">{t('research.studyContext')}</div>
            <dl className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500" data-testid="research-study-counts">
              <div className="flex items-baseline gap-1.5"><dt>{t('research.interviews')}</dt><dd className="font-bold text-slate-800">{interviewCount}</dd></div>
              <div className="flex items-baseline gap-1.5"><dt>{t('research.sharedTasks')}</dt><dd className="font-bold text-slate-800">{item.plan?.tasks?.length || 0}</dd></div>
            </dl>
          </div>
          <h1 className="research-heading break-words">{item.title}</h1>
          <p className="mt-6 max-w-3xl whitespace-pre-line break-words text-lg leading-8 text-slate-700">{item.goal}</p>
          <div className="mt-7 border-t border-slate-200/70 pt-6"><h2 className="research-subheading">{t('research.brief')}</h2><p className="mt-2 max-w-3xl whitespace-pre-line break-words text-sm leading-7 text-slate-500">{item.brief || t('research.noBrief')}</p></div>
          <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200/70 py-5"><span className="text-xs text-slate-400">{t('research.revision', { version: item.revision })}</span><div className="flex flex-wrap items-center gap-2"><button type="button" className="research-secondary" onClick={() => { setError(null); setDialog('archive'); }} data-testid="research-archive-study"><Trash2 size={15} />{t('research.archiveStudy')}</button><button type="button" className="research-secondary" onClick={() => { setEditingStudy(item); setDialog('edit'); }}>{t('research.editBrief')}</button></div></div>
          <div id="preparation"><PreparationPanel study={item} userId={user.id} workspaceId={workspace.id} /></div>
        </section>
        <div id="plan"><StudyPlanPanel study={item} userId={user.id} workspaceId={workspace.id} interviews={rows} autoDraftRequested={Boolean(location.state?.autoDraftPlan)} onDuplicate={() => { setError(null); setDialog('duplicate'); }} /></div>
        <section id="sessions"><div className="mb-5 flex flex-wrap items-center justify-between gap-4"><h2 className="research-section-heading">{t('research.interviews')}</h2><button className="research-primary" onClick={() => setDialog('create')} data-testid="research-new-interview"><Plus size={16} />{t('research.newInterview')}</button></div>
          {interviews.isPending ? <Loading /> : interviews.isError ? <ErrorState error={interviews.error} onRetry={() => interviews.refetch()} /> : rows.length === 0 ? <EmptyState title={t('research.emptyInterviewsTitle')} description={t('research.emptyInterviewsBody')} action={t('research.newInterview')} onAction={() => setDialog('create')} /> : <div className="space-y-4"><div className="flex flex-wrap items-center gap-3"><input type="search" value={sessionSearch} onChange={(event) => setSessionSearch(event.target.value)} placeholder={t('research.searchInterviews')} aria-label={t('research.searchInterviews')} data-testid="research-interview-search" className="research-field min-w-0 flex-1 sm:max-w-xs" /><select value={sessionStatus} onChange={(event) => setSessionStatus(event.target.value)} aria-label={t('research.filterInterviews')} data-testid="research-interview-filter" className="research-field w-full sm:w-auto"><option value="all">{t('research.filterAllSessions')}</option><option value="completed">{t('research.completed')}</option><option value="draft">{t('research.draft')}</option><option value="stale">{t('research.reviewNeeded')}</option></select></div>{filteredRows.length === 0 ? <EmptyState title={t('research.noSearchResults')} description={t('research.searchHint')} action={t('research.clearSearch')} onAction={() => { setSessionSearch(''); setSessionStatus('all'); }} /> : <div className="space-y-3">{filteredRows.map((row) => <Link data-testid="research-interview-card" key={row.id} to={`/studies/${studyId}/interviews/${row.id}`} className="app-surface group flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5 transition hover:shadow-lg"><div className="min-w-0 flex-1"><h3 className="break-words text-base font-semibold text-slate-900">{row.title}</h3><div className="mt-2 flex flex-wrap items-center gap-2"><Status status={row.status} />{row.summary_stale && <span className="text-xs text-amber-700">{t('research.reviewNeeded')}</span>}</div></div><ArrowUpRight size={18} className="shrink-0 text-slate-400 group-hover:text-orange-600" /></Link>)}{hasMore && rows.length > 0 && rows.length % 50 === 0 && <button className="research-secondary" disabled={loadingMore} onClick={loadMore}>{t(loadingMore ? 'research.loading' : 'research.loadMore')}</button>}</div>}</div>}
        </section>
        <ResultsPanel study={item} userId={user.id} workspaceId={workspace.id} />
        <div id="synthesis"><SynthesisPanel study={item} userId={user.id} workspaceId={workspace.id} studyId={studyId} interviews={rows} /></div>
    </div>
    {dialog === 'edit' && <Modal guardChanges title={t('research.editBrief')} onClose={close} busy={busy}><StudyForm key={editingStudy.revision} study={editingStudy} onSave={save} onCancel={close} busy={busy} error={error} onReload={async () => { const latest = await study.refetch(); if (latest.data) { setEditingStudy(latest.data); setError(null); } }} /></Modal>}
    {dialog === 'duplicate' && <Modal guardChanges title={t('research.duplicateStudy')} onClose={close} busy={busy}><p className="research-description mb-5">{t('research.duplicateStudyHint')}</p><StudyForm study={{ title: `${item.title} (${t('research.copySuffix')})`, goal: item.goal, brief: item.brief }} submitLabel="research.createDuplicate" onSave={duplicate} onCancel={close} busy={busy} error={error} /></Modal>}
    {dialog === 'create' && (
      <Modal guardChanges title={t('research.newInterview')} onClose={close} busy={busy}>
        <ModalForm
          onSubmit={create}
          actions={
            <>
              <button type="button" data-modal-dismiss className="research-text-button" onClick={close}>
                {t('research.cancel')}
              </button>
              <button disabled={busy || (!newTitle.trim() && !selectedFile)} className="research-primary">
                {busy
                  ? t(selectedFile ? 'research.uploadingMedia' : 'research.saving')
                  : t(selectedFile ? 'research.createAndTranscribe' : 'research.createInterview')}
              </button>
            </>
          }
        >
          <p className="research-description">{t('research.newInterviewHint')}</p>
          {error && <ErrorState error={error} />}
          <label className="block">
            <span className="research-label">{t('research.interviewTitle')}</span>
            <input
              name="title"
              required={!selectedFile}
              maxLength={240}
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              className="research-field"
              placeholder={t('research.interviewTitlePlaceholder')}
              autoFocus
              data-testid="research-interview-title"
            />
          </label>
          <div className="pt-1">
            <span className="research-label">{t('research.uploadRecordingOptional')}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp3,.wav,.m4a,.mp4,.webm,audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/m4a,video/mp4,video/webm,audio/webm"
              className="hidden"
              onChange={(event) => handleSelectCreateFile(event.target.files?.[0] || null)}
              data-testid="research-create-file-input"
            />
            {!selectedFile ? (
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDraggingFile(true);
                }}
                onDragLeave={() => setIsDraggingFile(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDraggingFile(false);
                  const dropped = event.dataTransfer?.files?.[0];
                  if (dropped) handleSelectCreateFile(dropped);
                }}
                className={`mt-1.5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition ${
                  isDraggingFile
                    ? 'border-orange-500 bg-orange-50/70'
                    : 'border-slate-200/90 bg-slate-50/60 hover:border-orange-300 hover:bg-orange-50/30'
                }`}
              >
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-orange-600 shadow-sm ring-1 ring-slate-200/70">
                  <UploadCloud size={22} />
                </div>
                <p className="text-sm font-semibold text-slate-900">{t('research.dropOrSelectFile')}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{t('research.supportedFormatsHint')}</p>
              </div>
            ) : (
              <div className="mt-1.5 space-y-3 rounded-2xl border border-orange-200/80 bg-orange-50/40 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-orange-600 shadow-sm ring-1 ring-orange-200/60">
                      <FileAudio size={19} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{selectedFile.name}</p>
                      <p className="text-xs text-slate-500">
                        {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white hover:text-slate-700"
                    aria-label={t('research.removeLine')}
                  >
                    <X size={16} />
                  </button>
                </div>
                <label className="flex cursor-pointer items-center gap-2.5 border-t border-orange-200/50 pt-3 text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={createAutoSummary}
                    onChange={(event) => setCreateAutoSummary(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                  />
                  {t('research.autoGenerateSummary')}
                </label>
              </div>
            )}
          </div>
        </ModalForm>
      </Modal>
    )}
    {dialog === 'archive' && <Modal title={t('research.archiveStudy')} onClose={close} busy={busy}><ModalForm as="div" testId="research-archive-study-confirm" actions={<><button type="button" className="research-text-button" disabled={busy} onClick={close}>{t('research.cancel')}</button><button type="button" className="research-primary" disabled={busy} onClick={archive} data-testid="research-confirm-archive-study">{t(busy ? 'research.saving' : 'research.confirmArchive')}</button></>}><p className="research-description">{t('research.archiveStudyConfirm', { title: item.title })}</p>{error && <ErrorState error={error} onRetry={error.status === 409 ? async () => { await study.refetch(); setError(null); } : undefined} />}</ModalForm></Modal>}
  </div>;
}
