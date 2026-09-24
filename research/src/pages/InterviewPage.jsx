import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, FileText, Plus, Trash2 } from 'lucide-react';
import { useResearchContext } from '../app/App';
import { researchKey, researchRequest, useResearchQuery } from '../hooks/useResearch';
import { EmptyState, ErrorState, Loading, Status } from '../components/UI';
import InterviewSummary from '../../../client/src/components/interviews/InterviewSummary';
import { normalizeInterviewSummary } from '../../../client/src/components/interviews/summaryDisplay';
import AnalysisAction from '../components/AnalysisAction';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';

const entry = () => ({ speaker: '', timestamp: '', text: '' });

export default function InterviewPage() {
  const { t } = useTranslation();
  const { studyId, interviewId } = useParams();
  const { user, workspace } = useResearchContext();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('summary');
  const [segments, setSegments] = useState([]);
  const [title, setTitle] = useState('');
  const [draftRevisions, setDraftRevisions] = useState(null);
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const study = useResearchQuery(user.id, workspace.id, ['study', studyId], `/studies/${studyId}`);
  const interview = useResearchQuery(user.id, workspace.id, ['interview', interviewId], `/interviews/${interviewId}`);
  const record = interview.data;
  const summary = useMemo(() => normalizeInterviewSummary(record?.summary_data), [record?.summary_data]);
  useEffect(() => {
    if (!record || dirty) return;
    setTitle(record.title || '');
    setSegments(Array.isArray(record.transcript_data) ? record.transcript_data : []);
    setDraftRevisions({ research_revision: record.research_revision, transcript_revision: record.transcript_revision, summary_revision: record.summary_revision });
  }, [record, dirty]);
  const changeSegment = (index, key, value) => { setSegments((previous) => previous.map((row, i) => i === index ? { ...row, [key]: value } : row)); setDirty(true); setSaved(false); };
  const save = async (event) => {
    event.preventDefault(); setError(null); setSaved(false);
    if (segments.some((row) => !row.text?.trim())) { setError({ code: 'INVALID_TRANSCRIPT' }); return; }
    setBusy(true);
    try {
      const updated = await researchRequest(`/interviews/${interviewId}`, { method: 'PATCH', body: JSON.stringify({
        title: title.trim(), transcript_data: segments.map((row) => ({ ...row, text: row.text.trim() })),
        ...draftRevisions,
      }) });
      queryClient.setQueryData(researchKey(user.id, workspace.id, 'interview', interviewId), updated);
      await queryClient.invalidateQueries({ queryKey: researchKey(user.id, workspace.id, 'interviews', studyId) });
      await queryClient.invalidateQueries({ queryKey: researchKey(user.id, workspace.id, 'synthesis', studyId) });
      setDirty(false); setSaved(true);
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const reset = async () => { setDirty(false); setError(null); setSaved(false); const latest = await interview.refetch(); if (latest.data) { setTitle(latest.data.title || ''); setSegments(Array.isArray(latest.data.transcript_data) ? latest.data.transcript_data : []); } };
  if (study.isPending || interview.isPending) return <Loading />;
  if (study.isError) return <ErrorState error={study.error} onRetry={() => study.refetch()} />;
  if (interview.isError) return <ErrorState error={interview.error} onRetry={() => interview.refetch()} />;
  if (study.data.workspace_id !== workspace.id || record.workspace_id !== workspace.id || record.study_id !== studyId) return <ErrorState error={{ status: 404 }} />;
  return <>
    <Link to={`/studies/${studyId}`} className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"><ArrowLeft size={16} />{study.data.title}</Link>
    <div className="mb-8 flex flex-wrap items-start justify-between gap-5"><div><div className="research-eyebrow">{t('research.interviews')}</div><h1 className="research-heading mt-3 break-words">{record.title}</h1><div className="mt-4 flex flex-wrap items-center gap-3"><Status status={record.status} />{record.summary_stale && <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">{t('research.reviewNeeded')}</span>}</div></div><div className="app-surface-soft max-w-sm rounded-2xl px-5 py-4"><div className="research-eyebrow">{t('research.sharedGoal')}</div><p className="mt-2 text-sm leading-6 text-slate-600">{study.data.goal}</p></div></div>
    {record.summary_stale && <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/70 p-5 text-sm leading-6 text-amber-900"><strong>{t('research.reviewNeeded')}</strong><p className="mt-1">{t('research.reviewNeededBody')}</p></div>}
    <div className="mb-6"><AnalysisAction userId={user.id} workspaceId={workspace.id} studyId={studyId} interviewId={interviewId} dirty={dirty} disabled={!record.transcript_data?.length} /></div>
    <div role="tablist" aria-label={t('research.sourceMaterial')} className="mb-6 flex w-fit max-w-full gap-1 overflow-x-auto rounded-2xl border border-slate-200/70 bg-white/70 p-1.5">{[['summary', 'summary'], ['transcript', 'transcript']].map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`rounded-xl px-5 py-2.5 text-sm font-bold transition ${tab === key ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-500 hover:bg-white'}`}>{t(`research.${label}`)}</button>)}</div>
    {tab === 'summary' ? <section role="tabpanel" className="max-w-5xl">{summary ? <div className="research-summary"><div className="mb-6 flex items-center justify-between gap-3"><div><div className="research-eyebrow">{t('research.summaryPrimary')}</div><h2 className="mt-2 text-2xl font-bold tracking-tight">{t('research.summary')}</h2></div><span className="text-xs text-slate-400">{t('research.revision', { version: record.summary_revision })}</span></div><InterviewSummary normalizedSummary={summary} /></div> : <EmptyState title={t('research.summaryEmptyTitle')} description={t('research.summaryEmptyBody')} action={t('research.transcript')} onAction={() => setTab('transcript')} />}</section> : <section role="tabpanel" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]"><form onSubmit={save} className="app-surface rounded-3xl p-6 sm:p-8" data-testid="research-transcript-form"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="research-eyebrow">{t('research.sourceMaterial')}</div><h2 className="mt-2 text-2xl font-bold tracking-tight">{t('research.transcript')}</h2></div><span className="text-xs text-slate-400">{t('research.transcriptRevision', { version: record.transcript_revision })}</span></div><p className="mt-4 text-sm leading-6 text-slate-500">{t('research.transcriptHint')}</p><label className="mt-7 block"><span className="research-label">{t('research.interviewTitle')}</span><input required maxLength={240} value={title} onChange={(event) => { setTitle(event.target.value); setDirty(true); setSaved(false); }} className="research-field" /></label><div className="mt-7 space-y-5">{segments.length === 0 && <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">{t('research.transcriptEmpty')}</p>}{segments.map((row, index) => <fieldset key={index} className="rounded-2xl border border-slate-200/80 bg-white/65 p-4 sm:p-5"><legend className="sr-only">{t('research.transcript')} {index + 1}</legend><div className="flex justify-end"><button type="button" aria-label={`${t('research.removeSegment')} ${index + 1}`} onClick={() => { setSegments((previous) => previous.filter((_, i) => i !== index)); setDirty(true); setSaved(false); }} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={16} /></button></div><div className="grid gap-4 sm:grid-cols-2"><label><span className="research-label">{t('research.speaker')}</span><input maxLength={200} value={row.speaker || ''} onChange={(event) => changeSegment(index, 'speaker', event.target.value)} className="research-field" /></label><label><span className="research-label">{t('research.timestamp')}</span><input value={row.timestamp || ''} onChange={(event) => changeSegment(index, 'timestamp', event.target.value)} className="research-field" /></label></div><label className="mt-4 block"><span className="research-label">{t('research.segmentText')}</span><textarea required rows={4} maxLength={50000} value={row.text || ''} onChange={(event) => changeSegment(index, 'text', event.target.value)} className="research-field resize-y" placeholder={t('research.segmentPlaceholder')} /></label></fieldset>)}</div><button type="button" className="research-secondary mt-6" onClick={() => { setSegments((previous) => [...previous, entry()]); setDirty(true); setSaved(false); }}><Plus size={16} />{t('research.addParagraph')}</button>{error && <div className="mt-6">{error.code === 'INVALID_TRANSCRIPT' ? <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{t('research.invalidTranscript')}</p> : <ErrorState error={error} onRetry={error.status === 409 ? reset : undefined} />}</div>}{saved && <p role="status" className="mt-6 text-sm font-semibold text-emerald-700">{t('research.transcriptSaved')}</p>}<div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200/70 pt-6"><span className="text-xs text-slate-400">{dirty ? t('research.unsaved') : t('research.saved')}</span><button className="research-primary" disabled={!dirty || busy || !title.trim()} data-testid="research-save-transcript">{t(busy ? 'research.saving' : 'research.saveTranscript')}</button></div></form><aside className="app-surface-soft h-fit rounded-3xl p-6"><FileText size={22} className="text-blue-600" /><h3 className="mt-5 font-bold">{t('research.sourceMaterial')}</h3><p className="mt-3 text-sm leading-6 text-slate-500">{t('research.processingPending')}</p></aside></section>}
  </>;
}
