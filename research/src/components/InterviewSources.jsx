import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { researchKey, researchRequest, useResearchQuery } from '../hooks/useResearch';
import { DisclosureButton, ErrorState, Loading, Modal } from './UI';

export default function InterviewSources({ record, userId, workspaceId, disabled, onRestoreTranscript }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [versionId, setVersionId] = useState(null);
  const versions = useInfiniteQuery({
    queryKey: researchKey(userId, workspaceId, 'transcript-versions', record.id),
    enabled: open,
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) => researchRequest(`/interviews/${record.id}/transcript-versions?limit=20${pageParam == null ? '' : `&before=${pageParam}`}`, { signal }),
    getNextPageParam: page => page.length === 20 ? page.at(-1).transcript_revision : undefined,
  });
  const detail = useResearchQuery(userId, workspaceId, ['transcript-version', versionId], `/interviews/${record.id}/transcript-versions/${versionId}`, Boolean(versionId));

  return <div className="app-surface-soft min-w-0 rounded-3xl p-5">
    <DisclosureButton open={open} onClick={() => setOpen(value => !value)} icon={History}>{t('research.versionHistory')}</DisclosureButton>
    {open && <section className="mt-4 space-y-4">
      {versions.isPending ? <Loading /> : versions.isError ? <ErrorState error={versions.error} /> : versions.data.pages.flat().length === 0 ? <p className="text-sm text-slate-500">{t('research.noHistory')}</p> : <ol className="space-y-3">{versions.data.pages.flat().map(version => <li key={version.id}><button className="min-h-10 text-left text-sm font-semibold text-blue-700" onClick={() => setVersionId(version.id)}>{t('research.transcriptRevision', { version: version.transcript_revision })} · {new Date(version.created_at).toLocaleString()}</button></li>)}</ol>}
      {versions.hasNextPage && <button className="research-secondary" disabled={versions.isFetchingNextPage} onClick={() => versions.fetchNextPage()}>{t('research.loadMore')}</button>}
    </section>}
    {versionId && <Modal title={t('research.versionHistory')} onClose={() => setVersionId(null)}>{detail.isPending ? <Loading /> : detail.isError ? <ErrorState error={detail.error} /> : <div className="space-y-5"><ol className="space-y-5">{detail.data.transcript_data.map((row, index) => <li key={row.id || index} id={`segment-${row.id}`}><p className="text-xs font-bold text-slate-500">{row.timestamp} · {row.speaker}</p><p className="mt-2 whitespace-pre-line text-sm leading-7">{row.text}</p></li>)}</ol>{onRestoreTranscript && <div className="border-t border-slate-200/70 pt-4"><button type="button" className="research-secondary" disabled={disabled} onClick={() => { onRestoreTranscript(detail.data.transcript_data.map(row => ({ ...row }))); setVersionId(null); }} data-testid="research-restore-transcript-version">{t('research.restoreTranscriptVersion')}</button></div>}</div>}</Modal>}
  </div>;
}
