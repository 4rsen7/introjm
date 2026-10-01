import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { researchKey, researchRequest } from '../hooks/useResearch';
import { ErrorState, Modal } from './UI';

export default function ArchiveStudyDialog({ study, userId, workspaceId, onClose, onArchived }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [current, setCurrent] = useState(study);
  const [error, setError] = useState(null);
  const [needsReload, setNeedsReload] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);

  const archive = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await researchRequest(`/studies/${current.id}`, { method: 'DELETE', body: JSON.stringify({ revision: current.revision }) });
      // Hide it immediately, retaining page size and cursors until the list refetches.
      client.setQueryData(researchKey(userId, workspaceId, 'studies'), old => old && ({
        ...old, pages: old.pages.map(page => page.map(row => row.id === current.id ? { ...row, archived_at: new Date().toISOString() } : row)),
      }));
      onArchived();
      await Promise.all([
        client.invalidateQueries({ queryKey: researchKey(userId, workspaceId, 'studies') }),
        client.invalidateQueries({ queryKey: researchKey(userId, workspaceId, 'study', current.id) }),
        client.invalidateQueries({ queryKey: researchKey(userId, workspaceId, 'interviews', current.id) }),
        client.invalidateQueries({ queryKey: researchKey(userId, workspaceId, 'synthesis', current.id) }),
      ]);
    } catch (cause) {
      if (cause.status === 409) setNeedsReload(true);
      setError(cause);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  const reloadLatest = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const latest = await researchRequest(`/studies/${study.id}`);
      if (latest.workspace_id !== workspaceId) throw Object.assign(new Error('Study unavailable'), { status: 404 });
      setCurrent(latest);
      setError(null);
      setNeedsReload(false);
      client.setQueryData(researchKey(userId, workspaceId, 'study', study.id), latest);
    } catch (cause) {
      setError(cause);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  return <Modal title={t('research.archiveStudy')} onClose={onClose} busy={busy}>
    <div data-testid="research-archive-study-confirm" className="space-y-6">
      <p className="text-sm leading-7 text-slate-600">{t('research.archiveStudyConfirm', { title: current.title })}</p>
      {error && <ErrorState error={error} />}
      {needsReload && <button type="button" className="research-secondary" disabled={busy} onClick={reloadLatest}>{t('research.reloadLatest')}</button>}
      <div className="flex flex-wrap gap-3">
        <button type="button" className="research-secondary" disabled={busy} onClick={onClose}>{t('research.cancel')}</button>
        <button type="button" className="research-primary" disabled={busy || needsReload} onClick={archive} data-testid="research-confirm-archive-study">{t(busy ? 'research.saving' : 'research.confirmArchive')}</button>
      </div>
    </div>
  </Modal>;
}
