import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorState } from './UI';

export default function StudyStart({ onCreate, busy, error, onCancel, locked = false }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState(null);
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [brief, setBrief] = useState('');
  const [files, setFiles] = useState([]);
  return <div className="space-y-6" data-testid="research-study-start">
    {!mode && <div className="grid gap-4 sm:grid-cols-2">
      <button type="button" onClick={() => setMode('upload')} className="app-surface-soft rounded-2xl p-6 text-left hover:border-orange-300" data-testid="research-start-upload"><strong className="block text-lg">{t('research.startWithInterviews')}</strong><span className="mt-2 block text-sm text-slate-600">{t('research.startWithInterviewsHint')}</span></button>
      <button type="button" onClick={() => setMode('manual')} className="app-surface-soft rounded-2xl p-6 text-left hover:border-orange-300" data-testid="research-start-manual"><strong className="block text-lg">{t('research.startWithBrief')}</strong><span className="mt-2 block text-sm text-slate-600">{t('research.startWithBriefHint')}</span></button>
    </div>}
    {mode && <form onSubmit={event => { event.preventDefault(); onCreate({ mode, title: title.trim(), goal: goal.trim(), brief: brief.trim(), files }); }} className="space-y-5">
      <label className="block"><span className="research-label">{t('research.studyTitle')}</span><input disabled={busy || locked} required maxLength={240} value={title} onChange={e => setTitle(e.target.value)} className="research-field" data-testid="research-study-title" /></label>
      {mode === 'manual' ? <><label className="block"><span className="research-label">{t('research.goal')}</span><textarea required rows={3} maxLength={12000} value={goal} onChange={e => setGoal(e.target.value)} className="research-field" data-testid="research-study-goal" /></label><label className="block"><span className="research-label">{t('research.brief')}</span><textarea disabled={busy || locked} rows={5} maxLength={30000} value={brief} onChange={e => setBrief(e.target.value)} className="research-field" data-testid="research-study-brief" /></label></> : <label className="block"><span className="research-label">{t('research.uploadAudioVideo')}</span><input type="file" disabled={busy || locked} multiple accept="audio/*,video/mp4,video/webm,.mp3,.m4a,.wav,.mp4,.webm" onChange={e => setFiles(Array.from(e.target.files || []))} className="research-field" data-testid="research-study-files" /><span className="mt-2 block text-xs leading-5 text-slate-500">{t('research.selectedFiles', { count: files.length })}</span></label>}
      {error && <ErrorState error={error} />}
      <div className="flex flex-wrap gap-3"><button type="button" className="research-secondary" disabled={busy || locked} onClick={() => setMode(null)}>{t('research.back')}</button><button type="button" className="research-text-button" disabled={busy} onClick={onCancel}>{t('research.cancel')}</button><button className="research-primary" disabled={busy || !title.trim() || (mode === 'manual' ? !goal.trim() : files.length === 0)}>{t(busy ? 'research.saving' : mode === 'manual' ? 'research.createStudy' : 'research.uploadAndPrepare')}</button></div>
    </form>}
  </div>;
}
