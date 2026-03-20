import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Sparkles, X } from 'lucide-react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';

export default function PortraitGenerationModal({ isOpen, onClose, interviews = [], onGenerate }) {
  const { t } = useTranslation();
  useBodyScrollLock(isOpen);

  const availableInterviews = useMemo(
    () => interviews.filter((interview) => (interview.transcript_data?.length || 0) > 0),
    [interviews]
  );

  const [selectedInterviewIds, setSelectedInterviewIds] = useState([]);
  const [title, setTitle] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setSelectedInterviewIds(availableInterviews[0]?.id ? [availableInterviews[0].id] : []);
    setTitle('');
    setError('');
    setIsGenerating(false);
  }, [availableInterviews, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (selectedInterviewIds.length === 0 || isGenerating) return;
    setIsGenerating(true);
    setError('');
    try {
      await onGenerate({
        interviewIds: selectedInterviewIds,
        title: title.trim(),
      });
      onClose();
    } catch (err) {
      setError(err.message || t('personas.portraits.generateFailed'));
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleInterview = (interviewId) => {
    setSelectedInterviewIds((current) => (
      current.includes(interviewId)
        ? current.filter((id) => id !== interviewId)
        : [...current, interviewId]
    ));
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{t('personas.portraits.generateTitle')}</h2>
            <p className="text-sm text-gray-500 mt-1">{t('personas.portraits.generateDesc')}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {availableInterviews.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center">
              <div className="text-sm font-medium text-gray-900">{t('personas.portraits.noInterviewsTitle')}</div>
              <p className="text-sm text-gray-500 mt-2">{t('personas.portraits.noInterviewsDesc')}</p>
            </div>
          ) : (
            <>
              <div>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <label className="block text-sm font-medium text-gray-700">{t('personas.portraits.sourceInterviews')}</label>
                  <span className="text-xs font-medium text-gray-500">
                    {t('personas.portraits.selectedInterviewsCount', { count: selectedInterviewIds.length })}
                  </span>
                </div>
                <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
                  {availableInterviews.map((interview) => {
                    const checked = selectedInterviewIds.includes(interview.id);
                    return (
                      <label key={interview.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleInterview(interview.id)}
                          className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900">{interview.title}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            {(interview.transcript_data?.length || 0)} {t('interviews.transcriptLines')}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-500 mt-2">{t('personas.portraits.sourceInterviewsHint')}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('personas.portraits.customTitle')}</label>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={t('personas.portraits.customTitlePlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition"
                />
                <p className="text-xs text-gray-500 mt-2">{t('personas.portraits.customTitleHint')}</p>
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('personas.portraits.methodology')}</div>
                <p className="text-sm text-slate-700 leading-relaxed">{t('personas.portraits.methodologyDesc')}</p>
              </div>
            </>
          )}

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-gray-700 hover:bg-gray-200 transition-colors">
            {t('interviews.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={selectedInterviewIds.length === 0 || availableInterviews.length === 0 || isGenerating}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white font-medium transition-colors ${
              selectedInterviewIds.length === 0 || availableInterviews.length === 0 || isGenerating
                ? 'bg-blue-300 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {isGenerating ? t('personas.portraits.generating') : t('personas.portraits.generateButton')}
          </button>
        </div>
      </div>
    </div>
  );
}
