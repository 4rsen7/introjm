import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ArrowLeft, Check, Copy, Download, FileAudio, FileText, Loader2, Mic, Plus, RotateCcw, Sparkles, Trash2, UploadCloud, Volume2 } from 'lucide-react';
import { useResearchContext } from '../app/App';
import { decodeUploadFileName, researchKey, researchRequest, uploadInterviewAudio, useResearchQuery } from '../hooks/useResearch';
import { useAnalysisJob } from '../hooks/useAnalysisJob';
import { buildInterviewMarkdown, buildTranscriptCsv, downloadFile, slugifyTitle } from '../utils/exportReport';
import { EmptyState, ErrorState, Loading, Modal, ModalForm, Status } from '../components/UI';
import InterviewSummary from '../../../client/src/components/interviews/InterviewSummary';
import { normalizeInterviewSummary } from '../../../client/src/components/interviews/summaryDisplay';
import AnalysisAction from '../components/AnalysisAction';
import ImpactPanel from '../components/ImpactPanel';
import { EvidenceAction } from '../components/ResultsPanel';
import InterviewSources from '../components/InterviewSources';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import InterviewPipeline from '../components/InterviewPipeline';
import ParticipantPanel from '../components/ParticipantPanel';
import { interviewStage } from '../utils/researchFlow';

const INTERVIEWER_SPEAKERS = new Set(['interviewer', 'moderator', 'researcher', 'дослідник', 'інтервʼюер', 'інтерв’юер', 'модератор']);
const isInterviewerSpeaker = (speaker = '') => INTERVIEWER_SPEAKERS.has(String(speaker || '').trim().toLowerCase());
const entry = (nextSpeaker = 'Interviewer') => ({ id: crypto.randomUUID(), speaker: nextSpeaker, timestamp: '00:00', text: '' });
const parseBulkTranscript = (raw) => String(raw || '').split(/\n+/).map((line) => line.trim()).filter(Boolean).map((line, idx) => {
  const match = /^(?:\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*)?(?:([^:—–-]{1,60})\s*[:—–-]\s+)?(.+)$/.exec(line);
  if (!match) return { id: crypto.randomUUID(), speaker: idx % 2 === 0 ? 'Interviewer' : 'Respondent', timestamp: '00:00', text: line };
  const [, timestamp = '', speaker = '', text = ''] = match;
  return {
    id: crypto.randomUUID(),
    speaker: speaker.trim().slice(0, 200) || (idx % 2 === 0 ? 'Interviewer' : 'Respondent'),
    timestamp: timestamp.trim() || '00:00',
    text: text.trim().slice(0, 50000),
  };
}).filter((item) => item.text);

export default function InterviewPage() {
  const { t } = useTranslation();
  const { studyId, interviewId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, workspace } = useResearchContext();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState(() => (location.state?.initialTab === 'transcript' ? 'transcript' : 'summary'));
  const [tabTouched, setTabTouched] = useState(() => location.state?.initialTab === 'transcript');
  const [segments, setSegments] = useState([]);
  const [title, setTitle] = useState('');
  const [draftRevisions, setDraftRevisions] = useState(null);
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedSegmentIndex, setCopiedSegmentIndex] = useState(null);
  const [copyError, setCopyError] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiveError, setArchiveError] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [isDraggingAudio, setIsDraggingAudio] = useState(false);
  const audioInputRef = useRef(null);
  const parsedBulk = useMemo(() => parseBulkTranscript(bulkText), [bulkText]);
  const summaryRef = useRef(null);
  const copySummary = async () => {
    try { await navigator.clipboard.writeText(`${title}\n\n${summaryRef.current?.innerText || ''}`); setCopied(true); setCopyError(false); }
    catch { setCopyError(true); }
  };
  const copySegmentLine = async (text, index) => {
    try {
      await navigator.clipboard.writeText(String(text || ''));
      setCopiedSegmentIndex(index);
      setTimeout(() => setCopiedSegmentIndex((prev) => (prev === index ? null : prev)), 2000);
    } catch {
      // ignore clipboard errors on line copy
    }
  };
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 2500); return () => clearTimeout(timer); }, [copied]);
  const study = useResearchQuery(user.id, workspace.id, ['study', studyId], `/studies/${studyId}`);
  const interview = useResearchQuery(user.id, workspace.id, ['interview', interviewId], `/interviews/${interviewId}`);
  const record = interview.data;
  const summary = useMemo(() => normalizeInterviewSummary(record?.summary_data), [record?.summary_data]);
  const systemState = record?.summary_data?._system || {};
  const sourceUploadFileName = useMemo(() => decodeUploadFileName(systemState.sourceUploadFileName), [systemState.sourceUploadFileName]);
  const isProcessingUpload = record?.status === 'processing' || systemState.uploadStatus === 'processing';
  const isFailedUpload = record?.status === 'failed' || systemState.uploadStatus === 'failed';
  const serverUploadError = systemState.uploadError || '';
  const waitingForAutoSummary = Boolean(systemState.autoSummaryRequested && !isFailedUpload && !systemState.autoSummaryError
    && record?.summary_revision <= (systemState.sourceSummaryRevision ?? -1));
  const summaryAnalysis = useAnalysisJob({ userId: user.id, workspaceId: workspace.id, studyId, interviewId, watch: isProcessingUpload || waitingForAutoSummary, watchSince: systemState.startedAt });
  const autoSummaryStopped = ['failed', 'stale', 'canceled'].includes(summaryAnalysis.job?.status)
    && (!systemState.startedAt || new Date(summaryAnalysis.job?.created_at) >= new Date(systemState.startedAt));
  const processingSummary = summaryAnalysis.busy || (waitingForAutoSummary && !autoSummaryStopped && !isProcessingUpload);

  useEffect(() => {
    if (!record || dirty) return;
    setTitle(record.title || '');
    setSegments(Array.isArray(record.transcript_data) ? record.transcript_data : []);
    setDraftRevisions({ research_revision: record.research_revision, transcript_revision: record.transcript_revision, summary_revision: record.summary_revision });
  }, [record, dirty]);

  useEffect(() => {
    if (!record || tabTouched) return;
    if (isProcessingUpload || processingSummary) setTab('summary');
  }, [record, isProcessingUpload, processingSummary, tabTouched]);

  useEffect(() => {
    if (!isProcessingUpload && !isUploadingAudio && (!waitingForAutoSummary || autoSummaryStopped) && !summaryAnalysis.busy) return;
    const pollTimer = setInterval(async () => {
      const latest = await interview.refetch();
      const latestData = latest.data;
      const stillProcessing = latestData?.status === 'processing' || latestData?.summary_data?._system?.uploadStatus === 'processing';
      if (latestData && !stillProcessing) {
        queryClient.invalidateQueries({ queryKey: researchKey(user.id, workspace.id, 'interviews', studyId) });
        queryClient.invalidateQueries({ queryKey: researchKey(user.id, workspace.id, 'analysis-job', `/interviews/${interviewId}/summary-job`) });
      }
    }, 2500);
    return () => {
      clearInterval(pollTimer);
    };
  }, [isProcessingUpload, isUploadingAudio, waitingForAutoSummary, autoSummaryStopped, summaryAnalysis.busy, interview.refetch, queryClient, user.id, workspace.id, studyId, interviewId]);

  const handleAudioFileUpload = async (file) => {
    if (!file || dirty || isUploadingAudio || isProcessingUpload || processingSummary) return;
    setUploadError('');
    setError(null);
    setSaved(false);
    setTab('summary');
    setTabTouched(true);
    setIsUploadingAudio(true);
    try {
      const updated = await uploadInterviewAudio(interviewId, file, { autoSummary: study.data?.brief_status !== 'draft' });
      if (updated) {
        queryClient.setQueryData(researchKey(user.id, workspace.id, 'interview', interviewId), updated);
      } else {
        await interview.refetch();
      }
      await queryClient.invalidateQueries({ queryKey: researchKey(user.id, workspace.id, 'interviews', studyId) });
      await queryClient.invalidateQueries({ queryKey: researchKey(user.id, workspace.id, 'analysis-job', `/interviews/${interviewId}/summary-job`) });
    } catch (err) {
      setUploadError(err?.message || t('research.uploadFailed'));
    } finally {
      setIsUploadingAudio(false);
      if (audioInputRef.current) audioInputRef.current.value = '';
    }
  };

  const changeSegment = (index, key, value) => { setSegments((previous) => previous.map((row, i) => i === index ? { ...row, [key]: value } : row)); setDirty(true); setSaved(false); };
  const toggleSegmentSpeaker = (index) => {
    setSegments((previous) => previous.map((row, i) => {
      if (i !== index) return row;
      const nextSpeaker = isInterviewerSpeaker(row.speaker) ? 'Respondent' : 'Interviewer';
      return { ...row, speaker: nextSpeaker };
    }));
    setDirty(true);
    setSaved(false);
  };
  const save = async (event) => {
    event.preventDefault(); const generate = event.nativeEvent.submitter?.value === 'generate'; setError(null); setSaved(false);
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
      if (generate && study.data?.brief_status !== 'draft') { setTab('summary'); setTabTouched(true); await summaryAnalysis.enqueueAsync(); }
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
      navigate(`/studies/${studyId}#interviews`);
    } catch (err) { setArchiveError(err); } finally { setBusy(false); }
  };
  const reset = async () => { setDirty(false); setError(null); setSaved(false); const latest = await interview.refetch(); if (latest.data) { setTitle(latest.data.title || ''); setSegments(Array.isArray(latest.data.transcript_data) ? latest.data.transcript_data : []); } };
  const back = <Link to={`/studies/${studyId}#interviews`} className="research-back" data-testid="research-back-to-interviews"><ArrowLeft size={16} /><span>{t('research.backToInterviews')}</span></Link>;
  if (study.isPending || interview.isPending) return <Loading />;
  if (study.isError || interview.isError) return <>{back}<ErrorState error={study.error || interview.error} onRetry={() => { study.refetch(); interview.refetch(); }} /></>;
  if (study.data.workspace_id !== workspace.id || record.workspace_id !== workspace.id || record.study_id !== studyId) return <>{back}<ErrorState error={{ status: 404 }} /></>;
  const tabs = ['summary', 'transcript'];
  const selectTab = (event, index) => {
    const next = event.key === 'ArrowRight' ? (index + 1) % 2 : event.key === 'ArrowLeft' ? (index + 1) % 2 : event.key === 'Home' ? 0 : event.key === 'End' ? 1 : null;
    if (next === null) return;
    event.preventDefault(); setTabTouched(true); setTab(tabs[next]); document.getElementById(`interview-tab-${tabs[next]}`)?.focus();
  };
  const activeUploadError = uploadError || (isFailedUpload ? (serverUploadError || t('research.uploadFailed')) : '');

  return <>
    {back}
    <input
      ref={audioInputRef}
      type="file"
      accept=".mp3,.wav,.m4a,.mp4,.webm,audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/m4a,video/mp4,video/webm,audio/webm"
      className="hidden"
      onChange={(event) => handleAudioFileUpload(event.target.files?.[0] || null)}
      data-testid="research-interview-audio-input"
    />
    <div className="mb-7 flex min-w-0 flex-wrap items-start justify-between gap-5">
      <div className="min-w-0 flex-1"><div className="research-eyebrow">{t('research.interviews')}</div><h1 className="research-heading mt-3 break-words">{record.title}</h1>
        <div className="mt-4 flex flex-wrap items-center gap-3"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{t(processingSummary ? 'research.analysisWorking' : `research.${interviewStage(record, study.data)}`)}</span></div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="research-secondary"
          disabled={dirty || busy || isUploadingAudio || isProcessingUpload || processingSummary}
          onClick={() => audioInputRef.current?.click()}
          data-testid="research-upload-audio-btn"
        >
          <UploadCloud size={15} />
          {t('research.uploadAudioVideo')}
        </button>
        <button type="button" className="research-secondary" disabled={dirty || busy} onClick={() => { setArchiveError(null); setConfirmArchive(true); }} data-testid="research-archive-interview"><Trash2 size={15} />{t('research.archiveInterview')}</button>
        <Link className="research-secondary" to={`/studies/${studyId}#summary`}>{t('research.toStudyResults')}</Link>
      </div>
    </div>
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div role="tablist" aria-label={t('research.sourceMaterial')} className="flex max-w-full gap-1 rounded-2xl border border-slate-200/70 bg-white/70 p-1.5">
        {tabs.map((key, index) => <button key={key} id={`interview-tab-${key}`} role="tab" aria-controls={`interview-panel-${key}`} aria-selected={tab === key} tabIndex={tab === key ? 0 : -1} onKeyDown={event => selectTab(event, index)} onClick={() => { setTabTouched(true); setTab(key); }} className="research-tab">{t(`research.${key}`)}{key === 'transcript' && dirty && <span className="h-1.5 w-1.5 rounded-full bg-orange-500" aria-label={t('research.unsaved')} />}</button>)}
      </div>
      {study.data?.brief_status !== 'draft' && <AnalysisAction userId={user.id} workspaceId={workspace.id} studyId={studyId} interviewId={interviewId} dirty={dirty} existing={Boolean(summary)} onStart={() => setError(null)} disabled={!record.transcript_data?.length || isUploadingAudio || isProcessingUpload || processingSummary} disabledReason={!record.transcript_data?.length ? t('research.addSourceFirst') : undefined} />}
    </div>
    {activeUploadError && <p role="alert" className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm leading-7 text-rose-800">{activeUploadError}</p>}
    {tab === 'summary' && error && <div className="mb-6"><ErrorState error={error} /></div>}
    {systemState.autoSummaryError && <p role="alert" className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-800">{t('research.autoSummaryFailed')}</p>}
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-5">
        <ImpactPanel record={record} study={study.data} userId={user.id} workspaceId={workspace.id} disabled={dirty || busy} />
        {tab === 'summary' ? <section role="tabpanel" id="interview-panel-summary" aria-labelledby="interview-tab-summary" className="space-y-5">
          {isUploadingAudio || isProcessingUpload ? <InterviewPipeline stage={isUploadingAudio ? 'upload' : 'transcription'} filename={sourceUploadFileName} /> : processingSummary ? <InterviewPipeline stage="summary" filename={sourceUploadFileName} /> : summary ? <div className="research-summary">
            <div className="mb-7 flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/70 pb-6">
              <div><h2 className="research-section-heading">{t('research.summary')}</h2><p className="mt-2 text-xs text-slate-500">{t('research.revision', { version: record.summary_revision })}</p></div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="research-secondary" onClick={copySummary}>{copied ? <Check size={16} /> : <Copy size={16} />}{t(copied ? 'research.copied' : 'research.copySummary')}</button>
                <button type="button" className="research-secondary" onClick={() => downloadFile({ filename: `${slugifyTitle(record.title, 'interview')}-summary.md`, content: buildInterviewMarkdown({ study: study.data, record, summaryText: summaryRef.current?.innerText || '', segments: Array.isArray(record.transcript_data) ? record.transcript_data : [], t }), mimeType: 'text/markdown;charset=utf-8' })} data-testid="research-export-interview-md"><Download size={16} />{t('research.exportInterviewMd')}</button>
              </div>
            </div>
            {copyError && <p role="alert" className="mb-5 text-sm text-amber-800">{t('research.copyFailed')}</p>}
            <div ref={summaryRef}><InterviewSummary normalizedSummary={summary} /></div>
            <div className="mt-8 border-t border-slate-200/70 pt-6 flex flex-wrap gap-3"><Link className="research-primary" to={`/studies/${studyId}#interviews`}>{t('research.continueInterviews')}</Link><Link className="research-secondary" to={`/studies/${studyId}#summary`}>{t('research.toStudyResults')}</Link></div>
          </div> : <section className="app-empty-state rounded-3xl p-6 sm:p-8" data-testid="research-source-intake"><h2 className="research-section-heading">{t(record.transcript_data?.length ? 'research.transcriptReadyTitle' : 'research.summaryEmptyTitle')}</h2><p className="mt-3 text-sm leading-7 text-slate-600">{t(record.transcript_data?.length ? 'research.transcriptReadyHint' : 'research.sourceIntakeHint')}</p><div className="mt-6 flex flex-wrap gap-3"><button type="button" className="research-primary" onClick={() => audioInputRef.current?.click()}>{t('research.uploadAudioVideo')}</button><button type="button" className="research-secondary" onClick={() => { setTab('transcript'); setTabTouched(true); setBulkText(''); setBulkOpen(true); }}>{t('research.pasteTranscript')}</button>{record.transcript_data?.length > 0 && <button className="research-secondary" onClick={() => { setTabTouched(true); setTab('transcript'); }}>{t('research.openTranscript')}</button>}</div></section>}
        </section> : <section role="tabpanel" id="interview-panel-transcript" aria-labelledby="interview-tab-transcript">
          <form onSubmit={save} className="research-card" data-testid="research-transcript-form">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Volume2 size={20} className="text-emerald-600" />
                <h2 className="research-section-heading">{t('research.transcript')}</h2>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {sourceUploadFileName && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                    <FileAudio size={13} className="text-orange-600" />
                    {sourceUploadFileName}
                  </span>
                )}
                <span className="text-xs text-slate-500">{t('research.transcriptRevision', { version: record.transcript_revision })}</span>
              </div>
            </div>
            <label className="mt-5 block"><span className="research-label">{t('research.interviewTitle')}</span><input required maxLength={240} value={title} onChange={event => { setTitle(event.target.value); setDirty(true); setSaved(false); }} className="research-field" /></label>

            {activeUploadError && !isUploadingAudio && !isProcessingUpload && (
              <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-800">
                <div className="flex items-start gap-3">
                  <AlertCircle size={18} className="mt-0.5 shrink-0 text-rose-600" />
                  <div>
                    <p className="font-semibold">{t('research.uploadFailedTitle')}</p>
                    <p className="mt-0.5 text-xs text-rose-700">{activeUploadError}</p>
                  </div>
                </div>
                <button type="button" onClick={() => audioInputRef.current?.click()} className="research-secondary">
                  <UploadCloud size={15} />
                  {t('research.retryUpload')}
                </button>
              </div>
            )}

            <div className="mt-6">
              {segments.length === 0 ? (
                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDraggingAudio(true);
                  }}
                  onDragLeave={() => setIsDraggingAudio(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setIsDraggingAudio(false);
                    const dropped = event.dataTransfer?.files?.[0];
                    if (dropped) handleAudioFileUpload(dropped);
                  }}
                  className={`flex flex-col items-center justify-center rounded-3xl border-2 border-dashed p-8 text-center transition ${
                    isDraggingAudio
                      ? 'border-orange-500 bg-orange-50/70'
                      : 'border-slate-300/90 bg-slate-50/60 hover:border-orange-300 hover:bg-orange-50/20'
                  }`}
                  data-testid="research-upload-dropzone"
                >
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-orange-600 shadow-sm ring-1 ring-slate-200/80">
                    <UploadCloud size={28} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">{t('research.uploadDropzoneTitle')}</h3>
                  <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{t('research.uploadDropzoneBody')}</p>
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => audioInputRef.current?.click()}
                      className="research-primary"
                      data-testid="research-dropzone-select-file"
                    >
                      <UploadCloud size={16} />
                      {t('research.selectAudioVideoFile')}
                    </button>
                  </div>
                  <p className="mt-3 text-xs text-slate-400">{t('research.supportedFormatsHint')}</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/90 p-5 sm:p-6 space-y-5" data-testid="research-transcript-stream">
                  {segments.map((row, index) => {
                    const isInterviewer = isInterviewerSpeaker(row.speaker);
                    const speakerLabel = row.speaker?.trim() || (isInterviewer ? 'Interviewer' : 'Respondent');
                    const timestampLabel = row.timestamp?.trim() || '00:00';
                    const bubbleRowClass = isInterviewer ? 'mr-auto' : 'ml-auto flex-row-reverse';
                    const bubbleGroupClass = isInterviewer ? 'items-start' : 'items-end';
                    const bubbleClass = isInterviewer
                      ? 'bg-white border border-gray-200 text-gray-800 rounded-tl-none'
                      : 'bg-emerald-50 border border-emerald-100 text-emerald-900 rounded-tr-none';
                    const estimatedRows = Math.max(
                      1,
                      Math.min(
                        10,
                        Math.max(
                          String(row.text || '').split('\n').length,
                          Math.ceil(String(row.text || '').length / 68)
                        )
                      )
                    );

                    return (
                      <div key={row.id || index} className={`flex gap-3.5 max-w-3xl ${bubbleRowClass}`}>
                        <button
                          type="button"
                          onClick={() => toggleSegmentSpeaker(index)}
                          title={t('research.toggleSpeaker')}
                          className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-sm transition-transform hover:scale-105 ${
                            isInterviewer ? 'bg-blue-600 text-white' : 'bg-emerald-100 text-emerald-600'
                          }`}
                        >
                          {isInterviewer ? <Mic size={18} /> : <Volume2 size={18} />}
                        </button>

                        <div className={`group flex min-w-0 flex-1 flex-col gap-1 ${bubbleGroupClass}`}>
                          <div className="flex items-center gap-2 px-1 text-xs text-gray-500">
                            <button
                              type="button"
                              onClick={() => toggleSegmentSpeaker(index)}
                              title={t('research.toggleSpeaker')}
                              className="font-semibold text-gray-700 hover:text-blue-600 transition-colors"
                            >
                              {speakerLabel}
                            </button>
                            <span>{timestampLabel}</span>
                          </div>

                          <div className={`w-full px-4 py-3 rounded-2xl shadow-sm text-sm leading-relaxed transition-shadow focus-within:ring-2 focus-within:ring-blue-500/25 ${bubbleClass}`}>
                            <div className="flex items-start gap-2.5">
                              <textarea
                                required
                                rows={estimatedRows}
                                maxLength={50000}
                                aria-label={t('research.segmentText')}
                                value={row.text || ''}
                                onChange={(event) => changeSegment(index, 'text', event.target.value)}
                                placeholder={t('research.segmentPlaceholder')}
                                className="min-w-[200px] sm:min-w-[280px] w-full flex-1 resize-none border-0 bg-transparent p-0 text-sm leading-relaxed text-inherit placeholder:text-gray-400 focus:outline-none focus:ring-0"
                              />
                              <div className="flex flex-shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  onClick={() => copySegmentLine(row.text, index)}
                                  title={copiedSegmentIndex === index ? t('research.copied') : t('research.copySegment')}
                                  className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-100/60 rounded-lg transition-colors"
                                >
                                  {copiedSegmentIndex === index ? <Check size={14} /> : <Copy size={14} />}
                                </button>
                                <button
                                  type="button"
                                  aria-label={`${t('research.removeSegment')} ${index + 1}`}
                                  title={t('research.removeSegment')}
                                  onClick={() => {
                                    setSegments((previous) => previous.filter((_, i) => i !== index));
                                    setDirty(true);
                                    setSaved(false);
                                  }}
                                  className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="research-secondary"
                onClick={() => {
                  setSegments((previous) => {
                    const last = previous.at(-1);
                    const nextSpeaker = last && isInterviewerSpeaker(last.speaker) ? 'Respondent' : 'Interviewer';
                    return [...previous, entry(nextSpeaker)];
                  });
                  setDirty(true);
                  setSaved(false);
                }}
              >
                <Plus size={16} />
                {t('research.addParagraph')}
              </button>
              <button type="button" className="research-secondary" onClick={() => { setBulkText(''); setBulkOpen(true); }} data-testid="research-paste-transcript"><FileText size={16} />{t('research.pasteTranscript')}</button>
              <button type="button" className="research-secondary" disabled={dirty || busy || isUploadingAudio || isProcessingUpload} onClick={() => audioInputRef.current?.click()}><UploadCloud size={16} />{t('research.uploadAudioVideo')}</button>
              {segments.length > 0 && <button type="button" className="research-secondary" onClick={() => downloadFile({ filename: `${slugifyTitle(title || record.title, 'interview')}-transcript.csv`, content: buildTranscriptCsv({ segments, t }), mimeType: 'text/csv;charset=utf-8' })} data-testid="research-export-transcript-csv"><Download size={16} />{t('research.exportTranscriptCsv')}</button>}
            </div>
            {error && <div className="mt-6">{error.code === 'INVALID_TRANSCRIPT' ? <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{t('research.invalidTranscript')}</p> : <ErrorState error={error} onRetry={error.status === 409 ? reset : undefined} />}</div>}
            {saved && <p role="status" className="mt-6 flex items-center gap-2 text-sm font-semibold text-emerald-700"><Check size={16} />{t('research.transcriptSaved')}</p>}
            <div className="research-form-actions mt-8"><span className="mr-auto text-xs text-slate-500">{t(dirty ? 'research.unsaved' : 'research.saved')}</span>{dirty && <button type="button" className="research-secondary" disabled={busy} onClick={() => { if (window.confirm(t('research.discardForm'))) reset(); }}><RotateCcw size={15} />{t('research.discardChanges')}</button>}<button className="research-secondary" disabled={!dirty || busy || !title.trim()} data-testid="research-save-transcript">{t(busy ? 'research.saving' : 'research.saveTranscript')}</button>{!summary && study.data?.brief_status !== 'draft' && <button className="research-primary" name="action" value="generate" disabled={!dirty || busy || !title.trim() || !segments.length || summaryAnalysis.busy} data-testid="research-save-and-summarize">{t('research.saveAndSummarize')}</button>}</div>
          </form>
        </section>}
      </div>
      <aside className="min-w-0 space-y-5" aria-label={t('research.interviewTools')}>
        <section className="app-surface-soft rounded-3xl p-5"><div className="research-eyebrow">{t('research.sharedGoal')}</div><p className="mt-3 break-words text-sm leading-7 text-slate-700">{study.data.goal}</p><p className="mt-3 text-xs leading-6 text-slate-500">{t('research.summaryContextHint')}</p>{study.data.brief && <details className="mt-4 text-xs leading-6 text-slate-600"><summary className="cursor-pointer font-semibold">{t('research.brief')}</summary><p className="mt-3 whitespace-pre-line break-words">{study.data.brief}</p></details>}</section>
        <ParticipantPanel record={record} userId={user.id} workspaceId={workspace.id} disabled={dirty || busy || workspace.role === 'viewer' || isProcessingUpload || processingSummary} />
        <InterviewSources record={record} userId={user.id} workspaceId={workspace.id} disabled={dirty || busy} onRestoreTranscript={(restored) => { setSegments(restored); setDirty(true); setSaved(false); setTabTouched(true); setTab('transcript'); }} />
        <EvidenceAction record={record} study={study.data} userId={user.id} workspaceId={workspace.id} disabled={dirty || busy} />
      </aside>
    </div>
    {bulkOpen && <Modal guardChanges title={t('research.pasteTranscript')} onClose={() => setBulkOpen(false)}><ModalForm onSubmit={(event) => { event.preventDefault(); if (!parsedBulk.length) return; setSegments(previous => [...previous, ...parsedBulk]); setDirty(true); setSaved(false); setBulkOpen(false); setBulkText(''); }} testId="research-paste-transcript-form" actions={<><button type="button" data-modal-dismiss className="research-text-button" onClick={() => setBulkOpen(false)}>{t('research.cancel')}</button><button className="research-primary" disabled={!parsedBulk.length} data-testid="research-import-segments">{t('research.importSegments', { count: parsedBulk.length })}</button></>}><p className="research-description">{t('research.pasteTranscriptHint')}</p><label className="block"><span className="research-label">{t('research.pasteTranscriptLabel')}</span><textarea required rows={8} maxLength={200000} value={bulkText} onChange={event => setBulkText(event.target.value)} className="research-field resize-y" placeholder={t('research.pasteTranscriptPlaceholder')} autoFocus data-testid="research-paste-transcript-input" /></label></ModalForm></Modal>}
    {confirmArchive && <Modal title={t('research.archiveInterview')} onClose={() => { if (!busy) { setConfirmArchive(false); setArchiveError(null); } }} busy={busy}><ModalForm as="div" testId="research-archive-interview-confirm" actions={<><button type="button" className="research-text-button" disabled={busy} onClick={() => { setConfirmArchive(false); setArchiveError(null); }}>{t('research.cancel')}</button><button type="button" className="research-primary" disabled={busy} onClick={archiveInterview} data-testid="research-confirm-archive-interview">{t(busy ? 'research.saving' : 'research.confirmArchive')}</button></>}><p className="research-description">{t('research.archiveInterviewConfirm', { title: record.title })}</p>{archiveError && <ErrorState error={archiveError} onRetry={archiveError.status === 409 ? async () => { await interview.refetch(); setArchiveError(null); } : undefined} />}</ModalForm></Modal>}
  </>;
}
