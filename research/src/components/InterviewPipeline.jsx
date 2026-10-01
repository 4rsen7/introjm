import { Check, Loader2, FileAudio, FileText, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function InterviewPipeline({ stage, replay = false, filename }) {
  const { t } = useTranslation();
  const stages = [['upload', FileAudio], ['transcription', FileText], ['summary', Sparkles]];
  const current = stages.findIndex(([key]) => key === stage);
  return <section className="app-surface rounded-3xl p-6 sm:p-8" role="status" aria-live="polite" data-testid={stage === 'summary' ? 'research-summary-progress' : 'research-transcription-progress'}>
    <div className="flex items-start gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><Loader2 size={24} className="animate-spin" /></span><div className="min-w-0"><div className="research-eyebrow">{t(replay ? 'research.replayBadge' : 'research.pipelineTitle')}</div><h2 className="mt-2 text-xl font-bold tracking-tight">{t(`research.pipeline_${stage}`)}</h2><p className="mt-3 text-sm leading-7 text-slate-600">{t(replay ? 'research.replayHint' : `research.pipeline_${stage}Hint`)}</p>{filename && <p className="mt-3 break-words text-xs text-slate-500">{filename}</p>}</div></div>
    <ol className="mt-7 grid gap-4 sm:grid-cols-3">{stages.map(([key, Icon], index) => <li key={key} className={`flex items-start gap-3 rounded-2xl border p-4 ${index === current ? 'border-orange-200 bg-orange-50/60' : 'border-slate-200/70 bg-white/50'}`} aria-current={index === current ? 'step' : undefined}><span className={`mt-0.5 ${index < current ? 'text-emerald-600' : 'text-slate-400'}`}>{index < current ? <Check size={18} /> : <Icon size={18} />}</span><div><p className="text-sm font-semibold">{t(`research.pipelineStep_${key}`)}</p><p className="mt-1 text-xs leading-5 text-slate-500">{t(index < current ? 'research.pipelineDone' : index === current ? 'research.pipelineActive' : 'research.pipelineNext')}</p></div></li>)}</ol>
  </section>;
}
