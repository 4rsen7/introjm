import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowUpRight, Plus, Target } from 'lucide-react';
import { useResearchContext } from '../app/App';
import { researchKey, researchRequest, useResearchQuery } from '../hooks/useResearch';
import { EmptyState, ErrorState, Loading, Modal, Status } from '../components/UI';
import StudyForm from '../components/StudyForm';
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
  const [page, setPage] = useState([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
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
      await refresh(); close();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const create = async (event) => {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const title = String(new FormData(event.currentTarget).get('title') || '').trim();
      const interview = await researchRequest(`/studies/${studyId}/interviews`, { method: 'POST', body: JSON.stringify({ title }) });
      await refresh(); navigate(`/studies/${studyId}/interviews/${interview.id}`);
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
  if (study.isError) return <ErrorState error={study.error} onRetry={() => study.refetch()} />;
  if (study.data.workspace_id !== workspace.id) return <ErrorState error={{ status: 404 }} />;
  const item = study.data;
  const rows = [...(interviews.data || []), ...page];
  return <>
    <Link to="/" className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"><ArrowLeft size={16} />{t('research.studies')}</Link>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_350px]">
      <div className="space-y-8">
        <section className="app-surface rounded-3xl p-6 sm:p-8">
          <div className="research-eyebrow mb-4">{t('research.studyContext')}</div>
          <h1 className="research-heading break-words">{item.title}</h1>
          <p className="mt-6 whitespace-pre-line text-lg leading-8 text-slate-700">{item.goal}</p>
          <div className="mt-7 border-t border-slate-200/70 pt-6"><h2 className="text-sm font-bold text-slate-800">{t('research.brief')}</h2><p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-500">{item.brief || t('research.noBrief')}</p></div>
          <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200/70 pt-5"><span className="text-xs text-slate-400">{t('research.revision', { version: item.revision })}</span><button className="research-secondary" onClick={() => { setEditingStudy(item); setDialog('edit'); }}>{t('research.editBrief')}</button></div>
        </section>
        <section><div className="mb-5 flex flex-wrap items-center justify-between gap-4"><div><div className="research-eyebrow">{t('research.interviewCount', { count: rows.length })}</div><h2 className="mt-2 text-2xl font-bold tracking-tight">{t('research.interviews')}</h2></div><button className="research-primary" onClick={() => setDialog('create')} data-testid="research-new-interview"><Plus size={16} />{t('research.newInterview')}</button></div>
          {interviews.isPending ? <Loading /> : interviews.isError ? <ErrorState error={interviews.error} onRetry={() => interviews.refetch()} /> : rows.length === 0 ? <EmptyState title={t('research.emptyInterviewsTitle')} description={t('research.emptyInterviewsBody')} action={t('research.newInterview')} onAction={() => setDialog('create')} /> : <div className="space-y-3">{rows.map((row) => <Link key={row.id} to={`/studies/${studyId}/interviews/${row.id}`} className="app-surface group flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5 transition hover:shadow-lg"><div className="min-w-0"><h3 className="break-words font-bold text-slate-900">{row.title}</h3><div className="mt-2 flex flex-wrap items-center gap-2"><Status status={row.status} />{row.summary_stale && <span className="text-xs text-amber-700">{t('research.reviewNeeded')}</span>}</div></div><ArrowUpRight size={18} className="text-slate-400 group-hover:text-orange-600" /></Link>)}{hasMore && rows.length > 0 && rows.length % 50 === 0 && <button className="research-secondary" disabled={loadingMore} onClick={loadMore}>{t(loadingMore ? 'research.loading' : 'research.loadMore')}</button>}</div>}
        </section>
        <SynthesisPanel userId={user.id} workspaceId={workspace.id} studyId={studyId} interviews={rows} />
      </div>
      <aside className="space-y-5"><div className="app-surface-soft rounded-3xl p-6"><Target size={22} className="text-orange-600" /><h2 className="mt-5 text-lg font-bold">{t('research.studyResults')}</h2><p className="mt-3 text-sm leading-6 text-slate-500">{t('research.synthesisDescription')}</p></div><div className="app-surface-soft rounded-3xl p-6"><div className="research-eyebrow">{t('research.brief')}</div><p className="mt-3 text-sm leading-6 text-slate-500">{t('research.briefAiPending')}</p></div></aside>
    </div>
    {dialog === 'edit' && <Modal title={t('research.editBrief')} onClose={close} busy={busy}><StudyForm key={editingStudy.revision} study={editingStudy} onSave={save} onCancel={close} busy={busy} error={error} onReload={async () => { const latest = await study.refetch(); if (latest.data) { setEditingStudy(latest.data); setError(null); } }} /></Modal>}
    {dialog === 'create' && <Modal title={t('research.newInterview')} onClose={close} busy={busy}><form onSubmit={create} className="space-y-6">{error && <ErrorState error={error} />}<label className="block"><span className="research-label">{t('research.interviewTitle')}</span><input name="title" required maxLength={240} className="research-field" placeholder={t('research.interviewTitlePlaceholder')} data-testid="research-interview-title" /></label><div className="flex justify-end gap-3"><button type="button" className="research-secondary" onClick={close}>{t('research.cancel')}</button><button disabled={busy} className="research-primary">{t(busy ? 'research.saving' : 'research.createInterview')}</button></div></form></Modal>}
  </>;
}
