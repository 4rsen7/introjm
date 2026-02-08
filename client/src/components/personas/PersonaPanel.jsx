import { ChevronDown, MapPin, Calendar, Quote, Plus, Target, AlertCircle, Edit2, User, Briefcase, GraduationCap, Smile, Bot, Baby } from 'lucide-react'

const getAvatarIcon = (id) => {
  switch(id) {
      case 'man': return User;
      case 'woman': return Smile;
      case 'student': return GraduationCap;
      case 'worker': return Briefcase;
      case 'parent': return Baby;
      case 'tech': return Bot;
      default: return null;
  }
}

export default function PersonaPanel({ persona, isExpanded, onToggle, onEdit, isExporting }) {
  if (!persona) {
    return (
      <button 
        onClick={onToggle}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-dashed border-gray-300 text-gray-400 hover:border-orange-300 hover:text-orange-600 hover:bg-orange-50 transition-colors text-sm font-medium whitespace-nowrap"
      >
        <Plus size={16} />
        <span>Add Persona</span>
      </button>
    )
  }

  const AvatarIcon = getAvatarIcon(persona.image)

  if (isExporting) {
    return (
      <div className="w-full border-b border-gray-200 pb-6 mb-8">
        <div className="flex items-start gap-6">
           <div className="w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 border-4 border-white shadow-sm shrink-0">
              {AvatarIcon ? (
                <AvatarIcon size={40} />
              ) : persona.image && persona.image.startsWith('http') ? (
                <img src={persona.image} className="w-full h-full rounded-full object-cover" alt={persona.name} />
              ) : (
                <span className="font-bold text-xl">{persona.name.charAt(0)}</span>
              )}
           </div>
           <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900 leading-tight">{persona.name}</h1>
              <p className="text-gray-500 font-medium mb-4">{persona.role}</p>
              <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mb-4">
                <div><span className="font-bold text-gray-800">Age:</span> {persona.age}</div>
                <div><span className="font-bold text-gray-800">Location:</span> {persona.location}</div>
              </div>
              <div className="italic text-gray-600 border-l-4 border-orange-200 pl-4">"{persona.quote}"</div>
           </div>
        </div>
        <div className="grid grid-cols-2 gap-8 mt-6 pt-6 border-t border-gray-200">
           <div>
              <h4 className="font-bold text-gray-900 mb-2 uppercase text-xs tracking-wider">Goals</h4>
              <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                {persona.goals.map((g, i) => <li key={i}>{g}</li>)}
              </ul>
           </div>
           <div>
              <h4 className="font-bold text-gray-900 mb-2 uppercase text-xs tracking-wider">Frustrations</h4>
              <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                {persona.frustrations.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
           </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative group">
      {/* Trigger Button in Header */}
      <div 
        onClick={onToggle} 
        className={`flex items-center gap-3 px-2 py-1.5 rounded-lg transition-colors border border-transparent cursor-pointer ${isExpanded ? 'bg-gray-100 border-gray-200' : 'hover:bg-gray-50'}`}
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-100 to-orange-200 flex items-center justify-center text-orange-600 border border-white shadow-sm shrink-0">
          {AvatarIcon ? (
            <AvatarIcon size={18} />
          ) : persona.image && persona.image.startsWith('http') ? (
            <img src={persona.image} alt={persona.name} className="w-full h-full rounded-full object-cover" />
          ) : (
            <span className="font-bold text-xs">{persona.name.charAt(0)}</span>
          )}
        </div>
        <div className="text-left hidden md:flex items-center gap-2">
          <div className="text-sm font-bold text-gray-900 leading-none">{persona.name}</div>
          <div className="text-xs text-gray-500 font-medium leading-none">{persona.role}</div>
        </div>
        
        <ChevronDown size={16} className={`text-gray-400 transition-transform ml-auto ${isExpanded ? 'rotate-180' : ''}`} />
      </div>

      {/* Dropdown Overlay */}
      {isExpanded && (
        <>
          <div className="fixed inset-0 z-40" onClick={onToggle}></div>
          <div className="absolute top-full left-0 mt-2 w-[500px] bg-white rounded-xl shadow-2xl border border-gray-100 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300 cursor-default">
            <div className="p-6 bg-gray-50/30 relative">
              <button 
                type="button"
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition cursor-pointer z-10"
                title="Edit Persona"
              >
                <Edit2 size={16} />
              </button>
              <div className="grid grid-cols-1 gap-6">
                {/* About */}
                <div className="space-y-4">
                  <div className="relative pl-4 border-l-4 border-orange-200 italic text-gray-600 text-sm leading-relaxed break-words pr-10">
                    <Quote size={16} className="absolute -top-2 -left-2 text-orange-300 fill-orange-100" />
                    "{persona.quote}"
                  </div>
                  <div className="flex items-center gap-4 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    <div className="flex items-center gap-1.5">
                      <Calendar size={14} /> {persona.age} years
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin size={14} /> {persona.location}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  {/* Goals */}
                  <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2"><Target size={14} /> Goals</h4>
                    <div className="flex flex-wrap gap-2">
                      {persona.goals.map((goal, i) => (
                        <span key={i} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-green-50 text-green-700 border border-green-100">{goal}</span>
                      ))}
                    </div>
                  </div>
                  {/* Frustrations */}
                  <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2"><AlertCircle size={14} /> Frustrations</h4>
                    <div className="flex flex-wrap gap-2">
                      {persona.frustrations.map((frust, i) => (
                        <span key={i} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-red-50 text-red-700 border border-red-100">{frust}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}