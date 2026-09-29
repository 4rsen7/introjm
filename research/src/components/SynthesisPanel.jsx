import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Download } from 'lucide-react';
import { useResearchQuery } from '../hooks/useResearch';
import { buildStudyReportMarkdown, downloadFile, slugifyTitle } from '../utils/exportReport';
import AnalysisAction from './AnalysisAction';
import { ErrorState, Loading } from './UI';

export default function SynthesisPanel({ study, userId, workspaceId, studyId, interviews }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 2500); return () => clearTimeout(timer); }, [copied]);
  const synthesis = useResearchQuery(userId, workspaceId, ['synthesis', studyId], `/studies/${studyId}/synthesis`);
  const findings = synthesis.data?.output?.findings || [];
  const names = new Map(interviews.map((item) => [item.id, item.title]));
  const hasSummary = interviews.some(item => item.summary_revision > 0 && !item.summary_stale);
  const copyFindings = async () => {
    const text = findings.map((finding, index) => {
      const sources = (finding.source_ids || []).map((id) => names.get(id) || id).join(', ');
      return `${t('research.findingNumber', { number: index + 1 })}\n${finding.text}${sources ? `\n(${sources})` : ''}`;
    }).join('\n\n');
    try { await navigator.clipboard.writeText(text); setCopied(true); setCopyError(false); }
    catch { setCopyError(true); }
  };
  const exportReport = () => {
    downloadFile({
      filename: `${slugifyTitle(study?.title, 'study')}-report.md`,
      content: buildStudyReportMarkdown({ study, findings, interviews, t }),
      mimeType: 'text/markdown;charset=utf-8',
    });
  };
  return <section className="research-card">
    <h2 className="research-section-heading">{t('research.synthesisTitle')}</h2>
    <p className="research-description mb-6 mt-3">{t('research.synthesisDescription')}</p>
    <AnalysisAction userId={userId} workspaceId={workspaceId} studyId={studyId} disabled={!hasSummary} disabledReason={!hasSummary ? t('research.noSourcesBody') : undefined} />
    {synthesis.isPending ? <Loading /> : synthesis.isError && synthesis.error.code !== 'RESEARCH_DISABLED' ? <div className="mt-5"><ErrorState error={synthesis.error} onRetry={() => synthesis.refetch()} /></div> : findings.length > 0 ? <>
      <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold text-slate-500">{t('research.synthesisSourceCount', { count: synthesis.data.source_manifest.length })}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="research-secondary" onClick={copyFindings} data-testid="research-copy-synthesis">{copied ? <Check size={15} /> : <Copy size={15} />}{t(copied ? 'research.copied' : 'research.copyFindings')}</button>
          <button type="button" className="research-secondary" onClick={exportReport} data-testid="research-export-synthesis-md"><Download size={15} />{t('research.exportReportMd')}</button>
        </div>
      </div>
      {copyError && <p role="alert" className="mt-3 text-sm text-amber-800">{t('research.copyFailed')}</p>}
      <ol className="mt-4 space-y-5">{findings.map((finding, index) => <li key={index} className="rounded-2xl border border-slate-200/70 bg-white/60 p-5"><div className="mb-3 text-xs font-bold text-orange-600">{t('research.findingNumber', { number: index + 1 })}</div><p className="whitespace-pre-line break-words text-sm leading-7 text-slate-800">{finding.text}</p><div className="mt-4 flex flex-wrap gap-2">{finding.source_ids.map((id) => <Link key={id} to={`/studies/${studyId}/interviews/${id}`} className="inline-flex min-h-10 max-w-full items-center rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"><span className="break-words">{names.get(id) || t('research.openSource')}</span></Link>)}</div></li>)}</ol>
    </> : <p className="mt-6 text-sm leading-6 text-slate-500">{t('research.synthesisEmpty')}</p>}
  </section>;
}
