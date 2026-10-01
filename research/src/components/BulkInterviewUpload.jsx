import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { decodeUploadFileName, researchRequest, uploadInterviewAudio } from '../hooks/useResearch';
import { ErrorState } from './UI';

export default function BulkInterviewUpload({ studyId, onFinished, autoSummary = true, label }) {
  const { t } = useTranslation();
  const [files, setFiles] = useState([]);
  const [nextIndex, setNextIndex] = useState(0);
  const [pendingId, setPendingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const upload = async () => {
    setBusy(true); setError(null);
    let batchId = null;
    let completed = false;
    try {
      const batch = await researchRequest(`/studies/${studyId}/upload-batches`, { method: 'POST', body: '{}' });
      batchId = batch.batch_id;
      for (let index = nextIndex; index < files.length; index += 1) {
        const file = files[index];
        const title = decodeUploadFileName(file.name).replace(/\.[^.]+$/, '').slice(0, 240) || t('research.interviews');
        const interviewId = index === nextIndex && pendingId ? pendingId : (await researchRequest(`/studies/${studyId}/interviews`, { method: 'POST', body: JSON.stringify({ title }) })).id;
        setPendingId(interviewId);
        await uploadInterviewAudio(interviewId, file, { autoSummary });
        setNextIndex(index + 1); setPendingId(null);
      }
      setFiles([]); setNextIndex(0);
      completed = true;
    } catch (cause) { setError(cause); }
    finally {
      try { if (batchId) await researchRequest(`/studies/${studyId}/upload-batches/complete`, { method: 'POST', body: JSON.stringify({ batch_id: batchId }) }); }
      catch (cause) { completed = false; setError(cause); }
      await onFinished?.(completed);
      setBusy(false);
    }
  };
  return <div className="space-y-4" data-testid="research-bulk-upload">
    <label className="block"><span className="research-label">{label || t('research.uploadAudioVideo')}</span><input type="file" multiple accept="audio/*,video/mp4,video/webm,.mp3,.m4a,.wav,.mp4,.webm" disabled={busy} onChange={e => { setFiles(Array.from(e.target.files || [])); setNextIndex(0); setPendingId(null); setError(null); }} className="research-field" /></label>
    {files.length > 0 && <p className="text-sm text-slate-600">{t('research.uploadProgress', { done: nextIndex, total: files.length })}</p>}
    {error && <ErrorState error={error} />}
    <button type="button" className="research-primary" onClick={upload} disabled={busy || nextIndex >= files.length || !files.length}>{t(busy ? 'research.saving' : 'research.addSelectedInterviews')}</button>
  </div>;
}
