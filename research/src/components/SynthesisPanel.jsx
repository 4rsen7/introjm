import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { researchKey, researchRequest, useResearchQuery } from '../hooks/useResearch';
import { ErrorState, Loading } from './UI';
import { buildStudyReportMarkdown, downloadFile, slugifyTitle } from '../utils/exportReport';

const groups = [
  ['insights', 'research.findingsInsights'],
  ['pain_points', 'research.findingsPainPoints'],
  ['what_worked', 'research.findingsWorked'],
  ['what_did_not_work', 'research.findingsDidNotWork'],
];

export default function SynthesisPanel({ study, userId, workspaceId, studyId, interviews }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const names = new Map(interviews.map(row => [row.id, row.title]));
  const synthesis = useResearchQuery(userId, workspaceId, ['synthesis', studyId], `/studies/${studyId}/synthesis`, true, 4000);
  const result = synthesis.data;
  const findings = Array.isArray(result?.output?.findings) ? result.output.findings : [];
  const legacy = findings.filter(finding => !groups.some(([category]) => category === finding.category));
  const updating = Boolean(!study.flow_error_code && study.flow_pending && (study.refresh_context_revision != null || study.brief_status === 'confirmed'));
  const staleBrief = result?.stale_reason === 'brief_changed';
  const retryFailure = Boolean(result?.refresh_available && (study.flow_error_code || result?.stale_reason === 'sources_changed'));
  const firstResult = Boolean(!result?.output && result?.refresh_available && study.brief_status === 'confirmed');
  const report = () => {
    // Historical findings must never be exported as evidence for a newer brief.
    const snapshot = result?.is_current ? study : { title: study.title };
    const body = buildStudyReportMarkdown({ study: snapshot, findings, interviews, t });
    const notice = staleBrief ? `${t('research.previousBriefResults')}\n\n` : '';
    const quotes = findings.flatMap(finding => (finding.evidence || []).map(source =>
      `> ${source.quote}\n\n${names.get(source.interview_id) || t('research.openSource')}`));
    return notice + body + (quotes.length ? `\n${quotes.join('\n\n')}\n` : '');
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(report()); setCopied(true); setCopyError(false); }
    catch { setCopyError(true); }
  };
  const refresh = async () => {
    setBusy(true); setError(null);
    try {
      await researchRequest(`/studies/${studyId}/refresh-results`, { method: 'POST', body: JSON.stringify({ revision: study.revision }) });
      await Promise.all(['study', 'interviews', 'synthesis'].map(part => client.invalidateQueries({ queryKey: researchKey(userId, workspaceId, part, studyId) })));
    } catch (cause) { setError(cause); }
    finally { setBusy(false); }
  };
  const renderFinding = (finding, index) => <details key={`${finding.text}:${index}`} className="border-t border-slate-200/70 py-4 first:border-t-0" data-testid="research-finding">
    <summary className="cursor-pointer list-none font-medium leading-7 text-slate-800 [&::-webkit-details-marker]:hidden"><span className="flex items-start justify-between gap-4"><span className="whitespace-pre-line break-words">{finding.text}</span><span aria-hidden="true" className="text-slate-400">⌄</span></span></summary>
    <div className="mt-4 space-y-3 text-sm leading-6">
      {(finding.evidence || []).map((evidence, evidenceIndex) => {
        const id = evidence.interview_id;
        return <div key={`${id}:${evidence.segment_id || evidenceIndex}`} className="rounded-xl bg-slate-50 p-4">
          {evidence.quote && <blockquote className="whitespace-pre-line break-words text-slate-700">“{evidence.quote}”</blockquote>}
          {id && <Link className="mt-2 inline-flex font-semibold text-blue-700 hover:underline" to={`/studies/${studyId}/interviews/${id}`}>{names.get(id) || t('research.openSource')}</Link>}
        </div>;
      })}
      <div className="flex flex-wrap gap-2">{(finding.source_ids || []).filter(id => !(finding.evidence || []).some(e => e.interview_id === id)).map(id => <Link key={id} className="rounded-lg bg-blue-50 px-3 py-2 font-semibold text-blue-700 hover:bg-blue-100" to={`/studies/${studyId}/interviews/${id}`}>{names.get(id) || t('research.openSource')}</Link>)}</div>
      {!(finding.evidence || []).length && !(finding.source_ids || []).length && <p className="text-slate-500">{t('research.findingNoEvidence')}</p>}
    </div>
  </details>;
  return <section data-testid="research-synthesis-tab" className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="research-section-heading">{t('research.overallSummary')}</h2><p className="mt-2 text-sm text-slate-500">{t('research.synthesisSourceCount', { count: result?.source_manifest?.length || 0 })}</p></div>{result?.refresh_available && (staleBrief || retryFailure || firstResult) && !updating && <button type="button" className="research-primary" onClick={refresh} disabled={busy} data-testid="research-refresh-results">{t(busy ? 'research.saving' : firstResult && !staleBrief ? 'research.createResults' : 'research.refreshResults')}</button>}</div>
    {staleBrief && <p className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900" role="status">{t('research.previousBriefResults')}</p>}
    {updating && <p className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm leading-6 text-blue-900" role="status">{t('research.updatingResults')}</p>}
    {study.flow_error_code && <p className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm leading-6 text-rose-800" role="alert">{t('research.resultsUpdateFailed')}</p>}
    {error && <ErrorState error={error} />}
    {copyError && <p role="alert" className="text-sm text-amber-800">{t('research.copyFailed')}</p>}
    {findings.length > 0 && <details className="app-surface-soft rounded-2xl p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-600">{t('research.reportActions')}</summary><div className="mt-4 flex flex-wrap gap-3"><button type="button" className="research-secondary" data-testid="research-copy-synthesis" onClick={copy}>{t(copied ? 'research.copied' : 'research.copySummary')}</button><button type="button" className="research-secondary" data-testid="research-export-synthesis-md" onClick={() => downloadFile({ filename: `${slugifyTitle(study.title)}-report.md`, content: report(), mimeType: 'text/markdown;charset=utf-8' })}>{t('research.exportStudyMd')}</button></div></details>}
    {synthesis.isPending ? <Loading /> : synthesis.isError ? <ErrorState error={synthesis.error} onRetry={() => synthesis.refetch()} /> : findings.length ? <>
      <div className="grid gap-5 lg:grid-cols-2">{groups.map(([category, title]) => <section key={category} className="app-surface rounded-3xl p-6 sm:p-7" data-testid={`research-findings-${category}`}><h3 className="mb-5 text-xl font-bold tracking-tight text-slate-900">{t(title)}</h3>{findings.filter(finding => finding.category === category).length ? findings.filter(finding => finding.category === category).map(renderFinding) : <p className="text-sm text-slate-500">{t('research.noCategoryFindings')}</p>}</section>)}</div>
      {legacy.length > 0 && <details className="app-surface rounded-3xl p-6"><summary className="cursor-pointer font-semibold">{t('research.legacyFindings')}</summary><div className="mt-4">{legacy.map(renderFinding)}</div></details>}
    </> : <div className="app-empty-state rounded-3xl p-8"><h3 className="research-section-heading">{t('research.summaryEmptyTitle')}</h3><p className="mt-3 text-sm leading-7 text-slate-600">{study.brief_status === 'draft' ? t('research.confirmBriefFirst') : t('research.synthesisEmpty')}</p><Link className="research-secondary mt-5" to={`#${study.brief_status === 'draft' ? 'brief' : 'interviews'}`}>{t(study.brief_status === 'draft' ? 'research.brief' : 'research.interviews')}</Link></div>}
  </section>;
}
