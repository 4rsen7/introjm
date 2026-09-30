import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BarChart3, Check, Copy, Download, ListChecks, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import TaskResultsChart from '../../../client/src/components/interviews/TaskResultsChart';
import { researchKey, researchRequest, useResearchQuery } from '../hooks/useResearch';
import { useResearchJob } from '../hooks/useResearchJob';
import { buildResultsCsv, downloadFile, slugifyTitle } from '../utils/exportReport';
import { ErrorState, Loading, Modal, ModalForm } from './UI';

const statuses = ['success', 'partial', 'failure', 'not_attempted', 'unknown'];
const colors = ['#059669', '#d97706', '#e11d48', '#a1a1aa', '#64748b'];

export function EvidenceAction({ record, study, userId, workspaceId, disabled }) {
  const { t } = useTranslation();
  const demo = import.meta.env.VITE_RESEARCH_DEMO === 'true';
  const job = useResearchJob({ userId, workspaceId, path: `/interviews/${record.id}/evidence-job`, enabled: Boolean(study.plan?.tasks?.length) });
  if (!study.plan?.tasks?.length) return null;
  return <section className="app-surface-soft space-y-4 rounded-3xl p-5"><h2 className="flex items-center gap-2 text-sm font-bold text-slate-800"><ListChecks size={18} className="text-orange-600" />{t('research.taskComparison')}</h2><button className="research-secondary w-full" disabled={demo || disabled || job.busy || !record.transcript_data?.length} onClick={() => job.start.mutate({ endpoint: `/interviews/${record.id}/evidence-jobs` })}>{t(job.busy ? 'research.analysisWorking' : 'research.analyzeTasks')}</button>
    {job.busy && job.data?.id && <button type="button" className="research-secondary w-full" disabled={job.cancel.isPending} onClick={() => job.cancel.mutate()}>{t('research.cancelJob')}</button>}
    <p className="text-sm leading-6 text-slate-500">{t('research.evidenceHint')}</p>
    {job.data?.status === 'completed' && <p role="status" className="text-sm text-emerald-700">{t('research.evidenceReady')} <Link to={`/studies/${study.id}#results`} className="underline">{t('research.studyResults')}</Link></p>}
    {['failed', 'stale', 'canceled'].includes(job.data?.status) && <p role="status" className="text-sm text-amber-800">{t(job.data?.status === 'canceled' ? 'research.jobCanceled' : 'research.jobStale')}</p>}
    {job.error && <ErrorState error={job.error} />}
    {demo && <p className="text-xs leading-5 text-slate-500">{t('research.demoAnalysis')}</p>}
    {!record.transcript_data?.length && <p className="text-xs leading-5 text-slate-500">{t('research.addSourceFirst')}</p>}
  </section>;
}

export default function ResultsPanel({ study, userId, workspaceId }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const location = useLocation();
  const [open, setOpen] = useState(location.hash === '#results');
  useEffect(() => { if (location.hash === '#results') { setOpen(true); document.getElementById('results')?.scrollIntoView({ block: 'start' }); } }, [location.hash]);
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState('unknown');
  const [reason, setReason] = useState('');
  const [segmentIds, setSegmentIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 2500); return () => clearTimeout(timer); }, [copied]);
  const results = useResearchQuery(userId, workspaceId, ['results', study.id], `/studies/${study.id}/results`, open);
  const source = useResearchQuery(userId, workspaceId, ['transcript-version', selected?.outcome?.transcript_version_id],
    `/interviews/${selected?.session.id}/transcript-versions/${selected?.outcome?.transcript_version_id}`, Boolean(selected));
  const select = (session, task) => { setSelected({ session, outcome: task.outcome }); setStatus(task.status); setReason(task.outcome.reason); setSegmentIds(task.outcome.segment_ids); setError(null); };
  const save = async event => {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      await researchRequest(`/outcomes/${selected.outcome.id}`, { method: 'PATCH', body: JSON.stringify({ evidence_revision: selected.session.evidence_revision,
        outcome: { task_id: selected.outcome.task_id, status, reason, segment_ids: segmentIds } }) });
      await client.invalidateQueries({ queryKey: researchKey(userId, workspaceId, 'results', study.id) });
      setSelected(null);
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const data = results.data;
  const copyResults = async () => {
    if (!data) return;
    const lines = [
      `${study.title} — ${t('research.taskComparison')}`,
      `${t('research.sessionsLabel')}: ${data.coverage.sessions} | ${t('research.participantsLabel')}: ${data.coverage.linked_participants}`,
      ...data.tasks.map((task, i) => `${i + 1}. ${task.title}: ${task.success_rate === null ? t('research.noAttemptData') : t('research.successFraction', { count: task.counts.success, attempts: task.attempts, percent: Math.round(task.success_rate * 100) })} (${t('research.unknownCoverage', { unknown: task.counts.unknown, skipped: task.counts.not_attempted, analyzed: task.analyzed, total: task.sessions })})`),
    ];
    try { await navigator.clipboard.writeText(lines.join('\n')); setCopied(true); setCopyError(false); }
    catch { setCopyError(true); }
  };
  const exportCsv = () => {
    if (!data) return;
    downloadFile({
      filename: `${slugifyTitle(study.title, 'study')}-task-results.csv`,
      content: buildResultsCsv({ study, data, t }),
      mimeType: 'text/csv;charset=utf-8',
    });
  };
  return <section id="results" className="research-card">
    <div className="flex flex-wrap items-center justify-between gap-4"><h2 className="research-section-heading flex items-center gap-3"><BarChart3 size={21} className="shrink-0 text-orange-600" />{t('research.taskComparison')}</h2><div className="flex flex-wrap items-center gap-2">{open && data?.tasks?.length > 0 && <><button type="button" className="research-secondary" onClick={copyResults} data-testid="research-copy-results">{copied ? <Check size={15} /> : <Copy size={15} />}{t(copied ? 'research.copied' : 'research.copyResults')}</button><button type="button" className="research-secondary" onClick={exportCsv} data-testid="research-export-results-csv"><Download size={15} />{t('research.exportResultsCsv')}</button></>}<button className="research-secondary" disabled={open && results.isFetching} onClick={() => { setOpen(true); if (open) results.refetch(); }}>{open && <RefreshCw size={15} className={results.isFetching ? 'animate-spin' : ''} />}{t(open ? 'research.refreshResults' : 'research.showResults')}</button></div></div>
    {copyError && <p role="alert" className="mt-3 text-sm text-amber-800">{t('research.copyFailed')}</p>}
    <p className="research-description mt-3">{t('research.resultsHint')}</p>
    {open && (results.isPending ? <Loading /> : results.isError ? <ErrorState error={results.error} onRetry={() => results.refetch()} /> : <div className="mt-6 space-y-7">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[['sessions', 'sessionsLabel'], ['current_summaries', 'currentSummariesLabel'], ...(data.coverage.linked_participants > 0 ? [['linked_participants', 'participantsLabel'], ['unlinked_sessions', 'unlinkedLabel']] : [])].map(([key, label]) => <div key={key} className="flex flex-col rounded-2xl border border-slate-200/70 bg-white/60 p-4"><dt className="text-xs leading-5 text-slate-500">{t(`research.${label}`)}</dt><dd className="mt-auto pt-2 text-2xl font-bold tracking-tight text-slate-900">{data.coverage[key]}</dd></div>)}</dl>
      {(!data.tasks.length || !data.sessions.length) && <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-5"><p className="text-sm leading-6 text-slate-600">{t(!data.tasks.length ? 'research.noTasks' : 'research.noResultSessions')}</p><a className="research-secondary mt-4" href={!data.tasks.length ? '#plan' : '#sessions'}>{t(!data.tasks.length ? 'research.toPlan' : 'research.newInterview')}</a></div>}
      {data.tasks.length > 0 && <div className="h-80" aria-label={t('research.taskComparison')}><TaskResultsChart tasks={data.tasks} statuses={statuses} colors={colors} labels={statuses.map(key => t(`research.outcome_${key}`))} /></div>}
      <ol className="space-y-3">{data.tasks.map((task, i) => <li key={task.id} className="rounded-2xl border border-slate-200/70 p-4"><strong className="text-sm">{i + 1}. {task.title}</strong><p className="mt-2 text-sm text-slate-600">{task.success_rate === null ? t('research.noAttemptData') : t('research.successFraction', { count: task.counts.success, attempts: task.attempts, percent: Math.round(task.success_rate * 100) })}</p><p className="mt-2 text-xs text-slate-500">{t('research.unknownCoverage', { unknown: task.counts.unknown, skipped: task.counts.not_attempted, analyzed: task.analyzed, total: task.sessions })}</p></li>)}</ol>
      {data.sessions.length > 0 && data.tasks.length > 0 && <div className="overflow-x-auto rounded-2xl border border-slate-200" tabIndex={0} role="region" aria-label={t('research.taskComparison')}><table className="w-full text-left text-sm"><caption className="sr-only">{t('research.taskComparison')}</caption><thead className="bg-slate-50/80 text-xs text-slate-500"><tr><th scope="col" className="p-4">{t('research.interviews')}</th>{data.tasks.map((task, i) => <th scope="col" key={task.id} className="min-w-32 p-4" title={task.title}><span className="block text-slate-800">{i + 1}</span><span className="mt-1 block max-w-48 break-words font-normal">{task.title}</span></th>)}</tr></thead><tbody>{data.sessions.map(session => <tr key={session.id} className="border-t border-slate-200 bg-white/50"><th scope="row" className="min-w-44 p-4 font-semibold"><Link to={`/studies/${study.id}/interviews/${session.id}`} className="break-words text-blue-700 hover:underline">{session.title}</Link></th>{session.tasks.map(task => <td key={task.task_id} className="p-4">{task.outcome ? <button className="min-h-10 rounded-lg px-2 text-left font-semibold text-blue-700 underline decoration-blue-200 underline-offset-4 hover:bg-blue-50" onClick={() => select(session, task)}>{t(`research.outcome_${task.status}`)}</button> : <span className="text-slate-500">{t('research.outcome_unknown')}</span>}</td>)}</tr>)}</tbody></table></div>}
    </div>)}
    {selected && <Modal guardChanges title={t('research.taskEvidence')} onClose={() => !busy && setSelected(null)} busy={busy}><ModalForm onSubmit={save} actions={<><button type="button" data-modal-dismiss className="research-text-button" disabled={busy} onClick={() => setSelected(null)}>{t('research.cancel')}</button><button className="research-primary" disabled={busy || source.isPending || !reason.trim() || (!['unknown', 'not_attempted'].includes(status) && !segmentIds.length)}>{t(busy ? 'research.saving' : 'research.saveCorrection')}</button></>}>
      {error && <ErrorState error={error} />}
      <p className="text-xs text-slate-500">{t(selected.outcome.author_id ? 'research.humanCorrection' : 'research.aiProposal')}</p>
      <label className="block"><span className="research-label">{t('research.outcome')}</span><select className="research-field" value={status} onChange={e => setStatus(e.target.value)}>{statuses.map(key => <option key={key} value={key}>{t(`research.outcome_${key}`)}</option>)}</select></label>
      <label className="block"><span className="research-label">{t('research.reason')}</span><textarea required rows={3} maxLength={4000} value={reason} onChange={e => setReason(e.target.value)} className="research-field resize-y" /></label>
      <h3 className="research-subheading">{t('research.sourceMaterial')}</h3><p className="research-description">{t('research.selectEvidence')}</p>
      {source.isPending ? <Loading /> : source.isError ? <ErrorState error={source.error} /> : <div className="max-h-80 space-y-4 overflow-y-auto">{source.data.transcript_data.map(row => <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3" key={row.id}><input type="checkbox" checked={segmentIds.includes(row.id)} onChange={e => setSegmentIds(previous => e.target.checked ? [...previous, row.id] : previous.filter(id => id !== row.id))} /><span><span className="block text-xs font-semibold text-slate-500">{row.timestamp} · {row.speaker}</span><span className="mt-1 block text-sm leading-6">{row.text}</span></span></label>)}</div>}
    </ModalForm></Modal>}
  </section>;
}
