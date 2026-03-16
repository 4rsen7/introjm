import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Mic, Search, CheckCircle2, AlertCircle, Loader2, StopCircle, Play, Sparkles, Save, ChevronLeft, Volume2, User, Edit2, UploadCloud, FileAudio } from 'lucide-react';
import { getAuthToken } from '../services/auth';
import { useQueryClient } from '@tanstack/react-query';

const API_URL = '/api';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export default function InterviewRoom({ userProfile, currentWorkspace }) {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const transcriptEndRef = useRef(null);
  
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
  const [currentLine, setCurrentLine] = useState('');
  const [editingIndex, setEditingIndex] = useState(null);
  const [editValue, setEditValue] = useState('');

  // AI Summary State
  const [generatingAI, setGeneratingAI] = useState(false);
  const [insightStage, setInsightStage] = useState(1);
  
  // Title Editing State
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');

  const handleTitleSave = () => {
    if (editedTitle.trim() !== interview.title && editedTitle.trim() !== '') {
      setInterview(prev => ({...prev, title: editedTitle.trim()}));
      saveInterview({ title: editedTitle.trim() });
    }
    setIsEditingTitle(false);
  };

  // Fetch Interview
  useEffect(() => {
    async function fetchInterview() {
      try {
        const token = await getAuthToken();
        const res = await fetch(`${API_URL}/interviews/${id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await res.json();
        if (res.ok && json.data) {
          setInterview(json.data);
          setTranscriptData(json.data.transcript_data || []);
        } else {
          alert('Interview not found');
          navigate('/interviews');
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchInterview();
  }, [id, navigate]);

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

  // Auto-scroll
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcriptData, currentLine]);

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

  const generateAIInsights = async () => {
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
        headers: { 'Authorization': `Bearer ${token}` }
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

  const handleEditSave = (index) => {
    const updated = [...transcriptData];
    updated[index].text = editValue;
    setTranscriptData(updated);
    transcriptDataRef.current = updated;
    setEditingIndex(null);
    saveInterview({ transcript_data: updated }, updated);
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
    
    // Simulate stages since we don't have Server-Sent Events from backend
    // Stage 1: Uploading (0 - 3s)
    // Stage 2: Analyzing (3s - 12s)
    // Stage 3: Generating JSON (12s onwards)
    const stageTimer1 = setTimeout(() => setUploadStage(2), 3000);
    const stageTimer2 = setTimeout(() => setUploadStage(3), 12000);

    const formData = new FormData();
    formData.append('audio', selectedFile);

    try {
      const token = await getAuthToken();
      const res = await fetch(`${API_URL}/interviews/${id}/upload-audio`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const json = await res.json();
      
      if (res.ok && json.data) {
        setTranscriptData(json.data.transcript_data || []);
        transcriptDataRef.current = json.data.transcript_data || [];
        setInterview(json.data);
        setSelectedFile(null);
        navigate(`/interviews/${id}`, { replace: true });
        queryClient.invalidateQueries(['interviews']);
      } else {
        alert(json.error || 'Failed to process audio file');
      }
    } catch (err) {
      console.error('Upload error:', err);
      alert('Network error while uploading.');
    } finally {
      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
      setIsUploading(false);
      setUploadStage(1);
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
              <span className={`px-2 py-0.5 rounded capitalize border ${isCompleted ? 'bg-green-50 text-green-700 border-green-200' : 'bg-yellow-50 text-yellow-800 border-yellow-200'}`}>
                {interview.status || 'draft'}
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
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Transcript View */}
        <div className="w-2/3 flex flex-col bg-white">
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
                {isUploading ? (
                  <div className="flex flex-col items-center gap-4">
                    <div className="relative flex items-center justify-center py-4">
                      <div className="absolute inset-0 bg-emerald-200 rounded-full blur-xl opacity-50 animate-pulse"></div>
                      <Loader2 size={64} strokeWidth={2.5} className="animate-spin text-emerald-500 relative z-10 mx-auto" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 animate-pulse">
                        {uploadStage === 1 && t('interviews.uploadStage1')}
                        {uploadStage === 2 && t('interviews.uploadStage2')}
                        {uploadStage === 3 && t('interviews.uploadStage3')}
                      </h3>
                      <p className="text-gray-500 mt-2 transition-opacity duration-300">
                        {uploadStage === 1 && t('interviews.uploadStage1Desc')}
                        {uploadStage === 2 && t('interviews.uploadStage2Desc')}
                        {uploadStage === 3 && t('interviews.uploadStage3Desc')}
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
                    
                    <div className={`relative px-5 py-3 rounded-2xl shadow-sm text-sm/relaxed ${isInterviewer ? 'bg-white border border-gray-200 text-gray-800 rounded-tl-none' : 'bg-emerald-50 border border-emerald-100 text-emerald-900 rounded-tr-none'}`}>
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
                        <>
                          <p>{entry.text}</p>
                          <button 
                            onClick={() => { setEditingIndex(index); setEditValue(entry.text); }}
                            className="absolute top-2 right-2 p-1 text-gray-400 opacity-0 group-hover:opacity-100 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"
                          >
                            <Edit2 size={14} />
                          </button>
                        </>
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
        <div className="w-1/3 flex flex-col border-l border-gray-200 bg-gray-50 z-10 relative">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2 bg-white">
            <Sparkles className="text-amber-500" size={20} />
            <h2 className="font-semibold text-gray-900">{t('interviews.aiInsights')}</h2>
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
            ) : (interview.summary_data && Object.keys(interview.summary_data).length > 0) ? (
              <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
                {/* General Insights */}
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t('interviews.tldr')}</h3>
                  <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-4 rounded-xl text-sm text-indigo-900 leading-relaxed border border-indigo-100">
                    {interview.summary_data.generalInsights}
                  </div>
                </div>

                {/* Pain Points */}
                {interview.summary_data.painPoints?.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                      <AlertCircle size={16} className="text-rose-500" />
                      {t('interviews.painPoints')}
                    </h3>
                    <ul className="space-y-3">
                      {interview.summary_data.painPoints.map((point, i) => (
                        <li key={i} className="flex gap-3 text-sm text-gray-700 bg-white border border-gray-100 shadow-sm p-3 rounded-lg">
                          <span className="flex-none mt-0.5 w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Key Quotes */}
                {interview.summary_data.quotes?.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                      <Mic size={16} className="text-emerald-500" />
                      {t('interviews.keyQuotes')}
                    </h3>
                    <div className="space-y-3">
                      {interview.summary_data.quotes.map((quote, i) => (
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
                  onClick={generateAIInsights}
                  disabled={transcriptData.length === 0 || isRecording}
                  className="px-6 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed shadow-sm"
                >
                  {isRecording ? t('interviews.stopFirst') : (transcriptData.length === 0 ? t('interviews.waitForTranscript') : t('interviews.generateInsights'))}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
