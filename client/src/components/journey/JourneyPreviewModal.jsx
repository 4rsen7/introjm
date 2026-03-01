import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { X, Loader2 } from 'lucide-react';
import { getAuthToken } from '../../services/auth';
import { parseMapData } from '../../utils/parseMapData';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import JourneyMapView from './JourneyMapView';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5005/api';

const fetchJourney = async ({ queryKey }) => {
  const [_key, id] = queryKey;
  if (!id) return null;
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/journeys/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (response.status === 401) throw new Error('Unauthorized');
  if (!response.ok) throw new Error('Failed to fetch');
  const data = await response.json();
  return data.data;
};

export default function JourneyPreviewModal({
  isOpen,
  onClose,
  journeyId,
  journey: journeyProp,
  onOpen,
  globalMetrics = [],
  globalJourneys = [],
  onOpenLinkedJourneyPreview,
}) {
  const { t } = useTranslation();

  const { data: fetchedJourney, isLoading, isError } = useQuery({
    queryKey: ['journey', journeyId],
    queryFn: fetchJourney,
    enabled: Boolean(isOpen && journeyId && !journeyProp),
  });

  const journey = journeyProp ?? fetchedJourney;
  const title = journey?.title || t('editor.untitled');

  const mapState = useMemo(() => {
    if (!journey?.map_data) return { lanes: [], cells: {}, gridColumns: [], emotionValues: {} };
    return parseMapData(journey.map_data);
  }, [journey?.map_data]);

  useBodyScrollLock(isOpen);
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 cursor-pointer p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-7xl w-[98vw] max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center shrink-0">
          <h2 className="text-lg font-bold text-gray-900 truncate pr-4">{title}</h2>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => { onOpen?.(); onClose(); }}
              className="px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors"
            >
              {t('journeyPreview.openJourney')}
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1" aria-label={t('journeyPreview.close')}>
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto rounded-b-xl pt-0 pr-4 pb-4 pl-0" style={{ minHeight: '70vh' }}>
          {isLoading && !journey ? (
            <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
              <Loader2 size={24} className="animate-spin" />
              <span>{t('journeyPreview.loading')}</span>
            </div>
          ) : isError && !journey ? (
            <div className="py-16 text-center text-red-600 text-sm">{t('journeyPreview.errorLoading')}</div>
          ) : journey ? (
            <div className="origin-top-left w-max" style={{ zoom: 0.8 }}>
              <JourneyMapView
                lanes={mapState.lanes}
                gridColumns={mapState.gridColumns}
                cells={mapState.cells}
                emotionValues={mapState.emotionValues}
                globalMetrics={globalMetrics}
                globalJourneys={globalJourneys}
                onOpenLinkedJourneyPreview={onOpenLinkedJourneyPreview}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
