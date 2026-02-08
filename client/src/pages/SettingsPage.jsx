import React, { useState, useEffect } from 'react';
import { User, Users, Building, Trash2, Mail, Plus, ShieldAlert, CreditCard, Zap } from 'lucide-react';
import ConfirmModal from '../ConfirmModal';
import PricingModal from '../components/common/PricingModal';

const SettingsPage = ({ initialTab = 'workspace' }) => {
  // 1. Mock User State (RBAC)
  // Змінюй це значення ('admin' | 'editor' | 'viewer') щоб тестувати UI
  const CURRENT_USER_ROLE = 'admin'; 

  // 2. Логіка Вкладок (Tabs Logic)
  const TABS = [
    { id: 'workspace', label: 'Workspace', allowedRoles: ['admin'] },
    { id: 'team', label: 'Team', allowedRoles: ['admin'] },
    { id: 'profile', label: 'Profile', allowedRoles: ['admin', 'editor', 'viewer'] },
  ];

  const allowedTabs = TABS.filter(tab => tab.allowedRoles.includes(CURRENT_USER_ROLE));

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
  const [workspaceName, setWorkspaceName] = useState('My Awesome Workspace');
  const [teamMembers, setTeamMembers] = useState([
    { id: 1, email: 'alex@example.com', role: 'Admin', status: 'Active' },
    { id: 2, email: 'sarah@example.com', role: 'Editor', status: 'Active' },
    { id: 3, email: 'mike@example.com', role: 'Viewer', status: 'Pending' },
  ]);
  const [inviteEmail, setInviteEmail] = useState('');
  
  const [profile, setProfile] = useState({
    name: 'New Account',
    email: 'user@example.com',
    color: 'bg-blue-100 text-blue-600'
  });
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isPricingOpen, setIsPricingOpen] = useState(false);

  const AVATAR_COLORS = [
    'bg-blue-100 text-blue-600',
    'bg-green-100 text-green-600',
    'bg-purple-100 text-purple-600',
    'bg-orange-100 text-orange-600',
    'bg-pink-100 text-pink-600',
  ];

  const handleInvite = () => {
    if(!inviteEmail) return;
    setTeamMembers([...teamMembers, { id: Date.now(), email: inviteEmail, role: 'Viewer', status: 'Pending' }]);
    setInviteEmail('');
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
            className={`px-6 py-3 text-sm font-medium transition-colors relative ${
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
                <button className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
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
                            <span className="text-lg font-bold text-gray-900">Free Trial</span>
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded-full uppercase">Active</span>
                        </div>
                        <div className="text-sm text-gray-500">Trial ends in 14 days</div>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 flex flex-col justify-center">
                        <div className="flex justify-between text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                            <span>Seat Usage</span>
                            <span>2 of 5 used</span>
                        </div>
                        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 w-2/5 rounded-full"></div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                    <div className="text-sm text-gray-500">
                        Want to unlock more features?
                    </div>
                    <button 
                        onClick={() => setIsPricingOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-medium shadow-md hover:shadow-lg hover:from-purple-700 hover:to-indigo-700 transition-all transform hover:-translate-y-0.5"
                    >
                        <Zap size={16} fill="currentColor" /> Upgrade Plan
                    </button>
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
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition flex items-center gap-2"
                >
                  <Plus size={16} /> Invite
                </button>
              </div>

              <div className="space-y-1">
                {teamMembers.map(member => (
                  <div key={member.id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold text-xs">
                        {member.email[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{member.email}</div>
                        <div className="text-xs text-gray-500">{member.role}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${member.status === 'Active' ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
                        {member.status}
                      </span>
                      <button className="text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition">
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
                  <div className={`w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold border-4 border-white shadow-sm ${profile.color}`}>
                    {profile.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex gap-2 justify-center">
                    {AVATAR_COLORS.map(color => (
                      <button
                        key={color}
                        onClick={() => setProfile({ ...profile, color })}
                        className={`w-6 h-6 rounded-full border border-gray-200 ${color.split(' ')[0]} ${profile.color === color ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex-1 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                    <input 
                      value={profile.name}
                      onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                    <input 
                      value={profile.email}
                      onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition"
                    />
                  </div>
                  <div className="pt-2">
                    <button className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
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
        onConfirm={() => { alert('Workspace deleted (simulated)'); setIsDeleteModalOpen(false); }}
        title="Delete Workspace?"
        message="Are you sure you want to delete this workspace? All data will be permanently lost."
        isDestructive={true}
      />

      <PricingModal isOpen={isPricingOpen} onClose={() => setIsPricingOpen(false)} />
    </div>
  );
};

export default SettingsPage;