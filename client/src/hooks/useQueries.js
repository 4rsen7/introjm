import { useQuery } from '@tanstack/react-query';
import { getAuthToken } from '../services/auth';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5005/api';

// Helper for consistent date formatting
const formatDate = (dateString) => {
  if (!dateString) return 'Just now';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

// Helpers for data mapping
export const mapMetricToClient = (m) => ({
  ...m,
  previousValue: m.previous_value,
  reverseColors: m.reverse_colors,
  dataSource: m.data_source,
  chartType: m.chart_type,
  seriesData: m.series_data,
  seriesLabelFormat: m.series_label_format ?? 'text',
  integrationConfig: m.integration_config,
  integrationConnectedBy: m.integration_connected_by ?? null,
  updatedAt: formatDate(m.updated_at)
});

export const mapPersonaToClient = (p) => ({
  ...p,
  updatedAt: formatDate(p.updated_at || p.created_at),
  painPoints: p.pain_points || p.painPoints || [],
  goals: p.goals || [],
  frustrations: p.frustrations || [],
  motivations: p.motivations || [],
  bio: p.bio || '',
  age: p.age || '',
  location: p.location || ''
});

export const mapJourneyToClient = (j) => ({
  ...j,
  updatedAt: formatDate(j.updated_at || j.created_at),
});

export const mapInterviewToClient = (i) => ({
  ...i,
  updatedAt: formatDate(i.updated_at || i.created_at),
});

// Generic fetcher
const fetchData = async (endpoint) => {
  const token = await getAuthToken();
  if (!token) throw new Error('No token');

  const response = await fetch(`${API_URL}${endpoint}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) throw new Error('Network response was not ok');
  const json = await response.json();
  return json.data;
};

// Hooks
export const useJourneys = () => {
  return useQuery({
    queryKey: ['journeys'],
    queryFn: async () => {
      const data = await fetchData('/journeys');
      return data.map(mapJourneyToClient);
    },
    refetchOnWindowFocus: true, // щоб інші учасники воркспейсу бачили нові мапи після перемикання на вкладку
  });
};

export const useInterviews = () => {
  return useQuery({
    queryKey: ['interviews'],
    queryFn: async () => {
      const data = await fetchData('/interviews');
      return data.map(mapInterviewToClient);
    },
    refetchOnWindowFocus: true,
  });
};

export const usePersonas = () => {
  return useQuery({
    queryKey: ['personas'],
    queryFn: async () => {
      const data = await fetchData('/personas');
      return data.map(mapPersonaToClient);
    },
  });
};

export const useMetrics = () => {
  return useQuery({
    queryKey: ['metrics'],
    queryFn: async () => {
      const data = await fetchData('/metrics');
      return data.map(mapMetricToClient);
    },
  });
};

export const useWorkspace = () => {
  return useQuery({
    queryKey: ['workspace'],
    queryFn: () => fetchData('/workspace'),
  });
};

const WORKSPACE_LIST_KEY = 'workspace_list';
export const useWorkspaceList = () => {
  return useQuery({
    queryKey: [WORKSPACE_LIST_KEY],
    queryFn: () => fetchData('/workspace/list'),
  });
};

export const useWorkspaceLimits = (workspaceId) => {
  return useQuery({
    queryKey: ['workspace', 'limits', workspaceId ?? 'current'],
    queryFn: async () => {
      const token = await getAuthToken();
      if (!token) throw new Error('No token');
      const url = new URL(`${API_URL}/workspace/limits`);
      if (workspaceId) url.searchParams.set('workspaceId', workspaceId);
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.message || 'Failed to fetch limits');
      return json.data || null;
    },
    refetchOnWindowFocus: true,
    staleTime: 15 * 1000,
  });
};

export const useProfile = () => {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => fetchData('/profile'),
  });
};
