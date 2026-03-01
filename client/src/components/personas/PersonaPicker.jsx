import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Search, Plus } from 'lucide-react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';

const PersonaPicker = ({ isOpen, onClose, onSelect, onCreateNew, personas = [] }) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  // Фільтруємо персони за пошуковим запитом
  const filteredPersonas = personas.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-scaleIn" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-800">{t('personas.selectPersona')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder={t('personas.searchPersonas')} 
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {filteredPersonas.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">{t('personas.noPersonasFound')}</div>
            ) : (
                filteredPersonas.map(persona => (
                <div 
                    key={persona.id}
                    onClick={() => onSelect(persona)}
                    className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors border border-transparent hover:border-blue-200 hover:shadow-sm"
                >
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold overflow-hidden shrink-0">
                    {persona.image && persona.image.startsWith('http') ? (
                        <img src={persona.image} alt={persona.name} className="w-full h-full object-cover" />
                    ) : (
                        persona.name.charAt(0)
                    )}
                    </div>
                <div>
                  <div className="font-medium text-gray-900">{persona.name}</div>
                  <div className="text-xs text-gray-500">{persona.role}</div>
                </div>
              </div>
            )))}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100">
            <button 
                onClick={onCreateNew}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-blue-600 hover:bg-blue-50 rounded-lg font-medium transition-colors"
            >
              <Plus size={18} />
              {t('personas.createNewPersona')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PersonaPicker;