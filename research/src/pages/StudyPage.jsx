import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowUpRight, BookOpen, Check, ClipboardList, ListChecks, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useResearchContext } from '../app/App';
import { researchKey, researchRequest, useResearchQuery } from '../hooks/useResearch';
import { EmptyState, ErrorState, Loading, Modal, ModalForm, Status } from '../components/UI';
import StudyForm from '../components/StudyForm';
import StudyPlanPanel from '../components/StudyPlanPanel';
import PreparationPanel from '../components/PreparationPanel';
import ResultsPanel from '../components/ResultsPanel';
import SynthesisPanel from '../components/SynthesisPanel';

export default function StudyPage() {
  const { t } = useTranslation();
  const { studyId } = useParams();
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
  const study = useResearchQuery(user.id, workspace.id, ['study', studyId], `/studies/${studyId}`);
  const interviews = useResearchQuery(user.id, workspace.id, ['interviews', studyId], `/studies/${studyId}/interviews`);
  const close = useCallback(() => { setDialog(null); setError(null); }, []);
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
      const title = String(new FormData(event.currentTarget).get('title') || '').trim();
      const interview = await researchRequest(`/studies/${studyId}/interviews`, { method: 'POST', body: JSON.stringify({ title }) });
      close(); await refresh(); navigate(`/studies/${studyId}/interviews/${interview.id}`);
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
        <div id="plan"><StudyPlanPanel study={item} userId={user.id} workspaceId={workspace.id} onDuplicate={() => { setError(null); setDialog('duplicate'); }} /></div>
        <section id="sessions"><div className="mb-5 flex flex-wrap items-center justify-between gap-4"><h2 className="research-section-heading">{t('research.interviews')}</h2><button className="research-primary" onClick={() => setDialog('create')} data-testid="research-new-interview"><Plus size={16} />{t('research.newInterview')}</button></div>
          {interviews.isPending ? <Loading /> : interviews.isError ? <ErrorState error={interviews.error} onRetry={() => interviews.refetch()} /> : rows.length === 0 ? <EmptyState title={t('research.emptyInterviewsTitle')} description={t('research.emptyInterviewsBody')} action={t('research.newInterview')} onAction={() => setDialog('create')} /> : <div className="space-y-4"><div className="flex flex-wrap items-center gap-3"><input type="search" value={sessionSearch} onChange={(event) => setSessionSearch(event.target.value)} placeholder={t('research.searchInterviews')} aria-label={t('research.searchInterviews')} data-testid="research-interview-search" className="research-field min-w-0 flex-1 sm:max-w-xs" /><select value={sessionStatus} onChange={(event) => setSessionStatus(event.target.value)} aria-label={t('research.filterInterviews')} data-testid="research-interview-filter" className="research-field w-full sm:w-auto"><option value="all">{t('research.filterAllSessions')}</option><option value="completed">{t('research.completed')}</option><option value="draft">{t('research.draft')}</option><option value="stale">{t('research.reviewNeeded')}</option></select></div>{filteredRows.length === 0 ? <EmptyState title={t('research.noSearchResults')} description={t('research.searchHint')} action={t('research.clearSearch')} onAction={() => { setSessionSearch(''); setSessionStatus('all'); }} /> : <div className="space-y-3">{filteredRows.map((row) => <Link data-testid="research-interview-card" key={row.id} to={`/studies/${studyId}/interviews/${row.id}`} className="app-surface group flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5 transition hover:shadow-lg"><div className="min-w-0 flex-1"><h3 className="break-words text-base font-semibold text-slate-900">{row.title}</h3><div className="mt-2 flex flex-wrap items-center gap-2"><Status status={row.status} />{row.summary_stale && <span className="text-xs text-amber-700">{t('research.reviewNeeded')}</span>}</div></div><ArrowUpRight size={18} className="shrink-0 text-slate-400 group-hover:text-orange-600" /></Link>)}{hasMore && rows.length > 0 && rows.length % 50 === 0 && <button className="research-secondary" disabled={loadingMore} onClick={loadMore}>{t(loadingMore ? 'research.loading' : 'research.loadMore')}</button>}</div>}</div>}
        </section>
        <ResultsPanel study={item} userId={user.id} workspaceId={workspace.id} />
        <div id="synthesis"><SynthesisPanel study={item} userId={user.id} workspaceId={workspace.id} studyId={studyId} interviews={rows} /></div>
    </div>
    {dialog === 'edit' && <Modal guardChanges title={t('research.editBrief')} onClose={close} busy={busy}><StudyForm key={editingStudy.revision} study={editingStudy} onSave={save} onCancel={close} busy={busy} error={error} onReload={async () => { const latest = await study.refetch(); if (latest.data) { setEditingStudy(latest.data); setError(null); } }} /></Modal>}
    {dialog === 'duplicate' && <Modal guardChanges title={t('research.duplicateStudy')} onClose={close} busy={busy}><p className="research-description mb-5">{t('research.duplicateStudyHint')}</p><StudyForm study={{ title: `${item.title} (${t('research.copySuffix')})`, goal: item.goal, brief: item.brief }} submitLabel="research.createDuplicate" onSave={duplicate} onCancel={close} busy={busy} error={error} /></Modal>}
    {dialog === 'create' && <Modal guardChanges title={t('research.newInterview')} onClose={close} busy={busy}><ModalForm onSubmit={create} actions={<><button type="button" data-modal-dismiss className="research-text-button" onClick={close}>{t('research.cancel')}</button><button disabled={busy} className="research-primary">{t(busy ? 'research.saving' : 'research.createInterview')}</button></>}><p className="research-description">{t('research.newInterviewHint')}</p>{error && <ErrorState error={error} />}<label className="block"><span className="research-label">{t('research.interviewTitle')}</span><input name="title" required maxLength={240} className="research-field" placeholder={t('research.interviewTitlePlaceholder')} autoFocus data-testid="research-interview-title" /></label></ModalForm></Modal>}
    {dialog === 'archive' && <Modal title={t('research.archiveStudy')} onClose={close} busy={busy}><ModalForm as="div" testId="research-archive-study-confirm" actions={<><button type="button" className="research-text-button" disabled={busy} onClick={close}>{t('research.cancel')}</button><button type="button" className="research-primary" disabled={busy} onClick={archive} data-testid="research-confirm-archive-study">{t(busy ? 'research.saving' : 'research.confirmArchive')}</button></>}><p className="research-description">{t('research.archiveStudyConfirm', { title: item.title })}</p>{error && <ErrorState error={error} onRetry={error.status === 409 ? async () => { await study.refetch(); setError(null); } : undefined} />}</ModalForm></Modal>}
  </div>;
}
