import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorState, ModalForm } from './UI';

export default function StudyForm({ study, onSave, onCancel, busy, error, onReload, submitLabel }) {
  const { t } = useTranslation();
  const [values, setValues] = useState({ title: study?.title || '', goal: study?.goal || '', brief: study?.brief || '' });
  const change = (key) => (event) => setValues((old) => ({ ...old, [key]: event.target.value }));
  return <ModalForm onSubmit={(event) => { event.preventDefault(); onSave({ title: values.title.trim(), goal: values.goal.trim(), brief: values.brief.trim() || null }); }} actions={<><button type="button" data-modal-dismiss onClick={onCancel} disabled={busy} className="research-text-button">{t('research.cancel')}</button><button disabled={busy || !values.title.trim() || !values.goal.trim()} className="research-primary" data-testid="research-study-save">{t(busy ? 'research.saving' : submitLabel || (study ? 'research.save' : 'research.createStudy'))}</button></>}>
    {error && <ErrorState error={error} onRetry={error.status === 409 ? onReload : undefined} />}
    <label className="block"><span className="research-label">{t('research.studyTitle')}</span><input required maxLength={240} value={values.title} onChange={change('title')} placeholder={t('research.studyTitlePlaceholder')} className="research-field" data-testid="research-study-title" /></label>
    <label className="block"><span className="research-label">{t('research.goal')}<span className="ml-2 text-orange-600">*</span></span><textarea required maxLength={12000} rows={3} value={values.goal} onChange={change('goal')} placeholder={t('research.goalPlaceholder')} className="research-field resize-y" data-testid="research-study-goal" /><span className="mt-2 block text-xs leading-5 text-slate-400">{t('research.goalHint')}</span></label>
    <label className="block"><span className="research-label">{t('research.brief')}<span className="ml-2 text-xs font-normal text-slate-400">{t('research.optional')}</span></span><textarea rows={5} maxLength={30000} value={values.brief} onChange={change('brief')} placeholder={t('research.briefPlaceholder')} className="research-field resize-y" data-testid="research-study-brief" /><span className="mt-2 block text-xs leading-5 text-slate-400">{t('research.briefHint')}</span></label>
  </ModalForm>;
}
