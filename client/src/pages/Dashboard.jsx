import { Map, User, BarChart3, Plus, MoreHorizontal, Clock, ArrowRight } from 'lucide-react'

const dummyJourneys = [
  { id: 1, title: "E-commerce Checkout", date: "2 hours ago", color: "bg-blue-100" },
  { id: 2, title: "Mobile App Onboarding", date: "Yesterday", color: "bg-purple-100" },
  { id: 3, title: "Customer Support Flow", date: "3 days ago", color: "bg-green-100" },
]

// Ми передаємо функцію onNewJourney, щоб знати, коли юзер хоче створити карту
export default function Dashboard({ onNewJourney, onNewPersona, onViewAllJourneys, onNewMetric }) {
  return (
    <div className="p-8 h-full overflow-auto bg-gray-50/30">
      <header className="mb-8 flex items-center justify-between">
        <div>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Dashboard</h2>
            <p className="text-gray-500 text-sm mt-1">Manage your customer journeys and personas</p>
        </div>
      </header>

      {/* Action Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
        <ActionCard 
          icon={Map} 
          label="New Journey" 
          subLabel="Map a customer experience"
          color="text-orange-600" 
          bgColor="bg-orange-50"
          onClick={onNewJourney}
        />
        <ActionCard 
          icon={User} 
          label="New Persona" 
          subLabel="Define target audience"
          color="text-blue-600" 
          bgColor="bg-blue-50"
          onClick={onNewPersona}
        />
        <ActionCard 
          icon={BarChart3} 
          label="New Metric" 
          subLabel="Track KPIs & data"
          color="text-emerald-600" 
          bgColor="bg-emerald-50"
          onClick={onNewMetric}
        />
      </div>

      {/* Recents Section */}
      <section>
        <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-gray-800">Recent Journeys</h3>
            <button onClick={() => onViewAllJourneys && onViewAllJourneys()} className="text-sm text-gray-500 hover:text-gray-900 font-medium flex items-center gap-1">
                View all <ArrowRight size={14} />
            </button>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {dummyJourneys.map(journey => (
                <JourneyCard key={journey.id} journey={journey} onClick={onNewJourney} />
            ))}
            
            {/* Create New Placeholder Card */}
            <button 
                onClick={onNewJourney}
                className="bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 hover:border-orange-300 hover:bg-orange-50/30 transition-all cursor-pointer flex flex-col items-center justify-center h-48 group text-gray-400 hover:text-orange-600"
            >
                <div className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center mb-2 group-hover:border-orange-200 group-hover:bg-orange-100 transition-colors">
                    <Plus size={20} />
                </div>
                <span className="text-sm font-medium">Create new</span>
            </button>
        </div>
      </section>
    </div>
  )
}

function ActionCard({ icon: Icon, label, subLabel, color, bgColor, onClick }) {
    return (
        <button 
            onClick={onClick}
            className="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md hover:border-gray-300 transition-all text-left group h-24"
        >
            <div className={`w-12 h-12 rounded-lg ${bgColor} flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}>
                <Icon className={color} size={24} />
            </div>
            <div className="flex-1 min-w-0">
                <div className="font-bold text-gray-900 truncate">{label}</div>
                <div className="text-xs text-gray-500 truncate">{subLabel}</div>
            </div>
            <div className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 -mr-2">
                <Plus size={20} />
            </div>
        </button>
    )
}

function JourneyCard({ journey, onClick }) {
    return (
        <div 
            onClick={onClick}
            className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg hover:border-gray-300 transition-all cursor-pointer group flex flex-col h-48 relative"
        >
            {/* Preview Area */}
            <div className={`h-28 ${journey.color} relative p-4 overflow-hidden`}>
                {/* Abstract Pattern */}
                <div className="absolute inset-0 opacity-30 bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:16px_16px]"></div>
                
                {/* Mini UI Mockup */}
                <div className="w-full h-full bg-white/60 rounded-t-lg border-t border-l border-r border-white/50 shadow-sm translate-y-2"></div>
                
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-1.5 bg-white/90 hover:bg-white rounded-md text-gray-600 shadow-sm backdrop-blur-sm">
                        <MoreHorizontal size={16} />
                    </button>
                </div>
            </div>
            
            {/* Info Area */}
            <div className="p-4 flex-1 flex flex-col justify-center border-t border-gray-50">
                <h4 className="font-bold text-gray-900 text-sm mb-1 truncate group-hover:text-orange-600 transition-colors">{journey.title}</h4>
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Clock size={12} />
                    <span>{journey.date}</span>
                </div>
            </div>
        </div>
    )
}