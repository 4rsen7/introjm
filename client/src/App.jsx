import { useState, useEffect } from 'react'
import { Routes, Route, useNavigate, useLocation, Navigate, Outlet } from 'react-router-dom'
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
import { MOCK_METRICS } from './data/mockMetrics'

function App() {
  // Stan: 'dashboard' або 'editor'
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token && location.pathname !== '/auth') {
      navigate('/auth');
    }
  }, [location, navigate]);

  const [activeMenu, setActiveMenu] = useState('dashboard');

  // Global Personas State
  const [globalPersonas, setGlobalPersonas] = useState([]);
  const [globalJourneys, setGlobalJourneys] = useState([]);
  const [globalMetrics, setGlobalMetrics] = useState(MOCK_METRICS);
  const [isPersonaModalOpen, setIsPersonaModalOpen] = useState(false);
  const [editingPersona, setEditingPersona] = useState(null);

  // Navigation Loading State
  const [isNavigating, setIsNavigating] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [settingsTab, setSettingsTab] = useState('workspace');

  // Fetch Journeys from API
  useEffect(() => {
    const fetchJourneys = async () => {
      const token = localStorage.getItem('token');
      if (!token) return;
      
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/journeys`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.status === 'success') {
          setGlobalJourneys(data.data);
        }
      } catch (error) {
        console.error('Error fetching journeys:', error);
      }
    };

    if (location.pathname === '/dashboard' || location.pathname === '/journeys') {
      fetchJourneys();
    }
  }, [location.pathname]);


  const handleSaveGlobalPersona = (personaData) => {
      setGlobalPersonas(prev => {
          const exists = prev.find(p => p.id === personaData.id);
          if (exists) {
              return prev.map(p => p.id === personaData.id ? { ...personaData, updatedAt: "Just now" } : p);
          }
          return [{ ...personaData, id: Date.now(), usedIn: 0, updatedAt: "Just now", status: 'active' }, ...prev];
      });
      setIsPersonaModalOpen(false);
      setEditingPersona(null);
  }

  const handleDeletePersona = (id) => {
      setGlobalPersonas(prev => prev.filter(p => p.id !== id));
  }

  const handleArchivePersona = (id) => {
      setGlobalPersonas(prev => prev.map(p => p.id === id ? { ...p, status: 'archived' } : p));
  }

  const handleRestorePersona = (id) => {
      setGlobalPersonas(prev => prev.map(p => p.id === id ? { ...p, status: 'active' } : p));
  }

  const handleDuplicatePersona = (persona) => {
      const newPersona = { ...persona, id: Date.now(), name: `${persona.name} (Copy)`, updatedAt: "Just now" };
      setGlobalPersonas(prev => [newPersona, ...prev]);
  }

  const handleCreateJourney = async () => {
    console.log('Creating new journey...');
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/journeys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title: 'Untitled Journey', description: '' })
      });
      const data = await response.json();
      if (data.status === 'success') {
        setGlobalJourneys(prev => [data.data, ...prev]);
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
      const newJourney = { ...journey, id: Date.now(), title: `${journey.title} (Copy)`, date: "Just now" };
      setGlobalJourneys(prev => [newJourney, ...prev]);
  }

  const handleDeleteJourney = (id) => {
      setGlobalJourneys(prev => prev.filter(j => j.id !== id));
  }

  const handleArchiveJourney = (id) => {
      setGlobalJourneys(prev => prev.map(j => j.id === id ? { ...j, status: 'archived' } : j));
  }

  const handleRestoreJourney = (id) => {
      setGlobalJourneys(prev => prev.map(j => j.id === id ? { ...j, status: 'draft' } : j)); // Restore to draft or previous status
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

  const handleSaveMetric = (metricData, shouldNavigate = true) => {
      const newMetric = {
          ...metricData, // Save all fields (suffix, previousValue, seriesData etc.)
          id: Date.now(),
          updatedAt: "Just now",
          linkedMaps: 0,
      };
      setGlobalMetrics(prev => [newMetric, ...prev]);
      if (shouldNavigate) {
        navigate('/metrics');
      }
      return newMetric;
  }

  const MainLayout = () => (
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
            <div className="px-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider flex justify-between items-center cursor-pointer hover:text-gray-600">
              Workspace <ChevronDown size={14} />
            </div>
            <div className="space-y-1">
              <MenuItem icon={Map} label="Journey maps" isActive={location.pathname === '/journeys'} onClick={() => navigate('/journeys')} />
              <MenuItem icon={Users} label="Personas" isActive={location.pathname === '/personas'} onClick={() => navigate('/personas')} />
              <MenuItem icon={BarChart3} label="Metrics" isActive={location.pathname.startsWith('/metrics')} onClick={() => navigate('/metrics')} />
            </div>
          </div>
          <div className="space-y-1">
             <MenuItem icon={ArchiveIcon} label="Archive" isActive={location.pathname === '/archive'} onClick={() => navigate('/archive')} />
             <MenuItem icon={Settings} label="Settings" isActive={location.pathname === '/settings'} onClick={() => { setSettingsTab('workspace'); navigate('/settings'); }} />
          </div>
        </nav>
        
        <div className="p-4 border-t border-gray-100">
          <div 
            className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 cursor-pointer transition"
            onClick={() => { setSettingsTab('profile'); navigate('/settings'); }}
          >
            <div className="w-8 h-8 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-600 font-bold text-xs">NA</div>
            <div className="flex flex-col">
               <span className="text-sm font-medium text-gray-700">New Account</span>
               <span className="text-xs text-gray-400">Trial Plan</span>
            </div>
          </div>
          <button 
            onClick={() => {
              localStorage.removeItem('token');
              localStorage.removeItem('user');
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
      <main className="flex-1 overflow-hidden">
         <Outlet />
      </main>

      <PersonaModal 
        isOpen={isPersonaModalOpen} 
        onClose={() => setIsPersonaModalOpen(false)} 
        onSave={handleSaveGlobalPersona}
        initialPersona={editingPersona}
      />
    </div>
  );

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

        <Route element={<MainLayout />}>
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
                personas={globalPersonas.filter(p => p.status !== 'archived')} 
                onCreate={() => { setEditingPersona(null); setIsPersonaModalOpen(true); }} 
                onEdit={(p) => { setEditingPersona(p); setIsPersonaModalOpen(true); }}
                onDelete={handleDeletePersona}
                onDuplicate={handleDuplicatePersona}
                onArchive={handleArchivePersona}
            />} />
            <Route path="/metrics" element={<Metrics metrics={globalMetrics} onCreate={handleNewMetric} />} />
            <Route path="/metrics/new" element={<MetricBuilder onBack={() => navigate('/metrics')} onSave={handleSaveMetric} />} />
            <Route path="/settings" element={<SettingsPage initialTab={settingsTab} />} />
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