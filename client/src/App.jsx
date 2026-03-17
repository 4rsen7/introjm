import { useState, useEffect, useMemo, useLayoutEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Routes, Route, useNavigate, useLocation, Navigate, Outlet, useParams } from 'react-router-dom'
import { LayoutGrid, Map, Users, BarChart3, Settings, Archive as ArchiveIcon, ChevronDown, LogOut, Mic } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Editor from './pages/Editor'
import Personas from './pages/Personas'
import PersonaModal from './components/personas/PersonaModal'
import JourneyMaps from './pages/JourneyMaps'
import Metrics from './pages/Metrics'
import MetricBuilder from './pages/MetricBuilder'
import InterviewsList from './pages/InterviewsList'
import InterviewRoom from './pages/InterviewRoom'
import SettingsPage from './pages/SettingsPage'
import ArchivePage from './pages/ArchivePage'
import AuthPage from './pages/AuthPage'
import LandingPage from './pages/LandingPage'
import TermsPage from './pages/TermsPage'
import PrivacyPage from './pages/PrivacyPage'
import PricingModal from './components/common/PricingModal'
import SupportFeedback from './components/common/SupportFeedback'
import { clearStoredAuthState, getActiveSession, getAuthToken, persistStoredAuthState } from './services/auth'
import { supabase } from './supabaseClient'
import { useQueryClient } from '@tanstack/react-query'
import { useJourneys, usePersonas, useMetrics, useInterviews, useWorkspace, useWorkspaceList, useWorkspaceLimits, useProfile, mapPersonaToClient, mapMetricToClient } from './hooks/useQueries'

const SELECTED_WORKSPACE_KEY = 'selectedWorkspaceId';

// Fallback to localhost:5005 if env var is missing
const API_URL = '/api';

const PUBLIC_PATHS = new Set(['/landing', '/auth', '/terms', '/privacy']);

const isPublicPath = (path) => PUBLIC_PATHS.has(path);

const ProtectedOutlet = ({ authReady, isAuthenticated }) => {
  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-orange-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/auth" replace />;
  return <Outlet />;
};

// Helper wrapper for editing metrics
const MetricEditorWrapper = ({ metrics, onSave, onBack, onSyncSuccess, currentUserId }) => {
  const { id } = useParams();
  const metric = metrics.find(m => m.id.toString() === id);
  return <MetricBuilder initialData={metric} onSave={onSave} onBack={onBack} onSyncSuccess={onSyncSuccess} currentUserId={currentUserId} />;
};

// --- ВИПРАВЛЕННЯ: MainLayout винесено за межі App ---
const MainLayout = ({ 
  isWorkspaceExpanded, 
  setIsWorkspaceExpanded, 
  currentWorkspace, 
  workspaces = [],
  onSwitchWorkspace,
  userProfile, 
  planName,
  isNavigating, 
  setSettingsTab 
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const getUserInitials = () => {
      const name = userProfile?.full_name || userProfile?.email || '';
      if (!name) return 'NA';
      return name.trim().split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  };

  return (
      <div className="flex h-screen bg-[#F3F4F6] font-sans text-gray-900">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shadow-sm z-10">
        <div className="p-6 flex items-center gap-3">
          <img src="/logo.svg" alt="IteroJM" className="w-8 h-8 rounded-lg object-contain shrink-0" />
          <span className="text-xl font-bold tracking-tight text-gray-900">IteroJM</span>
        </div>
        
        <nav className="flex-1 px-3 space-y-6 overflow-y-auto py-4">
          <div className="space-y-1">
            <MenuItem icon={LayoutGrid} label={t('nav.dashboard')} isActive={location.pathname === '/dashboard'} onClick={() => navigate('/dashboard')} />
          </div>
          <div>
            <div className="relative">
              <div 
                className="px-3 mb-2 text-xs font-semibold text-gray-400 flex justify-between items-center cursor-pointer hover:text-gray-600 select-none"
                onClick={() => workspaces.length > 1 ? setSwitcherOpen((o) => !o) : setIsWorkspaceExpanded(!isWorkspaceExpanded)}
                data-testid="workspace-switcher-toggle"
              >
                <span className="truncate flex-1" data-testid="current-workspace-label">{currentWorkspace?.name || t('nav.workspace')}</span>
                <ChevronDown 
                  size={14} 
                  className={`flex-shrink-0 ml-1 transition-transform duration-500 ${(workspaces.length > 1 ? switcherOpen : isWorkspaceExpanded) ? '' : '-rotate-90'}`} 
                  style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
                />
              </div>
              {switcherOpen && workspaces.length > 1 && (
                <div className="fixed inset-0 z-20 cursor-pointer" onClick={() => setSwitcherOpen(false)} aria-hidden="true" />
              )}
              {workspaces.length > 1 && (
                <div 
                  className="grid overflow-hidden transition-all duration-500 z-30 relative"
                  style={{ 
                    gridTemplateRows: switcherOpen ? '1fr' : '0fr',
                    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
                    transitionProperty: 'grid-template-rows'
                  }}
                >
                  <div className="overflow-hidden min-h-0">
                    <div 
                      className="mt-0.5 bg-white border border-gray-200 rounded-lg shadow-lg py-1 max-h-48 overflow-y-auto transition-all duration-500"
                      style={{
                        opacity: switcherOpen ? 1 : 0,
                        transform: switcherOpen ? 'translateY(0)' : 'translateY(-0.5rem)',
                        transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)'
                      }}
                    >
                      {workspaces.map((ws) => (
                        <button
                          key={ws.id}
                          type="button"
                          onClick={() => { onSwitchWorkspace(ws.id); setSwitcherOpen(false); }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex justify-between items-center ${currentWorkspace?.id === ws.id ? 'bg-orange-50 text-orange-700 font-medium' : 'text-gray-700'}`}
                          data-testid="workspace-option"
                          data-workspace-name={ws.name}
                        >
                          <span className="truncate">{ws.name}</span>
                          <span className="text-xs text-gray-400 ml-2 flex-shrink-0">{ws.role === 'owner' ? t('nav.owner') : t('nav.member')}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div 
              className="grid transition-all duration-500"
              style={{ 
                gridTemplateRows: isWorkspaceExpanded ? '1fr' : '0fr',
                transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
                transitionProperty: 'grid-template-rows'
              }}
            >
              <div className="overflow-hidden">
                <div 
                  className="space-y-1 transition-all duration-500"
                  style={{
                    opacity: isWorkspaceExpanded ? 1 : 0,
                    transform: isWorkspaceExpanded ? 'translateY(0)' : 'translateY(-0.5rem)',
                    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)'
                  }}
                >
                  <MenuItem icon={Map} label={t('nav.journeyMaps')} isActive={location.pathname === '/journeys'} onClick={() => navigate('/journeys')} />
                  <MenuItem icon={Users} label={t('nav.personas')} isActive={location.pathname === '/personas'} onClick={() => navigate('/personas')} />
                  <MenuItem icon={BarChart3} label={t('nav.metrics')} isActive={location.pathname.startsWith('/metrics')} onClick={() => navigate('/metrics')} />
                  <MenuItem icon={Mic} label={t('nav.interviews') || 'Interviews'} isActive={location.pathname.startsWith('/interviews')} onClick={() => navigate('/interviews')} />
                  <MenuItem icon={ArchiveIcon} label={t('nav.archive')} isActive={location.pathname === '/archive'} onClick={() => navigate('/archive')} />
                  <MenuItem icon={Settings} label={t('nav.settings')} isActive={location.pathname === '/settings'} onClick={() => { setSettingsTab('workspace'); navigate('/settings'); }} />
                </div>
              </div>
            </div>
          </div>
        </nav>
        
        <div className="p-4 border-t border-gray-100">
          <div 
            className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 cursor-pointer transition"
            onClick={() => { setSettingsTab('profile'); navigate('/settings'); }}
          >
            <div className={`w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center font-bold text-xs ${userProfile?.avatar_color || 'bg-blue-100 text-blue-600'}`}>
                {getUserInitials()}
            </div>
            <div className="flex flex-col">
               <span className="text-sm font-medium text-gray-700 truncate max-w-[140px]">{userProfile?.full_name || userProfile?.email || 'User'}</span>
               <span className="text-xs text-gray-400">{planName || '—'}</span>
            </div>
          </div>
          <button 
            onClick={async () => {
              localStorage.removeItem(SELECTED_WORKSPACE_KEY);
              queryClient.clear();
              clearStoredAuthState();
              navigate('/auth', { replace: true });
              try {
                await supabase.auth.signOut();
              } catch (error) {
                console.error('Error signing out:', error);
              }
            }}
            className="w-full flex items-center gap-3 px-2 py-2 mt-2 rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-600 transition text-sm font-medium"
            data-testid="signout-button"
          >
            <LogOut size={18} />
            <span>{t('common.signOut')}</span>
          </button>
        </div>
      </aside>

      {/* Main Content — vertical scroll for dashboard sections (Editor has its own scroll) */}
      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative">
         {isNavigating && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-white animate-in fade-in duration-200">
                <div className="w-8 h-8 border-2 border-gray-200 border-t-orange-600 rounded-full animate-spin"></div>
            </div>
         )}
         <div className="min-h-full w-full">
            <Outlet />
         </div>
      </main>
      <SupportFeedback />
    </div>
  );
};

function App() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const locationPathRef = useRef(location.pathname);
  const [authReady, setAuthReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    locationPathRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    let active = true;

    const applySession = (session, event = 'INITIAL_SESSION') => {
      if (!active) return;

      if (session?.access_token) {
        persistStoredAuthState(session);
        setIsAuthenticated(true);
        setAuthReady(true);
        return;
      }

      localStorage.removeItem(SELECTED_WORKSPACE_KEY);
      clearStoredAuthState();
      setIsAuthenticated(false);
      setAuthReady(true);

      if (event === 'SIGNED_OUT') {
        queryClient.clear();
      }

      const currentPath = locationPathRef.current;
      if (!isPublicPath(currentPath)) {
        navigate('/auth', { replace: true });
      }
    };

    void getActiveSession().then((session) => {
      applySession(session, 'INITIAL_SESSION');
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED') {
        applySession(session, event);
        return;
      }

      if (event === 'SIGNED_OUT') {
        applySession(null, event);
      }
    });

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, [navigate, queryClient]);

  // Ensure logged-in user has Starter subscription (e.g. after email confirmation)
  const ensureStarterCalledRef = useRef(false);
  useEffect(() => {
    if (!authReady || !isAuthenticated || ensureStarterCalledRef.current) return;

    void (async () => {
      const token = await getAuthToken();
      if (!token) return;
      ensureStarterCalledRef.current = true;
      fetch(`${API_URL}/subscriptions/ensure-starter`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      }).catch(() => {});
    })();
  }, [authReady, isAuthenticated]);

  // Navigation Loading Animation
  useLayoutEffect(() => {
    setIsNavigating(true);
    setLoadingProgress(20);

    const timers = [];

    timers.push(setTimeout(() => setLoadingProgress(70), 200));
    timers.push(setTimeout(() => setLoadingProgress(100), 500));
    
    // Complete navigation immediately after full width
    timers.push(setTimeout(() => {
      setIsNavigating(false);
      // Reset width slightly after fading out
      timers.push(setTimeout(() => setLoadingProgress(0), 150));
    }, 550));

    return () => {
      timers.forEach(clearTimeout);
      setIsNavigating(false);
    };
  }, [location.pathname]);

  // Refetch list data when opening Journeys / Personas / Metrics / Archive so members see updates (e.g. new persona created by owner)
  useEffect(() => {
    const path = location.pathname;
    if (path === '/journeys' || path.startsWith('/journeys/')) {
      queryClient.invalidateQueries({ queryKey: ['journeys'] });
    } else if (path === '/personas') {
      queryClient.invalidateQueries({ queryKey: ['personas'] });
    } else if (path === '/metrics' || path.startsWith('/metrics')) {
      queryClient.invalidateQueries({ queryKey: ['metrics'] });
    } else if (path === '/archive') {
      queryClient.invalidateQueries({ queryKey: ['journeys'] });
      queryClient.invalidateQueries({ queryKey: ['personas'] });
      queryClient.invalidateQueries({ queryKey: ['metrics'] });
    }
  }, [location.pathname, queryClient]);

  // On full page load (F5) invalidate list queries so data refetches instead of using stale persisted cache
  useEffect(() => {
    if (authReady && isAuthenticated) {
      queryClient.invalidateQueries({ queryKey: ['workspace'] });
      queryClient.invalidateQueries({ queryKey: ['workspace_list'] });
      queryClient.invalidateQueries({ queryKey: ['workspace', 'limits'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['journeys'] });
      queryClient.invalidateQueries({ queryKey: ['personas'] });
      queryClient.invalidateQueries({ queryKey: ['metrics'] });
    }
  }, [authReady, isAuthenticated, queryClient]);

  const [activeMenu, setActiveMenu] = useState('dashboard');
  const [isWorkspaceExpanded, setIsWorkspaceExpanded] = useState(true);

  // Global Personas State
  // REPLACED WITH REACT QUERY HOOKS
  const queriesEnabled = authReady && isAuthenticated;
  const { data: globalJourneys = [], isFetched: journeysFetched } = useJourneys(queriesEnabled);
  const { data: globalPersonas = [] } = usePersonas(queriesEnabled);
  const { data: globalMetrics = [] } = useMetrics(queriesEnabled);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(() => localStorage.getItem(SELECTED_WORKSPACE_KEY) || '');
  const workspaces = useWorkspaceList(queriesEnabled).data ?? [];
  const workspaceListInvalidatedRef = useRef(false);

  // If journeys loaded but workspace list is still empty (e.g. GET /api/journeys created workspace after list), refetch list once
  useEffect(() => {
    if (journeysFetched && workspaces.length === 0 && !workspaceListInvalidatedRef.current) {
      workspaceListInvalidatedRef.current = true;
      queryClient.invalidateQueries({ queryKey: ['workspace_list'] });
    }
  }, [journeysFetched, workspaces.length, queryClient]);

  const currentWorkspace = useMemo(() => {
    if (!workspaces.length) return null;
    const found = workspaces.find((w) => w.id === selectedWorkspaceId);
    return found || workspaces[0];
  }, [workspaces, selectedWorkspaceId]);

  const { data: userProfile } = useProfile(queriesEnabled);
  const { data: workspaceLimits } = useWorkspaceLimits(currentWorkspace?.id, queriesEnabled);
  const planName = workspaceLimits?.limits?.planName ?? null;

  useEffect(() => {
    if (workspaces.length > 0 && (!selectedWorkspaceId || !workspaces.some((w) => w.id === selectedWorkspaceId))) {
      const next = workspaces[0].id;
      setSelectedWorkspaceId(next);
      localStorage.setItem(SELECTED_WORKSPACE_KEY, next);
    }
  }, [workspaces, selectedWorkspaceId]);

  const handleSwitchWorkspace = (id) => {
    setSelectedWorkspaceId(id);
    localStorage.setItem(SELECTED_WORKSPACE_KEY, id);
    queryClient.invalidateQueries({ queryKey: ['journeys'] });
    queryClient.invalidateQueries({ queryKey: ['personas'] });
    queryClient.invalidateQueries({ queryKey: ['metrics'] });
    queryClient.invalidateQueries({ queryKey: ['workspace', 'limits'] });
  };

  const filteredJourneys = useMemo(() => 
    currentWorkspace ? globalJourneys.filter((j) => j.workspace_id === currentWorkspace.id) : globalJourneys,
    [globalJourneys, currentWorkspace]
  );
  const filteredPersonas = useMemo(() =>
    currentWorkspace ? globalPersonas.filter((p) => p.workspace_id === currentWorkspace.id) : globalPersonas,
    [globalPersonas, currentWorkspace]
  );
  const filteredMetrics = useMemo(() =>
    currentWorkspace ? globalMetrics.filter((m) => m.workspace_id === currentWorkspace.id) : globalMetrics,
    [globalMetrics, currentWorkspace]
  );
  const { data: globalInterviews = [] } = useInterviews(queriesEnabled);
  const filteredInterviews = useMemo(() =>
    currentWorkspace ? globalInterviews.filter((i) => i.workspace_id === currentWorkspace.id) : globalInterviews,
    [globalInterviews, currentWorkspace]
  );

  const [isPersonaModalOpen, setIsPersonaModalOpen] = useState(false);
  const [editingPersona, setEditingPersona] = useState(null);
  const [limitReached, setLimitReached] = useState({ open: false, limit: null });
  const [showPricingModal, setShowPricingModal] = useState(false);

  // Navigation Loading State
  const [isNavigating, setIsNavigating] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [settingsTab, setSettingsTab] = useState('workspace');

  // Calculate usage stats and linked journeys for personas (per current workspace)
  const personasWithUsage = useMemo(() => {
    return filteredPersonas.map(p => {
      const linked = filteredJourneys.filter(j => {
        let md = j.map_data;
        if (!md) return false;
        if (typeof md === 'string') {
          try { md = JSON.parse(md); } catch { return false; }
        }
        return md?.persona?.id === p.id;
      });
      
      return {
        ...p,
        usedIn: linked.length,
        linkedJourneys: linked.map(j => ({ id: j.id, title: j.title }))
      };
    });
  }, [filteredPersonas, filteredJourneys]);

  // Calculate usage stats for metrics (per current workspace)
  const metricsWithUsage = useMemo(() => {
    return filteredMetrics.map(m => {
      const linked = filteredJourneys.filter(j => {
        let md = j.map_data;
        if (!md) return false;
        if (typeof md === 'string') {
          try { md = JSON.parse(md); } catch { return false; }
        }
        
        if (!md.cells) return false;
        
        // Check if metric is used in any card
        return Object.values(md.cells).some(lane => 
            Object.values(lane).some(col => 
                col.cards?.some(c => c.type === 'metric' && String(c.content) === String(m.id))
            )
        );
      });

      return { 
        ...m, 
        linkedMaps: linked.length,
        linkedJourneys: linked.map(j => ({ id: j.id, title: j.title }))
      };
    });
  }, [filteredMetrics, filteredJourneys]);

  const handleSaveGlobalPersona = async (personaData) => {
      const token = await getAuthToken();
      
      // Determine ID: use passed ID, or fallback to editingPersona.id if available (for App-level modal)
      const id = personaData.id || (editingPersona?.id);

      // Якщо ID числове (Date.now()) або відсутнє - це створення нової персони. UUID - це рядок.
      const isNew = !id || typeof id === 'number';
      
      const dataToSave = { ...personaData };
      if (id) dataToSave.id = id;
      if (isNew && currentWorkspace?.id) dataToSave.workspace_id = currentWorkspace.id;

      try {
          let response;
          if (isNew) {
              // CREATE
              response = await fetch(`${API_URL}/personas`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                  body: JSON.stringify(dataToSave)
              });
          } else {
              // UPDATE
              response = await fetch(`${API_URL}/personas/${id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                  body: JSON.stringify(dataToSave)
              });
          }

          const data = await response.json();
          if (response.status === 403 && data.code === 'LIMIT_REACHED') {
              setLimitReached({ open: true, limit: data.limit });
              return;
          }
          if (data.status === 'success') {
              const savedPersona = mapPersonaToClient(data.data);
              queryClient.invalidateQueries(['personas']); // Refresh data
              setIsPersonaModalOpen(false);
              setEditingPersona(null);
              return savedPersona; // Return the saved persona so callers can update their state
          }
      } catch (error) {
          console.error('Error saving persona:', error);
      }
  }

  const handleDeletePersona = async (id) => {
      const token = await getAuthToken();
      try {
          await fetch(`${API_URL}/personas/${id}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${token}` }
          });
          queryClient.invalidateQueries(['personas']);
      } catch (error) { console.error(error); }
  }

  const handleArchivePersona = async (id) => {
      const token = await getAuthToken();
      try {
          await fetch(`${API_URL}/personas/${id}/archive`, { method: 'PUT', headers: { 'Authorization': `Bearer ${token}` } });
          queryClient.invalidateQueries(['personas']);
      } catch (error) { console.error(error); }
  }

  const handleRestorePersona = (id) => {
      queryClient.invalidateQueries(['personas']);
  }

  const handleDuplicatePersona = (persona) => {
      // Logic moved to Personas.jsx or needs API implementation
      // For now, just refresh
  }

  const handleCreateJourney = async () => {
    if (!currentWorkspace?.id) {
      alert(t('common.selectWorkspaceFirst'));
      return;
    }
    const token = await getAuthToken();
    try {
      const response = await fetch(`${API_URL}/journeys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title: 'Untitled Journey', description: '', workspace_id: currentWorkspace.id })
      });
      const data = await response.json();
      if (response.status === 403 && data.code === 'LIMIT_REACHED') {
        setLimitReached({ open: true, limit: data.limit });
        return;
      }
      if (data.status === 'success') {
        queryClient.invalidateQueries(['journeys']);
        navigate(`/journey/${data.data.id}`);
      } else {
        console.error('Server error:', data);
        alert(t('common.failedCreateJourney') + (data.error ? `: ${data.error}` : ''));
      }
    } catch (error) {
      console.error('Error creating journey:', error);
      alert(t('common.networkError'));
    }
  }

  const handleDuplicateJourney = (journey) => {
      queryClient.invalidateQueries(['journeys']);
  }

  const handleDeleteJourney = (id) => {
      queryClient.invalidateQueries(['journeys']);
  }

  const handleArchiveJourney = (id) => {
      queryClient.invalidateQueries(['journeys']);
  }

  const handleRestoreJourney = (id) => {
      queryClient.invalidateQueries(['journeys']);
  }

  const handleNewPersona = () => {
    setEditingPersona(null);
    setIsPersonaModalOpen(true);
    navigate('/personas');
  }

  const handleViewAllJourneys = () => {
    navigate('/journeys');
  }

  const handleEditJourney = (journey) => {
    navigate(`/journey/${journey.id}`);
  }

  const handleNewMetric = () => {
    navigate('/metrics/new');
  }

  const handleEditMetric = (metric) => {
    navigate(`/metrics/${metric.id}`);
  }

  const handleSaveMetric = async (metricData, shouldNavigate = true) => {
      const token = await getAuthToken();
      const isNew = !metricData.id || typeof metricData.id === 'number'; // Assuming DB ids are UUIDs
      
      // Map client camelCase to server snake_case
      const payload = {
        name: metricData.name,
        type: metricData.type,
        value: metricData.value,
        previous_value: metricData.previousValue,
        suffix: metricData.suffix,
        data_source: metricData.dataSource,
        chart_type: metricData.chartType,
        series_data: metricData.seriesData,
        reverse_colors: metricData.reverseColors,
        series_label_format: metricData.seriesLabelFormat,
        integration_config: metricData.integrationConfig
      };
      if (isNew && currentWorkspace?.id) payload.workspace_id = currentWorkspace.id;

      try {
        let response;
        if (isNew) {
           response = await fetch(`${API_URL}/metrics`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
             body: JSON.stringify(payload)
           });
        } else {
           response = await fetch(`${API_URL}/metrics/${metricData.id}`, {
             method: 'PUT',
             headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
             body: JSON.stringify(payload)
           });
        }
        
        const data = await response.json();
        if (response.status === 403 && data.code === 'LIMIT_REACHED') {
          setLimitReached({ open: true, limit: data.limit });
          return;
        }
        if (data.status === 'success') {
           const savedMetric = mapMetricToClient(data.data);
           queryClient.setQueryData(['metrics'], (prev) => Array.isArray(prev) ? [...prev, savedMetric] : [savedMetric]);
           queryClient.invalidateQueries(['metrics']);
           if (shouldNavigate) navigate('/metrics');
           return savedMetric;
        }
      } catch (error) {
        console.error('Error saving metric:', error);
      }
  }

  const handleDeleteMetric = async (id) => {
      const token = await getAuthToken();
      try {
          await fetch(`${API_URL}/metrics/${id}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${token}` }
          });
          queryClient.invalidateQueries(['metrics']);
      } catch (error) { console.error(error); }
  }

  const handleUpdateWorkspace = async (newName) => {
      if (!currentWorkspace?.id) return;
      const token = await getAuthToken();
      try {
          const response = await fetch(`${API_URL}/workspace`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ name: newName, workspace_id: currentWorkspace.id })
          });
          const data = await response.json();
          if (data.status === 'success') {
              queryClient.invalidateQueries(['workspace']);
              queryClient.invalidateQueries(['workspace_list']);
          }
      } catch (error) {
          console.error('Error updating workspace:', error);
      }
  };

  const handleDeleteWorkspace = async (workspaceId) => {
      if (!workspaceId) return false;
      const token = await getAuthToken();
      try {
          const response = await fetch(`${API_URL}/workspace`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ workspace_id: workspaceId })
          });
          const data = await response.json();
          if (data.status === 'success') {
              setSelectedWorkspaceId('');
              queryClient.invalidateQueries(['workspace_list']);
              queryClient.invalidateQueries(['workspace']);
              queryClient.invalidateQueries(['journeys']);
              queryClient.invalidateQueries(['personas']);
              queryClient.invalidateQueries(['metrics']);
              navigate('/dashboard');
              return true;
          }
          alert(data.error || data.message || t('common.failedDeleteWorkspace'));
          return false;
      } catch (error) {
          console.error('Error deleting workspace:', error);
          alert(t('common.failedDeleteWorkspace'));
          return false;
      }
  };

  const handleUpdateProfile = async (fullName, avatarColor) => {
      const token = await getAuthToken();
      try {
          const response = await fetch(`${API_URL}/profile`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ full_name: fullName, avatar_color: avatarColor })
          });
          const data = await response.json();
          if (data.status === 'success') {
              queryClient.invalidateQueries({ queryKey: ['profile'] });
          }
      } catch (error) {
          console.error('Error updating profile:', error);
      }
  };

  const getUserInitials = () => {
      const name = userProfile?.full_name || userProfile?.email || '';
      if (!name) return 'NA';
      return name
        .trim()
        .split(' ')
        .map(n => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
  };

  return (
    <>
      <div className={`fixed top-0 left-0 h-1 bg-orange-600 z-[9999] transition-all duration-300 ease-out ${isNavigating ? 'opacity-100' : 'opacity-0'}`} style={{ width: `${loadingProgress}%` }}></div>
      <Routes>
        <Route path="/" element={<Navigate to="/auth" replace />} />
        <Route path="/landing" element={<LandingPage />} />
        <Route path="/auth" element={<AuthPage onLogin={() => navigate('/dashboard')} />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />

        <Route element={<ProtectedOutlet authReady={authReady} isAuthenticated={isAuthenticated} />}>
          <Route path="/journey/:id" element={
              <Editor 
                onBack={() => navigate('/dashboard')} 
                globalPersonas={filteredPersonas}
                globalMetrics={filteredMetrics}
                globalJourneys={filteredJourneys}
                onSaveGlobalPersona={handleSaveGlobalPersona}
                onSaveGlobalMetric={(data) => handleSaveMetric(data, false)}
              />
          } />

          <Route element={
            <MainLayout 
               isWorkspaceExpanded={isWorkspaceExpanded}
               setIsWorkspaceExpanded={setIsWorkspaceExpanded}
               currentWorkspace={currentWorkspace}
               workspaces={workspaces}
               onSwitchWorkspace={handleSwitchWorkspace}
               userProfile={userProfile}
               planName={planName}
               isNavigating={isNavigating}
               setSettingsTab={setSettingsTab}
            />
          }>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard 
                journeys={filteredJourneys}
                currentUserId={userProfile?.id}
                isWorkspaceOwner={currentWorkspace?.role === 'owner'}
                onNewJourney={handleCreateJourney} 
                onEditJourney={handleEditJourney}
                onNewPersona={handleNewPersona} 
                onViewAllJourneys={handleViewAllJourneys} 
                onNewMetric={handleNewMetric} 
                onDuplicate={handleDuplicateJourney}
                onArchive={handleArchiveJourney}
                onDelete={handleDeleteJourney}
            />} />
            <Route path="/journeys" element={<JourneyMaps 
                journeys={filteredJourneys.filter(j => j.status !== 'archived')}
                currentUserId={userProfile?.id}
                isWorkspaceOwner={currentWorkspace?.role === 'owner'}
                onCreate={handleCreateJourney}
                onEdit={handleEditJourney}
                onDelete={handleDeleteJourney}
                onDuplicate={handleDuplicateJourney}
                onArchive={handleArchiveJourney}
            />} />
            <Route path="/personas" element={<Personas 
                personas={personasWithUsage.filter(p => p.status !== 'archived')} 
                currentUserId={userProfile?.id}
                isWorkspaceOwner={currentWorkspace?.role === 'owner'}
                onCreate={() => { setEditingPersona(null); setIsPersonaModalOpen(true); }} 
                onEdit={(p) => { setEditingPersona(p); setIsPersonaModalOpen(true); }}
                onDelete={handleDeletePersona}
                onDuplicate={handleDuplicatePersona}
                onArchive={handleArchivePersona}
            />} />
            <Route path="/metrics" element={<Metrics metrics={metricsWithUsage} currentUserId={userProfile?.id} isWorkspaceOwner={currentWorkspace?.role === 'owner'} onCreate={handleNewMetric} onEdit={handleEditMetric} onDelete={handleDeleteMetric} />} />
            <Route path="/metrics/new" element={<MetricBuilder onBack={() => navigate('/metrics')} onSave={handleSaveMetric} />} />
            <Route path="/metrics/:id" element={<MetricEditorWrapper metrics={filteredMetrics} currentUserId={userProfile?.id} onBack={() => navigate('/metrics')} onSave={handleSaveMetric} onSyncSuccess={() => queryClient.invalidateQueries(['metrics'])} />} />
            <Route path="/interviews" element={<InterviewsList interviews={filteredInterviews} userProfile={userProfile} currentWorkspace={currentWorkspace} onLimitReached={(limit) => setLimitReached({ open: true, limit })} />} />
            <Route path="/interviews/:id" element={<InterviewRoom userProfile={userProfile} currentWorkspace={currentWorkspace} />} />
            <Route path="/settings" element={<SettingsPage initialTab={settingsTab} workspace={currentWorkspace} onUpdateWorkspace={handleUpdateWorkspace} onDeleteWorkspace={handleDeleteWorkspace} userProfile={userProfile} onUpdateProfile={handleUpdateProfile} onOpenPricing={() => setShowPricingModal(true)} onLimitReached={(limit) => setLimitReached({ open: true, limit })} />} />
            <Route path="/archive" element={<ArchivePage 
                archivedJourneys={filteredJourneys.filter(j => j.status === 'archived')}
                archivedPersonas={filteredPersonas.filter(p => p.status === 'archived')}
                currentUserId={userProfile?.id}
                isWorkspaceOwner={currentWorkspace?.role === 'owner'}
                onRestoreJourney={handleRestoreJourney}
                onDeleteJourney={handleDeleteJourney}
                onRestorePersona={handleRestorePersona}
                onDeletePersona={handleDeletePersona}
            />} />
          </Route>
        </Route>
      </Routes>

      {/* Global Persona Modal (Moved outside MainLayout to be persistent) */}
      <PersonaModal 
        isOpen={isPersonaModalOpen} 
        onClose={() => setIsPersonaModalOpen(false)} 
        onSave={handleSaveGlobalPersona}
        initialPersona={editingPersona}
      />

      {/* Limit reached modal: owner can upgrade, member is told to contact owner */}
      {limitReached.open && (
        <div className="fixed inset-0 z-[99] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 cursor-pointer" onClick={() => setLimitReached({ open: false, limit: null })} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Limit reached</h3>
            <p className="text-gray-600 mb-4">
              {currentWorkspace?.role === 'owner'
                ? `You've reached the limit for ${limitReached.limit === 'journeys' ? 'journey maps' : limitReached.limit === 'members' ? 'team members' : limitReached.limit === 'interviews' ? 'interviews' : limitReached.limit}. Upgrade your plan to add more.`
                : `You've reached the workspace limit for ${limitReached.limit === 'journeys' ? 'journey maps' : limitReached.limit === 'members' ? 'team members' : limitReached.limit === 'interviews' ? 'interviews' : limitReached.limit}. Contact the workspace owner to upgrade the plan.`}
            </p>
            <div className="flex gap-2 justify-end">
              {currentWorkspace?.role === 'owner' ? (
                <>
                  <button onClick={() => setLimitReached({ open: false, limit: null })} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Close</button>
                  <button onClick={() => { setShowPricingModal(true); setLimitReached({ open: false, limit: null }); }} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">Upgrade plan</button>
                </>
              ) : (
                <button onClick={() => setLimitReached({ open: false, limit: null })} className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800">OK</button>
              )}
            </div>
          </div>
        </div>
      )}

      <PricingModal
        isOpen={showPricingModal}
        onClose={() => {
          setShowPricingModal(false);
          queryClient.invalidateQueries({ queryKey: ['workspace', 'limits'] });
        }}
        currentPlanName={planName}
      />
    </>
  )
}

function MenuItem({ icon: Icon, label, isActive, onClick }) {
  return (
    <div onClick={onClick} className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium cursor-pointer transition-all duration-200 group ${isActive ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}>
      <Icon size={20} strokeWidth={2} className={`${isActive ? 'text-gray-900' : 'text-gray-400 group-hover:text-gray-600'}`} />
      {label}
    </div>
  )
}

export default App
