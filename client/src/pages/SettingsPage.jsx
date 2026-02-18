import React, { useState, useEffect } from 'react';
import { User, Users, Building, Trash2, Mail, Plus, ShieldAlert, CreditCard, Zap, Loader2, Clock } from 'lucide-react';
import ConfirmModal from '../ConfirmModal';
import InfoModal from '../components/common/InfoModal';
import { getAuthToken } from '../services/auth';
import { useWorkspaceLimits } from '../hooks/useQueries';

// Fallback API URL
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5005/api';

const SettingsPage = ({ initialTab = 'workspace', workspace, onUpdateWorkspace, onDeleteWorkspace, userProfile, onUpdateProfile, onOpenPricing, onLimitReached }) => {
  // 1. Real Role Check
  const isOwner = workspace?.role === 'owner';

  // 2. Логіка Вкладок (Tabs Logic)
  const TABS = [
    { id: 'workspace', label: 'Workspace', restricted: true },
    { id: 'team', label: 'Team', restricted: true },
    { id: 'profile', label: 'Profile', restricted: false },
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
  const [profileColor, setProfileColor] = useState('bg-blue-100 text-blue-600');

  useEffect(() => {
    if (userProfile) {
        setProfileName(userProfile.full_name || '');
        setProfileColor(userProfile.avatar_color || 'bg-blue-100 text-blue-600');
    }
  }, [userProfile]);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const { data: limitsData } = useWorkspaceLimits(workspace?.id);
  const limits = limitsData?.limits;
  const usage = limits?.usage ?? { members: 0, journeys: 0, personas: 0, metrics: 0 };
  const maxMembers = limits?.maxMembers ?? null;
  const maxJ = limits?.maxJourneys ?? null;
  const maxP = limits?.maxPersonas ?? null;
  const maxM = limits?.maxMetrics ?? null;

  const AVATAR_COLORS = [
    'bg-blue-100 text-blue-600',
    'bg-green-100 text-green-600',
    'bg-purple-100 text-purple-600',
    'bg-orange-100 text-orange-600',
    'bg-pink-100 text-pink-600',
  ];

  // Fetch Team Data
  useEffect(() => {
    if (activeTab === 'team' && isOwner) {
        fetchTeam();
    }
  }, [activeTab, isOwner]);

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
              setInfoModal({ open: true, title: 'Запрошення надіслано', message: data.message || 'Invite sent successfully!', variant: 'success' });
              fetchTeam();
          } else {
              setInfoModal({ open: true, title: 'Помилка', message: data.error || data.message || 'Failed to invite user', variant: 'error' });
          }
      } catch (e) {
          console.error(e);
          setInfoModal({ open: true, title: 'Помилка', message: 'Failed to send invite. Please try again.', variant: 'error' });
      } finally {
          setIsInviting(false);
      }
  };

  const getInitials = (name) => {
      if (!name) return 'U';
      return name
        .trim()
        .split(' ')
        .map(n => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
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
          setInfoModal({ open: true, title: 'Помилка', message: json.error || 'Failed to cancel invite', variant: 'error' });
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
          setInfoModal({ open: true, title: 'Помилка', message: json.error || 'Failed to remove member', variant: 'error' });
        }
      }
    } catch (e) {
      console.error(e);
      setInfoModal({ open: true, title: 'Помилка', message: 'Request failed', variant: 'error' });
    } finally {
      setTeamActionLoading(false);
    }
  };

  return (
    <div className="p-8 bg-gray-50 min-h-screen font-sans text-gray-900">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
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
            {tab.label}
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
              <h2 className="text-xl font-bold text-gray-900">Access Denied</h2>
              <p>You don't have permission to view this tab.</p>
           </div>
        )}

        {/* WORKSPACE TAB */}
        {activeTab === 'workspace' && allowedTabs.find(t => t.id === 'workspace') && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Building size={20} className="text-gray-400" /> Workspace General
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Workspace Name</label>
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
                  Save Changes
                </button>
              </div>
            </section>

            <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                    <CreditCard size={20} className="text-gray-400" /> Subscription & Billing
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Current Plan</div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg font-bold text-gray-900">{limits?.planName ?? '—'}</span>
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded-full uppercase">Active</span>
                        </div>
                        {limits?.currentPeriodEnd && (
                            <div className="text-sm text-gray-500">
                                Renews {new Date(limits.currentPeriodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </div>
                        )}
                        {!limits?.planName && (
                            <div className="text-sm text-gray-500">No plan assigned</div>
                        )}
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 space-y-3">
                        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Usage (this workspace)</div>
                        {[
                            { label: 'Members', used: usage.members, max: maxMembers },
                            { label: 'Journeys', used: usage.journeys, max: maxJ },
                            { label: 'Personas', used: usage.personas, max: maxP },
                            { label: 'Metrics', used: usage.metrics, max: maxM },
                        ].map(({ label, used, max }) => (
                            <div key={label}>
                                <div className="flex justify-between text-xs text-gray-600 mb-1">
                                    <span>{label}</span>
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
                            <div className="text-sm text-gray-500">Want to unlock more features?</div>
                            <button 
                                onClick={() => onOpenPricing?.()}
                                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-medium shadow-md hover:shadow-lg hover:from-purple-700 hover:to-indigo-700 transition-all transform hover:-translate-y-0.5"
                            >
                                <Zap size={16} fill="currentColor" /> Upgrade Plan
                            </button>
                        </>
                    ) : (
                        <div className="text-sm text-gray-500">
                            Plan is managed by the workspace owner. Contact the owner to change the plan.
                        </div>
                    )}
                </div>
            </section>

            <section className="bg-white rounded-xl shadow-sm border border-red-100 p-6">
              <p className="text-sm text-gray-500 mb-4">Once you delete a workspace, there is no going back. Please be certain.</p>
              <button 
                onClick={() => setIsDeleteModalOpen(true)}
                className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-100 transition"
              >
                Delete Workspace
              </button>
            </section>
          </div>
        )}

        {/* TEAM TAB */}
        {activeTab === 'team' && allowedTabs.find(t => t.id === 'team') && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
               <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Users size={20} className="text-gray-400" /> Team Members
              </h2>
              
              <div className="flex gap-2 mb-6">
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input 
                    placeholder="Enter email to invite..."
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
                  {isInviting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Invite
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
                        <div className="text-sm font-medium text-gray-900">{member.full_name || member.email || 'Member'}</div>
                        <div className="text-xs text-gray-500">{member.role}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs px-2 py-1 rounded-full font-medium bg-green-50 text-green-700">
                        Active
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
                        <div className="text-xs text-gray-500 flex items-center gap-1"><Clock size={10} /> Pending Invite</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs px-2 py-1 rounded-full font-medium bg-yellow-50 text-yellow-700">
                        Pending
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
             <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                <User size={20} className="text-gray-400" /> Personal Profile
              </h2>

              <div className="flex items-start gap-8">
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700">Avatar</label>
                  <div className={`w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold border-4 border-white shadow-sm ${profileColor}`}>
                    {getInitials(profileName || userProfile?.email)}
                  </div>
                  <div className="flex gap-2 justify-center">
                    {AVATAR_COLORS.map(color => (
                      <button
                        key={color}
                        onClick={() => setProfileColor(color)}
                        className={`w-6 h-6 rounded-full border border-gray-200 cursor-pointer ${color.split(' ')[0]} ${profileColor === color ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex-1 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                    <input 
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition"
                      placeholder="Your Name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                    <input 
                      value={userProfile?.email || ''}
                      disabled
                      className="w-full px-3 py-2 border border-gray-200 bg-gray-50 text-gray-500 rounded-lg outline-none cursor-not-allowed"
                    />
                  </div>
                  <div className="pt-2">
                    <button 
                        onClick={() => onUpdateProfile && onUpdateProfile(profileName, profileColor)}
                        className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition"
                    >
                      Update Profile
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>

      <ConfirmModal 
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={async () => {
          if (workspace?.id && onDeleteWorkspace) {
            const ok = await onDeleteWorkspace(workspace.id);
            if (ok) setIsDeleteModalOpen(false);
          }
        }}
        title="Delete Workspace?"
        message="Are you sure you want to delete this workspace? All data will be permanently lost."
        isDestructive={true}
      />

      <ConfirmModal
        isOpen={!!teamConfirm}
        onClose={() => !teamActionLoading && setTeamConfirm(null)}
        onConfirm={handleTeamConfirmAction}
        title={teamConfirm?.type === 'cancelInvite' ? 'Cancel invite?' : 'Remove from workspace?'}
        message={
          teamConfirm?.type === 'cancelInvite'
            ? `Cancel the invite for ${teamConfirm.invite?.email}? They will no longer be able to join via this link.`
            : `Remove ${teamConfirm?.member?.full_name || teamConfirm?.member?.email || 'this member'} from the workspace? They will lose access immediately.`
        }
        confirmText={teamActionLoading ? '...' : (teamConfirm?.type === 'cancelInvite' ? 'Cancel invite' : 'Remove')}
        isDestructive={true}
      />

      <InfoModal
        isOpen={infoModal.open}
        onClose={() => setInfoModal((p) => ({ ...p, open: false }))}
        title={infoModal.title}
        message={infoModal.message}
        buttonText="OK"
        variant={infoModal.variant || 'success'}
      />
    </div>
  );
};

export default SettingsPage;