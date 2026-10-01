import { useTranslation } from 'react-i18next';
import { Loader2, Sparkles } from 'lucide-react';
import { useAnalysisJob } from '../hooks/useAnalysisJob';
import { ErrorState } from './UI';

export default function AnalysisAction({ userId, workspaceId, studyId, interviewId, disabled = false, disabledReason, dirty = false, existing = false, onStart }) {
  const { t } = useTranslation();
  const demo = import.meta.env.VITE_RESEARCH_DEMO === 'true';
  const analysis = useAnalysisJob({ userId, workspaceId, studyId, interviewId });
  const unavailable = demo || analysis.error?.code === 'RESEARCH_DISABLED';
  const status = analysis.job?.status;
  return <div className="space-y-3" data-testid={interviewId ? 'summary-action' : 'synthesis-action'}>
    <div className="flex flex-wrap items-center gap-3">
      <button className={existing ? 'research-secondary' : 'research-primary'} onClick={() => { onStart?.(); analysis.enqueue(); }} disabled={disabled || dirty || unavailable || analysis.loading || analysis.busy}>
        {analysis.busy || analysis.loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
        {t(`research.${analysis.busy ? 'analysisWorking' : interviewId ? existing ? 'regenerateSummary' : 'generateSummary' : existing ? 'regenerateSynthesis' : 'generateSynthesis'}`)}
      </button>
      {analysis.busy && analysis.job?.id && <button type="button" className="research-secondary" disabled={analysis.canceling} onClick={analysis.cancel} data-testid="research-cancel-job">{t('research.cancelJob')}</button>}
    </div>
    {analysis.busy && <p role="status" className="text-sm leading-6 text-blue-700">{t(`research.${status === 'running' ? 'jobRunning' : 'jobQueued'}`)}</p>}
    {['failed', 'stale', 'canceled'].includes(status) && <p role="status" className="text-sm leading-6 text-amber-800">{t(`research.${status === 'stale' ? 'jobStale' : status === 'canceled' ? 'jobCanceled' : 'jobFailed'}`)}</p>}
    {dirty && <p className="text-sm text-amber-700">{t('research.saveBeforeAnalysis')}</p>}
    {disabled && disabledReason && !dirty && <p className="max-w-sm text-xs leading-5 text-slate-500">{disabledReason}</p>}
    {unavailable ? <p className="text-sm text-slate-500">{t(demo ? 'research.demoAnalysis' : 'research.analysisUnavailable')}</p> : analysis.error && <ErrorState error={analysis.error} />}
  </div>;
}
