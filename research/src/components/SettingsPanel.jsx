import { useState } from 'react';
import { Copy, Trash2, UserPlus, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useResearchQuery, researchRequest } from '../hooks/useResearch';
import { Modal } from './UI';
import { ModalForm, ErrorState, Loading } from './UI';

function invitationState(invite) {
  if (invite.accepted_at) return 'accepted';
  if (new Date(invite.expires_at) < new Date()) return 'expired';
  return 'pending';
}

export default function SettingsPanel({ userId, workspace, onClose, onWorkspaceUpdated }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('general');
  const [email, setEmail] = useState('');
  const [days, setDays] = useState('7');
  const [shareLink, setShareLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  
  const [workspaceName, setWorkspaceName] = useState(workspace.name);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const invites = useResearchQuery(userId, workspace.id, ['invites'], `/workspaces/${workspace.id}/invites`);
  const members = useResearchQuery(userId, workspace.id, ['members'], `/workspaces/${workspace.id}/members`);
  const usage = useResearchQuery(userId, workspace.id, ['usage'], `/workspaces/${workspace.id}/usage`);
  const refresh = async () => Promise.all([invites.refetch(), members.refetch(), usage.refetch()]);

  const renameWorkspace = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null); setSaveSuccess(false);
    try {
      await researchRequest(`/workspaces/${workspace.id}`, { 
        method: 'PUT', 
        body: JSON.stringify({ name: workspaceName.trim() }) 
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      if (onWorkspaceUpdated) onWorkspaceUpdated();
    } catch (cause) { setError(cause); } finally { setBusy(false); }
  };

  const createInvite = async event => {
    event.preventDefault(); setBusy(true); setError(null); setShareLink(''); setCopied(false);
    try {
      const expires_at = new Date(Date.now() + Number(days) * 86400000).toISOString();
      const result = await researchRequest(`/workspaces/${workspace.id}/invites`, { method: 'POST', body: JSON.stringify({ email: email.trim(), expires_at }) });
      setShareLink(`${window.location.origin}/?invite=${encodeURIComponent(result.token)}`);
      setEmail('');
      await refresh();
    } catch (cause) { setError(cause); } finally { setBusy(false); }
  };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(shareLink); setCopied(true); setCopyError(false); }
    catch { setCopied(false); setCopyError(true); }
  };
  const remove = async () => {
    if (!confirmation) return;
    setBusy(true); setError(null);
    try {
      const path = confirmation.kind === 'invite' ? `/invites/${confirmation.id}` : `/workspaces/${workspace.id}/members/${confirmation.id}`;
      await researchRequest(path, { method: 'DELETE' });
      setConfirmation(null);
      await refresh();
    } catch (cause) { setError(cause); } finally { setBusy(false); }
  };

  return <Modal title={t('research.settingsTitle')} busy={busy} onClose={onClose}>
    <div className="mb-6 flex gap-1 border-b border-slate-200">
      <button 
        className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${activeTab === 'general' ? 'border-orange-500 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
        onClick={() => setActiveTab('general')}
      >{t('research.general')}</button>
      <button 
        className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${activeTab === 'team' ? 'border-orange-500 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
        onClick={() => setActiveTab('team')}
      >{t('research.teamTab')}</button>
    </div>

    {activeTab === 'general' && (
      <div className="space-y-8 animate-in fade-in duration-200">
        <section>
          <h3 className="research-section-heading">{t('research.renameWorkspace')}</h3>
          <form className="mt-4 flex flex-col gap-3" onSubmit={renameWorkspace}>
            <label className="block">
              <span className="research-label">{t('research.workspaceName')}</span>
              <input 
                className="research-field mt-1" 
                type="text" 
                value={workspaceName} 
                maxLength={150} 
                required 
                onChange={event => setWorkspaceName(event.target.value)} 
              />
            </label>
            <div className="flex items-center gap-3">
              <button type="submit" className="research-primary" disabled={busy || workspaceName.trim() === workspace.name}>
                <Save size={16} />{t('research.saveChanges')}
              </button>
              {saveSuccess && <span className="text-sm font-medium text-emerald-600 animate-in fade-in">{t('research.workspaceRenamed')}</span>}
            </div>
            {error && <div className="mt-2"><ErrorState error={error} /></div>}
          </form>
        </section>

        {usage.data && <section data-testid="research-workspace-usage">
          <h3 className="research-section-heading">{t('research.workspaceUsageTitle')}</h3>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">{[
            ['usageStudies', `${usage.data.studies_used} / ${usage.data.max_studies}`],
            ['usageInterviews', `${usage.data.interviews_used} / ${usage.data.max_interviews}`],
            ['usageAnalyses', `${usage.data.analyses_used} / ${usage.data.max_analyses}`],
            ['members', `${usage.data.members_used} / ${usage.data.max_members}`],
            ['usageStorage', `${Math.round((usage.data.storage_bytes_used || 0) / 1048576)} / ${Math.round((usage.data.max_storage_bytes || 0) / 1048576)} MB`],
            ['usageTranscription', `${Math.round((usage.data.transcription_seconds_used || 0) / 60)} / ${Math.round((usage.data.max_transcription_seconds || 0) / 60)} ${t('research.usageMinutesUnit')}`],
          ].map(([labelKey, value]) => <div key={labelKey} className="flex flex-col rounded-2xl border border-slate-200/70 bg-slate-50/70 p-3.5"><dt className="text-xs leading-5 text-slate-500">{t(`research.${labelKey}`)}</dt><dd className="mt-auto pt-1.5 text-sm font-bold text-slate-900">{value}</dd></div>)}</dl>
        </section>}
      </div>
    )}

    {activeTab === 'team' && (
      <div className="space-y-8 animate-in fade-in duration-200">
        {confirmation ? <ModalForm as="div" testId="research-team-confirm" actions={<><button type="button" className="research-text-button" disabled={busy} onClick={() => { setConfirmation(null); setError(null); }}>{t('research.cancel')}</button><button type="button" className="research-primary" disabled={busy} onClick={remove}>{t('research.confirmRemove')}</button></>}>
          <p className="research-description">{t(confirmation.kind === 'invite' ? 'research.revokeInviteConfirm' : 'research.removeMemberConfirm', { name: confirmation.label })}</p>
          {error && <ErrorState error={error} />}
        </ModalForm> : <div className="space-y-8" data-testid="research-team-panel">
          <section><h3 className="research-section-heading">{t('research.inviteMember')}</h3><p className="research-description mt-1">{t('research.inviteHint')}</p>
            <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={createInvite}>
              <label className="min-w-0 w-full flex-1 sm:min-w-52"><span className="research-label">{t('research.email')}</span><input className="research-field" type="email" value={email} maxLength={320} required autoComplete="email" onChange={event => setEmail(event.target.value)} /></label>
              <label><span className="research-label">{t('research.inviteExpiry')}</span><select className="research-field" value={days} onChange={event => setDays(event.target.value)}>{[1, 7, 14, 30].map(value => <option key={value} value={value}>{t('research.inviteDays', { count: value })}</option>)}</select></label>
              <button type="submit" className="research-primary" disabled={busy}><UserPlus size={16} />{t('research.createInvite')}</button>
            </form><p className="research-description mt-2">{t('research.inviteExpiryHint')}</p>
            {shareLink && <div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 p-4" role="status"><p className="text-sm font-semibold text-slate-800">{t('research.shareInviteLink')}</p><p className="mt-1 text-xs text-slate-600">{t('research.shareInviteHint')}</p>{copyError && <p role="alert" className="mt-2 text-sm text-amber-800">{t('research.copyFailed')}</p>}<div className="mt-3 flex flex-wrap gap-2"><input className="research-field min-w-0 flex-1" readOnly value={shareLink} aria-label={t('research.shareInviteLink')} onFocus={event => event.target.select()} /><button type="button" className="research-secondary" onClick={copyLink}><Copy size={15} />{t(copied ? 'research.copied' : 'research.copyLink')}</button></div></div>}
          </section>
          {error && <ErrorState error={error} />}
          <section><h3 className="research-section-heading">{t('research.invitations')}</h3>{invites.isPending ? <Loading /> : invites.isError ? <ErrorState error={invites.error} onRetry={() => invites.refetch()} /> : (invites.data || []).length === 0 ? <p className="mt-3 text-sm text-slate-500">{t('research.noInvitations')}</p> : <ul className="mt-3 divide-y divide-slate-100">{invites.data.map(invite => <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="min-w-0"><p className="break-words text-sm font-semibold [overflow-wrap:anywhere]">{invite.email}</p><p className="text-xs text-slate-500">{t(`research.invite${invitationState(invite)[0].toUpperCase()}${invitationState(invite).slice(1)}`)} · {new Date(invite.expires_at).toLocaleDateString()}</p></div>{invitationState(invite) === 'pending' && <button type="button" className="research-secondary shrink-0" onClick={() => setConfirmation({ kind: 'invite', id: invite.id, label: invite.email })}>{t('research.revokeInvite')}</button>}</li>)}</ul>}</section>
          <section><h3 className="research-section-heading">{t('research.members')}</h3>{members.isPending ? <Loading /> : members.isError ? <ErrorState error={members.error} onRetry={() => members.refetch()} /> : <ul className="mt-3 divide-y divide-slate-100">{(members.data || []).map(member => <li key={member.user_id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="min-w-0"><p className="break-words text-sm font-semibold [overflow-wrap:anywhere]">{member.user_id === userId ? t('research.you') : invites.data?.find(invite => invite.accepted_by === member.user_id)?.email || member.user_id}</p><p className="text-xs text-slate-500">{t(member.role === 'owner' ? 'research.owner' : 'research.member')}</p></div>{member.role !== 'owner' && <button type="button" className="research-secondary shrink-0" aria-label={t('research.removeMember')} onClick={() => setConfirmation({ kind: 'member', id: member.user_id, label: member.user_id })}><Trash2 size={15} />{t('research.removeMember')}</button>}</li>)}</ul>}</section>
        </div>}
      </div>
    )}
  </Modal>;
}
