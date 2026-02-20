import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Search, Map } from 'lucide-react';

const JourneyPicker = ({ isOpen, onClose, journeys = [], onSelect }) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  const filteredJourneys = journeys.filter(j =>
    (j.title || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-scaleIn" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-800">{t('editor.linkJourneyMapTitle')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-4">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder={t('editor.placeholderSearchJourneys')}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {journeys.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">{t('common.createAnotherJourneyFirst')}</div>
            ) : filteredJourneys.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">{t('editor.noJourneysMatch')}</div>
            ) : (
              filteredJourneys.map((journey) => (
                <div
                  key={journey.id}
                  onClick={() => onSelect(journey)}
                  className="flex items-center gap-3 p-3 hover:bg-amber-50/50 rounded-lg cursor-pointer transition-colors border border-transparent hover:border-amber-200 hover:shadow-sm"
                >
                  <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
                    <Map size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">{journey.title || t('editor.untitled')}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default JourneyPicker;
