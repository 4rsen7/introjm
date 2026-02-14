import React from 'react';
import { X, Map, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const LinkedMapsModal = ({ isOpen, onClose, title, items = [] }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-2 max-h-[60vh] overflow-y-auto">
          {items.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">
              No linked maps found.
            </div>
          ) : (
            <div className="space-y-1">
              {items.map((item) => (
                <Link 
                  key={item.id} 
                  to={`/journey/${item.id}`}
                  className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg group transition-colors"
                  onClick={onClose}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                      <Map size={16} />
                    </div>
                    <span className="font-medium text-gray-700 group-hover:text-gray-900">{item.title}</span>
                  </div>
                  <ArrowRight size={16} className="text-gray-300 group-hover:text-blue-500 transition-colors" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LinkedMapsModal;