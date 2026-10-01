import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowUpRight, Plus } from 'lucide-react';
import { useResearchContext } from '../app/App';
import { researchKey, researchRequest, useResearchQuery } from '../hooks/useResearch';
import { EmptyState, ErrorState, Loading, Modal, ModalForm } from '../components/UI';
import BulkInterviewUpload from '../components/BulkInterviewUpload';
import SharedBriefPanel from '../components/SharedBriefPanel';
import SynthesisPanel from '../components/SynthesisPanel';
import StudyPlanPanel from '../components/StudyPlanPanel';
import ResultsPanel from '../components/ResultsPanel';
import { interviewStage, STUDY_TABS, studyTabFromHash, summaryIsCurrent } from '../utils/researchFlow';

export default function StudyPage() {
  const { t } = useTranslation();
  const { studyId } = useParams();
  const { hash } = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const { user, workspace } = useResearchContext();
  const [tab, setTab] = useState(() => studyTabFromHash(hash));
  const [dialog, setDialog] = useState(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [more, setMore] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  useEffect(() => setTab(studyTabFromHash(hash)), [hash]);
  const study = useResearchQuery(user.id, workspace.id, ['study', studyId], `/studies/${studyId}`, true, 4000);
  const interviews = useResearchQuery(user.id, workspace.id, ['interviews', studyId], `/studies/${studyId}/interviews`, true, 4000);
  const refresh = async () => {
    await Promise.all(['study', 'interviews', 'synthesis', 'studies'].map(part => client.invalidateQueries({ queryKey: part === 'studies' ? researchKey(user.id, workspace.id, part) : researchKey(user.id, workspace.id, part, studyId) })));
  };
  const createInterview = async event => {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const created = await researchRequest(`/studies/${studyId}/interviews`, { method: 'POST', body: JSON.stringify({ title: title.trim() || t('research.interviews') }) });
      await refresh(); setDialog(null); setTitle(''); navigate(`/studies/${studyId}/interviews/${created.id}`);
    } catch (cause) { setError(cause); } finally { setBusy(false); }
  };
  const manageStudy = async action => {
    setBusy(true); setError(null);
    try {
      if (action === 'archive') {
        await researchRequest(`/studies/${studyId}`, { method: 'DELETE', body: JSON.stringify({ revision: study.data.revision }) });
        await refresh(); navigate('/');
      } else {
        const original = study.data;
        const created = await researchRequest('/studies', { method: 'POST', body: JSON.stringify({ workspace_id: workspace.id,
          title: original.title, goal: original.goal, brief: original.brief, brief_status: original.brief_status,
          plan: { ...original.plan, tasks: (original.plan?.tasks || []).map(task => ({ ...task, id: crypto.randomUUID() })) } }) });
        await refresh(); navigate(`/studies/${created.id}#brief`);
      }
      setDialog(null);
    } catch (cause) { setError(cause); } finally { setBusy(false); }
  };
  const loadMore = async () => {
    const current = [...(interviews.data || []), ...more];
    if (!current.length) return;
    setBusy(true); setError(null);
    try {
      const next = await researchRequest(`/studies/${studyId}/interviews?before=${encodeURIComponent(current.at(-1).id)}`);
      setMore(old => [...old, ...next]); setHasMore(next.length === 50);
    } catch (cause) { setError(cause); } finally { setBusy(false); }
  };
  if (study.isPending) return <Loading />;
  if (study.isError) return <ErrorState error={study.error} onRetry={() => study.refetch()} />;
  if (study.data.workspace_id !== workspace.id) return <ErrorState error={{ status: 404 }} />;
  const item = study.data;
  const rows = [...(interviews.data || []), ...more.filter(old => !(interviews.data || []).some(row => row.id === old.id))];
  const filtered = rows.filter(row => String(row.title || '').toLowerCase().includes(search.trim().toLowerCase()));
  const changeTab = value => navigate(`#${value}`, { replace: true });
  return <div className="mx-auto max-w-[80rem] min-w-0" data-testid="research-study-page">
    <div className="mb-7 flex flex-wrap items-center justify-between gap-4"><Link to="/" className="research-back !mb-0"><ArrowLeft size={16} />{t('research.returnStudies')}</Link><button type="button" className="research-primary" onClick={() => setDialog('add')} data-testid="research-new-interview"><Plus size={17} />{t('research.newInterview')}</button></div>
    <header className="mb-8"><div className="research-eyebrow">{t('research.study')}</div><h1 className="research-heading mt-3 break-words">{item.title}</h1><p className="mt-4 text-sm text-slate-500">{t('research.interviewCount', { count: rows.length })}{item.brief_status === 'confirmed' ? ` · ${t('research.briefConfirmed')}` : ` · ${t('research.briefDraft')}`}</p></header>
    <nav role="tablist" aria-label={t('research.studyNavigation')} className="mb-8 flex gap-2 overflow-x-auto border-b border-slate-200" data-testid="research-study-tabs">
      {STUDY_TABS.map((id, index) => <button key={id} role="tab" id={`study-tab-${id}`} aria-selected={tab === id} aria-controls={`study-panel-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => changeTab(id)} onKeyDown={event => { const next = event.key === 'ArrowRight' ? (index + 1) % STUDY_TABS.length : event.key === 'ArrowLeft' ? (index + STUDY_TABS.length - 1) % STUDY_TABS.length : event.key === 'Home' ? 0 : event.key === 'End' ? STUDY_TABS.length - 1 : null; if (next == null) return; event.preventDefault(); changeTab(STUDY_TABS[next]); document.getElementById(`study-tab-${STUDY_TABS[next]}`)?.focus(); }} className={`shrink-0 border-b-[3px] px-4 py-3 font-semibold ${tab === id ? 'border-orange-600 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{t(id === 'summary' ? 'research.summary' : id === 'brief' ? 'research.brief' : 'research.interviews')}{id === 'interviews' ? ` ${rows.length}` : ''}</button>)}
    </nav>
    <div role="tabpanel" id={`study-panel-${tab}`} aria-labelledby={`study-tab-${tab}`} className="min-w-0">
      {tab === 'summary' && <><SynthesisPanel study={item} userId={user.id} workspaceId={workspace.id} studyId={studyId} interviews={rows} /><details open={hash === '#results'} data-testid="research-comparison-tools" className="mt-8 app-surface-soft rounded-2xl p-5"><summary className="cursor-pointer text-sm font-semibold text-slate-600">{t('research.taskComparison')}</summary><div className="mt-5"><ResultsPanel study={item} userId={user.id} workspaceId={workspace.id} interviews={rows} /></div></details></>}
      {tab === 'interviews' && <section data-testid="research-interviews-tab"><div className="mb-6 flex flex-wrap items-center justify-between gap-4"><h2 className="research-section-heading">{t('research.interviews')}</h2><input type="search" data-testid="research-interview-search" aria-label={t('research.searchInterviews')} placeholder={t('research.searchInterviews')} value={search} onChange={event => setSearch(event.target.value)} className="research-field w-full sm:w-80" /></div>
        {interviews.isPending ? <Loading /> : interviews.isError ? <ErrorState error={interviews.error} onRetry={() => interviews.refetch()} /> : rows.length === 0 ? <EmptyState title={t('research.emptyInterviewsTitle')} description={t('research.emptyInterviewsBody')} action={t('research.newInterview')} onAction={() => setDialog('add')} /> : <div className="space-y-3">{filtered.map(row => <Link key={row.id} data-testid="research-interview-card" to={`/studies/${studyId}/interviews/${row.id}`} className="app-surface flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5 transition hover:shadow-lg"><div><h3 className="break-words font-semibold text-slate-900">{row.title}</h3><p className={`mt-2 text-xs ${summaryIsCurrent(row, item) ? 'text-emerald-700' : 'text-slate-500'}`}>{t(`research.${interviewStage(row, item)}`)}</p></div><ArrowUpRight size={18} className="text-slate-400" /></Link>)}{!filtered.length && <p className="text-sm text-slate-500">{t('research.noSearchResults')}</p>}{hasMore && rows.length > 0 && rows.length % 50 === 0 && <button className="research-secondary" disabled={busy} onClick={loadMore}>{t('research.loadMore')}</button>}</div>}{error && <ErrorState error={error} />}
      </section>}
      {tab === 'brief' && <><SharedBriefPanel key={`${item.id}:${item.revision}`} study={item} interviews={rows} userId={user.id} workspaceId={workspace.id} onSaved={refresh} /><details data-testid="research-additional-tools" className="mt-8 app-surface-soft rounded-2xl p-5"><summary className="cursor-pointer text-sm font-semibold text-slate-600">{t('research.additionalResearchTools')}</summary><div className="mt-5"><div data-testid="research-plan-tab"><StudyPlanPanel study={item} userId={user.id} workspaceId={workspace.id} interviews={rows} onDuplicate={() => { setError(null); setDialog('duplicate'); }} /></div><button type="button" className="research-text-button mt-5" data-testid="research-archive-study" onClick={() => { setError(null); setDialog('archive'); }}>{t('research.archiveStudy')}</button></div></details></>}
    </div>
    {['archive', 'duplicate'].includes(dialog) && <Modal title={t(dialog === 'archive' ? 'research.archiveStudy' : 'research.duplicateStudy')} onClose={() => setDialog(null)} busy={busy}><div data-testid={dialog === 'archive' ? 'research-archive-study-confirm' : 'research-duplicate-study-confirm'} className="space-y-6"><p className="text-sm leading-7 text-slate-600">{t(dialog === 'archive' ? 'research.archiveStudyConfirm' : 'research.duplicateStudyHint', { title: item.title })}</p>{error && <ErrorState error={error} />}<div className="flex flex-wrap gap-3"><button className="research-secondary" disabled={busy} onClick={() => setDialog(null)}>{t('research.cancel')}</button><button className="research-primary" disabled={busy} onClick={() => manageStudy(dialog)} data-testid={dialog === 'archive' ? 'research-confirm-archive-study' : 'research-confirm-duplicate-study'}>{t(busy ? 'research.saving' : dialog === 'archive' ? 'research.confirmArchive' : 'research.duplicateStudy')}</button></div></div></Modal>}
    {dialog === 'add' && <Modal guardChanges title={t('research.newInterview')} onClose={() => setDialog(null)} busy={busy}><div className="space-y-7"><BulkInterviewUpload studyId={studyId} autoSummary={item.brief_status !== 'draft'} onFinished={async complete => { await refresh(); if (complete) setDialog(null); }} /><div className="border-t border-slate-200 pt-6"><h3 className="font-semibold">{t('research.addTranscriptManually')}</h3><form className="mt-4 space-y-4" onSubmit={createInterview}><label className="block"><span className="research-label">{t('research.interviewTitle')}</span><input className="research-field" maxLength={240} value={title} onChange={event => setTitle(event.target.value)} /></label><button className="research-secondary" disabled={busy}>{t('research.createInterview')}</button></form>{error && <ErrorState error={error} />}</div></div></Modal>}
  </div>;
}
