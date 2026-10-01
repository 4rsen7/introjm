import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function InterviewPipeline({ stage, filename, onCancel, canceling = false }) {
  const { t } = useTranslation();
  return <section className="app-surface rounded-3xl p-6 sm:p-8" data-testid={stage === 'summary' ? 'research-summary-progress' : 'research-transcription-progress'}>
    <div className="flex flex-wrap items-start justify-between gap-5">
      <div role="status" aria-live="polite" className="flex min-w-0 flex-1 items-start gap-4">
        <Loader2 size={22} className="mt-1 shrink-0 animate-spin text-orange-600" />
        <div className="min-w-0"><h2 className="research-section-heading">{t(`research.pipeline_${stage}`)}</h2><p className="mt-2 text-sm leading-7 text-slate-600">{t(stage === 'upload' ? 'research.pipeline_uploadHint' : 'research.pipelineBackgroundHint')}</p>{filename && <p className="mt-3 break-words text-xs text-slate-500">{filename}</p>}</div>
      </div>
      {onCancel && <button type="button" className="research-secondary" disabled={canceling} onClick={onCancel} data-testid="research-cancel-job">{t('research.cancel')}</button>}
    </div>
  </section>;
}
