import { useQuery } from '@tanstack/react-query';
import { getAuthToken } from '../services/auth';
import { API_BASE_URL } from '../config/api';

const API_URL = API_BASE_URL;

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
export const useJourneys = (enabled = true) => {
  return useQuery({
    queryKey: ['journeys'],
    queryFn: async () => {
      const data = await fetchData('/journeys');
      return data.map(mapJourneyToClient);
    },
    enabled,
    refetchOnWindowFocus: true, // щоб інші учасники воркспейсу бачили нові мапи після перемикання на вкладку
  });
};

export const useInterviews = (enabled = true) => {
  return useQuery({
    queryKey: ['interviews'],
    queryFn: async () => {
      const data = await fetchData('/interviews');
      return data.map(mapInterviewToClient);
    },
    enabled,
    refetchOnWindowFocus: true,
  });
};

export const usePersonas = (enabled = true) => {
  return useQuery({
    queryKey: ['personas'],
    queryFn: async () => {
      const data = await fetchData('/personas');
      return data.map(mapPersonaToClient);
    },
    enabled,
  });
};

export const useMetrics = (enabled = true) => {
  return useQuery({
    queryKey: ['metrics'],
    queryFn: async () => {
      const data = await fetchData('/metrics');
      return data.map(mapMetricToClient);
    },
    enabled,
  });
};

export const useWorkspace = (enabled = true) => {
  return useQuery({
    queryKey: ['workspace'],
    queryFn: () => fetchData('/workspace'),
    enabled,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
};

const WORKSPACE_LIST_KEY = 'workspace_list';
export const useWorkspaceList = (enabled = true) => {
  return useQuery({
    queryKey: [WORKSPACE_LIST_KEY],
    queryFn: () => fetchData('/workspace/list'),
    enabled,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
};

export const useWorkspaceLimits = (workspaceId, enabled = true) => {
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
    enabled,
    refetchOnWindowFocus: true,
    staleTime: 15 * 1000,
  });
};

export const useProfile = (enabled = true) => {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => fetchData('/profile'),
    enabled,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
};
