import { useQuery } from '@tanstack/react-query';
import { getAuthToken } from '../services/auth';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

// Helpers for data mapping
export const mapMetricToClient = (m) => ({
  ...m,
  previousValue: m.previous_value,
  reverseColors: m.reverse_colors,
  dataSource: m.data_source,
  chartType: m.chart_type,
  seriesData: m.series_data,
  updatedAt: new Date(m.updated_at).toLocaleDateString()
});

export const mapPersonaToClient = (p) => ({
  ...p,
  painPoints: p.pain_points || p.painPoints || [],
  goals: p.goals || [],
  frustrations: p.frustrations || [],
  motivations: p.motivations || [],
  bio: p.bio || '',
  age: p.age || '',
  location: p.location || ''
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
    queryFn: () => fetchData('/journeys'),
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

export const useProfile = () => {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => fetchData('/profile'),
  });
};
