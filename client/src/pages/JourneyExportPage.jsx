import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import JourneyMapView from '../components/journey/JourneyMapView';
import { parseMapData } from '../utils/parseMapData';
import { mapMetricToClient } from '../hooks/useQueries';

const API_URL = '/api';

export default function JourneyExportPage() {
  const { id } = useParams();
  const location = useLocation();
  const documentRef = useRef(null);
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState('');

  const token = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('token') || '';
  }, [location.search]);

  const parsed = useMemo(() => parseMapData(payload?.journey?.map_data), [payload?.journey?.map_data]);
  const globalJourneys = useMemo(() => payload?.journeys || [], [payload?.journeys]);
  const globalMetrics = useMemo(() => (payload?.metrics || []).map(mapMetricToClient), [payload?.metrics]);

  useEffect(() => {
    let active = true;

    document.body.dataset.exportReady = 'false';
    delete document.body.dataset.exportError;
    delete window.__ITEROJM_EXPORT__;

    if (!token) {
      setError('Missing export token');
      document.body.dataset.exportError = 'Missing export token';
      return undefined;
    }

    (async () => {
      try {
        const response = await fetch(`${API_URL}/export/journeys/${id}/document?token=${encodeURIComponent(token)}`, {
          cache: 'no-store',
        });
        const json = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(json?.message || 'Failed to load export document');
        }

        if (!active) return;
        setPayload(json.data);
      } catch (fetchError) {
        if (!active) return;
        const message = fetchError instanceof Error ? fetchError.message : 'Failed to load export document';
        setError(message);
        document.body.dataset.exportError = message;
      }
    })();

    return () => {
      active = false;
      delete document.body.dataset.exportReady;
      delete document.body.dataset.exportError;
      delete window.__ITEROJM_EXPORT__;
    };
  }, [id, token]);

  useEffect(() => {
    if (!payload || error) return undefined;

    const markReady = () => {
      const el = documentRef.current;
      if (!el) return;

      const width = Math.ceil(Math.max(el.scrollWidth, el.getBoundingClientRect().width));
      const height = Math.ceil(Math.max(el.scrollHeight, el.getBoundingClientRect().height));

      window.__ITEROJM_EXPORT__ = { ready: true, width, height };
      document.body.dataset.exportReady = 'true';
      document.body.dataset.exportWidth = String(width);
      document.body.dataset.exportHeight = String(height);
    };

    document.body.dataset.exportReady = 'false';
    const raf = requestAnimationFrame(() => requestAnimationFrame(markReady));
    const timeoutId = window.setTimeout(markReady, 200);

    let observer;
    if (typeof ResizeObserver !== 'undefined' && documentRef.current) {
      observer = new ResizeObserver(() => {
        document.body.dataset.exportReady = 'false';
        window.clearTimeout(timeoutId);
        window.setTimeout(markReady, 120);
      });
      observer.observe(documentRef.current);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timeoutId);
      observer?.disconnect();
    };
  }, [payload, error, parsed, globalJourneys, globalMetrics]);

  if (error) {
    return (
      <div className="min-h-screen bg-white text-gray-900 flex items-center justify-center p-8">
        <div className="max-w-xl text-center">
          <h1 className="text-xl font-semibold mb-2">Export failed</h1>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="min-h-screen bg-white text-gray-900 flex items-center justify-center p-8">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-orange-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-gray-900 p-8">
      <div ref={documentRef} data-export-document-root className="inline-flex flex-col bg-white w-max">
        <div className="px-6 py-4 border-b border-gray-100 shrink-0">
          <h1 className="text-lg font-bold text-gray-900 truncate">{payload.journey?.title || 'Journey'}</h1>
        </div>
        <div className="bg-white">
          <JourneyMapView
            lanes={parsed.lanes}
            gridColumns={parsed.gridColumns}
            cells={parsed.cells}
            emotionValues={parsed.emotionValues}
            globalMetrics={globalMetrics}
            globalJourneys={globalJourneys}
            onOpenLinkedJourneyPreview={() => {}}
          />
        </div>
      </div>
    </div>
  );
}
