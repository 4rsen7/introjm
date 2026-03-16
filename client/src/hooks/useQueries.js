import { useQuery } from '@tanstack/react-query';
import { getAuthToken, getStoredAuthToken } from '../services/auth';

const API_URL = '/api';

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
  const hasToken = Boolean(getStoredAuthToken());
  return useQuery({
    queryKey: ['journeys'],
    queryFn: async () => {
      const data = await fetchData('/journeys');
      return data.map(mapJourneyToClient);
    },
    enabled: hasToken,
    refetchOnWindowFocus: true, // щоб інші учасники воркспейсу бачили нові мапи після перемикання на вкладку
  });
};

export const useInterviews = () => {
  const hasToken = Boolean(getStoredAuthToken());
  return useQuery({
    queryKey: ['interviews'],
    queryFn: async () => {
      const data = await fetchData('/interviews');
      return data.map(mapInterviewToClient);
    },
    enabled: hasToken,
    refetchOnWindowFocus: true,
  });
};

export const usePersonas = () => {
  const hasToken = Boolean(getStoredAuthToken());
  return useQuery({
    queryKey: ['personas'],
    queryFn: async () => {
      const data = await fetchData('/personas');
      return data.map(mapPersonaToClient);
    },
    enabled: hasToken,
  });
};

export const useMetrics = () => {
  const hasToken = Boolean(getStoredAuthToken());
  return useQuery({
    queryKey: ['metrics'],
    queryFn: async () => {
      const data = await fetchData('/metrics');
      return data.map(mapMetricToClient);
    },
    enabled: hasToken,
  });
};

export const useWorkspace = () => {
  const hasToken = Boolean(getStoredAuthToken());
  return useQuery({
    queryKey: ['workspace'],
    queryFn: () => fetchData('/workspace'),
    enabled: hasToken,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
};

const WORKSPACE_LIST_KEY = 'workspace_list';
export const useWorkspaceList = () => {
  const hasToken = Boolean(getStoredAuthToken());
  return useQuery({
    queryKey: [WORKSPACE_LIST_KEY],
    queryFn: () => fetchData('/workspace/list'),
    enabled: hasToken,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
};

export const useWorkspaceLimits = (workspaceId) => {
  const hasToken = Boolean(getStoredAuthToken());
  return useQuery({
    queryKey: ['workspace', 'limits', workspaceId ?? 'current'],
    queryFn: async () => {
      const token = await getAuthToken();
      if (!token) throw new Error('No token');
      const params = new URLSearchParams();
      if (workspaceId) params.set('workspaceId', workspaceId);
      const endpoint = `${API_URL}/workspace/limits${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.message || 'Failed to fetch limits');
      return json.data || null;
    },
    enabled: hasToken,
    refetchOnWindowFocus: true,
    staleTime: 15 * 1000,
  });
};

export const useProfile = () => {
  const hasToken = Boolean(getStoredAuthToken());
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => fetchData('/profile'),
    enabled: hasToken,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
};
