import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { researchKey, researchRequest } from '../hooks/useResearch';
import { useResearchJob } from '../hooks/useResearchJob';
import { DisclosureButton, ErrorState, Modal } from './UI';
import { StudyPlanForm } from './StudyPlanPanel';

export default function PreparationPanel({ study, userId, workspaceId }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState('');
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const job = useResearchJob({ userId, workspaceId, path: `/studies/${study.id}/preparation-job`, enabled: open });
  const proposal = job.data?.status === 'completed' ? job.data.output : null;
  const current = job.data?.study_version_id === study.current_version_id;
  const save = async plan => {
    setBusy(true); setError(null);
    try {
      const result = await researchRequest(`/studies/${study.id}/versions`, { method: 'POST', body: JSON.stringify({
        preparation_job_id: draft.jobId, revision: draft.revision, goal: draft.goal, brief: draft.brief, plan,
      }) });
      client.setQueryData(researchKey(userId, workspaceId, 'study', study.id), result);
      await Promise.all(['study-versions', 'interviews', 'synthesis', 'results'].map(part => client.invalidateQueries({ queryKey: researchKey(userId, workspaceId, part, study.id) })));
      setDraft(null);
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  return <div className="border-t border-slate-200/70 pt-5" data-testid="research-inline-preparation">
    <DisclosureButton open={open} onClick={() => setOpen(value => !value)} icon={Sparkles}>{t('research.prepareWithAi')}</DisclosureButton>
    {open && <div className="mt-6 space-y-5">
      <p className="text-sm leading-6 text-slate-500">{t('research.preparationHint')}</p>
      {proposal?.questions?.length > 0 && <div className="rounded-2xl bg-blue-50/70 p-5"><h3 className="text-sm font-bold">{t('research.clarifications')}</h3><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6">{proposal.questions.map((question, i) => <li key={i}>{question}</li>)}</ul></div>}
      <label className="block"><span className="research-label">{t('research.preparationAnswers')}</span><textarea rows={3} maxLength={8000} value={answers} onChange={e => setAnswers(e.target.value)} className="research-field resize-y" /></label>
      <div className="flex flex-wrap gap-3">{['brief', 'guide'].map(mode => <button key={mode} className="research-secondary" disabled={job.busy} onClick={() => job.start.mutate({ endpoint: `/studies/${study.id}/${mode}-jobs`, body: { answers } })}>{t(`research.prepare_${mode}`)}</button>)}{job.busy && job.data?.id && <button type="button" className="research-secondary" disabled={job.cancel.isPending} onClick={() => job.cancel.mutate()}>{t('research.cancelJob')}</button>}</div>
      {job.busy && <p role="status" className="text-sm text-blue-700">{t('research.analysisWorking')}</p>}
      {job.error && <ErrorState error={job.error} />}
      {['failed', 'stale', 'canceled'].includes(job.data?.status) && <p role="status" className="text-sm text-amber-800">{t(job.data?.status === 'canceled' ? 'research.jobCanceled' : 'research.jobStale')}</p>}
      {proposal && <div className="space-y-4 rounded-2xl border border-blue-100 bg-blue-50/50 p-5 [overflow-wrap:anywhere]"><div className="research-eyebrow">{t('research.draftForReview')}</div><h3 className="font-bold">{proposal.goal}</h3><p className="whitespace-pre-line text-sm leading-7 text-slate-600">{proposal.brief}</p>
        {proposal.assumptions?.length > 0 && <div><h4 className="text-sm font-semibold text-amber-800">{t('research.assumptions')}</h4><ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6">{proposal.assumptions.map((item, i) => <li key={i}>{item}</li>)}</ul></div>}
        <button disabled={!current} className="research-primary" onClick={() => { setError(null); setDraft({ ...proposal, goal: study.goal, brief: study.brief || '', jobId: job.data.id, revision: study.revision }); }}>{t('research.reviewProposal')}</button>
        {!current && <p className="text-sm text-amber-800">{t('research.jobStale')}</p>}
      </div>}
    </div>}
    {draft && <Modal guardChanges title={t('research.reviewProposal')} busy={busy} onClose={() => !busy && setDraft(null)}>
      <StudyPlanForm plan={draft.plan} onSave={save} onClose={() => setDraft(null)} busy={busy} error={error} prepend={<div className="space-y-4"><p className="research-notice">{t('research.planDraftPreservesContext')}</p><p className="research-notice">{t('research.planChangeWarning')}</p><label className="block"><span className="research-label">{t('research.sharedGoal')}</span><textarea rows={3} maxLength={12000} className="research-field" value={draft.goal} onChange={e => setDraft(old => ({ ...old, goal: e.target.value }))} /></label><label className="block"><span className="research-label">{t('research.brief')}</span><textarea rows={4} maxLength={30000} className="research-field" value={draft.brief || ''} onChange={e => setDraft(old => ({ ...old, brief: e.target.value }))} /></label></div>} />
    </Modal>}
  </div>;
}
