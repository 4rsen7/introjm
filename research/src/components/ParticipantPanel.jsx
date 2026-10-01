import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';
import { researchKey, researchRequest, useResearchQuery } from '../hooks/useResearch';
import { ErrorState } from './UI';

export default function ParticipantPanel({ record, userId, workspaceId, disabled }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const participants = useResearchQuery(userId, workspaceId, ['participants', record.study_id], `/studies/${record.study_id}/participants?limit=100`);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const assign = async participantId => {
    const updated = await researchRequest(`/interviews/${record.id}/participant`, { method: 'PATCH', body: JSON.stringify({ participant_id: participantId || null, research_revision: record.research_revision }) });
    client.setQueryData(researchKey(userId, workspaceId, 'interview', record.id), updated);
    await Promise.all(['interviews', 'results'].map(key => client.invalidateQueries({ queryKey: researchKey(userId, workspaceId, key, record.study_id) })));
  };
  const change = async participantId => {
    setBusy(true); setError(null);
    try { await assign(participantId); } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const create = async event => {
    event.preventDefault(); if (!name.trim()) return;
    setBusy(true); setError(null);
    try {
      const participant = await researchRequest(`/studies/${record.study_id}/participants`, { method: 'POST', body: JSON.stringify({ pseudonym: name.trim() }) });
      await participants.refetch(); await assign(participant.id); setName('');
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  return <section className="app-surface-soft rounded-3xl p-5 space-y-4"><h2 className="flex items-center gap-2 text-sm font-bold"><Users size={18} className="text-orange-600" />{t('research.participant')}</h2><p className="text-xs leading-6 text-slate-500">{t('research.participantOptional')}</p>
    <label className="block"><span className="research-label">{t('research.linkParticipant')}</span><select className="research-field" value={record.research_participant_id || ''} onChange={event => change(event.target.value)} disabled={disabled || busy || participants.isPending || participants.isError} data-testid="research-participant-select"><option value="">{t('research.sessionOnly')}</option>{participants.data?.map(item => <option key={item.id} value={item.id}>{item.pseudonym}</option>)}</select></label>
    <form onSubmit={create} className="space-y-3"><label className="block"><span className="research-label">{t('research.newParticipant')}</span><input className="research-field" maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder={t('research.participantPlaceholder')} disabled={disabled || busy} data-testid="research-participant-name" /></label><button className="research-secondary" disabled={disabled || busy || !name.trim()} data-testid="research-participant-create">{t('research.createParticipant')}</button></form>
    {(error || participants.error) && <ErrorState error={error || participants.error} onRetry={async () => { await participants.refetch(); await client.invalidateQueries({ queryKey: researchKey(userId, workspaceId, 'interview', record.id) }); setError(null); }} />}
  </section>;
}
