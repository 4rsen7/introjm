import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, Plus, Target } from 'lucide-react';
import { useResearchContext } from '../app/App';
import { researchKey, researchRequest } from '../hooks/useResearch';
import { EmptyState, ErrorState, Loading, Modal } from '../components/UI';
import StudyForm from '../components/StudyForm';

const PAGE_SIZE = 50;

export default function StudiesPage() {
  const { t } = useTranslation();
  const { user, workspace } = useResearchContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const close = useCallback(() => { setOpen(false); setError(null); }, []);
  const studies = useInfiniteQuery({
    queryKey: researchKey(user.id, workspace.id, 'studies'),
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) => researchRequest(`/studies?workspace_id=${encodeURIComponent(workspace.id)}&limit=${PAGE_SIZE}${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ''}`, { signal }),
    getNextPageParam: (lastPage) => lastPage.length === PAGE_SIZE ? lastPage.at(-1).id : undefined,
    staleTime: 30_000,
    retry: (count, failure) => failure.status >= 500 && count < 1,
  });
  const rows = studies.data?.pages.flat() || [];
  const create = async (values) => {
    setBusy(true); setError(null);
    try {
      const study = await researchRequest('/studies', { method: 'POST', body: JSON.stringify({ ...values, workspace_id: workspace.id }) });
      await queryClient.invalidateQueries({ queryKey: researchKey(user.id, workspace.id, 'studies') });
      navigate(`/studies/${study.id}`);
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  return <>
    <div className="mb-10 flex flex-wrap items-end justify-between gap-6"><div><div className="research-eyebrow mb-4">{t('research.studiesEyebrow')}</div><h1 className="research-heading">{t('research.studiesTitle')}</h1><p className="mt-4 max-w-2xl text-sm leading-7 text-slate-500">{t('research.studiesDescription')}</p></div><button onClick={() => setOpen(true)} className="research-primary" data-testid="research-new-study"><Plus size={17} />{t('research.newStudy')}</button></div>
    {studies.isPending ? <Loading /> : studies.isError && !studies.data ? <ErrorState error={studies.error} onRetry={() => studies.refetch()} /> : rows.length === 0 ? <EmptyState title={t('research.emptyStudiesTitle')} description={t('research.emptyStudiesBody')} action={t('research.newStudy')} onAction={() => setOpen(true)} /> : <><div className="research-eyebrow mb-4">{t('research.studyCount', { count: rows.length })}</div><div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{rows.map((study) => <Link data-testid="research-study-card" key={study.id} to={`/studies/${study.id}`} className="app-surface group flex flex-col rounded-3xl p-6 transition hover:-translate-y-0.5 hover:shadow-xl"><div className="mb-7 flex justify-between"><span className="rounded-xl border border-orange-100 bg-orange-50 p-2.5 text-orange-600"><Target size={21} /></span><ArrowUpRight className="text-slate-300 transition group-hover:text-orange-600" size={19} /></div><h2 className="break-words text-xl font-bold tracking-tight text-slate-950">{study.title}</h2><p className="mb-7 mt-3 line-clamp-3 whitespace-pre-line text-sm leading-6 text-slate-500">{study.goal}</p><div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-200/70 pt-4 text-xs font-semibold text-slate-400"><span>{t('research.revision', { version: study.revision ?? 0 })}</span><span className="text-slate-600">{t('research.openStudy')}</span></div></Link>)}</div>{studies.isFetchNextPageError && <div className="mt-6"><ErrorState error={studies.error} onRetry={() => studies.fetchNextPage()} /></div>}{studies.hasNextPage && <div className="mt-7 flex justify-center"><button className="research-secondary" disabled={studies.isFetchingNextPage} onClick={() => studies.fetchNextPage()} data-testid="research-load-more">{t(studies.isFetchingNextPage ? 'research.loading' : 'research.loadMore')}</button></div>}</>}
    {open && <Modal title={t('research.newStudy')} onClose={close} busy={busy}><StudyForm onSave={create} onCancel={close} busy={busy} error={error} /></Modal>}
  </>;
}
