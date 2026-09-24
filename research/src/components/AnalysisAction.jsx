import { useTranslation } from 'react-i18next';
import { Loader2, Sparkles } from 'lucide-react';
import { useAnalysisJob } from '../hooks/useAnalysisJob';
import { ErrorState } from './UI';

export default function AnalysisAction({ userId, workspaceId, studyId, interviewId, disabled = false, dirty = false }) {
  const { t } = useTranslation();
  const analysis = useAnalysisJob({ userId, workspaceId, studyId, interviewId });
  const unavailable = analysis.error?.code === 'RESEARCH_DISABLED';
  const status = analysis.job?.status;
  return <div className="space-y-3" data-testid={interviewId ? 'summary-action' : 'synthesis-action'}>
    <button className="research-primary" onClick={analysis.enqueue} disabled={disabled || dirty || unavailable || analysis.loading || analysis.busy}>
      {analysis.busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
      {t(`research.${analysis.busy ? 'analysisWorking' : interviewId ? 'generateSummary' : 'generateSynthesis'}`)}
    </button>
    {analysis.busy && <p role="status" className="text-sm leading-6 text-blue-700">{t(`research.${status === 'running' ? 'jobRunning' : 'jobQueued'}`)}</p>}
    {['failed', 'stale'].includes(status) && <p role="status" className="text-sm leading-6 text-amber-800">{t(`research.${status === 'stale' ? 'jobStale' : 'jobFailed'}`)}</p>}
    {dirty && <p className="text-sm text-amber-700">{t('research.saveBeforeAnalysis')}</p>}
    {unavailable ? <p className="text-sm text-slate-500">{t('research.analysisUnavailable')}</p> : analysis.error && <ErrorState error={analysis.error} />}
  </div>;
}
