import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { User, Users, Building, Trash2, Mail, Plus, ShieldAlert, CreditCard, Zap, Loader2, Clock, ChevronDown, Link2, X } from 'lucide-react';
import ConfirmModal from '../ConfirmModal';
import InfoModal from '../components/common/InfoModal';
import { getAuthToken } from '../services/auth';
import { useWorkspaceLimits } from '../hooks/useQueries';
import i18n, { setLocale } from '../i18n';

// Fallback API URL
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5005/api';

const SettingsPage = ({ initialTab = 'workspace', workspace, onUpdateWorkspace, onDeleteWorkspace, userProfile, onUpdateProfile, onOpenPricing, onLimitReached }) => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  // 1. Real Role Check
  const isOwner = workspace?.role === 'owner';

  // 2. Логіка Вкладок (Tabs Logic)
  const TABS = [
    { id: 'workspace', labelKey: 'settings.workspace', restricted: true },
    { id: 'team', labelKey: 'settings.team', restricted: true },
    { id: 'profile', labelKey: 'settings.profile', restricted: false },
  ];

  const allowedTabs = TABS.filter(tab => !tab.restricted || isOwner);

  const [activeTab, setActiveTab] = useState(() => {
    return allowedTabs.find(t => t.id === initialTab) ? initialTab : allowedTabs[0]?.id;
  });

  // Sync if prop changes (e.g. re-navigation)
  useEffect(() => {
    if (allowedTabs.find(t => t.id === initialTab)) {
      setActiveTab(initialTab);
    } else if (allowedTabs.length > 0) {
      setActiveTab(allowedTabs[0].id);
    }
  }, [initialTab]);

  // Mock Data
  const [workspaceName, setWorkspaceName] = useState(workspace?.name || '');
  
  useEffect(() => {
    if (workspace?.name) setWorkspaceName(workspace.name);
  }, [workspace]);

  // Team Data State
  const [teamData, setTeamData] = useState({ members: [], invites: [] });
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [teamConfirm, setTeamConfirm] = useState(null); // { type: 'cancelInvite', invite } | { type: 'removeMember', member }
  const [teamActionLoading, setTeamActionLoading] = useState(false);
  const [infoModal, setInfoModal] = useState({ open: false, title: '', message: '', variant: 'success' });
  
  const [profileName, setProfileName] = useState(userProfile?.full_name || '');
  const [profileLocale, setProfileLocale] = useState(i18n.language || 'en');

  useEffect(() => {
    if (userProfile) {
        setProfileName(userProfile.full_name || '');
    }
  }, [userProfile]);

  useEffect(() => {
    setProfileLocale(i18n.language || 'en');
  }, [activeTab]);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Profile: integrations for metrics
  const [integrationStatus, setIntegrationStatus] = useState({ google_sheets: false, microsoft_excel: false });
  const [integrationBanner, setIntegrationBanner] = useState(null);
  const [disconnectLoading, setDisconnectLoading] = useState(null); // 'google_sheets' | 'microsoft_excel' | null
  const [disconnectConfirm, setDisconnectConfirm] = useState(null); // { provider, label } | null

  const { data: limitsData } = useWorkspaceLimits(workspace?.id);
  const limits = limitsData?.limits;
  const usage = limits?.usage ?? { members: 0, journeys: 0, personas: 0, metrics: 0 };
  const maxMembers = limits?.maxMembers ?? null;
  const maxJ = limits?.maxJourneys ?? null;
  const maxP = limits?.maxPersonas ?? null;
  const maxM = limits?.maxMetrics ?? null;

  // Fetch Team Data
  useEffect(() => {
    if (activeTab === 'team' && isOwner) {
        fetchTeam();
    }
  }, [activeTab, isOwner]);

  // Profile: handle ?integration=connected|error from OAuth callback
  useEffect(() => {
    const integration = searchParams.get('integration');
    if (integration === 'connected') {
      setIntegrationBanner({ type: 'success', text: t('settings.integrationConnected') });
      setSearchParams((p) => { p.delete('integration'); p.delete('message'); return p; }, { replace: true });
    } else if (integration === 'error') {
      const message = searchParams.get('message') || t('settings.integrationError');
      setIntegrationBanner({ type: 'error', text: message });
      setSearchParams((p) => { p.delete('integration'); p.delete('message'); return p; }, { replace: true });
    }
  }, [searchParams, setSearchParams, t]);

  // Profile: fetch integration status when profile tab is active
  useEffect(() => {
    if (activeTab !== 'profile') return;
    let cancelled = false;
    (async () => {
      const token = await getAuthToken();
      if (!token) return;
      try {
        const res = await fetch(`${API_URL}/integrations/status`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (cancelled) return;
        if (data.status === 'success' && data.data)
          setIntegrationStatus({ google_sheets: !!data.data.google_sheets, microsoft_excel: !!data.data.microsoft_excel });
      } catch (e) { if (!cancelled) setIntegrationStatus({ google_sheets: false, microsoft_excel: false }); }
    })();
    return () => { cancelled = true; };
  }, [activeTab]);

  const fetchTeam = async () => {
      const token = await getAuthToken();
      try {
          const res = await fetch(`${API_URL}/workspace/team?workspaceId=${workspace?.id}`, { headers: { 'Authorization': `Bearer ${token}` } });
          const json = await res.json();
          if (json.status === 'success') setTeamData(json.data);
      } catch (e) { console.error(e); }
  };

  const handleInvite = async () => {
      if (!inviteEmail) return;
      setIsInviting(true);
      const token = await getAuthToken();
      try {
          // Додаємо workspaceId в URL query string, оскільки middleware авторизації може очікувати його саме там
          const res = await fetch(`${API_URL}/workspace/invite?workspaceId=${workspace?.id}&workspace_id=${workspace?.id}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ 
                email: inviteEmail,
                workspaceId: workspace?.id,
                workspace_id: workspace?.id
              })
          });
          const data = await res.json().catch(() => ({}));
          if (res.status === 403 && data.code === 'LIMIT_REACHED' && data.limit === 'members') {
              onLimitReached?.(data.limit);
              return;
          }
          if (res.ok && (data.status === 'success' || data.message)) {
              setInviteEmail('');
              setInfoModal({ open: true, title: t('settings.inviteSent'), message: data.message || t('settings.inviteSentMessage'), variant: 'success' });
              fetchTeam();
          } else {
              setInfoModal({ open: true, title: t('settings.errorTitle'), message: data.error || data.message || t('settings.failedInviteUser'), variant: 'error' });
          }
      } catch (e) {
          console.error(e);
          setInfoModal({ open: true, title: t('settings.errorTitle'), message: t('settings.failedSendInvite'), variant: 'error' });
      } finally {
          setIsInviting(false);
      }
  };

  const handleCancelInviteClick = (invite) => {
    setTeamConfirm({ type: 'cancelInvite', invite });
  };

  const handleRemoveMemberClick = (member) => {
    setTeamConfirm({ type: 'removeMember', member });
  };

  const handleTeamConfirmAction = async () => {
    if (!teamConfirm || teamActionLoading) return;
    const token = await getAuthToken();
    setTeamActionLoading(true);
    try {
      if (teamConfirm.type === 'cancelInvite') {
        const res = await fetch(`${API_URL}/workspace/invite/${teamConfirm.invite.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (res.ok) {
          setTeamConfirm(null);
          fetchTeam();
        } else {
          setInfoModal({ open: true, title: t('settings.errorTitle'), message: json.error || t('settings.failedCancelInvite'), variant: 'error' });
        }
      } else {
        const res = await fetch(`${API_URL}/workspace/member/${teamConfirm.member.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (res.ok) {
          setTeamConfirm(null);
          fetchTeam();
        } else {
          setInfoModal({ open: true, title: t('settings.errorTitle'), message: json.error || t('settings.failedRemoveMember'), variant: 'error' });
        }
      }
    } catch (e) {
      console.error(e);
      setInfoModal({ open: true, title: t('settings.errorTitle'), message: t('settings.requestFailed'), variant: 'error' });
    } finally {
      setTeamActionLoading(false);
    }
  };

  const handleConnectIntegration = async (provider) => {
    const token = await getAuthToken();
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/integrations/${provider}/authorize?returnPath=settings`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.redirectUrl) window.location.href = data.redirectUrl;
      else setIntegrationBanner({ type: 'error', text: data.error || data.message || t('settings.integrationError') });
    } catch (e) {
      setIntegrationBanner({ type: 'error', text: e.message || t('settings.integrationError') });
    }
  };

  const handleDisconnectIntegration = async (provider) => {
    if (!disconnectConfirm || disconnectConfirm.provider !== provider) return;
    setDisconnectLoading(provider);
    const token = await getAuthToken();
    try {
      const res = await fetch(`${API_URL}/integrations/${provider}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setIntegrationStatus((prev) => ({ ...prev, [provider]: false }));
        setIntegrationBanner({ type: 'success', text: t('settings.integrationDisconnected') });
        setDisconnectConfirm(null);
      } else {
        setIntegrationBanner({ type: 'error', text: data.message || t('settings.integrationError') });
      }
    } catch (e) {
      setIntegrationBanner({ type: 'error', text: e.message || t('settings.integrationError') });
    } finally {
      setDisconnectLoading(null);
    }
  };

  return (
    <div className="p-8 bg-gray-50 min-h-screen font-sans text-gray-900">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">{t('settings.settings')}</h1>
      </header>

      {/* Tabs Navigation */}
      <div className="flex border-b border-gray-200 mb-8">
        {allowedTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-6 py-3 text-sm font-medium transition-colors relative cursor-pointer ${
              activeTab === tab.id 
                ? 'text-blue-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t(tab.labelKey)}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-full"></div>
            )}
          </button>
        ))}
      </div>

      <div className="max-w-2xl">
        {/* Security Check for Content */}
        {!allowedTabs.find(t => t.id === activeTab) && (
           <div className="p-8 flex flex-col items-center justify-center text-center text-gray-500 bg-gray-50 rounded-xl border border-gray-200 border-dashed">
              <ShieldAlert size={48} className="mb-4 text-gray-300" />
              <h2 className="text-xl font-bold text-gray-900">{t('settings.accessDenied')}</h2>
              <p>{t('settings.noPermission')}</p>
           </div>
        )}

        {/* WORKSPACE TAB */}
        {activeTab === 'workspace' && allowedTabs.find(t => t.id === 'workspace') && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Building size={20} className="text-gray-400" /> {t('settings.workspaceGeneral')}
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.workspaceName')}</label>
                  <input 
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition"
                  />
                </div>
                <button 
                  onClick={() => onUpdateWorkspace && onUpdateWorkspace(workspaceName)}
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition"
                >
                  {t('settings.saveChanges')}
                </button>
              </div>
            </section>

            <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                    <CreditCard size={20} className="text-gray-400" /> {t('settings.subscriptionBilling')}
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                        <div className="text-xs font-bold text-gray-500 mb-1">{t('settings.currentPlan')}</div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg font-bold text-gray-900">{limits?.planName ?? '—'}</span>
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded-full">{t('settings.active')}</span>
                        </div>
                        {limits?.currentPeriodEnd && (
                            <div className="text-sm text-gray-500">
                                {t('settings.renews')} {new Date(limits.currentPeriodEnd).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                            </div>
                        )}
                        {!limits?.planName && (
                            <div className="text-sm text-gray-500">{t('settings.noPlanAssigned')}</div>
                        )}
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 space-y-3">
                        <div className="text-xs font-bold text-gray-500 mb-2">{t('settings.usage')}</div>
                        {[
                            { labelKey: 'settings.members', used: usage.members, max: maxMembers },
                            { labelKey: 'settings.journeys', used: usage.journeys, max: maxJ },
                            { labelKey: 'settings.personas', used: usage.personas, max: maxP },
                            { labelKey: 'settings.metrics', used: usage.metrics, max: maxM },
                        ].map(({ labelKey, used, max }) => (
                            <div key={labelKey}>
                                <div className="flex justify-between text-xs text-gray-600 mb-1">
                                    <span>{t(labelKey)}</span>
                                    <span>{max != null ? `${used} of ${max}` : `${used} used`}</span>
                                </div>
                                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-blue-500 rounded-full transition-all" 
                                        style={{ width: max != null && max > 0 ? `${Math.min(100, (used / max) * 100)}%` : '0%' }} 
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                    {isOwner ? (
                        <>
                            <div className="text-sm text-gray-500">{t('settings.wantToUnlockMore')}</div>
                            <button 
                                onClick={() => onOpenPricing?.()}
                                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-medium shadow-md hover:shadow-lg hover:from-purple-700 hover:to-indigo-700 transition-all transform hover:-translate-y-0.5"
                            >
                                <Zap size={16} fill="currentColor" /> {t('settings.upgradePlan')}
                            </button>
                        </>
                    ) : (
                        <div className="text-sm text-gray-500">
                            {t('settings.planManagedByOwner')}
                        </div>
                    )}
                </div>
            </section>

            <section className="bg-white rounded-xl shadow-sm border border-red-100 p-6">
              <p className="text-sm text-gray-500 mb-4">{t('settings.deleteWorkspaceWarning')}</p>
              <button 
                onClick={() => setIsDeleteModalOpen(true)}
                className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-100 transition"
              >
                {t('settings.deleteWorkspaceButton')}
              </button>
            </section>
          </div>
        )}

        {/* TEAM TAB */}
        {activeTab === 'team' && allowedTabs.find(t => t.id === 'team') && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
               <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Users size={20} className="text-gray-400" /> {t('settings.teamMembers')}
              </h2>
              
              <div className="flex gap-2 mb-6">
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input 
                    placeholder={t('settings.inviteEmailPlaceholder', 'Enter email to invite...')}
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  />
                </div>
                <button 
                  onClick={handleInvite}
                  disabled={isInviting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition flex items-center gap-2 disabled:opacity-70"
                >
                  {isInviting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} {t('settings.inviteButton')}
                </button>
              </div>

              <div className="space-y-1">
                {/* Active Members */}
                {teamData.members.map(member => (
                  <div key={member.id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold text-xs">
                        {(member.full_name || member.email || 'M')[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{member.full_name || member.email || t('nav.member')}</div>
                        <div className="text-xs text-gray-500">{member.role === 'owner' ? t('nav.owner') : t('nav.member')}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs px-2 py-1 rounded-full font-medium bg-green-50 text-green-700">
                        {t('settings.active')}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveMemberClick(member)}
                        className="text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition"
                        aria-label="Remove from workspace"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Pending Invites */}
                {teamData.invites.map(invite => (
                  <div key={invite.id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition group border border-dashed border-gray-200">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-400">
                        <Mail size={14} />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{invite.email}</div>
                        <div className="text-xs text-gray-500 flex items-center gap-1"><Clock size={10} /> {t('settings.pendingInvite')}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs px-2 py-1 rounded-full font-medium bg-yellow-50 text-yellow-700">
                        {t('settings.pending')}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCancelInviteClick(invite)}
                        className="text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition"
                        aria-label="Cancel invite"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* PROFILE TAB */}
        {activeTab === 'profile' && allowedTabs.find(t => t.id === 'profile') && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {integrationBanner && (
              <div className={`px-4 py-3 rounded-lg flex items-center justify-between ${integrationBanner.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                <span>{integrationBanner.text}</span>
                <button type="button" onClick={() => setIntegrationBanner(null)} className="p-1 hover:opacity-70"><X size={18} /></button>
              </div>
            )}
             <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                <User size={20} className="text-gray-400" /> {t('settings.personalProfile')}
              </h2>

              <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.displayName')}</label>
                    <input 
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition"
                      placeholder={t('settings.yourName')}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.emailAddress')}</label>
                    <input 
                      value={userProfile?.email || ''}
                      disabled
                      className="w-full px-3 py-2 border border-gray-200 bg-gray-50 text-gray-500 rounded-lg outline-none cursor-not-allowed"
                    />
                  </div>
                  <div className="pt-4 mt-4 border-t border-gray-100">
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('settings.interfaceLanguage')}</label>
                    <div className="relative max-w-xs">
                      <select
                        value={profileLocale}
                        onChange={(e) => setProfileLocale(e.target.value)}
                        className="w-full pl-3 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition bg-white appearance-none"
                      >
                        <option value="en">{t('settings.english')}</option>
                        <option value="uk">{t('settings.ukrainian')}</option>
                      </select>
                      <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                    </div>
                  </div>
                  <div className="pt-4">
                    <button 
                        onClick={async () => {
                          if (onUpdateProfile) await onUpdateProfile(profileName, 'bg-blue-100 text-blue-600');
                          setLocale(profileLocale, true);
                        }}
                        className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition"
                    >
                      {t('settings.updateProfile')}
                    </button>
                  </div>
              </div>
            </section>

            <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold mb-6">{t('settings.connectedServicesForMetrics')}</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-700">{t('metrics.googleSheets')}</span>
                  {integrationStatus.google_sheets ? (
                    <button type="button" onClick={() => setDisconnectConfirm({ provider: 'google_sheets', label: t('metrics.googleSheets') })} disabled={disconnectLoading !== null} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition disabled:opacity-50">
                      {disconnectLoading === 'google_sheets' ? <Loader2 size={16} className="animate-spin" /> : null} {t('settings.disconnect')}
                    </button>
                  ) : (
                    <button type="button" onClick={() => handleConnectIntegration('google_sheets')} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition">
                      <Link2 size={16} /> {t('settings.connect')}
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-700">{t('metrics.microsoftExcel')}</span>
                  {integrationStatus.microsoft_excel ? (
                    <button type="button" onClick={() => setDisconnectConfirm({ provider: 'microsoft_excel', label: t('metrics.microsoftExcel') })} disabled={disconnectLoading !== null} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition disabled:opacity-50">
                      {disconnectLoading === 'microsoft_excel' ? <Loader2 size={16} className="animate-spin" /> : null} {t('settings.disconnect')}
                    </button>
                  ) : (
                    <button type="button" onClick={() => handleConnectIntegration('microsoft_excel')} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition">
                      <Link2 size={16} /> {t('settings.connect')}
                    </button>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!disconnectConfirm}
        onClose={() => !disconnectLoading && setDisconnectConfirm(null)}
        onConfirm={() => disconnectConfirm && handleDisconnectIntegration(disconnectConfirm.provider)}
        title={t('settings.disconnect')}
        message={disconnectConfirm ? t('settings.integrationDisconnected') : ''}
        confirmText={disconnectLoading ? '...' : t('settings.disconnect')}
        isDestructive={true}
      />

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={async () => {
          if (workspace?.id && onDeleteWorkspace) {
            const ok = await onDeleteWorkspace(workspace.id);
            if (ok) setIsDeleteModalOpen(false);
          }
        }}
        title={t('settings.deleteWorkspace')}
        message={t('settings.deleteWorkspaceMessage')}
        isDestructive={true}
      />

      <ConfirmModal
        isOpen={!!teamConfirm}
        onClose={() => !teamActionLoading && setTeamConfirm(null)}
        onConfirm={handleTeamConfirmAction}
        title={teamConfirm?.type === 'cancelInvite' ? t('settings.cancelInvite') : t('settings.removeMember')}
        message={
          teamConfirm?.type === 'cancelInvite'
            ? t('settings.cancelInviteMessage', { email: teamConfirm.invite?.email })
            : t('settings.removeMemberMessage', { name: teamConfirm?.member?.full_name || teamConfirm?.member?.email || 'this member' })
        }
        confirmText={teamActionLoading ? '...' : (teamConfirm?.type === 'cancelInvite' ? t('settings.cancelInviteButton') : t('settings.removeButton'))}
        isDestructive={true}
      />

      <InfoModal
        isOpen={infoModal.open}
        onClose={() => setInfoModal((p) => ({ ...p, open: false }))}
        title={infoModal.title}
        message={infoModal.message}
        buttonText={t('settings.ok')}
        variant={infoModal.variant || 'success'}
      />
    </div>
  );
};

export default SettingsPage;