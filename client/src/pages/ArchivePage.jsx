import React, { useState } from 'react';
import { Search, RotateCcw, Trash2, Map, User, Archive as ArchiveIcon } from 'lucide-react';

const ArchivePage = ({ 
  archivedJourneys = [], 
  archivedPersonas = [], 
  onRestoreJourney, 
  onDeleteJourney, 
  onRestorePersona, 
  onDeletePersona 
}) => {
  const [activeTab, setActiveTab] = useState('journeys');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredJourneys = archivedJourneys.filter(j => 
    j.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredPersonas = archivedPersonas.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-8 bg-gray-50 min-h-screen font-sans text-gray-900">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <ArchiveIcon className="text-gray-400" /> Archive
        </h1>
        <p className="text-gray-500 mt-1">Restore or permanently delete items.</p>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
            onClick={() => setActiveTab('journeys')}
            className={`px-6 py-3 text-sm font-medium transition-colors relative ${activeTab === 'journeys' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
            Journeys ({archivedJourneys.length})
            {activeTab === 'journeys' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-full"></div>}
        </button>
        <button
            onClick={() => setActiveTab('personas')}
            className={`px-6 py-3 text-sm font-medium transition-colors relative ${activeTab === 'personas' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
            Personas ({archivedPersonas.length})
            {activeTab === 'personas' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-full"></div>}
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        <input 
            type="text" 
            placeholder={`Search archived ${activeTab}...`} 
            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Content */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50/50">
                <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Deleted Date</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
                {activeTab === 'journeys' ? (
                    filteredJourneys.length === 0 ? (
                        <tr><td colSpan="3" className="px-6 py-12 text-center text-gray-500">No archived journeys found</td></tr>
                    ) : (
                        filteredJourneys.map(journey => (
                            <tr key={journey.id} className="hover:bg-gray-50/80 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-lg ${journey.color || 'bg-gray-100'} flex items-center justify-center text-gray-600`}>
                                            <Map size={16} />
                                        </div>
                                        <div>
                                            <div className="font-bold text-gray-900">{journey.title}</div>
                                            <div className="text-xs text-gray-500">{journey.description || 'No description'}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {journey.date || 'Unknown'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <button onClick={() => onRestoreJourney(journey.id)} className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Restore">
                                            <RotateCcw size={18} />
                                        </button>
                                        <button onClick={() => onDeleteJourney(journey.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete Forever">
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))
                    )
                ) : (
                    filteredPersonas.length === 0 ? (
                        <tr><td colSpan="3" className="px-6 py-12 text-center text-gray-500">No archived personas found</td></tr>
                    ) : (
                        filteredPersonas.map(persona => (
                            <tr key={persona.id} className="hover:bg-gray-50/80 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 overflow-hidden">
                                            {persona.image && persona.image.startsWith('http') ? (
                                                <img src={persona.image} alt={persona.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <User size={16} />
                                            )}
                                        </div>
                                        <div>
                                            <div className="font-bold text-gray-900">{persona.name}</div>
                                            <div className="text-xs text-gray-500">{persona.role}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {persona.updatedAt || 'Unknown'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <button onClick={() => onRestorePersona(persona.id)} className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Restore">
                                            <RotateCcw size={18} />
                                        </button>
                                        <button onClick={() => onDeletePersona(persona.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete Forever">
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))
                    )
                )}
            </tbody>
        </table>
      </div>
    </div>
  );
};

export default ArchivePage;