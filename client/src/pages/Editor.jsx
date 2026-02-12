import React, { useState, useRef, useEffect, useMemo } from 'react'
import { ArrowLeft, Plus, ZoomIn, ZoomOut, Hand, MousePointer, RotateCcw, List, AlignLeft, Activity, Image as ImageIcon, ChevronDown, Info, MoreHorizontal, Copy, Trash2, Check, Download, User, Cloud, Loader2 } from 'lucide-react'
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { 
  DndContext, 
  closestCenter, 
  closestCorners,
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors,
  DragOverlay
} from '@dnd-kit/core';
import { 
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy, 
  useSortable 
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import TextLane from '../components/journey/TextLane'
import EmotionLane from '../components/journey/EmotionLane'
import ColumnHeader from '../components/common/ColumnHeader'
import JourneyCard from '../components/journey/JourneyCard'
import PersonaPanel from '../components/personas/PersonaPanel'
import PersonaModal from '../components/personas/PersonaModal'
import JourneyLoader from '../components/journey/JourneyLoader'
import PersonaPicker from '../components/personas/PersonaPicker'
import MetricPicker from '../components/metrics/MetricPicker'
import MetricModal from '../components/metrics/MetricModal'
import ConfirmModal from '../ConfirmModal'
import { supabase } from '../supabaseClient'
import { getAuthToken } from '../services/auth'

// Fallback to localhost:5001 if env var is missing
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

const PRINT_STYLES = `
  /* Clean Print Mode */
  /* .is-exporting .hide-on-export { display: none !important; } */ /* Disabled to keep all elements visible */
  .is-exporting { background: white !important; height: auto !important; overflow: visible !important; }

  @media print {
    @page { size: landscape; margin: 0.5cm; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white; }
    
    /* Hide non-printable elements */
    header, .fixed.bottom-6, .sticky button, .group\\/header button { display: none !important; }
    
    /* Reset layout for print */
    .flex-col { display: block !important; }
    .h-full { height: auto !important; }
    .overflow-auto { overflow: visible !important; }
    .sticky { position: static !important; }
    
    /* Ensure content visibility */
    .inline-flex { display: block !important; }
  }
  /* Ensure hidden elements are hidden in print media as well if class is present */
  @media print { .hide-on-export { display: none !important; } }
`;

const fetchJourney = async ({ queryKey }) => {
  const [_key, id] = queryKey;
  if (!id) return null;
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/journeys/${id}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (response.status === 401) throw new Error('Unauthorized');
  if (!response.ok) throw new Error('Failed to fetch');
  const data = await response.json();
  return data.data;
};

function SortableLaneItem({ id, children, zIndexOverride, isPinned, stickyTop }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    // Only apply transform if dragging to prevent breaking 'position: sticky'
    transform: transform ? CSS.Transform.toString(transform) : undefined,
    transition,
    zIndex: isDragging ? 100 : (isPinned ? 40 : (zIndexOverride || 'auto')),
    position: isPinned ? 'sticky' : 'relative',
    top: isPinned ? stickyTop : 'auto', 
  };
  return (
    <div ref={setNodeRef} style={style} className={`${isDragging ? "opacity-50 shadow-lg ring-1 ring-orange-200 rounded-lg z-50 bg-white" : ""} mb-4`}>
      {React.Children.map(children, child => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child, { dragHandleProps: { ...attributes, ...listeners } });
        }
        return child;
      })}
    </div>
  );
}

export default function Editor({ onBack, globalPersonas = [], globalMetrics = [], onSaveGlobalPersona, onSaveGlobalMetric }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const location = useLocation();
  const journeyId = id;
  const headerRef = useRef(null);
  const [gridColumns, setGridColumns] = useState(Array.from({ length: 5 }, (_, i) => ({ id: `col-${i + 1}` })))
  const [elevatedLaneId, setElevatedLaneId] = useState(null)
  const [activeDragItem, setActiveDragItem] = useState(null);
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [activePickerId, setActivePickerId] = useState(null);
  const fileInputRef = useRef(null);
  const [uploadTargetCardId, setUploadTargetCardId] = useState(null);

  const [lanes, setLanes] = useState([
    { id: 'stages-1', title: 'Journey Stages', type: 'stage', color: 'bg-gray-50', isPinned: true }, 
    { id: 1, title: 'User Goals', type: 'text', color: 'bg-gray-50' },
    { id: 2, title: 'Touchpoints', type: 'text', color: 'bg-gray-50' },
    { id: 3, title: 'Emotional State', type: 'emotion', color: 'bg-gray-50' },
  ])

  const initialCells = {
    'stages-1': {
      'col-1': { cards: [{ id: 's1', type: 'stage', content: 'Awareness', color: 'bg-blue-100', span: 1 }] },
      'col-2': { cards: [{ id: 's2', type: 'stage', content: 'Consideration', color: 'bg-purple-100', span: 1 }] },
      'col-3': { cards: [{ id: 's3', type: 'stage', content: 'Decision', color: 'bg-green-100', span: 1 }] },
      'col-4': { cards: [{ id: 's4', type: 'stage', content: 'Retention', color: 'bg-orange-100', span: 1 }] },
      'col-5': { cards: [{ id: 's5', type: 'stage', content: 'Advocacy', color: 'bg-pink-100', span: 1 }] },
    }
  }

  const [cells, setCells] = useState(initialCells)
  const [emotionValues, setEmotionValues] = useState({})

  // --- MAP METADATA ---
  const [journeyMeta, setJourneyMeta] = useState({
    title: 'Untitled Journey',
    description: '',
    status: 'draft',
    owner: ''
  })
  const [showDetails, setShowDetails] = useState(false)
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false)

  // --- PERSONA ---
  const [persona, setPersona] = useState(null)
  const [isPersonaModalOpen, setIsPersonaModalOpen] = useState(false)
  const [isPersonaExpanded, setIsPersonaExpanded] = useState(false)
  const [isPersonaPickerOpen, setIsPersonaPickerOpen] = useState(false)

  // --- METRICS ---
  const [isMetricPickerOpen, setIsMetricPickerOpen] = useState(false)
  const [pendingMetricLocation, setPendingMetricLocation] = useState(null)
  const [isMetricModalOpen, setIsMetricModalOpen] = useState(false)

  // --- ZOOM & PAN ---
  const [zoom, setZoom] = useState(1)
  const [isHandMode, setIsHandMode] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const scrollContainerRef = useRef(null)
  const hasMoved = useRef(false)
  const [isAddLaneMenuOpen, setIsAddLaneMenuOpen] = useState(false)
  const [activeColMenu, setActiveColMenu] = useState(null)
  const [isExporting, setIsExporting] = useState(false)
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, type: null, data: null });
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [isMinLoadComplete, setIsMinLoadComplete] = useState(false);

  // Sync local persona with global data (DB source of truth) whenever globalPersonas updates
  useEffect(() => {
    if (persona?.id && globalPersonas.length > 0) {
      const freshPersona = globalPersonas.find(p => p.id === persona.id);
      if (freshPersona && JSON.stringify(freshPersona) !== JSON.stringify(persona)) {
        setPersona(freshPersona);
      }
    }
  }, [globalPersonas, persona?.id]);

  // Ensure persona has all expected arrays to prevent crashes in PersonaPanel
  const safePersona = useMemo(() => {
      if (!persona) return null;
      return {
          ...persona,
          goals: Array.isArray(persona.goals) ? persona.goals : [],
          frustrations: Array.isArray(persona.frustrations) ? persona.frustrations : [],
          motivations: Array.isArray(persona.motivations) ? persona.motivations : [],
          painPoints: Array.isArray(persona.painPoints) ? persona.painPoints : [],
          bio: persona.bio || '',
          age: persona.age || '',
          location: persona.location || ''
      };
  }, [persona]);

  // --- DATA LOADING (React Query) ---
  const { 
    data: journeyData, 
    error: queryError, 
    isLoading: isQueryLoading,
    isError: isQueryError 
  } = useQuery({
    queryKey: ['journey', journeyId],
    queryFn: fetchJourney,
    enabled: !!journeyId,
    initialData: location.state?.preloadedJourney,
    staleTime: 1000 * 60 * 5, // 5 mins
    gcTime: 1000 * 60 * 60 * 24, // 24 hours (persist)
  });

  // Helper to load data into state
  const loadJourneyState = (j) => {
    setJourneyMeta({
      title: j.title,
      description: j.description || '',
      status: j.status || 'draft',
      owner: j.owner || ''
    });

    if (j.map_data) {
       let mapData = j.map_data;
       if (typeof mapData === 'string') {
           try { mapData = JSON.parse(mapData); } catch (e) { console.error(e); setLoadError(true); return; }
       }
       if (mapData.lanes) setLanes(mapData.lanes);
       if (mapData.cells) setCells(mapData.cells);
       if (mapData.gridColumns) setGridColumns(mapData.gridColumns);
       if (mapData.emotionValues) setEmotionValues(mapData.emotionValues);
       if (mapData.persona) {
           // Try to find fresh data from global state, fallback to snapshot
           const freshPersona = globalPersonas.find(p => p.id === mapData.persona.id);
           setPersona(freshPersona || mapData.persona);
       }
    }
  };

  useEffect(() => {
    if (journeyData && !isDataLoaded) {
      loadJourneyState(journeyData);
      setIsDataLoaded(true);
    }
  }, [journeyData, isDataLoaded]);

  // Force minimum load time for UX (to show tips and smooth transition)
  useEffect(() => {
    const timer = setTimeout(() => setIsMinLoadComplete(true), 1500); // 1.5s delay
    return () => clearTimeout(timer);
  }, []);

  // Handle Auth Errors
  useEffect(() => {
    if (queryError?.message === 'Unauthorized') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      supabase.auth.signOut();
      queryClient.removeQueries(); // Clear cache on unauthorized
      navigate('/');
    }
  }, [queryError, navigate]);

  // Auto-save Effect
  useEffect(() => {
    // SAVE GUARD: Never save if data hasn't loaded successfully or if there's an error
    if (!journeyId || !isDataLoaded || loadError || isQueryError) return;

    const controller = new AbortController();

    const saveData = async () => {
      setIsSaving(true);
      try {
        const token = await getAuthToken();
        const map_data = {
          lanes,
          cells,
          gridColumns,
          persona,
          emotionValues
        };
        
        const payload = {
          title: journeyMeta.title,
          description: journeyMeta.description,
          status: journeyMeta.status,
          map_data
        };

        const response = await fetch(`${API_URL}/journeys/${journeyId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        
        if (response.ok) {
            setLastSaved(new Date());
            // Update cache with latest state to ensure persistence is up to date
            queryClient.setQueryData(['journey', journeyId], (old) => ({
              ...old,
              title: payload.title,
              description: payload.description,
              status: payload.status,
              map_data: payload.map_data
            }));

            // Оновлюємо загальний список мап, щоб Дашборд побачив нову назву та дату
            queryClient.invalidateQueries({ queryKey: ['journeys'] });
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error("Auto-save failed:", error);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSaving(false);
        }
      }
    };

    const timer = setTimeout(saveData, 2000); // Debounce 2s
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [journeyId, lanes, cells, gridColumns, journeyMeta, isDataLoaded, loadError, isQueryError, persona, queryClient, emotionValues]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const onWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setZoom(z => Math.max(0.5, Math.min(2, Number((z + delta).toFixed(1)))));
      }
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, []);

  const handleMouseDown = (e) => {
    hasMoved.current = false;
    if (e.button === 1 || (isHandMode && e.button === 0)) {
      setIsPanning(true);
      e.preventDefault();
    }
  }
  const handleMouseUp = () => setIsPanning(false)
  const handleMouseMove = (e) => {
    if (isPanning) {
      hasMoved.current = true;
      window.scrollBy(-e.movementX, -e.movementY);
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // --- ACTIONS ---
  const handleAddLane = (type) => {
    const newLaneId = Date.now()
    let newLane = { id: newLaneId, color: 'bg-gray-50' }
    let initialCard = null

    switch (type) {
      case 'stage':
        newLane = { ...newLane, title: 'Stages', type: 'stage', color: 'bg-gray-50', isPinned: false }
        initialCard = { id: `c-${Date.now()}`, type: 'stage', content: 'New Stage', span: 1, color: 'bg-blue-100' }
        break
      case 'text':
        newLane = { ...newLane, title: 'Text', type: 'text' }
        initialCard = { id: `c-${Date.now()}`, type: 'text', content: '' }
        break
      case 'image':
        newLane = { ...newLane, title: 'Images', type: 'text' }
        initialCard = { id: `c-${Date.now()}`, type: 'image', content: '' }
        break
      case 'emotion':
        newLane = { ...newLane, title: 'Emotion', type: 'emotion' }
        break
    }

    setLanes([...lanes, newLane])
    
    if (initialCard && gridColumns.length > 0) {
      const firstColId = gridColumns[0].id
      setCells(prev => ({ ...prev, [newLaneId]: { [firstColId]: { cards: [initialCard] } } }))
    }
    
    setIsAddLaneMenuOpen(false)
  }
  const handleDeleteLane = (laneId) => { 
      setConfirmConfig({ isOpen: true, type: 'delete-lane', data: laneId });
  }
  const handleDuplicateLane = (laneId) => {
    const originalLane = lanes.find(l => l.id === laneId);
    const newId = Date.now();
    const newLane = { ...originalLane, id: newId, title: `${originalLane.title} (Copy)` };
    const index = lanes.findIndex(l => l.id === laneId);
    const newLanes = [...lanes];
    newLanes.splice(index + 1, 0, newLane);
    setLanes(newLanes);

    if (cells[laneId]) {
      const newLaneCells = JSON.parse(JSON.stringify(cells[laneId]));
      Object.values(newLaneCells).forEach(col => {
        if(col.cards) col.cards.forEach(c => c.id = Math.random().toString(36).substr(2, 9));
      });
      setCells(prev => ({ ...prev, [newId]: newLaneCells }));
    }
  }
  const handleUpdateLane = (laneId, updates) => { setLanes(lanes.map(l => l.id === laneId ? { ...l, ...updates } : l)); }
  
  const handleAddCard = (laneId, colId, type) => {
    if (type === 'metric') {
        setPendingMetricLocation({ laneId, colId });
        setIsMetricPickerOpen(true);
        return;
    }

    const newCard = { id: `c-${Date.now()}`, type, content: '', color: type === 'stage' ? 'bg-purple-100' : undefined };
    setCells(prev => {
      const laneCells = prev[laneId] || {};
      const colData = laneCells[colId] || { cards: [] };
      return { ...prev, [laneId]: { ...laneCells, [colId]: { ...colData, cards: [...colData.cards, newCard] } } }
    })
  }

  const handleSelectMetric = (metric) => {
      if (!pendingMetricLocation) return;
      const { laneId, colId } = pendingMetricLocation;
      const newCard = { id: `c-${Date.now()}`, type: 'metric', content: metric.id }; // Store metric ID as content
      setCells(prev => {
        const laneCells = prev[laneId] || {};
        const colData = laneCells[colId] || { cards: [] };
        return { ...prev, [laneId]: { ...laneCells, [colId]: { ...colData, cards: [...colData.cards, newCard] } } }
      });
      setIsMetricPickerOpen(false);
      setPendingMetricLocation(null);
  }

  const handleCreateMetric = (metricData) => {
      const newMetric = onSaveGlobalMetric(metricData);
      setIsMetricModalOpen(false);
      // Add the newly created metric to the map
      handleSelectMetric(newMetric);
  }

  const handleUpdateCard = (laneId, colId, updatedCard) => {
    setCells(prev => {
      const laneCells = prev[laneId] || {};
      const colData = laneCells[colId] || { cards: [] };
      return { ...prev, [laneId]: { ...laneCells, [colId]: { ...colData, cards: colData.cards.map(c => c.id === updatedCard.id ? updatedCard : c) } } }
    })
  }
  const handleDeleteCard = (laneId, colId, cardId) => {
    setCells(prev => {
      const laneCells = prev[laneId] || {};
      const colData = laneCells[colId] || { cards: [] };
      return { ...prev, [laneId]: { ...laneCells, [colId]: { ...colData, cards: colData.cards.filter(c => c.id !== cardId) } } }
    })
  }
  const handleUpdateEmotion = (laneId, colId, value) => { setEmotionValues(prev => ({ ...prev, [laneId]: { ...prev[laneId], [colId]: value } })) }

  const handleTogglePin = (laneId) => {
    setLanes(prev => prev.map(l => l.id === laneId ? { ...l, isPinned: !l.isPinned } : l));
  }

  // Helper to find active lane for z-index elevation
  const activeLaneId = selectedCardId ? Object.keys(cells).find(laneId => 
    Object.values(cells[laneId] || {}).some(col => 
      col.cards?.some(c => c.id === selectedCardId)
    )
  ) : null;

  // --- MAP ACTIONS ---
  const handleDuplicateMap = () => {
    setConfirmConfig({ isOpen: true, type: 'duplicate-map' });
    setIsHeaderMenuOpen(false)
  }

  const handleClearMap = () => {
    setConfirmConfig({ isOpen: true, type: 'clear-map' });
    setIsHeaderMenuOpen(false);
  }

  const handleTriggerImageUpload = (cardId) => {
    setUploadTargetCardId(cardId);
    fileInputRef.current?.click();
  }

  const handleImageFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // 1. Validate Size (2MB)
    if (file.size > 2 * 1024 * 1024) {
        alert("File is too large. Maximum size is 2MB.");
        e.target.value = '';
        return;
    }

    try {
        // 2. Upload to Supabase Storage
        const fileExt = file.name.split('.').pop();
        const fileName = `${uploadTargetCardId}-${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('journey_images')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        // 3. Get Public URL
        const { data: { publicUrl } } = supabase.storage
            .from('journey_images')
            .getPublicUrl(filePath);

        // 4. Update Card Content
        const container = findContainer(uploadTargetCardId);
        if (container) {
            const { laneId, colId } = container;
            const card = cells[laneId][colId].cards.find(c => c.id === uploadTargetCardId);
            if (card) handleUpdateCard(laneId, colId, { ...card, content: publicUrl });
        }
    } catch (error) {
        console.error("Image upload failed:", error);
        alert(`Failed to upload image: ${error.message || "Unknown error"}`);
    } finally {
        setUploadTargetCardId(null);
        e.target.value = '';
    }
  }

  const handleConfirmAction = async () => {
      if (confirmConfig.type === 'delete-lane') {
          setLanes(lanes.filter(l => l.id !== confirmConfig.data));
      } else if (confirmConfig.type === 'clear-map') {
          setCells({});
          setEmotionValues({});
          setLanes(prev => prev.filter(l => l.isPinned)); // Optional: keep only pinned lanes or reset to default
          // For now, let's just clear content as before
      } else if (confirmConfig.type === 'duplicate-map') {
          try {
              const token = await getAuthToken();
              const response = await fetch(`${API_URL}/journeys/${journeyId}/duplicate`, {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${token}` }
              });
              if (!response.ok) throw new Error('Failed to duplicate journey');
              const { data } = await response.json();
              // Pass the new data directly to the route state to avoid race conditions
              navigate(`/journey/${data.id}`, { state: { preloadedJourney: data } });
          } catch (error) {
              console.error("Failed to duplicate journey:", error);
          }
      }
      setConfirmConfig({ isOpen: false, type: null, data: null });
  }

  const handleExport = async () => {
    try {
      setIsExporting(true);
      setIsGeneratingPdf(true);
      setSelectedCardId(null); // Deselect any active card
      setIsHeaderMenuOpen(false);

      // Allow DOM to update
      await new Promise(resolve => setTimeout(resolve, 100));

      // Store current zoom and reset to 1 for capture to ensure best quality
      const originalZoom = zoom;
      setZoom(1);
      
      // Save window scroll and scroll to top to prevent html2canvas offsets
      const originalScrollX = window.scrollX;
      const originalScrollY = window.scrollY;
      window.scrollTo(0, 0);
      
      // Wait for zoom reset render
      await new Promise(resolve => setTimeout(resolve, 500));

      const headerElement = headerRef.current;
      const mapElement = scrollContainerRef.current.firstElementChild;
      
      const mapWidth = mapElement.scrollWidth;
      const mapHeight = mapElement.scrollHeight;
      const headerHeight = headerElement.offsetHeight;
      
      // Calculate total dimensions
      // Ensure header spans full width if map is wider than viewport
      const totalWidth = Math.max(mapWidth, headerElement.offsetWidth);
      const totalHeight = headerHeight + mapHeight + 50; // Add buffer to prevent bottom clipping
      
      // --- CLONE STRATEGY (FIXED) ---
      // Create a temporary container to hold the clone
      // Using absolute position at 0,0 ensures html2canvas captures the full content
      // regardless of viewport size, provided we scrolled to top.
      const container = document.createElement('div');
      Object.assign(container.style, {
          position: 'absolute',
          top: '0',
          left: '0',
          zIndex: '-9999',
          width: `${totalWidth}px`,
          height: `${totalHeight}px`,
          overflow: 'visible', // Ensure content isn't clipped
          backgroundColor: '#ffffff',
          display: 'flex',
          flexDirection: 'column'
      });

      // 1. Clone Header
      const headerClone = headerElement.cloneNode(true);
      Object.assign(headerClone.style, {
          width: '100%',
          flexShrink: '0',
          height: `${headerHeight}px`, // Fix height to match original exactly
          minHeight: `${headerHeight}px`,
          position: 'static',
          overflow: 'visible', // Keep shadows and borders visible
          zIndex: '10'
      });

      // 2. Clone Map
      const mapClone = mapElement.cloneNode(true);
      
      // Force dimensions and reset transforms on clone
      Object.assign(mapClone.style, {
          width: `${mapWidth}px`,
          height: `${mapHeight}px`,
          transform: 'none',
          zoom: '1',
          overflow: 'visible',
          position: 'relative' // Ensure proper stacking context
      });

      container.appendChild(headerClone);
      container.appendChild(mapClone);
      
      // Add class to trigger hide-on-export styles inside clones
      container.classList.add('is-exporting');

      document.body.appendChild(container);

      // --- CRITICAL FIX FOR STICKY HEADERS ---
      // Convert sticky elements to relative in the clone to ensure they are captured 
      // in their natural position and not clipped or displaced by html2canvas.
      const stickyElements = container.querySelectorAll('.sticky');
      stickyElements.forEach(el => {
          el.style.position = 'relative';
          el.style.top = 'auto';
          el.style.left = 'auto';
          el.style.transform = 'none';
      });

      // Wait for clone to render layout
      await new Promise(resolve => setTimeout(resolve, 200));

      const canvas = await html2canvas(container, {
        scale: 2, // Higher quality
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
        width: totalWidth,
        height: totalHeight,
        windowWidth: totalWidth,
        windowHeight: totalHeight,
        x: 0,
        y: 0,
        scrollX: 0,
        scrollY: 0,
      });

      // Cleanup: Remove clone from DOM
      document.body.removeChild(container);
      window.scrollTo(originalScrollX, originalScrollY); // Restore scroll position

      const imgData = canvas.toDataURL('image/png');
      
      // Create PDF with dimensions matching the canvas (Auto-Landscape/Portrait)
      const pdf = new jsPDF({
        orientation: totalWidth > totalHeight ? 'landscape' : 'portrait',
        unit: 'px',
        format: [totalWidth, totalHeight]
      });

      pdf.addImage(imgData, 'PNG', 0, 0, totalWidth, totalHeight);
      pdf.save(`${journeyMeta.title || 'journey-map'}.pdf`);

      // Restore zoom
      setZoom(originalZoom);
    } catch (error) {
      console.error("Export failed:", error);
    } finally {
      setIsExporting(false);
      setIsGeneratingPdf(false);
    }
  }

  const handleSavePersona = async (formData) => {
    const tempId = persona?.id || Date.now();
    const newPersona = {
        ...persona, // Зберігаємо існуючі поля (наприклад, ті, що не редагуються в модалці)
        ...formData, 
        id: tempId
    }
    setPersona(newPersona) // Optimistic update
    setIsPersonaModalOpen(false)

    const savedPersona = await onSaveGlobalPersona(newPersona)
    if (savedPersona) {
        setPersona(savedPersona) // Update with real ID/Data from server
    }
  }

  const handleDisconnectPersona = () => {
    setPersona(null);
    setIsPersonaExpanded(false);
  }

  // --- DRAG & DROP LOGIC ---
  const findContainer = (id) => {
    if (String(id).includes('::')) {
       const [l, c] = id.split('::');
       return { laneId: l, colId: c, isContainer: true };
    }
    for (const laneId in cells) {
      for (const colId in cells[laneId]) {
        if (cells[laneId][colId].cards.find(c => c.id === id)) {
          return { laneId, colId };
        }
      }
    }
    return null;
  };

  const handleDragStart = (event) => {
    const { active } = event;
    if (active.data.current?.type === 'card') {
      setActiveDragItem(active.data.current.card);
    }
    setSelectedCardId(null);
  }

  const handleDragOver = (event) => {
    const { active, over } = event;
    if (!over) return;

    if (active.data.current?.type === 'card') {
      const activeId = active.id;
      const overId = over.id;

      const activeContainer = findContainer(activeId);
      const overContainer = findContainer(overId);

      if (!activeContainer || !overContainer) return;

      // Якщо переміщуємо в ІНШИЙ контейнер (колонку)
      if (activeContainer.laneId !== overContainer.laneId || activeContainer.colId !== overContainer.colId) {
        setCells((prev) => {
          // 1. Копіюємо стан
          const newState = { ...prev };
          
          // 2. Безпечно дістаємо Lane
          const activeLane = newState[activeContainer.laneId] ? { ...newState[activeContainer.laneId] } : {};
          newState[activeContainer.laneId] = activeLane;
          
          let overLane;
          if (activeContainer.laneId === overContainer.laneId) {
            overLane = activeLane;
          } else {
            overLane = newState[overContainer.laneId] ? { ...newState[overContainer.laneId] } : {};
            newState[overContainer.laneId] = overLane;
          }

          // 3. Безпечно дістаємо Column (Source)
          const activeColData = activeLane[activeContainer.colId];
          if (!activeColData || !activeColData.cards) return prev; // Захист від крашу
          
          const activeCol = { ...activeColData };
          activeLane[activeContainer.colId] = activeCol;
          activeCol.cards = [...activeCol.cards];

          // 4. Безпечно дістаємо Column (Destination)
          const overColData = overLane[overContainer.colId];
          // Якщо в новій колонці нічого немає, створюємо пустий об'єкт
          const overCol = overColData ? { ...overColData } : { cards: [] };
          overLane[overContainer.colId] = overCol;
          // Захист: якщо cards undefined, робимо пустий масив
          overCol.cards = overCol.cards ? [...overCol.cards] : [];

          // 5. Знаходимо індекси
          const activeIndex = activeCol.cards.findIndex(c => c.id === activeId);
          if (activeIndex === -1) return prev;

          // 6. Видаляємо зі старого місця
          const [movedCard] = activeCol.cards.splice(activeIndex, 1);

          // 7. Вставляємо в нове місце
          let newIndex;
          if (overContainer.isContainer) {
            newIndex = overCol.cards.length + 1;
          } else {
            const overIndex = overCol.cards.findIndex(c => c.id === overId);
            const isBelowOverItem = over && active.rect.current.translated && active.rect.current.translated.top > over.rect.top + over.rect.height;
            const modifier = isBelowOverItem ? 1 : 0;
            newIndex = overIndex >= 0 ? overIndex + modifier : overCol.cards.length + 1;
          }
          
          overCol.cards.splice(newIndex, 0, movedCard);

          return newState;
        });
      }
    }
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveDragItem(null);

    // Lane Reordering
    if (!active.data.current?.type && active.id !== over?.id) {
        setLanes((items) => {
            const oldIndex = items.findIndex((item) => item.id === active.id);
            const newIndex = items.findIndex((item) => item.id === over.id);
            return arrayMove(items, oldIndex, newIndex);
        });
        return;
    }

    // Card Reordering (same container)
    if (active.data.current?.type === 'card' && over) {
        const activeContainer = findContainer(active.id);
        const overContainer = findContainer(over.id);

        if (activeContainer && overContainer && 
            !activeContainer.isContainer && !overContainer.isContainer &&
            activeContainer.laneId === overContainer.laneId && 
            activeContainer.colId === overContainer.colId) {
            
            const laneId = activeContainer.laneId;
            const colId = activeContainer.colId;
            setCells(prev => {
                const lane = prev[laneId];
                const col = lane[colId];
                const cards = col.cards;
                
                const oldIndex = cards.findIndex(c => c.id === active.id);
                const newIndex = cards.findIndex(c => c.id === over.id);
                
                return {
                    ...prev,
                    [laneId]: {
                        ...lane,
                        [colId]: {
                            ...col,
                            cards: arrayMove(cards, oldIndex, newIndex)
                        }
                    }
                }
            });
        }
    }
  };

  const handleAddColumnRight = (index) => { const newCols = [...gridColumns]; newCols.splice(index + 1, 0, { id: `col-${Date.now()}` }); setGridColumns(newCols); }
  const handleMoveColumnLeft = (index) => { if (index === 0) return; const newCols = [...gridColumns]; const [col] = newCols.splice(index, 1); newCols.splice(index - 1, 0, col); setGridColumns(newCols); }
  const handleMoveColumnRight = (index) => { if (index === gridColumns.length - 1) return; const newCols = [...gridColumns]; const [col] = newCols.splice(index, 1); newCols.splice(index + 1, 0, col); setGridColumns(newCols); }
  const handleDeleteColumn = (index) => { const newCols = [...gridColumns]; newCols.splice(index, 1); setGridColumns(newCols); }

  if ((!isMinLoadComplete || !isDataLoaded || isQueryLoading) && !isQueryError) return <JourneyLoader />

  // Calculate dynamic sticky offsets based on zoom
  // 64px is the height of the fixed main header
  // 48px is the height of the column header row
  const stickyColHeaderTop = `${64 / zoom}px`;
  const stickyLaneTop = `${(64 / zoom) + 48}px`;

  return (
    <div className="flex flex-col min-h-screen bg-white pt-16">
      {/* PDF Generation Overlay */}
      {isGeneratingPdf && (
        <div className="fixed inset-0 z-[9999] bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-200">
            <div className="bg-white p-6 rounded-2xl shadow-xl border border-gray-100 flex flex-col items-center">
                <Loader2 className="w-10 h-10 text-orange-600 animate-spin mb-4" />
                <h3 className="text-lg font-bold text-gray-900">Generating PDF...</h3>
                <p className="text-sm text-gray-500 mt-1">Preparing your journey map for export</p>
            </div>
        </div>
      )}
      <style>{PRINT_STYLES}</style>
      <header 
        ref={headerRef}
        className={`bg-white border-b border-gray-200 shrink-0 z-[70] fixed top-0 left-0 w-full shadow-sm ${isExporting ? 'border-none shadow-none' : ''}`}
        onMouseDown={() => setSelectedCardId(null)}
      >
        <div className="h-16 flex items-center px-6 justify-between">
          <div className="flex items-center gap-4 flex-1 w-full">
            <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition hide-on-export"><ArrowLeft size={20} /></button>
            
            <div className="flex items-center gap-2 flex-1 max-w-xl">
              <input 
                className="text-lg font-bold text-gray-900 bg-transparent outline-none hover:bg-gray-50 focus:bg-gray-50 rounded px-2 py-1 transition-colors w-full"
                value={journeyMeta.title}
                onChange={(e) => setJourneyMeta({ ...journeyMeta, title: e.target.value })}
              />
              <button 
                onClick={() => setShowDetails(!showDetails)}
                className={`p-1 rounded-full hover:bg-gray-100 text-gray-400 transition hide-on-export ${showDetails ? 'bg-gray-100 text-gray-600 rotate-180' : ''}`}
              >
                <ChevronDown size={20} />
              </button>

              <div className="relative hide-on-export">
                <button 
                  onClick={() => setIsHeaderMenuOpen(!isHeaderMenuOpen)}
                  className={`p-1 rounded-full hover:bg-gray-100 transition ${isHeaderMenuOpen ? 'bg-gray-100 text-gray-900' : 'text-gray-400'}`}
                >
                  <MoreHorizontal size={20} />
                </button>
                
                {isHeaderMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsHeaderMenuOpen(false)}></div>
                    <div className="absolute top-full left-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-gray-100 z-[100] overflow-hidden py-1">
                        <button onClick={handleExport} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                          <Download size={16} className="text-gray-400" /> Export PDF
                        </button>
                        <div className="h-px bg-gray-100 my-1"></div>
                        <button onClick={handleDuplicateMap} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                          <Copy size={16} className="text-gray-400" /> Duplicate Journey
                        </button>
                        <div className="h-px bg-gray-100 my-1"></div>
                        <button onClick={handleClearMap} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                          <RotateCcw size={16} className="text-gray-400" /> Clear Content
                        </button>
                    </div>
                  </>
                )}
              </div>

              {/* PERSONA PANEL (Moved here) */}
              <PersonaPanel 
                persona={safePersona} 
                isExpanded={isPersonaExpanded} 
                onToggle={() => {
                  if (!persona) setIsPersonaPickerOpen(true);
                  else setIsPersonaExpanded(!isPersonaExpanded);
                }} 
                onEdit={() => setIsPersonaModalOpen(true)}
                onDisconnect={handleDisconnectPersona}
                isExporting={false}
              />
            </div>

            {/* Save Status Indicator */}
            <div className="flex items-center gap-2 text-xs font-medium text-gray-400 hide-on-export min-w-[80px] justify-end ml-auto">
                {isSaving ? (
                    <><div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div> Saving...</>
                ) : lastSaved ? (
                    <><Cloud size={14} /> Saved</>
                ) : null}
            </div>
          </div>
        </div>

        <div className={`overflow-hidden transition-all duration-300 ease-in-out bg-gray-50/50 hide-on-export ${showDetails ? 'max-h-96 border-t border-gray-100 opacity-100' : 'max-h-0 border-t-0 opacity-0'}`}>
          <div className="px-6 py-6 grid grid-cols-1 md:grid-cols-3 gap-8 shadow-inner">
             <div className="md:col-span-2 space-y-2">
               <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Description</label>
               <textarea 
                 className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 h-24 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 resize-none bg-white transition-all"
                 placeholder="Add a description for this journey map..."
                 value={journeyMeta.description}
                 onChange={(e) => setJourneyMeta({ ...journeyMeta, description: e.target.value })}
               />
             </div>
             <div className="space-y-5">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Status</label>
                  <div className="relative">
                    <select 
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 bg-white appearance-none cursor-pointer"
                      value={journeyMeta.status}
                      onChange={(e) => setJourneyMeta({ ...journeyMeta, status: e.target.value })}
                    >
                      <option value="draft">Draft</option>
                      <option value="live">Live</option>
                      <option value="archived">Archived</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Owner</label>
                  <input 
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 bg-white"
                    placeholder="Add owner..."
                    value={journeyMeta.owner}
                    onChange={(e) => setJourneyMeta({ ...journeyMeta, owner: e.target.value })}
                  />
                </div>
             </div>
          </div>
        </div>
      </header>

      <div 
        ref={scrollContainerRef}
        id="journey-editor-container"
        className={`flex-1 bg-white relative ${isHandMode ? 'cursor-grab active:cursor-grabbing' : ''} ${isExporting ? 'is-exporting' : ''}`}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onMouseMove={handleMouseMove}
        onClick={() => { if (!hasMoved.current) { setSelectedCardId(null); setActivePickerId(null); } }}
      >
        <div className="inline-flex flex-col w-max pb-20 origin-top-left" style={{ zoom: zoom, pointerEvents: isHandMode ? 'none' : 'auto' }}>

          <div 
            className={`flex sticky ${activeColMenu ? 'z-[90]' : 'z-[60]'} bg-white h-12 items-end pb-2 border-b border-transparent shadow-sm`}
            style={{ top: stickyColHeaderTop }}
          >
            <div 
              className="w-64 shrink-0 sticky left-0 bg-white border-r border-gray-100 h-full"
              style={{ zIndex: 50, transform: 'translate3d(0,0,0)' }}
            ></div>
            <div className="flex">
              {gridColumns.map((col, i) => (
                <ColumnHeader key={col.id} index={i}
                  isLast={i === gridColumns.length - 1}
                  onAddRight={() => handleAddColumnRight(i)}
                  onMoveLeft={() => handleMoveColumnLeft(i)}
                  onMoveRight={() => handleMoveColumnRight(i)}
                  onDelete={() => handleDeleteColumn(i)}
                  isMenuOpen={activeColMenu === col.id}
                  onToggleMenu={(state) => setActiveColMenu(state ? col.id : null)}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col">
            <DndContext 
                sensors={sensors} 
                collisionDetection={closestCorners} 
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
            >
              <SortableContext items={lanes} strategy={verticalListSortingStrategy}>
                {lanes.map(lane => (
                  <SortableLaneItem 
                    key={lane.id} 
                    id={lane.id}
                    zIndexOverride={elevatedLaneId === lane.id || activeLaneId === lane.id ? 80 : 1}
                    isPinned={lane.isPinned}
                    stickyTop={stickyLaneTop}
                  >
                    {lane.type === 'emotion' ? (
                      <EmotionLane 
                        lane={lane} 
                        gridColumns={gridColumns}
                        laneData={emotionValues[lane.id] || {}} 
                        onUpdatePoint={handleUpdateEmotion}
                        onDelete={() => handleDeleteLane(lane.id)}
                        onDuplicate={() => handleDuplicateLane(lane.id)}
                        onUpdate={(updates) => handleUpdateLane(lane.id, updates)}
                        isMenuOpen={elevatedLaneId === lane.id}
                        onToggleMenu={(isOpen) => setElevatedLaneId(isOpen ? lane.id : null)}
                        onTogglePin={() => handleTogglePin(lane.id)}
                      />
                    ) : (
                      <TextLane 
                        lane={lane} 
                        gridColumns={gridColumns}
                        laneData={cells[lane.id] || {}} 
                        globalMetrics={globalMetrics}
                        onAddCard={handleAddCard} 
                        onUpdateCard={handleUpdateCard}
                        onDeleteCard={handleDeleteCard}
                        onDelete={() => handleDeleteLane(lane.id)}
                        onDuplicate={() => handleDuplicateLane(lane.id)}
                        onUpdate={(updates) => handleUpdateLane(lane.id, updates)}
                        isMenuOpen={elevatedLaneId === lane.id}
                        onToggleMenu={(isOpen) => setElevatedLaneId(isOpen ? lane.id : null)}
                        selectedCardId={selectedCardId}
                        onSelectCard={setSelectedCardId}
                        onTogglePin={() => handleTogglePin(lane.id)}
                        activePickerId={activePickerId}
                        onSetActivePicker={setActivePickerId}
                        onUploadImage={handleTriggerImageUpload}
                      />
                    )}
                  </SortableLaneItem>
                ))}
              </SortableContext>

              <DragOverlay>
                {activeDragItem ? (
                    <div className="opacity-90 rotate-2 scale-105 pointer-events-none" style={{ zoom: zoom }}>
                        <JourneyCard card={activeDragItem} onUpdate={() => {}} />
                    </div>
                ) : null}
              </DragOverlay>

            </DndContext>

            <div className="flex mt-2">
               <div className="w-64 shrink-0 sticky left-0 z-10 bg-white hide-on-export">
                  <div className="relative">
                    {isAddLaneMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-0" onClick={() => setIsAddLaneMenuOpen(false)}></div>
                        <div className="absolute bottom-full left-0 w-full mb-2 bg-white rounded-lg shadow-xl border border-gray-100 z-10 overflow-hidden py-1">
                          <button onClick={() => handleAddLane('stage')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                            <List size={14} className="text-purple-500" /> Steps
                          </button>
                          <button onClick={() => handleAddLane('text')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                            <AlignLeft size={14} className="text-gray-500" /> Text
                          </button>
                          <button onClick={() => handleAddLane('emotion')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                            <Activity size={14} className="text-orange-500" /> Emotion Chart
                          </button>
                          <button onClick={() => handleAddLane('image')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                            <ImageIcon size={14} className="text-blue-500" /> Image
                          </button>
                        </div>
                      </>
                    )}
                    <button onClick={() => setIsAddLaneMenuOpen(!isAddLaneMenuOpen)} className="w-full py-3 text-gray-400 font-medium hover:text-orange-600 hover:bg-orange-50 transition flex items-center justify-center gap-2 text-sm">
                      <Plus size={18} /> Add Lane
                    </button>
                  </div>
               </div>
            </div>
          </div>
        </div>
      </div>

      {/* Zoom & Pan Controls */}
      <div className="fixed bottom-6 right-6 flex items-center gap-1 bg-white p-1.5 rounded-lg shadow-xl border border-gray-200 z-50 hide-on-export">
        <button onClick={() => setIsHandMode(false)} className={`p-2 rounded hover:bg-gray-100 ${!isHandMode ? 'bg-orange-50 text-orange-600' : 'text-gray-500'}`} title="Pointer">
          <MousePointer size={18} />
        </button>
        <button onClick={() => setIsHandMode(true)} className={`p-2 rounded hover:bg-gray-100 ${isHandMode ? 'bg-orange-50 text-orange-600' : 'text-gray-500'}`} title="Hand Tool">
          <Hand size={18} />
        </button>
        <div className="w-px h-4 bg-gray-200 mx-1"></div>
        <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} className="p-2 rounded hover:bg-gray-100 text-gray-500" title="Zoom Out">
          <ZoomOut size={18} />
        </button>
        <span className="text-xs font-medium w-12 text-center text-gray-600">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="p-2 rounded hover:bg-gray-100 text-gray-500" title="Zoom In">
          <ZoomIn size={18} />
        </button>
        <button onClick={() => setZoom(1)} className="p-2 rounded hover:bg-gray-100 text-gray-500" title="Reset Zoom">
          <RotateCcw size={16} />
        </button>
      </div>

      <PersonaModal 
        isOpen={isPersonaModalOpen} 
        onClose={() => setIsPersonaModalOpen(false)} 
        onSave={handleSavePersona}
        initialPersona={safePersona}
      />

      <PersonaPicker 
        isOpen={isPersonaPickerOpen}
        onClose={() => setIsPersonaPickerOpen(false)}
        personas={globalPersonas || []}
        onSelect={(p) => { setPersona(p); setIsPersonaPickerOpen(false); }}
        onCreateNew={() => { setIsPersonaPickerOpen(false); setIsPersonaModalOpen(true); }}
      />

      <MetricPicker 
        isOpen={isMetricPickerOpen}
        onClose={() => setIsMetricPickerOpen(false)}
        metrics={globalMetrics}
        onSelect={handleSelectMetric}
        onCreateNew={() => { setIsMetricPickerOpen(false); setIsMetricModalOpen(true); }}
      />

      <MetricModal 
        isOpen={isMetricModalOpen}
        onClose={() => setIsMetricModalOpen(false)}
        onSave={handleCreateMetric}
      />

      <ConfirmModal 
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
        onConfirm={handleConfirmAction}
        title={
            confirmConfig.type === 'delete-lane' ? "Delete Lane?" : 
            confirmConfig.type === 'clear-map' ? "Clear Map?" :
            "Duplicate Journey?"
        }
        message={
            confirmConfig.type === 'delete-lane' ? "Are you sure you want to delete this lane and all its content?" : 
            confirmConfig.type === 'clear-map' ? "This will remove all content from the map. This action cannot be undone." :
            "Are you sure you want to create a copy of this journey map?"
        }
        confirmText={confirmConfig.type === 'duplicate-map' ? "Duplicate" : "Delete"}
        isDestructive={confirmConfig.type !== 'duplicate-map'}
      />

      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept="image/png, image/jpeg, image/gif, image/webp"
        onChange={handleImageFileChange}
      />
    </div>
  )
}
