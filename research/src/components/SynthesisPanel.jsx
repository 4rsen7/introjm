import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useResearchQuery } from '../hooks/useResearch';
import AnalysisAction from './AnalysisAction';
import { ErrorState, Loading } from './UI';

export default function SynthesisPanel({ userId, workspaceId, studyId, interviews }) {
  const { t } = useTranslation();
  const synthesis = useResearchQuery(userId, workspaceId, ['synthesis', studyId], `/studies/${studyId}/synthesis`);
  const findings = synthesis.data?.output?.findings || [];
  const names = new Map(interviews.map((item) => [item.id, item.title]));
  return <section className="app-surface rounded-3xl p-6 sm:p-8">
    <div className="research-eyebrow">{t('research.studyResults')}</div>
    <h2 className="mt-3 text-2xl font-bold tracking-tight">{t('research.synthesisTitle')}</h2>
    <p className="mb-6 mt-3 text-sm leading-6 text-slate-500">{t('research.synthesisDescription')}</p>
    <AnalysisAction userId={userId} workspaceId={workspaceId} studyId={studyId} />
    {synthesis.isPending ? <Loading /> : synthesis.isError && synthesis.error.code !== 'RESEARCH_DISABLED' ? <div className="mt-5"><ErrorState error={synthesis.error} onRetry={() => synthesis.refetch()} /></div> : findings.length > 0 ? <>
      <p className="mt-7 text-xs font-semibold text-slate-500">{t('research.synthesisSourceCount', { count: synthesis.data.source_manifest.length })}</p>
      <ol className="mt-4 space-y-5">{findings.map((finding, index) => <li key={index} className="rounded-2xl border border-slate-200/70 bg-white/60 p-5"><p className="whitespace-pre-line text-sm leading-7 text-slate-800">{finding.text}</p><div className="mt-4 flex flex-wrap gap-2">{finding.source_ids.map((id) => <Link key={id} to={`/studies/${studyId}/interviews/${id}`} className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">{names.get(id) || t('research.openSource')}</Link>)}</div></li>)}</ol>
    </> : <p className="mt-6 text-sm leading-6 text-slate-500">{t('research.synthesisEmpty')}</p>}
  </section>;
}
