import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { researchKey, researchRequest, useResearchQuery } from '../hooks/useResearch';
import { summaryContextChanged } from '../utils/researchFlow';
import { useResearchJob } from '../hooks/useResearchJob';
import { ErrorState } from './UI';

export default function ImpactPanel({ record, study, userId, workspaceId, disabled }) {
  const { t } = useTranslation();
  const demo = import.meta.env.VITE_RESEARCH_DEMO === 'true';
  const client = useQueryClient();
  const [error, setError] = useState(null);
  const [accepting, setAccepting] = useState(false);
  const source = useResearchQuery(userId, workspaceId, ['summary-source', record.summary_source_job_id], `/jobs/${record.summary_source_job_id}`, Boolean(record.summary_stale && record.summary_source_job_id && record.summary_source_study_revision == null));
  const contextChanged = summaryContextChanged(record, study) || Boolean(source.data?.study_version_id && source.data.study_version_id !== study.current_version_id);
  const job = useResearchJob({ userId, workspaceId, path: `/interviews/${record.id}/impact`, enabled: Boolean(record.summary_source_job_id && record.summary_stale) });
  const result = job.data?.status === 'completed' ? job.data.output : null;
  const current = job.data?.transcript_version_id === record.current_transcript_version_id && job.data?.study_version_id === study.current_version_id && job.data?.summary_revision === record.summary_revision;
  const accept = async () => {
    setAccepting(true); setError(null);
    try {
      const updated = await researchRequest(`/interviews/${record.id}/summary-validations/${job.data.validation.id}/accept`, { method: 'POST', body: JSON.stringify({ research_revision: record.research_revision }) });
      client.setQueryData(researchKey(userId, workspaceId, 'interview', record.id), updated);
      await Promise.all(['interviews', 'synthesis', 'results'].map(key => client.invalidateQueries({ queryKey: researchKey(userId, workspaceId, key, study.id) })));
    } catch (err) { setError(err); } finally { setAccepting(false); }
  };
  if (!record.summary_stale) return null;
  return <section className="mb-6 space-y-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
    <h2 className="research-subheading">{t('research.impactTitle')}</h2><p className="text-sm leading-6 text-slate-600" data-testid="research-stale-reason">{t(contextChanged ? 'research.contextChangedHint' : 'research.transcriptChangedHint')}</p>
    {!contextChanged && <div className="flex flex-wrap items-center gap-3"><button className="research-secondary" disabled={demo || disabled || job.busy || source.isFetching || !record.summary_source_job_id} onClick={() => job.start.mutate({ endpoint: `/interviews/${record.id}/impact-jobs` })}>{t(job.busy ? 'research.analysisWorking' : 'research.checkImpact')}</button>{job.busy && job.data?.id && <button type="button" className="research-secondary" disabled={job.cancel.isPending} onClick={() => job.cancel.mutate()}>{t('research.cancelJob')}</button>}</div>}
    {demo && <p className="text-xs leading-5 text-slate-500">{t('research.demoAnalysis')}</p>}{result && !contextChanged && <div><p className="font-semibold">{t(`research.impact_${result.decision}`)}</p><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6">{result.reasons.map((reason, i) => <li key={i}>{['WHITESPACE_ONLY', 'CRITICAL_EDIT_REQUIRES_REVIEW'].includes(reason) ? t(`research.${reason}`) : reason}</li>)}</ul>
      {result.sections?.length > 0 && <p className="mt-3 text-xs text-slate-600">{result.sections.map(section => t(`research.section_${section}`)).join(' · ')}</p>}
      {current && result.decision === 'unaffected' && job.data.validation && <button className="research-secondary mt-4" disabled={disabled || accepting} onClick={accept}>{t('research.keepSummary')}</button>}
      {!current && <p className="mt-3 text-sm text-amber-800">{t('research.jobStale')}</p>}
    </div>}
    {(error || job.error) && <ErrorState error={error || job.error} />}
  </section>;
}
