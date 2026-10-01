import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { researchRequest } from '../hooks/useResearch';
import { useResearchJob } from '../hooks/useResearchJob';
import { ErrorState } from './UI';

const valuesFrom = (source) => ({ title: source?.title || '', goal: source?.brief_status === 'draft' && source?.goal === 'Brief pending confirmation' ? '' : source?.goal || '', brief: source?.brief || '',
  plan: { ...(source?.plan || {}), tasks: (source?.plan?.tasks || []).map(task => ({ ...task })) } });

export default function SharedBriefPanel({ study, interviews, userId, workspaceId, onSaved }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(() => valuesFrom(study));
  const [editing, setEditing] = useState(study.brief_status === 'draft');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const requested = useRef(false);
  const isDraft = study.brief_status === 'draft';
  const job = useResearchJob({ userId, workspaceId, path: `/studies/${study.id}/preparation-job` });
  const proposal = job.data?.status === 'completed' && job.data?.is_current !== false && job.data?.study_version_id === study.current_version_id ? job.data.output : null;
  const ready = interviews.filter(row => row.transcript_revision > 0 && row.status !== 'processing' && row.status !== 'failed');
  const waiting = interviews.some(row => row.status === 'processing');
  const failed = interviews.filter(row => row.status === 'failed');

  useEffect(() => { if (!editing) setDraft(valuesFrom(study)); }, [study, editing]);
  useEffect(() => {
    if (!isDraft || requested.current || job.isPending || job.busy || job.data || job.error || !ready.length || waiting) return;
    requested.current = true;
    job.start.mutate({ endpoint: `/studies/${study.id}/brief-jobs`, body: {} });
  }, [isDraft, job.isPending, job.busy, job.data, job.error, ready.length, waiting, study.id]);

  const update = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  const updateTask = (index, key, value) => setDraft(current => ({ ...current, plan: { ...current.plan, tasks: current.plan.tasks.map((task, i) => i === index ? { ...task, [key]: value } : task) } }));
  const save = async event => {
    event.preventDefault(); setBusy(true); setError(null); setNotice('');
    try {
      const endpoint = isDraft ? `/studies/${study.id}/brief-confirm` : `/studies/${study.id}/brief`;
      const payload = { ...draft, title: draft.title.trim(), goal: draft.goal.trim(), brief: draft.brief.trim() || null,
        revision: study.revision, ...(proposal ? { preparation_job_id: job.data.id } : {}) };
      await researchRequest(endpoint, { method: isDraft ? 'POST' : 'PATCH', body: JSON.stringify(payload) });
      setEditing(false); setNotice(isDraft ? 'briefConfirmed' : 'briefSaved');
      await onSaved();
    } catch (cause) { setError(cause); }
    finally { setBusy(false); }
  };
  return <section className="app-surface rounded-3xl p-6 sm:p-8" data-testid="research-shared-brief">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="research-eyebrow">{t('research.brief')}</div><h2 className="research-section-heading mt-2">{t('research.sharedGoal')}</h2></div>{!isDraft && !editing && <button type="button" className="research-secondary" onClick={() => { setDraft(valuesFrom(study)); setEditing(true); }}>{t('research.editBrief')}</button>}</div>
    {isDraft && <div className="mt-5 rounded-2xl bg-blue-50/70 p-5 text-sm leading-6 text-blue-800" role="status">
      {waiting ? t('research.briefWaitingTranscripts', { ready: ready.length, total: interviews.length }) : job.busy ? t('research.briefPreparing', { count: ready.length }) : proposal ? t('research.briefProposalAll', { count: proposal.source_count ?? ready.length }) : ready.length ? t('research.briefReadyToPrepare', { count: ready.length }) : t('research.briefManualOrUpload')}
      {failed.length > 0 && <p className="mt-2 text-amber-800">{t('research.briefFailedSources', { count: failed.length })}</p>}
    </div>}
    {proposal && <div className="mt-5 rounded-2xl border border-orange-200 bg-orange-50/60 p-5"><h3 className="font-semibold">{t('research.reviewProposal')}</h3><p className="mt-2 whitespace-pre-line text-sm leading-6">{proposal.goal}</p><button type="button" className="research-secondary mt-4" onClick={() => { setDraft(current => ({ ...current, goal: proposal.goal || current.goal, brief: proposal.brief || current.brief, plan: { ...current.plan, ...(proposal.plan || {}), tasks: (proposal.plan?.tasks || current.plan.tasks).map(task => ({ ...task, id: task.id || crypto.randomUUID() })) } })); setEditing(true); }}>{t('research.useProposal')}</button></div>}
    {isDraft && ready.length > 0 && !waiting && !job.busy && !proposal && <button type="button" className="research-secondary mt-5" disabled={job.start.isPending} onClick={() => job.start.mutate({ endpoint: `/studies/${study.id}/brief-jobs`, body: {} })}>{t('research.prepareWithAi')}</button>}
    {!isDraft && <div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" className="research-secondary" disabled={job.busy || waiting || busy} onClick={() => job.start.mutate({ endpoint: `/studies/${study.id}/brief-jobs`, body: { description: editing ? `${draft.goal}\n${draft.brief}` : `${study.goal}\n${study.brief || ''}` } })}>{t(job.busy ? 'research.analysisWorking' : 'research.expandBriefWithAi')}</button><p className="text-xs leading-5 text-slate-500">{t('research.aiBriefOptional')}</p></div>}
    {job.start.error && <div className="mt-5"><ErrorState error={job.start.error} /></div>}
    {job.data?.status === 'failed' && !job.start.error && <p role="alert" className="mt-5 rounded-2xl bg-amber-50/70 p-5 text-sm leading-6 text-amber-800">{t('research.briefPreparationFailed')}</p>}
    {notice && <p role="status" className="mt-5 text-sm text-emerald-700">{t(`research.${notice}`)}</p>}
    {editing ? <form onSubmit={save} className="mt-6 space-y-5">
      {error && <ErrorState error={error} onRetry={error.status === 409 ? onSaved : undefined} />}
      <label className="block"><span className="research-label">{t('research.studyTitle')}</span><input required maxLength={240} className="research-field" value={draft.title} onChange={e => update('title', e.target.value)} /></label>
      <label className="block"><span className="research-label">{t('research.goal')}</span><textarea required rows={3} maxLength={12000} className="research-field" value={draft.goal} onChange={e => update('goal', e.target.value)} /></label>
      <label className="block"><span className="research-label">{t('research.brief')}</span><textarea rows={5} maxLength={30000} className="research-field" value={draft.brief} onChange={e => update('brief', e.target.value)} /></label>
      <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">{t('research.sharedTasks')}</h3><button type="button" className="research-secondary" onClick={() => update('plan', { ...draft.plan, tasks: [...draft.plan.tasks, { id: crypto.randomUUID(), title: '', instruction: '', success_criteria: '' }] })}>{t('research.addTask')}</button></div>
        {draft.plan.tasks.map((task, index) => <fieldset key={task.id || index} className="space-y-3 rounded-2xl border border-slate-200 p-5"><legend className="px-2 text-xs font-semibold text-slate-500">{t('research.taskNumber', { number: index + 1 })}</legend>{['title', 'instruction', 'success_criteria'].map(key => <label key={key} className="block"><span className="research-label">{t(`research.task_${key}`)}</span><textarea rows={key === 'title' ? 1 : 2} maxLength={key === 'title' ? 240 : 4000} value={task[key] || ''} onChange={e => updateTask(index, key, e.target.value)} className="research-field" /></label>)}<button type="button" className="research-text-button" onClick={() => update('plan', { ...draft.plan, tasks: draft.plan.tasks.filter((_, i) => i !== index) })}>{t('research.removeTask')}</button></fieldset>)}
      </div>
      <div className="flex flex-wrap gap-3"><button className="research-primary" disabled={busy || !draft.title.trim() || !draft.goal.trim()}>{t(busy ? 'research.saving' : isDraft ? 'research.confirmBrief' : 'research.save')}</button>{!isDraft && <button type="button" className="research-secondary" onClick={() => setEditing(false)}>{t('research.cancel')}</button>}</div>
    </form> : <div className="mt-6 space-y-5 text-sm leading-7"><div><h3 className="research-label">{t('research.goal')}</h3><p className="whitespace-pre-line break-words text-slate-700">{study.goal}</p></div><div><h3 className="research-label">{t('research.brief')}</h3><p className="whitespace-pre-line break-words text-slate-700">{study.brief || t('research.noBrief')}</p></div>{(study.plan?.tasks || []).length > 0 && <div><h3 className="research-label">{t('research.sharedTasks')}</h3><ol className="mt-2 list-decimal space-y-3 pl-5">{study.plan.tasks.map(task => <li key={task.id}><strong>{task.title}</strong>{task.success_criteria && <p className="text-slate-600">{task.success_criteria}</p>}</li>)}</ol></div>}</div>}
  </section>;
}
