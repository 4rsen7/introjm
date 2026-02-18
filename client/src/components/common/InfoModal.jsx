import React from 'react';
import { CheckCircle } from 'lucide-react';

const InfoModal = ({ isOpen, onClose, title, message, buttonText = 'OK' }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-scaleIn p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-center mb-4">
          <CheckCircle className="w-12 h-12 text-green-500" strokeWidth={1.5} />
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-2 text-center">{title}</h2>
        <p className="text-gray-600 mb-6 text-center">{message}</p>
        <div className="flex justify-center">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-orange-600 text-white font-medium rounded-lg hover:bg-orange-700 transition-colors shadow-sm"
          >
            {buttonText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InfoModal;
