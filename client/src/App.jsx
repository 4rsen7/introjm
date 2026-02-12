import { useState, useEffect, useMemo, useLayoutEffect } from 'react'
import { Routes, Route, useNavigate, useLocation, Navigate, Outlet, useParams } from 'react-router-dom'
import { LayoutGrid, Map, Users, BarChart3, Settings, Archive as ArchiveIcon, ChevronDown, LogOut } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Editor from './pages/Editor'
import Personas from './pages/Personas'
import PersonaModal from './components/personas/PersonaModal'
import JourneyMaps from './pages/JourneyMaps'
import Metrics from './pages/Metrics'
import MetricBuilder from './pages/MetricBuilder'
import SettingsPage from './pages/SettingsPage'
import ArchivePage from './pages/ArchivePage'
import AuthPage from './pages/AuthPage'
import { getAuthToken } from './services/auth'
import { useQueryClient } from '@tanstack/react-query'
import { useJourneys, usePersonas, useMetrics, useWorkspace, useProfile, mapPersonaToClient, mapMetricToClient } from './hooks/useQueries'

// Fallback to localhost:5001 if env var is missing
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

// Helper wrapper for editing metrics
const MetricEditorWrapper = ({ metrics, onSave, onBack }) => {
  const { id } = useParams();
  const metric = metrics.find(m => m.id.toString() === id);
  return <MetricBuilder initialData={metric} onSave={onSave} onBack={onBack} />;
};

// --- ВИПРАВЛЕННЯ: MainLayout винесено за межі App ---
const MainLayout = ({ 
  isWorkspaceExpanded, 
  setIsWorkspaceExpanded, 
  currentWorkspace, 
  userProfile, 
  isNavigating, 
  setSettingsTab 
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

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
          <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center text-white font-bold">I</div>
          <span className="text-xl font-bold tracking-tight text-gray-900">IteroJM</span>
        </div>
        
        <nav className="flex-1 px-3 space-y-6 overflow-y-auto py-4">
          <div className="space-y-1">
            <MenuItem icon={LayoutGrid} label="Dashboard" isActive={location.pathname === '/dashboard'} onClick={() => navigate('/dashboard')} />
          </div>
          <div>
            <div 
              className="px-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider flex justify-between items-center cursor-pointer hover:text-gray-600 select-none"
              onClick={() => setIsWorkspaceExpanded(!isWorkspaceExpanded)}
            >
              {currentWorkspace?.name || 'Workspace'} 
              <ChevronDown 
                size={14} 
                className={`transition-transform duration-500 ${isWorkspaceExpanded ? '' : '-rotate-90'}`} 
                style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
              />
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
                  <MenuItem icon={Map} label="Journey maps" isActive={location.pathname === '/journeys'} onClick={() => navigate('/journeys')} />
                  <MenuItem icon={Users} label="Personas" isActive={location.pathname === '/personas'} onClick={() => navigate('/personas')} />
                  <MenuItem icon={BarChart3} label="Metrics" isActive={location.pathname.startsWith('/metrics')} onClick={() => navigate('/metrics')} />
                  <MenuItem icon={ArchiveIcon} label="Archive" isActive={location.pathname === '/archive'} onClick={() => navigate('/archive')} />
                  <MenuItem icon={Settings} label="Settings" isActive={location.pathname === '/settings'} onClick={() => { setSettingsTab('workspace'); navigate('/settings'); }} />
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
            <div className="w-8 h-8 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-600 font-bold text-xs">
                {getUserInitials()}
            </div>
            <div className="flex flex-col">
               <span className="text-sm font-medium text-gray-700 truncate max-w-[140px]">{userProfile?.full_name || userProfile?.email || 'User'}</span>
               <span className="text-xs text-gray-400">Trial Plan</span>
            </div>
          </div>
          <button 
            onClick={() => {
              localStorage.removeItem('token');
              localStorage.removeItem('user');
              queryClient.removeQueries(); // Clear all cached data on logout
              navigate('/auth');
            }}
            className="w-full flex items-center gap-3 px-2 py-2 mt-2 rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-600 transition text-sm font-medium"
          >
            <LogOut size={18} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative">
         {isNavigating && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-white animate-in fade-in duration-200">
                <div className="w-8 h-8 border-2 border-gray-200 border-t-orange-600 rounded-full animate-spin"></div>
            </div>
         )}
         <div className="h-full w-full">
            <Outlet />
         </div>
      </main>
    </div>
  );
};

function App() {
  // Stan: 'dashboard' або 'editor'
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token && location.pathname !== '/auth') {
      navigate('/auth');
    }
  }, [location, navigate]);

  // Navigation Loading Animation
  useLayoutEffect(() => {
    setIsNavigating(true);
    setLoadingProgress(20);

    const t1 = setTimeout(() => setLoadingProgress(70), 200);
    const t2 = setTimeout(() => setLoadingProgress(100), 500);
    const t3 = setTimeout(() => {
      setIsNavigating(false);
      setTimeout(() => setLoadingProgress(0), 150);
    }, 300);

    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
    };
  }, [location.pathname]);

  const [activeMenu, setActiveMenu] = useState('dashboard');
  const [isWorkspaceExpanded, setIsWorkspaceExpanded] = useState(true);

  // Global Personas State
  // REPLACED WITH REACT QUERY HOOKS
  const { data: globalJourneys = [] } = useJourneys();
  const { data: globalPersonas = [] } = usePersonas();
  const { data: globalMetrics = [] } = useMetrics();
  const { data: currentWorkspace } = useWorkspace();
  const { data: userProfile } = useProfile();

  const [isPersonaModalOpen, setIsPersonaModalOpen] = useState(false);
  const [editingPersona, setEditingPersona] = useState(null);

  // Navigation Loading State
  const [isNavigating, setIsNavigating] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [settingsTab, setSettingsTab] = useState('workspace');

  // Calculate usage stats and linked journeys for personas
  const personasWithUsage = useMemo(() => {
    return globalPersonas.map(p => {
      const linked = globalJourneys.filter(j => {
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
  }, [globalPersonas, globalJourneys]);

  // Calculate usage stats for metrics
  const metricsWithUsage = useMemo(() => {
    return globalMetrics.map(m => {
      const linkedCount = globalJourneys.filter(j => {
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
      }).length;

      return { ...m, linkedMaps: linkedCount };
    });
  }, [globalMetrics, globalJourneys]);

  const handleSaveGlobalPersona = async (personaData) => {
      const token = await getAuthToken();
      
      // Determine ID: use passed ID, or fallback to editingPersona.id if available (for App-level modal)
      const id = personaData.id || (editingPersona?.id);

      // Якщо ID числове (Date.now()) або відсутнє - це створення нової персони. UUID - це рядок.
      const isNew = !id || typeof id === 'number';
      
      const dataToSave = { ...personaData };
      if (id) dataToSave.id = id;
      
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
    console.log('Creating new journey...');
    const token = await getAuthToken();
    try {
      const response = await fetch(`${API_URL}/journeys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title: 'Untitled Journey', description: '' })
      });
      const data = await response.json();
      if (data.status === 'success') {
        queryClient.invalidateQueries(['journeys']);
        navigate(`/journey/${data.data.id}`);
      } else {
        console.error('Server error:', data);
        alert(`Failed to create journey: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error creating journey:', error);
      alert('Network error. Check console for details.');
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
        reverse_colors: metricData.reverseColors
      };

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
        if (data.status === 'success') {
           const savedMetric = mapMetricToClient(data.data);
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
      const token = await getAuthToken();
      try {
          const response = await fetch(`${API_URL}/workspace`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ name: newName })
          });
          const data = await response.json();
          if (data.status === 'success') {
              queryClient.invalidateQueries(['workspace']);
          }
      } catch (error) {
          console.error('Error updating workspace:', error);
      }
  };

  const handleUpdateProfile = async (fullName) => {
      const token = await getAuthToken();
      try {
          const response = await fetch(`${API_URL}/profile`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ full_name: fullName })
          });
          const data = await response.json();
          if (data.status === 'success') {
              queryClient.invalidateQueries(['profile']);
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
        <Route path="/auth" element={<AuthPage onLogin={() => navigate('/dashboard')} />} />
        
        <Route path="/journey/:id" element={
            <Editor 
              onBack={() => navigate('/dashboard')} 
              globalPersonas={globalPersonas}
              globalMetrics={globalMetrics}
              onSaveGlobalPersona={handleSaveGlobalPersona}
              onSaveGlobalMetric={(data) => handleSaveMetric(data, false)}
            />
        } />

        <Route element={
          <MainLayout 
             isWorkspaceExpanded={isWorkspaceExpanded}
             setIsWorkspaceExpanded={setIsWorkspaceExpanded}
             currentWorkspace={currentWorkspace}
             userProfile={userProfile}
             isNavigating={isNavigating}
             setSettingsTab={setSettingsTab}
          />
        }>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard 
                journeys={globalJourneys}
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
                journeys={globalJourneys.filter(j => j.status !== 'archived')}
                onCreate={handleCreateJourney}
                onEdit={handleEditJourney}
                onDelete={handleDeleteJourney}
                onDuplicate={handleDuplicateJourney}
                onArchive={handleArchiveJourney}
            />} />
            <Route path="/personas" element={<Personas 
                personas={personasWithUsage.filter(p => p.status !== 'archived')} 
                onCreate={() => { setEditingPersona(null); setIsPersonaModalOpen(true); }} 
                onEdit={(p) => { setEditingPersona(p); setIsPersonaModalOpen(true); }}
                onDelete={handleDeletePersona}
                onDuplicate={handleDuplicatePersona}
                onArchive={handleArchivePersona}
            />} />
            <Route path="/metrics" element={<Metrics metrics={metricsWithUsage} onCreate={handleNewMetric} onEdit={handleEditMetric} onDelete={handleDeleteMetric} />} />
            <Route path="/metrics/new" element={<MetricBuilder onBack={() => navigate('/metrics')} onSave={handleSaveMetric} />} />
            <Route path="/metrics/:id" element={<MetricEditorWrapper metrics={globalMetrics} onBack={() => navigate('/metrics')} onSave={handleSaveMetric} />} />
            <Route path="/settings" element={<SettingsPage initialTab={settingsTab} workspace={currentWorkspace} onUpdateWorkspace={handleUpdateWorkspace} userProfile={userProfile} onUpdateProfile={handleUpdateProfile} />} />
            <Route path="/archive" element={<ArchivePage 
                archivedJourneys={globalJourneys.filter(j => j.status === 'archived')}
                archivedPersonas={globalPersonas.filter(p => p.status === 'archived')}
                onRestoreJourney={handleRestoreJourney}
                onDeleteJourney={handleDeleteJourney}
                onRestorePersona={handleRestorePersona}
                onDeletePersona={handleDeletePersona}
            />} />
        </Route>
      </Routes>

      {/* Global Persona Modal (Moved outside MainLayout to be persistent) */}
      <PersonaModal 
        isOpen={isPersonaModalOpen} 
        onClose={() => setIsPersonaModalOpen(false)} 
        onSave={handleSaveGlobalPersona}
        initialPersona={editingPersona}
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