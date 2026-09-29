import { useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { UsersRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { researchKey, researchRequest, useResearchQuery } from '../hooks/useResearch';
import { DisclosureButton, ErrorState, Loading, Modal } from './UI';

export default function InterviewSources({ record, userId, workspaceId, disabled, onRestoreTranscript }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [versionId, setVersionId] = useState(null);
  const [pseudonym, setPseudonym] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const participants = useInfiniteQuery({ queryKey: researchKey(userId, workspaceId, 'participants', record.study_id), enabled: open, initialPageParam: null,
    queryFn: ({ pageParam, signal }) => researchRequest(`/studies/${record.study_id}/participants?limit=100${pageParam ? `&before=${pageParam}` : ''}`, { signal }),
    getNextPageParam: page => page.length === 100 ? page.at(-1).id : undefined });
  const versions = useInfiniteQuery({ queryKey: researchKey(userId, workspaceId, 'transcript-versions', record.id), enabled: open, initialPageParam: null,
    queryFn: ({ pageParam, signal }) => researchRequest(`/interviews/${record.id}/transcript-versions?limit=20${pageParam == null ? '' : `&before=${pageParam}`}`, { signal }),
    getNextPageParam: page => page.length === 20 ? page.at(-1).transcript_revision : undefined });
  const detail = useResearchQuery(userId, workspaceId, ['transcript-version', versionId], `/interviews/${record.id}/transcript-versions/${versionId}`, Boolean(versionId));
  const assign = async participantId => {
    setBusy(true); setError(null);
    try {
      const updated = await researchRequest(`/interviews/${record.id}/participant`, { method: 'PATCH', body: JSON.stringify({ participant_id: participantId || null, research_revision: record.research_revision }) });
      client.setQueryData(researchKey(userId, workspaceId, 'interview', record.id), updated);
      await client.invalidateQueries({ queryKey: researchKey(userId, workspaceId, 'results', record.study_id) });
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const create = async event => {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const participant = await researchRequest(`/studies/${record.study_id}/participants`, { method: 'POST', body: JSON.stringify({ pseudonym }) });
      await participants.refetch(); setPseudonym(''); await assign(participant.id);
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  return <div className="app-surface-soft min-w-0 rounded-3xl p-5">
    <DisclosureButton open={open} onClick={() => setOpen(value => !value)} icon={UsersRound}>{t('research.sourcesAndParticipant')}</DisclosureButton>
    {open && <section className="mt-4 space-y-6">
      <p className="text-sm leading-6 text-slate-500">{t('research.participantHint')}</p>
      {error && <ErrorState error={error} />}
      {participants.isError ? <ErrorState error={participants.error} /> : <label className="block"><span className="research-label">{t('research.participant')}</span><select value={record.research_participant_id || ''} disabled={busy || disabled || participants.isPending} onChange={e => assign(e.target.value)} className="research-field"><option value="">{t('research.participantUnknown')}</option>{participants.data?.pages.flat().map(item => <option value={item.id} key={item.id}>{item.pseudonym}</option>)}</select></label>}
      {participants.hasNextPage && <button className="research-secondary" disabled={participants.isFetchingNextPage} onClick={() => participants.fetchNextPage()}>{t('research.loadMore')}</button>}
      <form className="flex flex-wrap items-end gap-3" onSubmit={create}><label className="min-w-0 w-full flex-1"><span className="research-label">{t('research.newParticipant')}</span><input required maxLength={120} value={pseudonym} onChange={e => setPseudonym(e.target.value)} className="research-field" /></label><button className="research-secondary" disabled={busy || disabled || !pseudonym.trim()}>{t('research.addParticipant')}</button></form>
      <div><h3 className="research-subheading">{t('research.versionHistory')}</h3>{versions.isPending ? <Loading /> : versions.isError ? <ErrorState error={versions.error} /> : versions.data.pages.flat().length === 0 ? <p className="mt-2 text-sm text-slate-500">{t('research.noHistory')}</p> : <ol className="mt-3 space-y-3">{versions.data.pages.flat().map(version => <li key={version.id}><button className="min-h-10 text-left text-sm font-semibold text-blue-700" onClick={() => setVersionId(version.id)}>{t('research.transcriptRevision', { version: version.transcript_revision })} · {new Date(version.created_at).toLocaleString()}</button></li>)}</ol>}{versions.hasNextPage && <button className="research-secondary mt-4" disabled={versions.isFetchingNextPage} onClick={() => versions.fetchNextPage()}>{t('research.loadMore')}</button>}</div>
    </section>}
    {versionId && <Modal title={t('research.versionHistory')} onClose={() => setVersionId(null)}>{detail.isPending ? <Loading /> : detail.isError ? <ErrorState error={detail.error} /> : <div className="space-y-5"><ol className="space-y-5">{detail.data.transcript_data.map((row, index) => <li key={row.id || index} id={`segment-${row.id}`}><p className="text-xs font-bold text-slate-500">{row.timestamp} · {row.speaker}</p><p className="mt-2 whitespace-pre-line text-sm leading-7">{row.text}</p></li>)}</ol>{onRestoreTranscript && <div className="border-t border-slate-200/70 pt-4"><button type="button" className="research-secondary" disabled={disabled} onClick={() => { onRestoreTranscript(detail.data.transcript_data.map(row => ({ ...row }))); setVersionId(null); }} data-testid="research-restore-transcript-version">{t('research.restoreTranscriptVersion')}</button></div>}</div>}</Modal>}
  </div>;
}
