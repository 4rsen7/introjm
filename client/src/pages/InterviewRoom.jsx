import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Mic, CheckCircle2, AlertCircle, Loader2, StopCircle, Sparkles, Save, ChevronLeft, Volume2, Edit2, UploadCloud, FileAudio, Copy, Check } from 'lucide-react';
import { getAuthToken } from '../services/auth';
import { API_BASE_URL } from '../config/api';
import { useQueryClient } from '@tanstack/react-query';

const API_URL = API_BASE_URL;
const INSIGHTS_PANEL_WIDTH_KEY = 'iterojm.interview.insightsWidth';
const DEFAULT_INSIGHTS_WIDTH = 420;
const MIN_INSIGHTS_WIDTH = 320;
const MAX_INSIGHTS_WIDTH = 680;
const INSIGHT_SECTION_ORDER = [
  'summary',
  'journeyDraft',
  'jtbdProfile',
  'forcesOfProgress',
  'painPoints',
  'momentsOfFriction',
  'unmetNeeds',
  'workarounds',
  'opportunityAreas',
  'strengths',
  'quotes',
];
const INSIGHT_PRESET_SECTIONS = {
  quick_summary: ['summary', 'painPoints', 'strengths', 'quotes'],
  research_insights: ['summary', 'painPoints', 'strengths', 'momentsOfFriction', 'unmetNeeds', 'workarounds', 'opportunityAreas', 'quotes'],
  journey_mapping: ['summary', 'journeyDraft', 'painPoints', 'strengths', 'momentsOfFriction', 'quotes'],
  jtbd_analysis: ['summary', 'jtbdProfile', 'forcesOfProgress', 'strengths', 'quotes'],
};
const DEFAULT_INSIGHT_PRESET = 'research_insights';
const DEFAULT_INSIGHT_SECTIONS = [...INSIGHT_PRESET_SECTIONS[DEFAULT_INSIGHT_PRESET]];

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const cleanString = (value) => typeof value === 'string' ? value.trim() : '';

const normalizeStringArray = (value, maxItems) =>
  Array.isArray(value)
    ? value
        .map((item) => cleanString(item))
        .filter(Boolean)
        .slice(0, maxItems)
    : [];

const normalizeTouchpoints = (value, maxItems) =>
  Array.isArray(value)
    ? value
        .map((item) => {
          if (typeof item === 'string') {
            const touchpoint = cleanString(item);
            return touchpoint ? { touchpoint, interactsWith: '', channel: '' } : null;
          }
          if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
          const touchpoint = cleanString(item.touchpoint);
          const interactsWith = cleanString(item.interactsWith || item.actor || item.stakeholder);
          const channel = cleanString(item.channel);
          if (!touchpoint && !interactsWith && !channel) return null;
          return { touchpoint, interactsWith, channel };
        })
        .filter(Boolean)
        .slice(0, maxItems)
    : [];

const normalizeStagePainPoints = (value, maxItems) =>
  Array.isArray(value)
    ? value
        .map((item) => {
          if (typeof item === 'string') {
            const description = cleanString(item);
            return description ? { title: '', description, severity: '' } : null;
          }
          if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
          const title = cleanString(item.title);
          const description = cleanString(item.description || item.problem || item.painPoint);
          const severity = cleanString(item.severity);
          if (!title && !description && !severity) return null;
          return { title, description, severity };
        })
        .filter(Boolean)
        .slice(0, maxItems)
    : [];

const normalizeInterviewSummary = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const summary = raw.summary && typeof raw.summary === 'object' && !Array.isArray(raw.summary) ? raw.summary : {};
  const journeyDraft = raw.journeyDraft && typeof raw.journeyDraft === 'object' && !Array.isArray(raw.journeyDraft) ? raw.journeyDraft : {};
  const jtbdProfile = raw.jtbdProfile && typeof raw.jtbdProfile === 'object' && !Array.isArray(raw.jtbdProfile) ? raw.jtbdProfile : {};
  const forcesOfProgress = raw.forcesOfProgress && typeof raw.forcesOfProgress === 'object' && !Array.isArray(raw.forcesOfProgress) ? raw.forcesOfProgress : {};
  const painPoints = Array.isArray(raw.painPoints)
    ? raw.painPoints
        .map((item) => {
          if (typeof item === 'string') {
            const description = cleanString(item);
            return description ? { title: '', description, rootCause: '', impact: '', severity: '', evidenceQuote: '' } : null;
          }
          if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
          const title = cleanString(item.title);
          const description = cleanString(item.description || item.problem || item.painPoint);
          if (!title && !description) return null;
          return {
            title,
            description,
            rootCause: cleanString(item.rootCause),
            impact: cleanString(item.impact),
            severity: cleanString(item.severity),
            evidenceQuote: cleanString(item.evidenceQuote || item.quote),
          };
        })
        .filter(Boolean)
    : [];

  const normalizePairList = (value, primaryKey, secondaryKey) =>
    Array.isArray(value)
      ? value
          .map((item) => {
            if (typeof item === 'string') {
              const primary = cleanString(item);
              return primary ? { [primaryKey]: primary, [secondaryKey]: '' } : null;
            }
            if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
            const primary = cleanString(item[primaryKey]);
            const secondary = cleanString(item[secondaryKey]);
            if (!primary && !secondary) return null;
            return { [primaryKey]: primary, [secondaryKey]: secondary };
          })
          .filter(Boolean)
      : [];

  const momentsOfFriction = Array.isArray(raw.momentsOfFriction)
    ? raw.momentsOfFriction
        .map((item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
          const stage = cleanString(item.stage);
          const situation = cleanString(item.situation);
          const breakdown = cleanString(item.breakdown);
          const customerReaction = cleanString(item.customerReaction);
          if (!stage && !situation && !breakdown && !customerReaction) return null;
          return { stage, situation, breakdown, customerReaction };
        })
        .filter(Boolean)
    : [];
  const strengths = Array.isArray(raw.strengths)
    ? raw.strengths
        .map((item) => {
          if (typeof item === 'string') {
            const title = cleanString(item);
            return title ? { title, description: '', whyItWorks: '', evidenceQuote: '' } : null;
          }
          if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
          const title = cleanString(item.title);
          const description = cleanString(item.description);
          const whyItWorks = cleanString(item.whyItWorks);
          const evidenceQuote = cleanString(item.evidenceQuote || item.quote);
          if (!title && !description && !whyItWorks && !evidenceQuote) return null;
          return { title, description, whyItWorks, evidenceQuote };
        })
        .filter(Boolean)
    : [];

  const normalized = {
    summary: {
      jobToBeDone: cleanString(summary.jobToBeDone || raw.jobToBeDone),
      generalInsight: cleanString(summary.generalInsight || raw.generalInsight || raw.generalInsights),
      overallSentiment: cleanString(summary.overallSentiment || raw.overallSentiment),
    },
    journeyDraft: {
      jobContext: cleanString(journeyDraft.jobContext),
      stages: Array.isArray(journeyDraft.stages)
        ? journeyDraft.stages
            .map((item) => {
              if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
              const stage = cleanString(item.stage);
              const customerActions = normalizeStringArray(item.customerActions, 6);
              const touchpoints = normalizeTouchpoints(item.touchpoints, 6);
              const painPoints = normalizeStagePainPoints(item.painPoints, 5);
              if (!stage && customerActions.length === 0 && touchpoints.length === 0 && painPoints.length === 0) return null;
              return { stage, customerActions, touchpoints, painPoints };
            })
            .filter(Boolean)
            .slice(0, 8)
        : [],
    },
    jtbdProfile: {
      mainJob: cleanString(jtbdProfile.mainJob),
      functionalJob: cleanString(jtbdProfile.functionalJob),
      emotionalJob: cleanString(jtbdProfile.emotionalJob),
      socialJob: cleanString(jtbdProfile.socialJob),
      jobContext: cleanString(jtbdProfile.jobContext),
      desiredOutcome: cleanString(jtbdProfile.desiredOutcome),
      successCriteria: normalizeStringArray(jtbdProfile.successCriteria, 5),
    },
    forcesOfProgress: {
      pushes: normalizeStringArray(forcesOfProgress.pushes, 5),
      pulls: normalizeStringArray(forcesOfProgress.pulls, 5),
      anxieties: normalizeStringArray(forcesOfProgress.anxieties, 5),
      habits: normalizeStringArray(forcesOfProgress.habits, 5),
    },
    painPoints,
    momentsOfFriction,
    unmetNeeds: normalizePairList(raw.unmetNeeds, 'need', 'whyItMatters'),
    workarounds: normalizePairList(raw.workarounds, 'workaround', 'whatItSignals'),
    opportunityAreas: normalizePairList(raw.opportunityAreas, 'area', 'rationale'),
    strengths,
    quotes: Array.isArray(raw.quotes) ? raw.quotes.map((q) => cleanString(q)).filter(Boolean) : [],
  };

  const hasContent =
    normalized.summary.jobToBeDone ||
    normalized.summary.generalInsight ||
    normalized.summary.overallSentiment ||
    normalized.journeyDraft.jobContext ||
    normalized.journeyDraft.stages.length > 0 ||
    normalized.jtbdProfile.mainJob ||
    normalized.jtbdProfile.functionalJob ||
    normalized.jtbdProfile.emotionalJob ||
    normalized.jtbdProfile.socialJob ||
    normalized.jtbdProfile.jobContext ||
    normalized.jtbdProfile.desiredOutcome ||
    normalized.jtbdProfile.successCriteria.length > 0 ||
    normalized.forcesOfProgress.pushes.length > 0 ||
    normalized.forcesOfProgress.pulls.length > 0 ||
    normalized.forcesOfProgress.anxieties.length > 0 ||
    normalized.forcesOfProgress.habits.length > 0 ||
    normalized.painPoints.length > 0 ||
    normalized.momentsOfFriction.length > 0 ||
    normalized.unmetNeeds.length > 0 ||
    normalized.workarounds.length > 0 ||
    normalized.opportunityAreas.length > 0 ||
    normalized.strengths.length > 0 ||
    normalized.quotes.length > 0;

  return hasContent ? normalized : null;
};

const sentimentBadgeClass = (sentiment) => {
  switch (sentiment) {
    case 'positive':
      return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
    case 'negative':
      return 'bg-rose-50 text-rose-700 border border-rose-100';
    case 'mixed':
      return 'bg-amber-50 text-amber-700 border border-amber-100';
    default:
      return 'bg-gray-100 text-gray-600 border border-gray-200';
  }
};

const sentimentLabel = (sentiment, t) => {
  switch (sentiment) {
    case 'positive':
      return t('interviews.sentimentPositive');
    case 'negative':
      return t('interviews.sentimentNegative');
    case 'mixed':
      return t('interviews.sentimentMixed');
    default:
      return sentiment;
  }
};

const normalizeInsightConfigFromSummary = (summaryData) => {
  if (!isPlainObject(summaryData)) return null;
  const systemState = isPlainObject(summaryData._system) ? summaryData._system : null;
  const summaryGeneration = isPlainObject(systemState?.summaryGeneration) ? systemState.summaryGeneration : null;
  if (!summaryGeneration) return null;

  const selectedSections = INSIGHT_SECTION_ORDER.filter((sectionKey) =>
    Array.isArray(summaryGeneration.selectedSections) && summaryGeneration.selectedSections.includes(sectionKey)
  );
  const presetCandidate = cleanString(summaryGeneration.preset);
  const preset = presetCandidate === 'custom' || presetCandidate === 'full_analysis' || Object.prototype.hasOwnProperty.call(INSIGHT_PRESET_SECTIONS, presetCandidate)
    ? presetCandidate
    : '';
  const mergeMode = summaryGeneration.mergeMode === 'replace_all' ? 'replace_all' : 'merge_selected';

  if (!preset && selectedSections.length === 0) return null;

  return {
    preset: preset || 'custom',
    selectedSections: selectedSections.length > 0 ? selectedSections : [...DEFAULT_INSIGHT_SECTIONS],
    mergeMode,
  };
};

export default function InterviewRoom({ userProfile, currentWorkspace }) {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const transcriptEndRef = useRef(null);
  const mainContentRef = useRef(null);
  
  const [interview, setInterview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isUploadMode = new URLSearchParams(location.search).get('mode') === 'upload' || interview?.type === 'upload';
  
  // File Upload State
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState(1);
  
  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [micStream, setMicStream] = useState(null);
  const [systemStream, setSystemStream] = useState(null);
  const recognitionRef = useRef(null);
  
  // Transcript State
  const [transcriptData, setTranscriptData] = useState([]);
  const transcriptDataRef = useRef([]); // Ref to hold latest state for auto-save
  const prevTranscriptLengthRef = useRef(0);
  const prevLastTranscriptIdRef = useRef(null);
  const [currentLine, setCurrentLine] = useState('');
  const [editingIndex, setEditingIndex] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [isDesktopLayout, setIsDesktopLayout] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1024 : true));
  const [isResizingInsights, setIsResizingInsights] = useState(false);
  const [insightsWidth, setInsightsWidth] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_INSIGHTS_WIDTH;
    const stored = Number.parseInt(window.localStorage.getItem(INSIGHTS_PANEL_WIDTH_KEY) || '', 10);
    return Number.isFinite(stored) ? stored : DEFAULT_INSIGHTS_WIDTH;
  });

  // AI Summary State
  const [generatingAI, setGeneratingAI] = useState(false);
  const [insightStage, setInsightStage] = useState(1);
  const [isInsightsConfigOpen, setIsInsightsConfigOpen] = useState(false);
  const [selectedInsightPreset, setSelectedInsightPreset] = useState(DEFAULT_INSIGHT_PRESET);
  const [selectedInsightSections, setSelectedInsightSections] = useState(DEFAULT_INSIGHT_SECTIONS);
  const [insightMergeMode, setInsightMergeMode] = useState('merge_selected');
  
  // Title Editing State
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const normalizedSummary = useMemo(() => normalizeInterviewSummary(interview?.summary_data), [interview?.summary_data]);
  const persistedInsightConfig = useMemo(() => normalizeInsightConfigFromSummary(interview?.summary_data), [interview?.summary_data]);
  const insightPresets = useMemo(() => ([
    {
      key: 'quick_summary',
      label: t('interviews.presetQuickSummary'),
      description: t('interviews.presetQuickSummaryDesc'),
    },
    {
      key: 'research_insights',
      label: t('interviews.presetResearchInsights'),
      description: t('interviews.presetResearchInsightsDesc'),
    },
    {
      key: 'journey_mapping',
      label: t('interviews.presetJourneyMapping'),
      description: t('interviews.presetJourneyMappingDesc'),
    },
    {
      key: 'jtbd_analysis',
      label: t('interviews.presetJtbdAnalysis'),
      description: t('interviews.presetJtbdAnalysisDesc'),
    },
  ]), [t]);
  const insightSectionOptions = useMemo(() => ([
    { key: 'summary', label: t('interviews.sectionSummary'), description: t('interviews.sectionSummaryDesc') },
    { key: 'journeyDraft', label: t('interviews.journeyDraft'), description: t('interviews.sectionJourneyDraftDesc') },
    { key: 'jtbdProfile', label: t('interviews.jtbdProfile'), description: t('interviews.sectionJtbdProfileDesc') },
    { key: 'forcesOfProgress', label: t('interviews.forcesOfProgress'), description: t('interviews.sectionForcesOfProgressDesc') },
    { key: 'painPoints', label: t('interviews.painPoints'), description: t('interviews.sectionPainPointsDesc') },
    { key: 'momentsOfFriction', label: t('interviews.momentsOfFriction'), description: t('interviews.sectionMomentsOfFrictionDesc') },
    { key: 'unmetNeeds', label: t('interviews.unmetNeeds'), description: t('interviews.sectionUnmetNeedsDesc') },
    { key: 'workarounds', label: t('interviews.workarounds'), description: t('interviews.sectionWorkaroundsDesc') },
    { key: 'opportunityAreas', label: t('interviews.opportunityAreas'), description: t('interviews.sectionOpportunityAreasDesc') },
    { key: 'strengths', label: t('interviews.strengths'), description: t('interviews.sectionStrengthsDesc') },
    { key: 'quotes', label: t('interviews.keyQuotes'), description: t('interviews.sectionQuotesDesc') },
  ]), [t]);
  const uploadFailureShownRef = useRef(false);
  const interviewStatusLabel = useMemo(() => {
    switch (interview?.status) {
      case 'processing':
        return t('interviews.statusProcessing');
      case 'completed':
        return t('interviews.statusCompleted');
      case 'failed':
        return t('interviews.statusFailed');
      default:
        return t('interviews.statusDraft');
    }
  }, [interview?.status, t]);

  const handleTitleSave = () => {
    if (editedTitle.trim() !== interview.title && editedTitle.trim() !== '') {
      setInterview(prev => ({...prev, title: editedTitle.trim()}));
      saveInterview({ title: editedTitle.trim() });
    }
    setIsEditingTitle(false);
  };

  const applyInsightPreset = (presetKey) => {
    const presetSections = INSIGHT_PRESET_SECTIONS[presetKey];
    if (!presetSections) return;
    setSelectedInsightPreset(presetKey);
    setSelectedInsightSections([...presetSections]);
  };

  const toggleInsightSection = (sectionKey) => {
    setSelectedInsightPreset('custom');
    setSelectedInsightSections((current) => {
      const next = current.includes(sectionKey)
        ? current.filter((item) => item !== sectionKey)
        : [...current, sectionKey];
      return INSIGHT_SECTION_ORDER.filter((item) => next.includes(item));
    });
  };

  const fetchInterview = useCallback(async ({ redirectOnMissing = true, settleLoading = false } = {}) => {
    try {
      const token = await getAuthToken();
      const res = await fetch(`${API_URL}/interviews/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const json = await res.json();
      if (res.ok && json.data) {
        setInterview(json.data);
        setTranscriptData(json.data.transcript_data || []);
        transcriptDataRef.current = json.data.transcript_data || [];
        return json.data;
      }

      if (redirectOnMissing) {
        alert('Interview not found');
        navigate('/interviews');
      }
      return null;
    } catch (err) {
      console.error(err);
      return null;
    } finally {
      if (settleLoading) {
        setLoading(false);
      }
    }
  }, [id, navigate]);

  // Fetch Interview
  useEffect(() => {
    fetchInterview({ settleLoading: true });
  }, [fetchInterview]);

  useEffect(() => {
    if (!persistedInsightConfig || isInsightsConfigOpen) return;
    setSelectedInsightPreset(persistedInsightConfig.preset);
    setSelectedInsightSections(persistedInsightConfig.selectedSections);
    setInsightMergeMode(persistedInsightConfig.mergeMode);
  }, [isInsightsConfigOpen, persistedInsightConfig]);

  useEffect(() => {
    if (loading || !isUploadMode || !interview || interview.status !== 'processing') {
      return undefined;
    }

    let cancelled = false;
    let timerId;

    const pollInterview = async () => {
      const data = await fetchInterview({ redirectOnMissing: false });
      if (cancelled || !data) return;

      if (data.status === 'completed' && Array.isArray(data.transcript_data) && data.transcript_data.length > 0) {
        uploadFailureShownRef.current = false;
        setSelectedFile(null);
        setUploadStage(1);
        navigate(`/interviews/${id}`, { replace: true });
        queryClient.invalidateQueries(['interviews']);
        return;
      }

      if (data.status === 'failed') {
        setUploadStage(1);
        if (!uploadFailureShownRef.current) {
          uploadFailureShownRef.current = true;
          alert(t('interviews.transcriptionFailed'));
        }
        queryClient.invalidateQueries(['interviews']);
        return;
      }

      timerId = window.setTimeout(pollInterview, 4000);
    };

    pollInterview();

    return () => {
      cancelled = true;
      if (timerId) {
        window.clearTimeout(timerId);
      }
    };
  }, [fetchInterview, id, interview?.status, isUploadMode, loading, navigate, queryClient, t]);

  // Setup Speech Recognition
  useEffect(() => {
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'uk-UA'; // Default to Ukrainian as requested

      recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        if (finalTranscript) {
          const newEntry = {
            id: Date.now().toString(),
            speaker: 'Interviewer', // For V1, default to Interviewer, user can edit
            text: finalTranscript.trim(),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
          setTranscriptData(prev => {
            const next = [...prev, newEntry];
            transcriptDataRef.current = next; // Update ref for auto-save
            return next;
          });
          setCurrentLine('');
        } else {
          setCurrentLine(interimTranscript);
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error', event.error);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  // Auto-scroll only for live transcript updates and newly appended lines.
  useEffect(() => {
    const prevLength = prevTranscriptLengthRef.current;
    const prevLastId = prevLastTranscriptIdRef.current;
    const lastEntry = transcriptData[transcriptData.length - 1];
    const nextLastId = lastEntry?.id ?? null;
    const appendedNewEntry =
      transcriptData.length > prevLength ||
      (transcriptData.length > 0 && nextLastId !== prevLastId && transcriptData.length === prevLength);
    const hasLiveTranscript = Boolean(currentLine);

    if (appendedNewEntry || hasLiveTranscript) {
      transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }

    prevTranscriptLengthRef.current = transcriptData.length;
    prevLastTranscriptIdRef.current = nextLastId;
  }, [transcriptData, currentLine]);

  useEffect(() => {
    const handleWindowResize = () => {
      setIsDesktopLayout(window.innerWidth >= 1024);
    };

    handleWindowResize();
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(INSIGHTS_PANEL_WIDTH_KEY, String(insightsWidth));
  }, [insightsWidth]);

  useEffect(() => {
    if (!isResizingInsights || !isDesktopLayout) return undefined;

    const handlePointerMove = (event) => {
      const container = mainContentRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const nextWidth = rect.right - event.clientX;
      const maxAllowed = Math.min(MAX_INSIGHTS_WIDTH, Math.max(MIN_INSIGHTS_WIDTH, rect.width - 420));
      const clampedWidth = Math.min(maxAllowed, Math.max(MIN_INSIGHTS_WIDTH, nextWidth));
      setInsightsWidth(clampedWidth);
    };

    const stopResizing = () => {
      setIsResizingInsights(false);
    };

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResizing);

    return () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResizing);
    };
  }, [isDesktopLayout, isResizingInsights]);

  const startRecording = async () => {
    try {
      // Prompt for Mic
      const mStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicStream(mStream);

      // Prompt for System Audio (optional for MVP, building UI concept)
      try {
        const sStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        setSystemStream(sStream);
      } catch (err) {
        console.warn('User skipped system audio share', err);
      }

      setIsRecording(true);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (e) {
          // already started
        }
      }
    } catch (err) {
      console.error('Error starting recording:', err);
      alert('Microphone access is required to transcribe.');
    }
  };

  const stopRecording = () => {
    setIsRecording(false);
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    if (micStream) micStream.getTracks().forEach(track => track.stop());
    if (systemStream) systemStream.getTracks().forEach(track => track.stop());
    setMicStream(null);
    setSystemStream(null);
    saveInterview();
  };

  const saveInterview = async (updates = {}, dataToSave = transcriptData) => {
    setSaving(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${API_URL}/interviews/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          transcript_data: dataToSave,
          ...updates
        })
      });
      const json = await res.json();
      if (res.ok) {
        setInterview(json.data);
        queryClient.invalidateQueries(['interviews']);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // Auto-save on unmount
  useEffect(() => {
    return () => {
      // Use the ref since state might be stale during unmount
      if (transcriptDataRef.current.length > 0) {
        saveInterview({}, transcriptDataRef.current);
      }
    };
  }, []);

  const generateAIInsights = async ({
    preset = selectedInsightPreset,
    selectedSections = selectedInsightSections,
    mergeMode = insightMergeMode,
  } = {}) => {
    const normalizedSections = INSIGHT_SECTION_ORDER.filter((sectionKey) => selectedSections.includes(sectionKey));
    if (normalizedSections.length === 0) {
      alert(t('interviews.selectAtLeastOneSection'));
      return;
    }

    setGeneratingAI(true);
    setInsightStage(1);
    
    // Simulate stages of insight generation
    // Stage 1: Context (0 - 4s)
    // Stage 2: Extraction (4s - 9s)
    // Stage 3: Formulation (9s onwards)
    const stageTimer1 = setTimeout(() => setInsightStage(2), 4000);
    const stageTimer2 = setTimeout(() => setInsightStage(3), 9000);

    try {
      const token = await getAuthToken();
      const res = await fetch(`${API_URL}/interviews/${id}/generate-summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          preset,
          selectedSections: normalizedSections,
          mergeMode,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setInterview(json.data);
      } else {
        alert(json.error || 'Failed to generate summary');
      }
    } catch (err) {
      console.error(err);
    } finally {
      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
      setGeneratingAI(false);
      setInsightStage(1);
    }
  };

  const openInsightsConfig = () => {
    if (transcriptData.length === 0 || isRecording || generatingAI) return;
    setIsInsightsConfigOpen(true);
  };

  const handleGenerateConfiguredInsights = async () => {
    if (selectedInsightSections.length === 0) {
      alert(t('interviews.selectAtLeastOneSection'));
      return;
    }
    setIsInsightsConfigOpen(false);
    await generateAIInsights({
      preset: selectedInsightPreset,
      selectedSections: selectedInsightSections,
      mergeMode: insightMergeMode,
    });
  };

  const handleEditSave = (index) => {
    const updated = [...transcriptData];
    updated[index].text = editValue;
    setTranscriptData(updated);
    transcriptDataRef.current = updated;
    setEditingIndex(null);
    saveInterview({ transcript_data: updated }, updated);
  };

  const handleCopyLine = async (entryText, index) => {
    try {
      await navigator.clipboard.writeText(entryText || '');
      setCopiedIndex(index);
      window.setTimeout(() => {
        setCopiedIndex((current) => (current === index ? null : current));
      }, 1600);
    } catch (err) {
      console.error('Clipboard copy failed:', err);
      alert(t('interviews.copyFailed'));
    }
  };

  const toggleSpeaker = (index) => {
    const updated = [...transcriptData];
    updated[index].speaker = updated[index].speaker === 'Interviewer' ? 'Respondent' : 'Interviewer';
    setTranscriptData(updated);
    transcriptDataRef.current = updated;
    saveInterview({ transcript_data: updated }, updated);
  };

  // Upload Handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleFileUpload = async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    setUploadStage(1);
    uploadFailureShownRef.current = false;
    
    // Simulate stages since we don't have Server-Sent Events from backend
    // Stage 1: Uploading (0 - 3s)
    // Stage 2: Analyzing (3s - 12s)
    // Stage 3: Generating JSON (12s onwards)
    const stageTimer1 = setTimeout(() => setUploadStage(2), 3000);
    const stageTimer2 = setTimeout(() => setUploadStage(3), 12000);

    const formData = new FormData();
    formData.append('audio', selectedFile);

    try {
      let acceptedForProcessing = false;
      const token = await getAuthToken();
      const res = await fetch(`${API_URL}/interviews/${id}/upload-audio`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const json = await res.json();
      
      if ((res.status === 202 || res.ok) && json.data) {
        acceptedForProcessing = true;
        setInterview(json.data);
        setTranscriptData(json.data.transcript_data || []);
        transcriptDataRef.current = json.data.transcript_data || [];
        setSelectedFile(null);
        queryClient.invalidateQueries(['interviews']);
        setUploadStage(2);
      } else {
        alert(json.error || 'Failed to process audio file');
      }

      if (!acceptedForProcessing) {
        setUploadStage(1);
      }
    } catch (err) {
      console.error('Upload error:', err);
      alert('Network error while uploading.');
      setUploadStage(1);
    } finally {
      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
      setIsUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-blue-600 rounded-full animate-spin"></div>
      </div>
    );
  }
  if (!interview) return null;

  const isCompleted = interview.status === 'completed';
  const isUploadProcessing = isUploadMode && transcriptData.length === 0 && (isUploading || interview.status === 'processing');
  const canConfigureInsights = transcriptData.length > 0 && !isRecording && !generatingAI;
  const selectedInsightsCount = selectedInsightSections.length;

  return (
    <div className="absolute inset-0 flex flex-col bg-white">
      {/* Header */}
      <header className="flex-none px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-white z-10 sticky top-0">
        <div className="flex items-center gap-4 flex-1">
          <button onClick={() => navigate('/interviews')} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1 max-w-2xl flex items-center gap-4">
            {isEditingTitle ? (
              <input 
                type="text" 
                value={editedTitle} 
                onChange={(e) => setEditedTitle(e.target.value)} 
                className="text-xl font-bold text-gray-900 bg-white border border-blue-300 rounded px-2 py-0.5 max-w-[300px] w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
                onBlur={handleTitleSave}
                onKeyDown={(e) => e.key === 'Enter' && handleTitleSave()}
              />
            ) : (
              <div 
                className="group flex items-center gap-2 cursor-pointer max-w-[300px]" 
                onClick={() => { setEditedTitle(interview.title); setIsEditingTitle(true); }}
                title="Click to edit title"
              >
                <h1 className="text-xl font-bold text-gray-900 truncate">{interview.title}</h1>
                <Edit2 size={16} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </div>
            )}
            
            {/* Status Badges */}
            <div className="flex items-center gap-2 text-xs font-medium">
              <span className={`px-2 py-0.5 rounded flex items-center gap-1.5 shadow-sm ${isRecording ? 'bg-red-500 text-white' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                {isRecording ? (
                  <><span className="w-2 h-2 rounded-full bg-white animate-pulse shadow-sm"></span> {t('interviews.recording')}</>
                ) : (
                  <><span className="w-2 h-2 rounded-full bg-green-500 shadow-sm animate-pulse"></span> {t('interviews.ready')}</>
                )}
              </span>
              <span className={`px-2 py-0.5 rounded capitalize border ${isCompleted ? 'bg-green-50 text-green-700 border-green-200' : interview.status === 'failed' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-yellow-50 text-yellow-800 border-yellow-200'}`}>
                {interviewStatusLabel}
              </span>
              <span className="text-gray-500 whitespace-nowrap">{new Date(interview.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => saveInterview()}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? t('interviews.saving') : t('interviews.save')}
          </button>
          
          {(!isRecording && !isUploadMode) && (
            <button 
              onClick={startRecording}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Mic size={16} />
              {t('interviews.startInterview')}
            </button>
          )}
          
          {isRecording && (
            <button 
              onClick={stopRecording}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors shadow-sm"
            >
              <StopCircle size={16} />
              {t('interviews.stopRecording')}
            </button>
          )}

        </div>
      </header>

      {/* Main Content */}
      <div ref={mainContentRef} className="relative flex-1 flex overflow-hidden">
        {/* Left: Transcript View */}
        <div
          className="w-2/3 min-w-0 flex flex-col bg-white lg:w-auto"
          style={isDesktopLayout ? { width: `calc(100% - ${insightsWidth}px)` } : undefined}
        >
          <div className="flex-none bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
            <div className="flex items-center gap-2">
               {isUploadMode && transcriptData.length === 0 ? <UploadCloud className="text-emerald-500" size={20} /> : <Volume2 className="text-emerald-500" size={20} />}
               <h2 className="font-semibold text-gray-900">{isUploadMode && transcriptData.length === 0 ? t('interviews.uploadAudioVideo') : t('interviews.liveTranscript')}</h2>
            </div>
            {isRecording && <span className="text-red-500 flex items-center gap-1.5 text-sm font-medium"><Mic size={14} className="animate-pulse" /> {t('interviews.listening')}</span>}
          </div>
          
          {isUploadMode && transcriptData.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50 relative">
              <div 
                className={`w-full max-w-xl p-12 text-center rounded-2xl border-2 border-dashed transition-all duration-200 ease-in-out bg-white ${dragActive ? 'border-emerald-500 bg-emerald-50/50 scale-[1.02]' : 'border-gray-300 hover:border-gray-400'}`}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
              >
                {isUploadProcessing ? (
                  <div className="flex flex-col items-center gap-4">
                    <div className="relative flex items-center justify-center py-4">
                      <div className="absolute inset-0 bg-emerald-200 rounded-full blur-xl opacity-50 animate-pulse"></div>
                      <Loader2 size={64} strokeWidth={2.5} className="animate-spin text-emerald-500 relative z-10 mx-auto" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 animate-pulse">
                        {isUploading ? (
                          <>
                            {uploadStage === 1 && t('interviews.uploadStage1')}
                            {uploadStage === 2 && t('interviews.uploadStage2')}
                            {uploadStage === 3 && t('interviews.uploadStage3')}
                          </>
                        ) : (
                          t('interviews.transcribing')
                        )}
                      </h3>
                      <p className="text-gray-500 mt-2 transition-opacity duration-300">
                        {isUploading ? (
                          <>
                            {uploadStage === 1 && t('interviews.uploadStage1Desc')}
                            {uploadStage === 2 && t('interviews.uploadStage2Desc')}
                            {uploadStage === 3 && t('interviews.uploadStage3Desc')}
                          </>
                        ) : (
                          t('interviews.transcribingDesc')
                        )}
                      </p>
                    </div>
                  </div>
                ) : selectedFile ? (
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mb-2">
                      <FileAudio size={32} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 break-all px-4">{selectedFile.name}</h3>
                      <p className="text-gray-500 mt-1">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                    </div>
                    <div className="flex gap-3 mt-4">
                      <button onClick={() => setSelectedFile(null)} className="px-6 py-2.5 rounded-lg text-gray-600 font-medium hover:bg-gray-100 transition-colors">
                        {t('interviews.cancel')}
                      </button>
                      <button onClick={handleFileUpload} className="px-8 py-2.5 bg-emerald-600 text-white rounded-lg font-medium shadow-sm hover:bg-emerald-700 transition-colors">
                        {t('interviews.startTranscription')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-6 group-hover:bg-slate-200 transition-colors">
                      <UploadCloud size={40} />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">{t('interviews.dragDrop')}</h3>
                    <p className="text-gray-500 mb-6 max-w-sm mx-auto">
                      {t('interviews.dragDropDesc')}
                    </p>
                    <label className="cursor-pointer px-8 py-3 bg-white border border-gray-300 rounded-lg font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors inline-block">
                      {t('interviews.browseFiles')}
                      <input type="file" className="hidden" accept="audio/*,video/mp4" onChange={handleChange} />
                    </label>
                  </>
                )}
              </div>
            </div>
          ) : (
          <div className="flex-1 overflow-y-auto p-6 bg-slate-50 space-y-6">
            {transcriptData.length === 0 && !currentLine && !isRecording && (
              <div className="h-full flex items-center justify-center text-gray-400">
                <p>{t('interviews.pressStart')}</p>
              </div>
            )}

            {transcriptData.map((entry, index) => {
              const isInterviewer = entry.speaker === 'Interviewer';
              const isEditing = editingIndex === index;

              return (
                <div key={entry.id || index} className={`flex gap-4 max-w-3xl ${isInterviewer ? 'mr-auto' : 'ml-auto flex-row-reverse'}`}>
                  {/* Avatar */}
                  <button 
                    onClick={() => toggleSpeaker(index)}
                    title="Click to toggle speaker"
                    className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-sm transition-transform hover:scale-105 ${isInterviewer ? 'bg-blue-600 text-white' : 'bg-emerald-100 text-emerald-600'}`}
                  >
                    {isInterviewer ? <Mic size={18} /> : <Volume2 size={18} />}
                  </button>

                  {/* Bubble */}
                  <div className={`group flex flex-col gap-1 ${isInterviewer ? 'items-start' : 'items-end'}`}>
                    <div className="flex items-center gap-2 text-xs text-gray-500 px-1">
                      <span className="font-semibold">{entry.speaker}</span>
                      <span>{entry.timestamp}</span>
                    </div>
                    
                    <div className={`px-5 py-3 rounded-2xl shadow-sm text-sm/relaxed ${isInterviewer ? 'bg-white border border-gray-200 text-gray-800 rounded-tl-none' : 'bg-emerald-50 border border-emerald-100 text-emerald-900 rounded-tr-none'}`}>
                      {isEditing ? (
                        <div className="flex flex-col gap-2 min-w-[250px]">
                          <textarea 
                            value={editValue} 
                            onChange={e => setEditValue(e.target.value)}
                            className="w-full text-sm p-2 border border-blue-300 rounded focus:ring-1 focus:ring-blue-500 outline-none"
                            rows={3}
                            autoFocus
                          />
                          <div className="flex justify-end gap-2">
                            <button onClick={() => setEditingIndex(null)} className="text-xs text-gray-500 hover:text-gray-700">{t('interviews.cancel')}</button>
                            <button onClick={() => handleEditSave(index)} className="text-xs bg-blue-600 text-white px-3 py-1 rounded">{t('interviews.save')}</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-3">
                          <p className="min-w-0 flex-1">{entry.text}</p>
                          <div className="flex flex-shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            <button
                              onClick={() => handleCopyLine(entry.text, index)}
                              title={copiedIndex === index ? t('interviews.copied') : t('interviews.copyLine')}
                              className="p-1 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-all"
                            >
                              {copiedIndex === index ? <Check size={14} /> : <Copy size={14} />}
                            </button>
                            <button 
                              onClick={() => { setEditingIndex(index); setEditValue(entry.text); }}
                              title={t('interviews.editLine')}
                              className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"
                            >
                              <Edit2 size={14} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Live Typing Indicator */}
            {currentLine && (
              <div className="flex gap-4 max-w-3xl mr-auto opacity-70">
                <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white bg-blue-400">
                  <Mic size={18} className="animate-pulse" />
                </div>
                <div className="flex flex-col gap-1 items-start">
                  <div className="flex items-center gap-2 text-xs text-gray-500 px-1">
                    <span className="font-semibold">Interviewer</span>
                    <span className="animate-pulse">listening...</span>
                  </div>
                  <div className="px-5 py-3 rounded-2xl shadow-sm text-sm/relaxed bg-white/70 border border-gray-200 text-gray-600 rounded-tl-none italic">
                    {currentLine}
                  </div>
                </div>
              </div>
            )}
            <div ref={transcriptEndRef} />
          </div>
          )}
        </div>

        {/* Right: AI Insights Panel */}
        <div
          className="w-1/3 flex min-w-0 flex-shrink-0 flex-col border-l border-gray-200 bg-gray-50 z-10 relative lg:w-auto"
          style={isDesktopLayout ? { width: `${insightsWidth}px` } : undefined}
        >
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-3 bg-white">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="text-amber-500" size={20} />
              <h2 className="font-semibold text-gray-900">{t('interviews.aiInsights')}</h2>
            </div>
            <button
              onClick={openInsightsConfig}
              disabled={!canConfigureInsights}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles size={14} />
              {normalizedSummary ? t('interviews.updateInsights') : t('interviews.configureInsights')}
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6">
            {generatingAI ? (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                <div className="relative flex items-center justify-center py-2">
                   <div className="absolute inset-0 bg-blue-200 rounded-full blur-xl opacity-50 animate-pulse"></div>
                   <Loader2 size={48} strokeWidth={2.5} className="animate-spin text-blue-600 relative z-10 mx-auto" />
                </div>
                <p className="text-gray-900 font-bold text-lg animate-pulse">
                  {insightStage === 1 && t('interviews.insightStage1')}
                  {insightStage === 2 && t('interviews.insightStage2')}
                  {insightStage === 3 && t('interviews.insightStage3')}
                </p>
                <p className="text-sm text-gray-500 transition-opacity duration-300">
                  {insightStage === 1 && t('interviews.insightStage1Desc')}
                  {insightStage === 2 && t('interviews.insightStage2Desc')}
                  {insightStage === 3 && t('interviews.insightStage3Desc')}
                </p>
              </div>
            ) : normalizedSummary ? (
                <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
                {/* Overview */}
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t('interviews.overview')}</h3>
                  <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-4 rounded-xl border border-indigo-100 space-y-3">
                    {normalizedSummary.summary.jobToBeDone && (
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-500 mb-1">{t('interviews.jobToBeDone')}</div>
                        <div className="text-sm text-indigo-900 leading-relaxed">{normalizedSummary.summary.jobToBeDone}</div>
                      </div>
                    )}
                    {normalizedSummary.summary.generalInsight && (
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-500 mb-1">{t('interviews.tldr')}</div>
                        <div className="text-sm text-indigo-900 leading-relaxed">{normalizedSummary.summary.generalInsight}</div>
                      </div>
                    )}
                    {normalizedSummary.summary.overallSentiment && (
                      <div className="pt-1">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${sentimentBadgeClass(normalizedSummary.summary.overallSentiment)}`}>
                          {t('interviews.overallSentiment')}: {sentimentLabel(normalizedSummary.summary.overallSentiment, t)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {normalizedSummary.journeyDraft.stages.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t('interviews.journeyDraft')}</h3>
                    {normalizedSummary.journeyDraft.jobContext && (
                      <div className="rounded-lg border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-900 leading-relaxed">
                        <span className="font-semibold">{t('interviews.jobContext')}:</span> {normalizedSummary.journeyDraft.jobContext}
                      </div>
                    )}
                    <div className="space-y-3">
                      {normalizedSummary.journeyDraft.stages.map((stage, i) => (
                        <div key={`${stage.stage || 'stage'}-${i}`} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm space-y-3">
                          {stage.stage && (
                            <div className="text-xs font-bold uppercase tracking-wider text-gray-400">{stage.stage}</div>
                          )}

                          {stage.customerActions.length > 0 && (
                            <div className="space-y-2">
                              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('interviews.customerActions')}</div>
                              <ul className="space-y-1">
                                {stage.customerActions.map((action, actionIndex) => (
                                  <li key={`${action}-${actionIndex}`} className="text-sm text-gray-800 leading-relaxed">• {action}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {stage.touchpoints.length > 0 && (
                            <div className="space-y-2">
                              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('interviews.touchpoints')}</div>
                              <div className="space-y-2">
                                {stage.touchpoints.map((touchpoint, touchpointIndex) => (
                                  <div key={`${touchpoint.touchpoint}-${touchpointIndex}`} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700 space-y-1">
                                    {touchpoint.touchpoint && <div className="font-medium text-gray-900">{touchpoint.touchpoint}</div>}
                                    {(touchpoint.interactsWith || touchpoint.channel) && (
                                      <div className="text-xs text-gray-600">
                                        {touchpoint.interactsWith && <span>{t('interviews.interactsWith')}: {touchpoint.interactsWith}</span>}
                                        {touchpoint.interactsWith && touchpoint.channel && <span> • </span>}
                                        {touchpoint.channel && <span>{t('interviews.channel')}: {touchpoint.channel}</span>}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {stage.painPoints.length > 0 && (
                            <div className="space-y-2">
                              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('interviews.stagePainPoints')}</div>
                              <div className="space-y-2">
                                {stage.painPoints.map((point, pointIndex) => (
                                  <div key={`${point.title || point.description}-${pointIndex}`} className="rounded-lg border border-rose-100 bg-rose-50/60 px-3 py-2 text-sm text-rose-900 space-y-1">
                                    <div className="font-medium">{point.title || point.description}</div>
                                    {point.title && point.description && <div className="text-rose-800 leading-relaxed">{point.description}</div>}
                                    {point.severity && <div className="text-xs uppercase tracking-wider text-rose-600">{t('interviews.severity')}: {point.severity}</div>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(normalizedSummary.jtbdProfile.mainJob ||
                  normalizedSummary.jtbdProfile.functionalJob ||
                  normalizedSummary.jtbdProfile.emotionalJob ||
                  normalizedSummary.jtbdProfile.socialJob ||
                  normalizedSummary.jtbdProfile.jobContext ||
                  normalizedSummary.jtbdProfile.desiredOutcome ||
                  normalizedSummary.jtbdProfile.successCriteria.length > 0) && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t('interviews.jtbdProfile')}</h3>
                    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm space-y-3">
                      {normalizedSummary.jtbdProfile.mainJob && (
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">{t('interviews.mainJob')}</div>
                          <div className="text-sm text-gray-900 leading-relaxed">{normalizedSummary.jtbdProfile.mainJob}</div>
                        </div>
                      )}
                      {normalizedSummary.jtbdProfile.functionalJob && (
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">{t('interviews.functionalJob')}</div>
                          <div className="text-sm text-gray-900 leading-relaxed">{normalizedSummary.jtbdProfile.functionalJob}</div>
                        </div>
                      )}
                      {normalizedSummary.jtbdProfile.emotionalJob && (
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">{t('interviews.emotionalJob')}</div>
                          <div className="text-sm text-gray-900 leading-relaxed">{normalizedSummary.jtbdProfile.emotionalJob}</div>
                        </div>
                      )}
                      {normalizedSummary.jtbdProfile.socialJob && (
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">{t('interviews.socialJob')}</div>
                          <div className="text-sm text-gray-900 leading-relaxed">{normalizedSummary.jtbdProfile.socialJob}</div>
                        </div>
                      )}
                      {normalizedSummary.jtbdProfile.jobContext && (
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">{t('interviews.jobContext')}</div>
                          <div className="text-sm text-gray-900 leading-relaxed">{normalizedSummary.jtbdProfile.jobContext}</div>
                        </div>
                      )}
                      {normalizedSummary.jtbdProfile.desiredOutcome && (
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">{t('interviews.desiredOutcome')}</div>
                          <div className="text-sm text-gray-900 leading-relaxed">{normalizedSummary.jtbdProfile.desiredOutcome}</div>
                        </div>
                      )}
                      {normalizedSummary.jtbdProfile.successCriteria.length > 0 && (
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">{t('interviews.successCriteria')}</div>
                          <ul className="space-y-1">
                            {normalizedSummary.jtbdProfile.successCriteria.map((criterion, criterionIndex) => (
                              <li key={`${criterion}-${criterionIndex}`} className="text-sm text-gray-900 leading-relaxed">• {criterion}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {(normalizedSummary.forcesOfProgress.pushes.length > 0 ||
                  normalizedSummary.forcesOfProgress.pulls.length > 0 ||
                  normalizedSummary.forcesOfProgress.anxieties.length > 0 ||
                  normalizedSummary.forcesOfProgress.habits.length > 0) && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t('interviews.forcesOfProgress')}</h3>
                    <div className="grid gap-3">
                      {[
                        ['pushes', t('interviews.pushes'), 'bg-amber-50 border-amber-100 text-amber-900'],
                        ['pulls', t('interviews.pulls'), 'bg-emerald-50 border-emerald-100 text-emerald-900'],
                        ['anxieties', t('interviews.anxieties'), 'bg-rose-50 border-rose-100 text-rose-900'],
                        ['habits', t('interviews.habits'), 'bg-slate-50 border-slate-200 text-slate-900'],
                      ].map(([key, label, tone]) => {
                        const items = normalizedSummary.forcesOfProgress[key];
                        if (!items || items.length === 0) return null;
                        return (
                          <div key={key} className={`rounded-xl border p-4 shadow-sm space-y-2 ${tone}`}>
                            <div className="text-xs font-bold uppercase tracking-wider">{label}</div>
                            <ul className="space-y-1">
                              {items.map((item, itemIndex) => (
                                <li key={`${item}-${itemIndex}`} className="text-sm leading-relaxed">• {item}</li>
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {normalizedSummary.strengths.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-emerald-500" />
                      {t('interviews.strengths')}
                    </h3>
                    <div className="space-y-3">
                      {normalizedSummary.strengths.map((item, i) => (
                        <div key={`${item.title || item.description}-${i}`} className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-4 shadow-sm space-y-2">
                          <div className="text-sm font-semibold text-emerald-950">{item.title || item.description}</div>
                          {item.title && item.description && (
                            <p className="text-sm text-emerald-900 leading-relaxed">{item.description}</p>
                          )}
                          {item.whyItWorks && (
                            <div className="text-xs text-emerald-800">
                              <span className="font-semibold text-emerald-950">{t('interviews.whyItWorks')}:</span> {item.whyItWorks}
                            </div>
                          )}
                          {item.evidenceQuote && (
                            <blockquote className="rounded-r-lg border-l-4 border-emerald-300 bg-white/70 pl-4 py-2 text-sm italic text-emerald-900">
                              "{item.evidenceQuote}"
                            </blockquote>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pain Points */}
                {normalizedSummary.painPoints.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                      <AlertCircle size={16} className="text-rose-500" />
                      {t('interviews.painPoints')}
                    </h3>
                    <div className="space-y-3">
                      {normalizedSummary.painPoints.map((point, i) => (
                        <div key={i} className="bg-white border border-gray-100 shadow-sm p-4 rounded-lg space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-sm font-semibold text-gray-900">{point.title || point.description}</div>
                            {point.severity && (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${sentimentBadgeClass(point.severity === 'high' ? 'negative' : point.severity === 'medium' ? 'mixed' : 'positive')}`}>
                                {point.severity}
                              </span>
                            )}
                          </div>
                          {point.title && point.description && (
                            <p className="text-sm text-gray-700 leading-relaxed">{point.description}</p>
                          )}
                          {(point.rootCause || point.impact) && (
                            <div className="grid gap-2">
                              {point.rootCause && (
                                <div className="text-xs text-gray-600"><span className="font-semibold text-gray-800">{t('interviews.rootCause')}:</span> {point.rootCause}</div>
                              )}
                              {point.impact && (
                                <div className="text-xs text-gray-600"><span className="font-semibold text-gray-800">{t('interviews.customerImpact')}:</span> {point.impact}</div>
                              )}
                            </div>
                          )}
                          {point.evidenceQuote && (
                            <blockquote className="text-sm italic text-gray-600 border-l-4 border-rose-300 bg-rose-50/70 pl-4 py-2 rounded-r-lg">
                              "{point.evidenceQuote}"
                            </blockquote>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {normalizedSummary.momentsOfFriction.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t('interviews.momentsOfFriction')}</h3>
                    <div className="space-y-3">
                      {normalizedSummary.momentsOfFriction.map((item, i) => (
                        <div key={i} className="bg-white border border-gray-100 shadow-sm p-4 rounded-lg space-y-2">
                          {item.stage && <div className="text-xs font-bold uppercase tracking-wider text-gray-400">{item.stage}</div>}
                          {item.situation && <div className="text-sm text-gray-800"><span className="font-semibold">{t('interviews.situation')}:</span> {item.situation}</div>}
                          {item.breakdown && <div className="text-sm text-gray-800"><span className="font-semibold">{t('interviews.breakdown')}:</span> {item.breakdown}</div>}
                          {item.customerReaction && <div className="text-sm text-gray-800"><span className="font-semibold">{t('interviews.customerReaction')}:</span> {item.customerReaction}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {normalizedSummary.unmetNeeds.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t('interviews.unmetNeeds')}</h3>
                    <div className="space-y-3">
                      {normalizedSummary.unmetNeeds.map((item, i) => (
                        <div key={i} className="bg-white border border-gray-100 shadow-sm p-4 rounded-lg space-y-1">
                          <div className="text-sm font-semibold text-gray-900">{item.need}</div>
                          {item.whyItMatters && <div className="text-sm text-gray-700 leading-relaxed">{item.whyItMatters}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {normalizedSummary.workarounds.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t('interviews.workarounds')}</h3>
                    <div className="space-y-3">
                      {normalizedSummary.workarounds.map((item, i) => (
                        <div key={i} className="bg-white border border-gray-100 shadow-sm p-4 rounded-lg space-y-1">
                          <div className="text-sm font-semibold text-gray-900">{item.workaround}</div>
                          {item.whatItSignals && <div className="text-sm text-gray-700 leading-relaxed">{item.whatItSignals}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {normalizedSummary.opportunityAreas.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t('interviews.opportunityAreas')}</h3>
                    <div className="space-y-3">
                      {normalizedSummary.opportunityAreas.map((item, i) => (
                        <div key={i} className="bg-white border border-gray-100 shadow-sm p-4 rounded-lg space-y-1">
                          <div className="text-sm font-semibold text-gray-900">{item.area}</div>
                          {item.rationale && <div className="text-sm text-gray-700 leading-relaxed">{item.rationale}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Key Quotes */}
                {normalizedSummary.quotes.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                      <Mic size={16} className="text-emerald-500" />
                      {t('interviews.keyQuotes')}
                    </h3>
                    <div className="space-y-3">
                      {normalizedSummary.quotes.map((quote, i) => (
                        <blockquote key={i} className="text-sm italic text-gray-600 border-l-4 border-emerald-400 bg-emerald-50/50 pl-4 py-2 rounded-r-lg">
                          "{quote}"
                        </blockquote>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-4 text-gray-400">
                <Sparkles size={48} className="text-gray-200" />
                <p className="px-8 text-sm">{t('interviews.aiInsightsDesc')}</p>
                <button 
                  onClick={openInsightsConfig}
                  disabled={transcriptData.length === 0 || isRecording}
                  className="px-6 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed shadow-sm"
                >
                  {isRecording ? t('interviews.stopFirst') : (transcriptData.length === 0 ? t('interviews.waitForTranscript') : t('interviews.generateInsights'))}
                </button>
              </div>
            )}
          </div>
        </div>

        {isDesktopLayout && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t('interviews.resizeInsightsPanel')}
            onPointerDown={(event) => {
              event.preventDefault();
              setIsResizingInsights(true);
            }}
            className="absolute inset-y-0 z-20 w-4 -translate-x-1/2 cursor-col-resize"
            style={{ left: `calc(100% - ${insightsWidth}px)` }}
          >
            <div className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors ${isResizingInsights ? 'bg-blue-400' : 'bg-gray-200 hover:bg-blue-300'}`} />
            <div className={`absolute left-1/2 top-1/2 flex h-10 w-3 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-white shadow-sm transition-all ${isResizingInsights ? 'border-blue-300 text-blue-500' : 'border-gray-200 text-gray-300 hover:border-blue-200 hover:text-blue-400'}`}>
              <div className="flex gap-0.5">
                <span className="h-3.5 w-0.5 rounded-full bg-current" />
                <span className="h-3.5 w-0.5 rounded-full bg-current" />
              </div>
            </div>
          </div>
        )}
      </div>

      {isInsightsConfigOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={() => setIsInsightsConfigOpen(false)}>
          <div className="w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="border-b border-gray-200 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-500">{t('interviews.recommended')}</div>
                  <h3 className="text-xl font-bold text-gray-900">{t('interviews.insightSetupTitle')}</h3>
                  <p className="max-w-2xl text-sm text-gray-600">{t('interviews.insightSetupDesc')}</p>
                </div>
                <button
                  onClick={() => setIsInsightsConfigOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                >
                  {t('interviews.cancel')}
                </button>
              </div>
            </div>

            <div className="max-h-[75vh] overflow-y-auto px-6 py-6 space-y-8 bg-gray-50">
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold uppercase tracking-wider text-gray-500">{t('interviews.presets')}</h4>
                    <p className="mt-1 text-sm text-gray-600">{t('interviews.presetsDesc')}</p>
                  </div>
                  <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-500 shadow-sm">
                    {t('interviews.selectedCount', { count: selectedInsightsCount })}
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {insightPresets.map((preset) => {
                    const isActive = selectedInsightPreset === preset.key;
                    return (
                      <button
                        key={preset.key}
                        type="button"
                        onClick={() => applyInsightPreset(preset.key)}
                        className={`rounded-2xl border p-4 text-left shadow-sm transition-all ${
                          isActive
                            ? 'border-blue-300 bg-blue-50 text-blue-950 ring-2 ring-blue-100'
                            : 'border-gray-200 bg-white text-gray-900 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold">{preset.label}</div>
                          {isActive && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">{t('interviews.activePreset')}</span>}
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-gray-600">{preset.description}</p>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="space-y-3">
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-wider text-gray-500">{t('interviews.customSections')}</h4>
                  <p className="mt-1 text-sm text-gray-600">{t('interviews.customSectionsDesc')}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {insightSectionOptions.map((section) => {
                    const isSelected = selectedInsightSections.includes(section.key);
                    return (
                      <button
                        key={section.key}
                        type="button"
                        onClick={() => toggleInsightSection(section.key)}
                        className={`rounded-2xl border p-4 text-left shadow-sm transition-all ${
                          isSelected
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-100'
                            : 'border-gray-200 bg-white text-gray-900 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="text-sm font-semibold">{section.label}</div>
                          <span className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-bold ${
                            isSelected
                              ? 'border-emerald-600 bg-emerald-600 text-white'
                              : 'border-gray-300 bg-white text-transparent'
                          }`}>
                            ✓
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-gray-600">{section.description}</p>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="space-y-3">
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-wider text-gray-500">{t('interviews.regenerationMode')}</h4>
                  <p className="mt-1 text-sm text-gray-600">{t('interviews.regenerationModeDesc')}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setInsightMergeMode('merge_selected')}
                    className={`rounded-2xl border p-4 text-left shadow-sm transition-all ${
                      insightMergeMode === 'merge_selected'
                        ? 'border-blue-300 bg-blue-50 text-blue-950 ring-2 ring-blue-100'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="text-sm font-semibold">{t('interviews.mergeSelected')}</div>
                    <p className="mt-2 text-sm leading-relaxed text-gray-600">{t('interviews.mergeSelectedDesc')}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setInsightMergeMode('replace_all')}
                    className={`rounded-2xl border p-4 text-left shadow-sm transition-all ${
                      insightMergeMode === 'replace_all'
                        ? 'border-blue-300 bg-blue-50 text-blue-950 ring-2 ring-blue-100'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="text-sm font-semibold">{t('interviews.replaceAllInsights')}</div>
                    <p className="mt-2 text-sm leading-relaxed text-gray-600">{t('interviews.replaceAllInsightsDesc')}</p>
                  </button>
                </div>
              </section>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-gray-200 bg-white px-6 py-4">
              <div className="text-sm text-gray-500">{t('interviews.selectedCount', { count: selectedInsightsCount })}</div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsInsightsConfigOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
                >
                  {t('interviews.cancel')}
                </button>
                <button
                  onClick={handleGenerateConfiguredInsights}
                  disabled={selectedInsightsCount === 0}
                  className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  {normalizedSummary ? t('interviews.updateInsights') : t('interviews.generateInsights')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
