import { useState } from 'react'
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

const MOCK_PERSONAS = [
  { id: 1, name: "Alex Doe", role: "Software Engineer", image: "tech", age: 32, location: "Kyiv", quote: "Efficiency is key.", goals: ["Automate tasks"], frustrations: ["Slow UI"], usedIn: 2, updatedAt: "2 days ago", status: 'active' },
  { id: 2, name: "Sarah Smith", role: "Marketing Manager", image: "woman", age: 28, location: "London", quote: "I need clear analytics.", goals: ["Growth"], frustrations: ["Complex data"], usedIn: 1, updatedAt: "1 week ago", status: 'active' },
  { id: 3, name: "John Brown", role: "Student", image: "student", age: 21, location: "Berlin", quote: "Learning is fun.", goals: ["Get a job"], frustrations: ["No experience"], usedIn: 0, updatedAt: "3 days ago", status: 'active' },
  { id: 4, name: "Emily White", role: "HR Specialist", image: "worker", age: 35, location: "New York", quote: "People first.", goals: ["Better hiring"], frustrations: ["Paperwork"], usedIn: 3, updatedAt: "Yesterday", status: 'active' },
  { id: 5, name: "Michael Green", role: "Stay-at-home Dad", image: "parent", age: 40, location: "Toronto", quote: "Family time.", goals: ["Work-life balance"], frustrations: ["No time"], usedIn: 0, updatedAt: "5 hours ago", status: 'active' },
]

const MOCK_JOURNEYS = [
  { id: 1, title: "E-commerce Checkout", date: "2 hours ago", color: "bg-blue-100", status: "live", description: "Main checkout flow for guest users" },
  { id: 2, title: "Mobile App Onboarding", date: "Yesterday", color: "bg-purple-100", status: "draft", description: "New user registration process" },
  { id: 3, title: "Customer Support Flow", date: "3 days ago", color: "bg-green-100", status: "archived", description: "Legacy support ticket system" },
]

function App() {
  // Stan: 'dashboard' або 'editor'
  const [currentView, setCurrentView] = useState('dashboard');
  const [activeMenu, setActiveMenu] = useState('dashboard');

  // Global Personas State
  const [globalPersonas, setGlobalPersonas] = useState(MOCK_PERSONAS);
  const [globalJourneys, setGlobalJourneys] = useState(MOCK_JOURNEYS);
  const [globalMetrics, setGlobalMetrics] = useState(MOCK_METRICS);
  const [isPersonaModalOpen, setIsPersonaModalOpen] = useState(false);
  const [editingPersona, setEditingPersona] = useState(null);

  // Navigation Loading State
  const [isNavigating, setIsNavigating] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [settingsTab, setSettingsTab] = useState('workspace');

  const navigate = (view, menu, callback) => {
      if (view === currentView && !menu) return;
      
      setIsNavigating(true);
      setLoadingProgress(10);
      
      setTimeout(() => setLoadingProgress(60), 200);

      setTimeout(() => {
          setCurrentView(view);
          if (menu) setActiveMenu(menu);
          if (callback) callback();
          
          setLoadingProgress(100);
          setTimeout(() => { setIsNavigating(false); setTimeout(() => setLoadingProgress(0), 150); }, 100);
      }, 300);
  }

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
    navigate('personas', 'personas', () => {
        setEditingPersona(null);
        setIsPersonaModalOpen(true);
    });
  }

  const handleViewAllJourneys = () => {
    navigate('journey', 'journey');
  }

  const handleEditJourney = (journey) => {
    navigate('editor');
  }

  const handleNewMetric = () => {
    navigate('metric-new', 'metrics');
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
        navigate('metrics', 'metrics');
      }
      return newMetric;
  }

  const content = currentView === 'auth' ? (
    <AuthPage onLogin={() => navigate('dashboard', 'dashboard')} />
  ) : currentView === 'editor' ? (
    <Editor 
      onBack={() => navigate('dashboard', 'dashboard')} 
      globalPersonas={globalPersonas}
      globalMetrics={globalMetrics}
      onSaveGlobalPersona={handleSaveGlobalPersona}
      onSaveGlobalMetric={(data) => handleSaveMetric(data, false)}
    />
  ) : (
    <div className="flex h-screen bg-[#F3F4F6] font-sans text-gray-900">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shadow-sm z-10">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center text-white font-bold">I</div>
          <span className="text-xl font-bold tracking-tight text-gray-900">IteroJM</span>
        </div>
        
        <nav className="flex-1 px-3 space-y-6 overflow-y-auto py-4">
          <div className="space-y-1">
            <MenuItem icon={LayoutGrid} label="Dashboard" isActive={activeMenu === 'dashboard'} onClick={() => navigate('dashboard', 'dashboard')} />
          </div>
          <div>
            <div className="px-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider flex justify-between items-center cursor-pointer hover:text-gray-600">
              Workspace <ChevronDown size={14} />
            </div>
            <div className="space-y-1">
              <MenuItem icon={Map} label="Journey maps" isActive={activeMenu === 'journey'} onClick={() => navigate('journey', 'journey')} />
              <MenuItem icon={Users} label="Personas" isActive={activeMenu === 'personas'} onClick={() => navigate('personas', 'personas')} />
              <MenuItem icon={BarChart3} label="Metrics" isActive={activeMenu === 'metrics'} onClick={() => navigate('metrics', 'metrics')} />
            </div>
          </div>
          <div className="space-y-1">
             <MenuItem icon={ArchiveIcon} label="Archive" isActive={activeMenu === 'archive'} onClick={() => navigate('archive', 'archive')} />
             <MenuItem icon={Settings} label="Settings" isActive={activeMenu === 'settings'} onClick={() => { setSettingsTab('workspace'); navigate('settings', 'settings'); }} />
          </div>
        </nav>
        
        <div className="p-4 border-t border-gray-100">
          <div 
            className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 cursor-pointer transition"
            onClick={() => { setSettingsTab('profile'); navigate('settings', 'settings'); }}
          >
            <div className="w-8 h-8 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-600 font-bold text-xs">NA</div>
            <div className="flex flex-col">
               <span className="text-sm font-medium text-gray-700">New Account</span>
               <span className="text-xs text-gray-400">Trial Plan</span>
            </div>
          </div>
          <button 
            onClick={() => navigate('auth')}
            className="w-full flex items-center gap-3 px-2 py-2 mt-2 rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-600 transition text-sm font-medium"
          >
            <LogOut size={18} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
         {/* Рендеримо Дашборд і передаємо функцію відкриття редактора */}
         {currentView === 'dashboard' && <Dashboard onNewJourney={() => navigate('editor')} onNewPersona={handleNewPersona} onViewAllJourneys={handleViewAllJourneys} onNewMetric={handleNewMetric} />}
         {currentView === 'personas' && (
            <Personas 
              personas={globalPersonas.filter(p => p.status !== 'archived')} 
              onCreate={() => { setEditingPersona(null); setIsPersonaModalOpen(true); }} 
              onEdit={(p) => { setEditingPersona(p); setIsPersonaModalOpen(true); }}
              onDelete={handleDeletePersona}
              onDuplicate={handleDuplicatePersona}
              onArchive={handleArchivePersona}
            />
         )}
         {currentView === 'journey' && (
            <JourneyMaps 
              journeys={globalJourneys.filter(j => j.status !== 'archived')}
              onCreate={() => navigate('editor')}
              onEdit={handleEditJourney}
              onDelete={handleDeleteJourney}
              onDuplicate={handleDuplicateJourney}
              onArchive={handleArchiveJourney}
            />
         )}
         {currentView === 'metrics' && (
            <Metrics 
              metrics={globalMetrics}
              onCreate={handleNewMetric}
            />
         )}
         {currentView === 'metric-new' && (
            <MetricBuilder 
                onBack={() => navigate('metrics', 'metrics')}
                onSave={handleSaveMetric}
            />
         )}
         {currentView === 'settings' && (
            <SettingsPage initialTab={settingsTab} />
         )}
         {currentView === 'archive' && (
            <ArchivePage 
                archivedJourneys={globalJourneys.filter(j => j.status === 'archived')}
                archivedPersonas={globalPersonas.filter(p => p.status === 'archived')}
                onRestoreJourney={handleRestoreJourney}
                onDeleteJourney={handleDeleteJourney}
                onRestorePersona={handleRestorePersona}
                onDeletePersona={handleDeletePersona}
            />
         )}
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
      {content}
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