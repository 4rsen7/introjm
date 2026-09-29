import { useEffect, useId, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FileAudio, Upload } from 'lucide-react';
import { researchKey, researchRequest } from '../hooks/useResearch';
import { fileFingerprint, uploadRecording } from '../services/recordingUpload';
import { DisclosureButton, ErrorState } from './UI';

export default function MediaUploadPanel({ record, userId, workspaceId, disabled }) {
  const { t } = useTranslation();
  const demo = import.meta.env.VITE_RESEARCH_DEMO === 'true';
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const fileId = useId();
  const fileInput = useRef(null);
  const [file, setFile] = useState(null);
  const [automatic, setAutomatic] = useState(false);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const controller = useRef(null);
  const storedKey = `research.upload.${userId}.${workspaceId}.${record.id}`;
  const [session, setSession] = useState(() => {
    try { const value = JSON.parse(sessionStorage.getItem(storedKey)); return value && new Date(value.asset.expires_at) > new Date() ? value : null; } catch { return null; }
  });
  const remember = value => { setSession(value); try { value ? sessionStorage.setItem(storedKey, JSON.stringify(value)) : sessionStorage.removeItem(storedKey); } catch { /* Resume in this tab still works. */ } };
  const uploads = useQuery({ queryKey: researchKey(userId, workspaceId, 'uploads', record.id), enabled: open,
    queryFn: ({ signal }) => researchRequest(`/interviews/${record.id}/uploads`, { signal }), retry: false,
    refetchInterval: q => q.state.data?.some(asset => ['ready', 'processing'].includes(asset.status)) ? 2000 : false });
  const previous = useRef('');
  useEffect(() => {
    const marker = uploads.data?.map(asset => `${asset.id}:${asset.status}`).join(',');
    if (!marker || marker === previous.current) return;
    previous.current = marker;
    client.invalidateQueries({ queryKey: researchKey(userId, workspaceId, 'interview', record.id) });
    client.invalidateQueries({ queryKey: researchKey(userId, workspaceId, 'analysis-job') });
  }, [uploads.data, client, userId, workspaceId, record.id]);
  useEffect(() => () => controller.current?.abort(), []);
  const complete = async assetId => {
    setBusy(true); setError(null);
    try {
      await researchRequest(`/uploads/${assetId}/complete`, { method: 'POST', body: JSON.stringify({ auto_summary: automatic }) });
      if (session?.asset.id === assetId) remember(null);
      await uploads.refetch();
      return true;
    } catch (err) { setError(err); return false; } finally { setBusy(false); }
  };
  const start = async event => {
    event.preventDefault();
    if (!file || file.size < 1 || file.size > 100 * 1024 * 1024) { setError({ code: 'RESEARCH_MEDIA_TOO_LARGE' }); return; }
    setBusy(true); setError(null); controller.current = new AbortController();
    try {
      const fingerprint = await fileFingerprint(file);
      let current = session;
      if (current && current.fingerprint !== fingerprint) throw Object.assign(new Error('Choose the same recording to resume'), { code: 'UPLOAD_FILE_MISMATCH' });
      if (!current) {
        current = { ...await researchRequest(`/interviews/${record.id}/uploads`, { method: 'POST', body: JSON.stringify({ size_bytes: file.size, auto_summary: automatic }) }), fingerprint };
        remember(current);
      }
      await uploadRecording(file, current, { signal: controller.current.signal, onProgress: setProgress, onSession: remember });
      if (await complete(current.asset.id)) { remember(null); setFile(null); setProgress(0); if (fileInput.current) fileInput.current.value = '';  }
    } catch (err) { if (err.name !== 'AbortError') setError(err); } finally { setBusy(false); }
  };
  const cancel = async assetId => {
    controller.current?.abort(); setBusy(true); setError(null);
    try { await researchRequest(`/uploads/${assetId}/cancel`, { method: 'POST' }); if (session?.asset.id === assetId) remember(null); await uploads.refetch(); }
    catch (err) { setError(err); } finally { setBusy(false); }
  };
  return <section className="app-surface-soft min-w-0 rounded-3xl p-5">
    <DisclosureButton open={open} onClick={() => setOpen(value => !value)} icon={Upload}>{t('research.uploadRecording')}</DisclosureButton>
    {open && <div className="mt-5 space-y-5">{demo && <p className="research-notice">{t('research.demoRecording')}</p>}<p className="text-sm leading-6 text-slate-500">{t('research.uploadHint')}</p>
      <form onSubmit={start} className="space-y-4">{session && <p className="research-notice">{t('research.resumeHint')}</p>}<label htmlFor={fileId} className="block cursor-pointer rounded-2xl border border-dashed border-slate-300 bg-white/70 p-5 text-center transition hover:border-orange-300 hover:bg-orange-50/30"><FileAudio size={26} className="mx-auto mb-3 text-orange-500" /><span className="block break-words text-sm font-semibold text-slate-700 [overflow-wrap:anywhere]">{file ? file.name : t('research.chooseRecording')}</span><span className="mt-2 block text-xs text-slate-500">{file ? `${(file.size / 1048576).toFixed(1)} MB` : t('research.recordingFormats')}</span><input id={fileId} ref={fileInput} type="file" accept="audio/mpeg,audio/mp4,audio/wav,audio/webm,video/mp4,video/webm" aria-label={t('research.recordingFile')} disabled={demo || busy || disabled} onChange={e => { setFile(e.target.files?.[0] || null); setError(null); }} className="mt-4 block w-full min-w-0 text-xs text-slate-500 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-semibold file:text-slate-700" /></label>
        <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={automatic} disabled={busy || Boolean(session)} onChange={e => setAutomatic(e.target.checked)} />{t('research.autoSummaryAfterUpload')}</label>
        <div className="flex flex-wrap gap-3"><button className="research-primary" disabled={demo || busy || disabled || !file}>{t(session ? 'research.resumeUpload' : 'research.uploadRecording')}</button>{busy && <button type="button" className="research-secondary" onClick={() => controller.current?.abort()}>{t('research.pauseUpload')}</button>}{session && !busy && <button type="button" className="research-secondary" onClick={() => cancel(session.asset.id)}>{t('research.cancelUpload')}</button>}</div>
        {(busy || progress > 0) && <div><progress max="1" value={progress} className="w-full accent-orange-500" aria-label={t('research.uploadProgress')} /><p role="status" className="mt-2 text-xs text-slate-500">{Math.round(progress * 100)}% · {t(progress === 1 ? 'research.verifyingRecording' : 'research.uploadProgress')}</p></div>}
      </form>
      {(error || uploads.error) && <ErrorState error={error || uploads.error} />}
      {uploads.isPending ? <p className="text-xs text-slate-500" role="status">{t('research.loading')}</p> : !uploads.error && !uploads.data?.length && <p className="text-xs leading-5 text-slate-500">{t('research.noRecordings')}</p>}
      <ol className="space-y-3">{uploads.data?.map(asset => <li key={asset.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"><div><p className="text-sm font-semibold">{t(`research.asset_${asset.status}`)}</p><p className="mt-1 text-xs text-slate-400">{new Date(asset.created_at).toLocaleString()} · {Math.round((asset.verified_size_bytes || asset.declared_size_bytes) / 1024 / 1024)} MB</p></div>
        {asset.status === 'awaiting_upload' && <button disabled={demo || busy || disabled} className="research-secondary" onClick={() => complete(asset.id)}>{t('research.verifyUploadedFile')}</button>}
        {['awaiting_upload', 'ready', 'processing', 'failed'].includes(asset.status) && <button disabled={busy} className="text-sm font-semibold text-rose-700" onClick={() => cancel(asset.id)}>{t('research.cancelUpload')}</button>}
      </li>)}</ol>
    </div>}
  </section>;
}
