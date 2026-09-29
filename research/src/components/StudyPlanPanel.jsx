import { useEffect, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, ClipboardList, Copy, History, Check, ExternalLink, Loader2, Sparkles } from 'lucide-react';
import { researchKey, researchRequest, useResearchQuery } from '../hooks/useResearch';
import { useResearchJob } from '../hooks/useResearchJob';
import { ErrorState, Loading, Modal, ModalForm } from './UI';

const sections = ['summary', 'testedProductContext', 'taskSuccess', 'whatWorked', 'whatDidNotWork', 'confusionsObjections', 'featureRequests', 'actionableRecommendations', 'quotes'];
const lines = value => value.split('\n').map(row => row.trim()).filter(Boolean);
export const emptyPlan = () => ({ questions: [], hypotheses: [], prototype: { name: '', url: '', version: '' }, tasks: [], guide: [] });

export function StudyPlanForm({ plan, busy, error, onSave, onClose, prepend }) {
  const { t } = useTranslation();
  const initial = plan || emptyPlan();
  const [draft, setDraft] = useState(() => ({ ...initial, prototype: { ...emptyPlan().prototype, ...initial.prototype }, tasks: initial.tasks || [], questions: (initial.questions || []).join('\n'), hypotheses: (initial.hypotheses || []).join('\n'), guide: (initial.guide || []).join('\n') }));
  const field = (key, value) => setDraft(old => ({ ...old, [key]: value }));
  const taskField = (id, key, value) => setDraft(old => ({ ...old, tasks: old.tasks.map(task => task.id === id ? { ...task, [key]: value } : task) }));
  const submit = event => {
    event.preventDefault();
    onSave({ ...draft, questions: lines(draft.questions), hypotheses: lines(draft.hypotheses), guide: lines(draft.guide) });
  };
  return <ModalForm onSubmit={submit} testId="research-plan-form" actions={<><button type="button" data-modal-dismiss className="research-text-button" disabled={busy} onClick={onClose}>{t('research.cancel')}</button><button disabled={busy} className="research-primary">{t(busy ? 'research.saving' : 'research.savePlan')}</button></>}>
    {error && <ErrorState error={error} />}
    {prepend}
    <p className="text-sm leading-6 text-slate-500">{t('research.planHint')}</p>
    <div className="grid gap-4 sm:grid-cols-2">{['name', 'version'].map(key => <label key={key}><span className="research-label">{t(`research.prototype_${key}`)}</span><input value={draft.prototype[key]} maxLength={240} className="research-field" onChange={e => field('prototype', { ...draft.prototype, [key]: e.target.value })} /></label>)}</div>
    <label className="block"><span className="research-label">{t('research.prototype_url')}</span><input type="url" maxLength={2000} value={draft.prototype.url} className="research-field" onChange={e => field('prototype', { ...draft.prototype, url: e.target.value })} /></label>
    {['questions', 'hypotheses'].map(key => <label key={key} className="block"><span className="research-label">{t(`research.plan_${key}`)}</span><textarea value={draft[key]} rows={3} maxLength={20000} onChange={e => field(key, e.target.value)} className="research-field resize-y" /><span className="mt-2 block text-xs text-slate-400">{t('research.onePerLine')}</span></label>)}
    <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="research-subheading">{t('research.sharedTasks')}</h3><button type="button" className="research-secondary" disabled={draft.tasks.length >= 30} onClick={() => field('tasks', [...draft.tasks, { id: crypto.randomUUID(), title: '', instruction: '', success_criteria: '' }])}><Plus size={16} />{t('research.addTask')}</button></div>
      {draft.tasks.map((task, index) => <fieldset key={task.id} className="min-w-0 space-y-4 rounded-2xl border border-slate-200 p-4 sm:p-5"><legend className="px-2 text-xs font-bold text-slate-500">{t('research.taskNumber', { number: index + 1 })}</legend>
        {[['title', 240, 1], ['instruction', 4000, 3], ['success_criteria', 2000, 2]].map(([key, max, rows]) => <label key={key} className="block"><span className="research-label">{t(`research.task_${key}`)}</span><textarea required maxLength={max} rows={rows} value={task[key]} className="research-field resize-y" onChange={e => taskField(task.id, key, e.target.value)} /></label>)}
        <button type="button" className="flex items-center gap-2 text-xs font-semibold text-rose-600" onClick={() => field('tasks', draft.tasks.filter(row => row.id !== task.id))}><Trash2 size={14} />{t('research.removeTask')}</button>
      </fieldset>)}
    </section>
    <label className="block"><span className="research-label">{t('research.interviewGuide')}</span><textarea rows={6} value={draft.guide} maxLength={100000} className="research-field resize-y" onChange={e => field('guide', e.target.value)} /><span className="mt-2 block text-xs text-slate-400">{t('research.onePerLine')}</span></label>
    <fieldset><legend className="research-label">{t('research.summarySections')}</legend><div className="mt-3 grid gap-3 sm:grid-cols-2">{sections.map(section => <label className="flex items-center gap-3 text-sm" key={section}><input type="checkbox" disabled={section === 'summary'} checked={(draft.summary_sections || sections).includes(section)} onChange={event => field('summary_sections', event.target.checked ? [...(draft.summary_sections || sections), section] : (draft.summary_sections || sections).filter(key => key !== section))} />{t(`research.section_${section}`)}</label>)}</div></fieldset>
  </ModalForm>;
}

export default function StudyPlanPanel({ study, userId, workspaceId, interviews = [], autoDraftRequested = false, onDuplicate }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [draftStudy, setDraftStudy] = useState(null);
  const [aiDraftModal, setAiDraftModal] = useState(null);
  const [aiDraftEnabled, setAiDraftEnabled] = useState(Boolean(autoDraftRequested));
  const [autoOpenPending, setAutoOpenPending] = useState(Boolean(autoDraftRequested));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(null);
  const prepJob = useResearchJob({ userId, workspaceId, path: `/studies/${study.id}/preparation-job`, enabled: aiDraftEnabled });
  const proposal = prepJob.data?.status === 'completed' ? prepJob.data.output : null;
  const proposalIsCurrent = prepJob.data?.study_version_id === study.current_version_id;
  const hasAnyInterview = Array.isArray(interviews) && interviews.length > 0;
  const hasCompletedInterview = Array.isArray(interviews) && interviews.some(row => row.status === 'completed');

  useEffect(() => {
    if (!autoOpenPending || prepJob.isPending || prepJob.busy) return;
    if (proposal && proposalIsCurrent) {
      setAiDraftModal({ ...proposal, jobId: prepJob.data.id, revision: study.revision });
      setAutoOpenPending(false);
      return;
    }
    if (!prepJob.data || !proposalIsCurrent) {
      prepJob.start.mutate({ endpoint: `/studies/${study.id}/brief-jobs`, body: { answers: '' } });
    }
  }, [autoOpenPending, prepJob, proposal, proposalIsCurrent, study.id, study.revision]);

  const handleRequestAiDraft = () => {
    setError(null);
    setSaved(false);
    setAiDraftEnabled(true);
    if (proposal && proposalIsCurrent) {
      setAiDraftModal({ ...proposal, jobId: prepJob.data.id, revision: study.revision });
    } else {
      setAutoOpenPending(true);
      if (aiDraftEnabled && !prepJob.busy) {
        prepJob.start.mutate({ endpoint: `/studies/${study.id}/brief-jobs`, body: { answers: '' } });
      }
    }
  };

  const history = useInfiniteQuery({ queryKey: researchKey(userId, workspaceId, 'study-versions', study.id), enabled: showHistory, initialPageParam: null,
    queryFn: ({ pageParam, signal }) => researchRequest(`/studies/${study.id}/versions?limit=20${pageParam == null ? '' : `&before=${pageParam}`}`, { signal }),
    getNextPageParam: page => page.length === 20 ? page.at(-1).context_revision : undefined });
  const detail = useResearchQuery(userId, workspaceId, ['study-version', historyVersion], `/studies/${study.id}/versions/${historyVersion}`, Boolean(historyVersion));
  const plan = { ...emptyPlan(), ...study.plan };
  const save = async next => {
    setBusy(true); setError(null);
    try {
      const updated = await researchRequest(`/studies/${study.id}/versions`, { method: 'POST', body: JSON.stringify({ revision: draftStudy.revision, plan: next }) });
      client.setQueryData(researchKey(userId, workspaceId, 'study', study.id), updated);
      await Promise.all(['study-versions', 'interviews', 'synthesis', 'results'].map(key => client.invalidateQueries({ queryKey: researchKey(userId, workspaceId, key, study.id) })));
      setDraftStudy(null); setSaved(true);
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const saveAiDraft = async nextPlan => {
    setBusy(true); setError(null);
    try {
      const updated = await researchRequest(`/studies/${study.id}/versions`, {
        method: 'POST',
        body: JSON.stringify({
          preparation_job_id: aiDraftModal.jobId,
          revision: aiDraftModal.revision,
          goal: aiDraftModal.goal,
          brief: aiDraftModal.brief,
          plan: nextPlan,
        }),
      });
      client.setQueryData(researchKey(userId, workspaceId, 'study', study.id), updated);
      await Promise.all(['study-versions', 'interviews', 'synthesis', 'results'].map(key => client.invalidateQueries({ queryKey: researchKey(userId, workspaceId, key, study.id) })));
      setAiDraftModal(null);
      setSaved(true);
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  return <section className="research-card">
    <div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><ClipboardList size={22} className="text-orange-600" /><h2 className="research-section-heading">{t('research.researchPlan')}</h2></div><span className="text-xs text-slate-400">{t('research.contextVersion', { version: study.context_revision ?? study.revision })}</span></div>
    <p className="research-description mt-3">{t('research.planHint')}</p>
    {saved && <p role="status" className="mt-4 flex items-center gap-2 text-sm text-emerald-700"><Check size={16} />{t('research.planSaved')}</p>}
    {plan.prototype?.url && /^https?:\/\//i.test(plan.prototype.url) && <a href={plan.prototype.url} target="_blank" rel="noopener noreferrer" className="research-secondary mt-5"><ExternalLink size={15} />{t('research.openPrototype')}</a>}
    {plan.prototype?.name && <p className="mt-5 text-sm font-semibold">{plan.prototype.name} {plan.prototype.version}</p>}
    {['questions', 'hypotheses'].map(key => plan[key].length > 0 && <details key={key} className="mt-5 rounded-xl bg-slate-50 p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-700">{t(`research.plan_${key}`)}</summary><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6">{plan[key].map((line, index) => <li key={index}>{line}</li>)}</ul></details>)}
    {plan.tasks.length > 0 ? <ol className="mt-6 space-y-4">{plan.tasks.map((task, index) => <li key={task.id} className="rounded-2xl border border-slate-200/70 bg-white/50 p-5 [overflow-wrap:anywhere]"><h3 className="research-task-heading" data-testid="research-task-heading"><span data-testid="research-task-number">{index + 1}.</span><span>{task.title}</span></h3><p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-500">{task.instruction}</p><p className="mt-3 text-sm leading-6 text-emerald-800"><strong>{t('research.task_success_criteria')}: </strong>{task.success_criteria}</p></li>)}</ol> : (
      <div className="mt-5 space-y-4">
        {hasCompletedInterview || hasAnyInterview ? (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-orange-200/80 bg-gradient-to-br from-orange-50/70 via-white to-amber-50/40 p-5" data-testid="research-plan-ai-draft-banner">
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-orange-700">
                <Sparkles size={14} />
                {t('research.planDraftBadge')}
              </div>
              <h3 className="mt-1.5 text-base font-bold text-slate-900">{t('research.planDraftFromInterviewTitle')}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">{t('research.planDraftFromInterviewBody')}</p>
            </div>
            <button
              type="button"
              disabled={prepJob.busy}
              onClick={handleRequestAiDraft}
              className="research-primary shrink-0"
              data-testid="research-generate-plan-from-interview"
            >
              {prepJob.busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {prepJob.busy
                ? t('research.generatingPlanDraft')
                : proposal && proposalIsCurrent
                  ? t('research.reviewGeneratedPlanDraft')
                  : t('research.generatePlanFromInterview')}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
            <div className="text-sm leading-6 text-slate-600">
              <p className="font-semibold text-slate-800">{t('research.planOptionalAtStartTitle')}</p>
              <p className="mt-0.5 text-slate-500">{t('research.planOptionalAtStartBody')}</p>
            </div>
            <button className="research-secondary shrink-0" onClick={() => { setDraftStudy(study); setError(null); setSaved(false); }}>{t('research.editPlanManually') || 'Створити вручну'}</button>
          </div>
        )}
      </div>
    )}
    {plan.guide.length > 0 && <details className="mt-6 rounded-2xl bg-slate-50 p-5"><summary className="cursor-pointer text-sm font-semibold text-slate-700">{t('research.interviewGuide')}</summary><ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-6 text-slate-600">{plan.guide.map((line, index) => <li key={index}>{line}</li>)}</ol></details>}
    <div className="mt-6 flex flex-wrap gap-3">{plan.tasks.length > 0 && <button className="research-secondary" onClick={() => { setDraftStudy(study); setError(null); setSaved(false); }}>{t('research.editPlan')}</button>}{onDuplicate && <button type="button" className="research-secondary" onClick={onDuplicate} data-testid="research-duplicate-plan"><Copy size={16} />{t('research.duplicateStudy')}</button>}<button aria-expanded={showHistory} className="research-secondary" onClick={() => setShowHistory(value => !value)}><History size={16} />{t('research.versionHistory')}</button></div>
    {showHistory && <div className="mt-5">{history.isPending ? <Loading /> : history.isError ? <ErrorState error={history.error} onRetry={() => history.refetch()} /> : history.data.pages.flat().length === 0 ? <p className="text-sm text-slate-500">{t('research.noHistory')}</p> : <ol className="space-y-2">{history.data.pages.flat().map(row => <li key={row.id}><button className="research-secondary w-full justify-between text-left" onClick={() => setHistoryVersion(row.id)}>{t('research.contextVersion', { version: row.context_revision })} · {new Date(row.created_at).toLocaleDateString()}</button></li>)}</ol>}</div>}
    {showHistory && history.hasNextPage && <button className="research-secondary mt-4" disabled={history.isFetchingNextPage} onClick={() => history.fetchNextPage()}>{t('research.loadMore')}</button>}
    {draftStudy && <Modal guardChanges title={t('research.editPlan')} onClose={() => !busy && setDraftStudy(null)} busy={busy}><StudyPlanForm plan={draftStudy.plan} onSave={save} onClose={() => setDraftStudy(null)} busy={busy} error={error} /></Modal>}
    {aiDraftModal && <Modal guardChanges title={t('research.reviewGeneratedPlanDraft')} onClose={() => !busy && setAiDraftModal(null)} busy={busy}><StudyPlanForm plan={aiDraftModal.plan} onSave={saveAiDraft} onClose={() => setAiDraftModal(null)} busy={busy} error={error} prepend={<div className="space-y-4"><label className="block"><span className="research-label">{t('research.sharedGoal')}</span><textarea rows={3} maxLength={12000} className="research-field" value={aiDraftModal.goal} onChange={e => setAiDraftModal(old => ({ ...old, goal: e.target.value }))} /></label><label className="block"><span className="research-label">{t('research.brief')}</span><textarea rows={4} maxLength={30000} className="research-field" value={aiDraftModal.brief || ''} onChange={e => setAiDraftModal(old => ({ ...old, brief: e.target.value }))} /></label></div>} /></Modal>}
    {historyVersion && <Modal title={t('research.versionHistory')} onClose={() => setHistoryVersion(null)}>{detail.isPending ? <Loading /> : detail.isError ? <ErrorState error={detail.error} /> : <div className="space-y-5"><p className="font-semibold">{detail.data.goal}</p><p className="whitespace-pre-line text-sm leading-7 text-slate-600">{detail.data.brief}</p>{detail.data.plan.tasks.map(task => <div key={task.id}><h3 className="research-subheading">{task.title}</h3><p className="text-sm leading-6 text-slate-600">{task.instruction}</p><p className="mt-2 text-sm text-emerald-800">{task.success_criteria}</p></div>)}<div className="border-t border-slate-200/70 pt-4"><button type="button" className="research-secondary" onClick={() => { setDraftStudy({ ...study, plan: detail.data.plan }); setHistoryVersion(null); setError(null); setSaved(false); }} data-testid="research-restore-plan-version">{t('research.restorePlanVersion')}</button></div></div>}</Modal>}
  </section>;
}
