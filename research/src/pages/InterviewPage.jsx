import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Check, Copy, Download, FileText, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useResearchContext } from '../app/App';
import { researchKey, researchRequest, useResearchQuery } from '../hooks/useResearch';
import { buildInterviewMarkdown, buildTranscriptCsv, downloadFile, slugifyTitle } from '../utils/exportReport';
import { EmptyState, ErrorState, Loading, Modal, ModalForm, Status } from '../components/UI';
import InterviewSummary from '../../../client/src/components/interviews/InterviewSummary';
import { normalizeInterviewSummary } from '../../../client/src/components/interviews/summaryDisplay';
import AnalysisAction from '../components/AnalysisAction';
import MediaUploadPanel from '../components/MediaUploadPanel';
import ImpactPanel from '../components/ImpactPanel';
import { EvidenceAction } from '../components/ResultsPanel';
import InterviewSources from '../components/InterviewSources';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';

const entry = () => ({ id: crypto.randomUUID(), speaker: '', timestamp: '', text: '' });
const parseBulkTranscript = (raw) => String(raw || '').split(/\n+/).map((line) => line.trim()).filter(Boolean).map((line) => {
  const match = /^(?:\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*)?(?:([^:—–-]{1,60})\s*[:—–-]\s+)?(.+)$/.exec(line);
  if (!match) return { id: crypto.randomUUID(), speaker: '', timestamp: '', text: line };
  const [, timestamp = '', speaker = '', text = ''] = match;
  return { id: crypto.randomUUID(), speaker: speaker.trim().slice(0, 200), timestamp: timestamp.trim(), text: text.trim().slice(0, 50000) };
}).filter((item) => item.text);

export default function InterviewPage() {
  const { t } = useTranslation();
  const { studyId, interviewId } = useParams();
  const navigate = useNavigate();
  const { user, workspace } = useResearchContext();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('summary');
  const [segments, setSegments] = useState([]);
  const [title, setTitle] = useState('');
  const [draftRevisions, setDraftRevisions] = useState(null);
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiveError, setArchiveError] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const parsedBulk = useMemo(() => parseBulkTranscript(bulkText), [bulkText]);
  const summaryRef = useRef(null);
  const copySummary = async () => {
    try { await navigator.clipboard.writeText(`${title}\n\n${summaryRef.current?.innerText || ''}`); setCopied(true); setCopyError(false); }
    catch { setCopyError(true); }
  };
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 2500); return () => clearTimeout(timer); }, [copied]);
  const study = useResearchQuery(user.id, workspace.id, ['study', studyId], `/studies/${studyId}`);
  const interview = useResearchQuery(user.id, workspace.id, ['interview', interviewId], `/interviews/${interviewId}`);
  const record = interview.data;
  const summary = useMemo(() => normalizeInterviewSummary(record?.summary_data), [record?.summary_data]);
  useEffect(() => {
    if (!record || dirty) return;
    setTitle(record.title || '');
    setSegments(Array.isArray(record.transcript_data) ? record.transcript_data : []);
    setDraftRevisions({ research_revision: record.research_revision, transcript_revision: record.transcript_revision, summary_revision: record.summary_revision });
  }, [record, dirty]);
  const changeSegment = (index, key, value) => { setSegments((previous) => previous.map((row, i) => i === index ? { ...row, [key]: value } : row)); setDirty(true); setSaved(false); };
  const save = async (event) => {
    event.preventDefault(); setError(null); setSaved(false);
    if (segments.some((row) => !row.text?.trim())) { setError({ code: 'INVALID_TRANSCRIPT' }); return; }
    setBusy(true);
    try {
      const updated = await researchRequest(`/interviews/${interviewId}`, { method: 'PATCH', body: JSON.stringify({
        title: title.trim(), transcript_data: segments.map((row) => ({ ...row, text: row.text.trim() })),
        ...draftRevisions,
      }) });
      queryClient.setQueryData(researchKey(user.id, workspace.id, 'interview', interviewId), updated);
      await queryClient.invalidateQueries({ queryKey: researchKey(user.id, workspace.id, 'interviews', studyId) });
      await queryClient.invalidateQueries({ queryKey: researchKey(user.id, workspace.id, 'synthesis', studyId) });
      await queryClient.invalidateQueries({ queryKey: researchKey(user.id, workspace.id, 'results', studyId) });
      setDirty(false); setSaved(true);
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const archiveInterview = async () => {
    setBusy(true); setArchiveError(null);
    try {
      await researchRequest(`/interviews/${interviewId}`, { method: 'DELETE', body: JSON.stringify({
        research_revision: record.research_revision,
        transcript_revision: record.transcript_revision,
        summary_revision: record.summary_revision,
      }) });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: researchKey(user.id, workspace.id, 'interviews', studyId) }),
        queryClient.invalidateQueries({ queryKey: researchKey(user.id, workspace.id, 'synthesis', studyId) }),
        queryClient.invalidateQueries({ queryKey: researchKey(user.id, workspace.id, 'results', studyId) }),
      ]);
      navigate(`/studies/${studyId}`);
    } catch (err) { setArchiveError(err); } finally { setBusy(false); }
  };
  const reset = async () => { setDirty(false); setError(null); setSaved(false); const latest = await interview.refetch(); if (latest.data) { setTitle(latest.data.title || ''); setSegments(Array.isArray(latest.data.transcript_data) ? latest.data.transcript_data : []); } };
  const back = <Link to={`/studies/${studyId}`} className="research-back"><ArrowLeft size={16} /><span>{study.data?.title || t('research.returnStudy')}</span></Link>;
  if (study.isPending || interview.isPending) return <Loading />;
  if (study.isError || interview.isError) return <>{back}<ErrorState error={study.error || interview.error} onRetry={() => { study.refetch(); interview.refetch(); }} /></>;
  if (study.data.workspace_id !== workspace.id || record.workspace_id !== workspace.id || record.study_id !== studyId) return <>{back}<ErrorState error={{ status: 404 }} /></>;
  const tabs = ['summary', 'transcript'];
  const selectTab = (event, index) => {
    const next = event.key === 'ArrowRight' ? (index + 1) % 2 : event.key === 'ArrowLeft' ? (index + 1) % 2 : event.key === 'Home' ? 0 : event.key === 'End' ? 1 : null;
    if (next === null) return;
    event.preventDefault(); setTab(tabs[next]); document.getElementById(`interview-tab-${tabs[next]}`)?.focus();
  };
  return <>
    {back}
    <div className="mb-7 flex min-w-0 flex-wrap items-start justify-between gap-5">
      <div className="min-w-0 flex-1"><div className="research-eyebrow">{t('research.interviews')}</div><h1 className="research-heading mt-3 break-words">{record.title}</h1>
        <div className="mt-4 flex flex-wrap items-center gap-3"><Status status={record.status} />{record.summary_stale && <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">{t('research.reviewNeeded')}</span>}</div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="research-secondary" disabled={dirty || busy} onClick={() => { setArchiveError(null); setConfirmArchive(true); }} data-testid="research-archive-interview"><Trash2 size={15} />{t('research.archiveInterview')}</button>
        <Link className="research-secondary" to={`/studies/${studyId}#results`}>{t('research.toStudyResults')}</Link>
      </div>
    </div>
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div role="tablist" aria-label={t('research.sourceMaterial')} className="flex max-w-full gap-1 rounded-2xl border border-slate-200/70 bg-white/70 p-1.5">
        {tabs.map((key, index) => <button key={key} id={`interview-tab-${key}`} role="tab" aria-controls={`interview-panel-${key}`} aria-selected={tab === key} tabIndex={tab === key ? 0 : -1} onKeyDown={event => selectTab(event, index)} onClick={() => setTab(key)} className="research-tab">{t(`research.${key}`)}{key === 'transcript' && dirty && <span className="h-1.5 w-1.5 rounded-full bg-orange-500" aria-label={t('research.unsaved')} />}</button>)}
      </div>
      <AnalysisAction userId={user.id} workspaceId={workspace.id} studyId={studyId} interviewId={interviewId} dirty={dirty} disabled={!record.transcript_data?.length} disabledReason={!record.transcript_data?.length ? t('research.addSourceFirst') : undefined} />
    </div>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-5">
        <ImpactPanel record={record} study={study.data} userId={user.id} workspaceId={workspace.id} disabled={dirty || busy} />
        {tab === 'summary' ? <section role="tabpanel" id="interview-panel-summary" aria-labelledby="interview-tab-summary">
          {summary ? <div className="research-summary">
            <div className="mb-7 flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/70 pb-6">
              <div><h2 className="research-section-heading">{t('research.summary')}</h2><p className="mt-2 text-xs text-slate-500">{t('research.revision', { version: record.summary_revision })}</p></div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="research-secondary" onClick={copySummary}>{copied ? <Check size={16} /> : <Copy size={16} />}{t(copied ? 'research.copied' : 'research.copySummary')}</button>
                <button type="button" className="research-secondary" onClick={() => downloadFile({ filename: `${slugifyTitle(record.title, 'interview')}-summary.md`, content: buildInterviewMarkdown({ study: study.data, record, summaryText: summaryRef.current?.innerText || '', segments: Array.isArray(record.transcript_data) ? record.transcript_data : [], t }), mimeType: 'text/markdown;charset=utf-8' })} data-testid="research-export-interview-md"><Download size={16} />{t('research.exportInterviewMd')}</button>
              </div>
            </div>
            {copyError && <p role="alert" className="mb-5 text-sm text-amber-800">{t('research.copyFailed')}</p>}
            <div ref={summaryRef}><InterviewSummary normalizedSummary={summary} /></div>
          </div> : <EmptyState title={t('research.summaryEmptyTitle')} description={t('research.summaryEmptyBody')} action={t('research.addTranscript')} onAction={() => setTab('transcript')} />}
        </section> : <section role="tabpanel" id="interview-panel-transcript" aria-labelledby="interview-tab-transcript">
          <form onSubmit={save} className="research-card" data-testid="research-transcript-form">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="research-section-heading">{t('research.transcript')}</h2></div><span className="text-xs text-slate-500">{t('research.transcriptRevision', { version: record.transcript_revision })}</span></div>
            <p className="research-description mt-4">{t('research.transcriptHint')}</p>
            <label className="mt-7 block"><span className="research-label">{t('research.interviewTitle')}</span><input required maxLength={240} value={title} onChange={event => { setTitle(event.target.value); setDirty(true); setSaved(false); }} className="research-field" /></label>
            <div className="mt-7 space-y-5">{segments.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-6"><FileText size={24} className="mb-3 text-slate-400" /><p className="text-sm leading-6 text-slate-500">{t('research.transcriptEmpty')}</p></div>}
              {segments.map((row, index) => <fieldset key={row.id || index} className="min-w-0 rounded-2xl border border-slate-200/80 bg-white/65 p-4 sm:p-5">
                <legend className="px-2 text-xs font-semibold text-slate-500">{t('research.transcriptSegment', { number: index + 1 })}</legend>
                <div className="mb-3 flex justify-end"><button type="button" aria-label={`${t('research.removeSegment')} ${index + 1}`} title={t('research.removeSegment')} onClick={() => { setSegments(previous => previous.filter((_, i) => i !== index)); setDirty(true); setSaved(false); }} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={17} /></button></div>
                <div className="grid gap-4 sm:grid-cols-2"><label><span className="research-label">{t('research.speaker')}</span><input maxLength={200} value={row.speaker || ''} placeholder={t('research.speakerPlaceholder')} onChange={event => changeSegment(index, 'speaker', event.target.value)} className="research-field" /></label><label><span className="research-label">{t('research.timestamp')}</span><input value={row.timestamp || ''} placeholder="00:00" onChange={event => changeSegment(index, 'timestamp', event.target.value)} className="research-field" /></label></div>
                <label className="mt-4 block"><span className="research-label">{t('research.segmentText')}</span><textarea required rows={4} maxLength={50000} value={row.text || ''} onChange={event => changeSegment(index, 'text', event.target.value)} className="research-field resize-y" placeholder={t('research.segmentPlaceholder')} /></label>
              </fieldset>)}
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button type="button" className="research-secondary" onClick={() => { setSegments(previous => [...previous, entry()]); setDirty(true); setSaved(false); }}><Plus size={16} />{t('research.addParagraph')}</button>
              <button type="button" className="research-secondary" onClick={() => { setBulkText(''); setBulkOpen(true); }} data-testid="research-paste-transcript"><FileText size={16} />{t('research.pasteTranscript')}</button>
              {segments.length > 0 && <button type="button" className="research-secondary" onClick={() => downloadFile({ filename: `${slugifyTitle(title || record.title, 'interview')}-transcript.csv`, content: buildTranscriptCsv({ segments, t }), mimeType: 'text/csv;charset=utf-8' })} data-testid="research-export-transcript-csv"><Download size={16} />{t('research.exportTranscriptCsv')}</button>}
            </div>
            {error && <div className="mt-6">{error.code === 'INVALID_TRANSCRIPT' ? <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{t('research.invalidTranscript')}</p> : <ErrorState error={error} onRetry={error.status === 409 ? reset : undefined} />}</div>}
            {saved && <p role="status" className="mt-6 flex items-center gap-2 text-sm font-semibold text-emerald-700"><Check size={16} />{t('research.transcriptSaved')}</p>}
            <div className="research-form-actions mt-8"><span className="mr-auto text-xs text-slate-500">{t(dirty ? 'research.unsaved' : 'research.saved')}</span>{dirty && <button type="button" className="research-secondary" disabled={busy} onClick={() => { if (window.confirm(t('research.discardForm'))) reset(); }}><RotateCcw size={15} />{t('research.discardChanges')}</button>}<button className="research-primary" disabled={!dirty || busy || !title.trim()} data-testid="research-save-transcript">{t(busy ? 'research.saving' : 'research.saveTranscript')}</button></div>
          </form>
        </section>}
      </div>
      <aside className="min-w-0 space-y-5" aria-label={t('research.interviewTools')}>
        <section className="app-surface-soft rounded-3xl p-5"><div className="research-eyebrow">{t('research.sharedGoal')}</div><p className="mt-3 break-words text-sm leading-7 text-slate-700">{study.data.goal}</p></section>
        <MediaUploadPanel record={record} userId={user.id} workspaceId={workspace.id} disabled={dirty || busy} />
        <InterviewSources record={record} userId={user.id} workspaceId={workspace.id} disabled={dirty || busy} onRestoreTranscript={(restored) => { setSegments(restored); setDirty(true); setSaved(false); setTab('transcript'); }} />
        <EvidenceAction record={record} study={study.data} userId={user.id} workspaceId={workspace.id} disabled={dirty || busy} />
      </aside>
    </div>
    {bulkOpen && <Modal guardChanges title={t('research.pasteTranscript')} onClose={() => setBulkOpen(false)}><ModalForm onSubmit={(event) => { event.preventDefault(); if (!parsedBulk.length) return; setSegments(previous => [...previous, ...parsedBulk]); setDirty(true); setSaved(false); setBulkOpen(false); setBulkText(''); }} testId="research-paste-transcript-form" actions={<><button type="button" data-modal-dismiss className="research-text-button" onClick={() => setBulkOpen(false)}>{t('research.cancel')}</button><button className="research-primary" disabled={!parsedBulk.length} data-testid="research-import-segments">{t('research.importSegments', { count: parsedBulk.length })}</button></>}><p className="research-description">{t('research.pasteTranscriptHint')}</p><label className="block"><span className="research-label">{t('research.pasteTranscriptLabel')}</span><textarea required rows={8} maxLength={200000} value={bulkText} onChange={event => setBulkText(event.target.value)} className="research-field resize-y" placeholder={t('research.pasteTranscriptPlaceholder')} autoFocus data-testid="research-paste-transcript-input" /></label></ModalForm></Modal>}
    {confirmArchive && <Modal title={t('research.archiveInterview')} onClose={() => { if (!busy) { setConfirmArchive(false); setArchiveError(null); } }} busy={busy}><ModalForm as="div" testId="research-archive-interview-confirm" actions={<><button type="button" className="research-text-button" disabled={busy} onClick={() => { setConfirmArchive(false); setArchiveError(null); }}>{t('research.cancel')}</button><button type="button" className="research-primary" disabled={busy} onClick={archiveInterview} data-testid="research-confirm-archive-interview">{t(busy ? 'research.saving' : 'research.confirmArchive')}</button></>}><p className="research-description">{t('research.archiveInterviewConfirm', { title: record.title })}</p>{archiveError && <ErrorState error={archiveError} onRetry={archiveError.status === 409 ? async () => { await interview.refetch(); setArchiveError(null); } : undefined} />}</ModalForm></Modal>}
  </>;
}
