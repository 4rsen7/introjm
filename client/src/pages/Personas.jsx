import React, { useState, useMemo } from 'react';
import { Search, Filter, Copy, Trash2, Plus, User, X, Archive } from 'lucide-react';
import ConfirmModal from '../ConfirmModal';
import Tooltip from '../components/common/Tooltip';

const Personas = ({ personas = [], onCreate, onEdit, onDelete, onDuplicate, onArchive }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, action: null, item: null });

  const roles = useMemo(() => [...new Set(personas.map(p => p.role).filter(Boolean))], [personas]);
  const locations = useMemo(() => [...new Set(personas.map(p => p.location).filter(Boolean))], [personas]);

  const filteredPersonas = personas.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.role.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = selectedRole ? p.role === selectedRole : true;
    const matchesLocation = selectedLocation ? p.location === selectedLocation : true;
    
    return matchesSearch && matchesRole && matchesLocation;
  });

  const handleConfirmAction = () => {
    const { action, item } = confirmConfig;
    if (action === 'delete' && onDelete) onDelete(item.id);
    if (action === 'duplicate' && onDuplicate) onDuplicate(item);
    setConfirmConfig({ isOpen: false, action: null, item: null });
  };

  const openConfirm = (action, item) => {
    setConfirmConfig({ isOpen: true, action, item });
  };

  return (
    <div className="p-8 bg-gray-50 min-h-screen font-sans text-gray-900">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Personas</h1>
        <button 
            onClick={onCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm transition-colors"
        >
          <Plus size={18} />
          Create persona
        </button>
      </header>

      <div className="flex flex-col mb-6">
       <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
                type="text" 
                placeholder="Search personas..." 
                className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>
        <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 border rounded-lg font-medium shadow-sm transition-colors ${showFilters ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
        >
            <Filter size={16} />
            <span>Filters</span>
        </button>
      </div>

      <div className={`grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${showFilters ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className={`pt-4 transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${showFilters ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`}>
            <div className="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
            <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-gray-500 uppercase">Role</label>
                <select 
                    className="text-sm border border-gray-200 rounded-md px-2 py-1.5 outline-none focus:border-blue-500 min-w-[150px] bg-white"
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value)}
                >
                    <option value="">All Roles</option>
                    {roles.map(role => <option key={role} value={role}>{role}</option>)}
                </select>
            </div>
            <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-gray-500 uppercase">Location</label>
                <select 
                    className="text-sm border border-gray-200 rounded-md px-2 py-1.5 outline-none focus:border-blue-500 min-w-[150px] bg-white"
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                >
                    <option value="">All Locations</option>
                    {locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                </select>
            </div>
            {(selectedRole || selectedLocation) && (
                <button onClick={() => { setSelectedRole(''); setSelectedLocation(''); }} className="mt-auto mb-1 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition" title="Clear filters">
                    <X size={16} />
                </button>
            )}
            </div>
          </div>
        </div>
      </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Used In</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Updated</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Created By</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredPersonas.length === 0 ? (
                <tr>
                    <td colSpan="5" className="px-6 py-12 text-center text-gray-500">
                        <div className="flex flex-col items-center justify-center">
                            <User size={48} className="text-gray-200 mb-4" />
                            <p className="text-lg font-medium text-gray-900">No personas found</p>
                        </div>
                    </td>
                </tr>
            ) : (
                filteredPersonas.map((persona) => (
              <tr 
                key={persona.id} 
                className="hover:bg-gray-50/80 transition-colors group cursor-pointer"
                onClick={() => onEdit && onEdit(persona)}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 flex items-center justify-center text-blue-600 font-bold overflow-hidden shrink-0 shadow-sm">
                        {persona.image && persona.image.startsWith('http') ? (
                            <img src={persona.image} alt={persona.name} className="w-full h-full object-cover" />
                        ) : (
                            persona.name.charAt(0)
                        )}
                    </div>
                    <div>
                      <div className="font-bold text-gray-900">{persona.name}</div>
                      <div className="text-sm text-gray-500">{persona.role}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {persona.usedIn > 0 ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                        Linked to {persona.usedIn} maps
                      </span>
                  ) : (
                      <span className="text-sm text-gray-400">(not used)</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {persona.updatedAt || 'Just now'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-600 border border-white shadow-sm">
                            {(persona.owner || 'U').charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm text-gray-600">{persona.owner || 'Unknown'}</span>
                    </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right flex items-center justify-end gap-2">
                    <Tooltip content="Duplicate">
                        <button 
                            onClick={(e) => { e.stopPropagation(); openConfirm('duplicate', persona); }}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                            <Copy size={18} />
                        </button>
                    </Tooltip>
                    <Tooltip content="Archive">
                        <button 
                            onClick={(e) => { e.stopPropagation(); onArchive && onArchive(persona.id); }}
                            className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                        >
                            <Archive size={18} />
                        </button>
                    </Tooltip>
                    <Tooltip content="Delete">
                        <button 
                            onClick={(e) => { e.stopPropagation(); openConfirm('delete', persona); }}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                            <Trash2 size={18} />
                        </button>
                    </Tooltip>
                </td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>

      <ConfirmModal 
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
        onConfirm={handleConfirmAction}
        title={confirmConfig.action === 'delete' ? "Delete Persona?" : "Duplicate Persona?"}
        message={confirmConfig.action === 'delete' 
            ? "Are you sure you want to delete this persona? This action cannot be undone." 
            : `Create a copy of "${confirmConfig.item?.name}"?`}
        confirmText={confirmConfig.action === 'delete' ? "Delete" : "Duplicate"}
        isDestructive={confirmConfig.action === 'delete'}
      />
    </div>
  );
};

export default Personas;