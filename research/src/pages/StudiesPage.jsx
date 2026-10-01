import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, Plus, Target } from 'lucide-react';
import { useResearchContext } from '../app/App';
import { researchKey, researchRequest } from '../hooks/useResearch';
import { EmptyState, ErrorState, Loading, Modal } from '../components/UI';
import StudyStart from '../components/StudyStart';
import ArchiveStudyDialog from '../components/ArchiveStudyDialog';
import { decodeUploadFileName, uploadInterviewAudio } from '../hooks/useResearch';

const PAGE_SIZE = 50;

export default function StudiesPage() {
  const { t } = useTranslation();
  const { user, workspace } = useResearchContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [pendingDraft, setPendingDraft] = useState(null);
  const [archiveStudy, setArchiveStudy] = useState(null);
  useEffect(() => setArchiveStudy(null), [user.id, workspace.id]);
  const close = useCallback(() => { setOpen(false); setError(null); setPendingDraft(null); }, []);
  const studies = useInfiniteQuery({
    queryKey: researchKey(user.id, workspace.id, 'studies'),
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) => researchRequest(`/studies?workspace_id=${encodeURIComponent(workspace.id)}&limit=${PAGE_SIZE}${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ''}`, { signal }),
    getNextPageParam: (lastPage) => lastPage.length === PAGE_SIZE ? lastPage.at(-1).id : undefined,
    staleTime: 30_000,
    retry: (count, failure) => failure.status >= 500 && count < 1,
  });
  const rows = studies.data?.pages.flat().filter(study => !study.archived_at) || [];
  const query = search.trim().toLowerCase();
  const filtered = query ? rows.filter((study) => [study.title, study.goal, study.brief].some((value) => String(value || '').toLowerCase().includes(query))) : rows;
  const create = async (values) => {
    setBusy(true); setError(null);
    let batchId = null;
    let batchStudyId = null;
    try {
      const study = pendingDraft?.study || await researchRequest('/studies', { method: 'POST', body: JSON.stringify({
        title: values.title, goal: values.mode === 'manual' ? values.goal : '', brief: values.mode === 'manual' ? values.brief || null : null,
        brief_status: values.mode === 'upload' ? 'draft' : 'confirmed', workspace_id: workspace.id,
      }) });
      if (values.mode === 'upload') {
        batchStudyId = study.id;
        batchId = (await researchRequest(`/studies/${study.id}/upload-batches`, { method: 'POST', body: '{}' })).batch_id;
        let nextIndex = pendingDraft?.nextIndex || 0;
        let pendingInterviewId = pendingDraft?.pendingInterviewId || null;
        setPendingDraft({ study, nextIndex, pendingInterviewId });
        for (; nextIndex < values.files.length; nextIndex += 1) {
          const file = values.files[nextIndex];
          if (!pendingInterviewId) {
            const title = decodeUploadFileName(file.name).replace(/\.[^.]+$/, '').slice(0, 240) || file.name;
            pendingInterviewId = (await researchRequest(`/studies/${study.id}/interviews`, { method: 'POST', body: JSON.stringify({ title }) })).id;
            setPendingDraft({ study, nextIndex, pendingInterviewId });
          }
          await uploadInterviewAudio(pendingInterviewId, file, { autoSummary: false });
          pendingInterviewId = null;
          setPendingDraft({ study, nextIndex: nextIndex + 1, pendingInterviewId: null });
        }
        await researchRequest(`/studies/${study.id}/upload-batches/complete`, { method: 'POST', body: JSON.stringify({ batch_id: batchId }) });
        batchId = null;
      }
      await queryClient.invalidateQueries({ queryKey: researchKey(user.id, workspace.id, 'studies') });
      setPendingDraft(null); close(); navigate(`/studies/${study.id}#${values.mode === 'upload' ? 'brief' : 'summary'}`);
    } catch (err) { setError(err); await queryClient.invalidateQueries({ queryKey: researchKey(user.id, workspace.id, 'studies') }); } finally {
      if (batchId) {
        try { await researchRequest(`/studies/${batchStudyId}/upload-batches/complete`, { method: 'POST', body: JSON.stringify({ batch_id: batchId }) }); }
        catch (cause) { setError(cause); }
      }
      setBusy(false);
    }
  };
  return <>
    <div className="research-studies-intro"><div className="min-w-0 max-w-3xl"><h1 className="research-studies-title">{t('research.studiesTitle')}</h1><p className="research-studies-description">{t('research.studiesDescription')}</p></div><button onClick={() => setOpen(true)} className="research-primary research-studies-create" data-testid="research-new-study"><Plus size={17} />{t('research.newStudy')}</button></div>
    {studies.isPending ? <Loading /> : studies.isError && !studies.data ? <ErrorState error={studies.error} onRetry={() => studies.refetch()} /> : rows.length === 0 ? <EmptyState title={t('research.emptyStudiesTitle')} description={t('research.emptyStudiesBody')} action={t('research.newStudy')} onAction={() => setOpen(true)} /> : <><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div className="text-sm font-medium text-slate-500">{t('research.studyCount', { count: filtered.length })}</div><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('research.searchStudies')} aria-label={t('research.searchStudies')} data-testid="research-study-search" className="research-field w-full sm:w-80" /></div>{filtered.length === 0 ? <EmptyState title={t('research.noSearchResults')} description={t('research.searchHint')} action={t('research.clearSearch')} onAction={() => setSearch('')} /> : <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{filtered.map((study) => <article key={study.id} className="app-surface group flex flex-col rounded-3xl p-6 transition hover:-translate-y-0.5 hover:shadow-xl"><Link data-testid="research-study-card" to={`/studies/${study.id}`} className="flex min-h-0 flex-1 flex-col rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-600"><div className="mb-5 flex justify-between"><span className="rounded-xl border border-orange-100 bg-orange-50 p-2.5 text-orange-600"><Target size={21} /></span><ArrowUpRight className="text-slate-300 transition group-hover:text-orange-600" size={19} /></div><h2 className="break-words text-lg font-semibold leading-7 tracking-tight text-slate-900">{study.title}</h2><p className="mb-7 mt-3 line-clamp-3 whitespace-pre-line text-sm leading-6 text-slate-500">{study.brief_status === 'draft' ? t('research.briefDraft') : study.goal}</p></Link><div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 pt-4 text-xs font-semibold text-slate-400"><span>{t('research.revision', { version: study.revision ?? 0 })}</span><div className="flex flex-wrap items-center gap-4"><button type="button" className="research-text-button" data-testid="research-archive-study-card" onClick={() => setArchiveStudy(study)}>{t('research.archiveStudy')}</button><Link to={`/studies/${study.id}`} className="text-slate-600 hover:text-orange-700">{t('research.openStudy')}</Link></div></div></article>)}</div>}{studies.isFetchNextPageError && <div className="mt-6"><ErrorState error={studies.error} onRetry={() => studies.fetchNextPage()} /></div>}{studies.hasNextPage && <div className="mt-7 flex justify-center"><button className="research-secondary" disabled={studies.isFetchingNextPage} onClick={() => studies.fetchNextPage()} data-testid="research-load-more">{t(studies.isFetchingNextPage ? 'research.loading' : 'research.loadMore')}</button></div>}</>}
    {open && <Modal guardChanges title={t('research.newStudy')} onClose={close} busy={busy}><StudyStart onCreate={create} onCancel={close} busy={busy} error={error} locked={Boolean(pendingDraft)} /></Modal>}
    {archiveStudy?.workspace_id === workspace.id && <ArchiveStudyDialog key={`${workspace.id}:${archiveStudy.id}`} study={archiveStudy} userId={user.id} workspaceId={workspace.id} onClose={() => setArchiveStudy(null)} onArchived={() => setArchiveStudy(null)} />}
  </>;
}
