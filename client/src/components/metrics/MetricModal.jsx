import React from 'react';
import { X } from 'lucide-react';
import MetricBuilder from '../../pages/MetricBuilder';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';

export default function MetricModal({ isOpen, onClose, onSave, initialMetric }) {
  useBodyScrollLock(isOpen);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose}></div>
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
         <div className="absolute top-4 right-4 z-10">
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition bg-white shadow-sm border border-gray-100">
              <X size={20} />
            </button>
         </div>
         <MetricBuilder
            onBack={onClose}
            onSave={onSave}
            initialData={initialMetric ?? undefined}
         />
      </div>
    </div>
  )
}
