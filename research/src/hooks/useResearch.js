import { useQuery } from '@tanstack/react-query';
import { getAuthToken } from '../../../client/src/services/auth';

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
export const researchKey = (userId, workspaceId, ...parts) => ['research', userId, workspaceId, ...parts];

export async function researchRequest(path, options = {}) {
  const token = await getAuthToken();
  if (!token) throw Object.assign(new Error('Authentication required'), { code: 'UNAUTHENTICATED', status: 401 });
  const response = await fetch(`${API_BASE_URL}/research${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  let result;
  try { result = await response.json(); } catch { result = {}; }
  if (!response.ok || result.status === 'error') {
    throw Object.assign(new Error(result.message || 'Request failed'), { code: result.code, status: response.status });
  }
  return result.data;
}

export async function uploadInterviewAudio(interviewId, file, { autoSummary = true } = {}) {
  const token = await getAuthToken();
  if (!token) throw Object.assign(new Error('Authentication required'), { code: 'UNAUTHENTICATED', status: 401 });
  const formData = new FormData();
  formData.append('audio', file);
  formData.append('auto_summary', autoSummary ? 'true' : 'false');
  const response = await fetch(`${API_BASE_URL}/research/interviews/${interviewId}/upload-audio`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  let result;
  try { result = await response.json(); } catch { result = {}; }
  if (!response.ok || result.status === 'error') {
    throw Object.assign(new Error(result.message || result.error || 'Upload failed'), { code: result.code, status: response.status });
  }
  return result.data;
}

export function useResearchQuery(userId, workspaceId, parts, path, enabled = true) {
  return useQuery({
    queryKey: researchKey(userId, workspaceId, ...parts),
    queryFn: ({ signal }) => researchRequest(path, { signal }),
    enabled: Boolean(userId && enabled),
    staleTime: 30_000,
    retry: (count, error) => error.status >= 500 && count < 1,
  });
}
