import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { researchKey, researchRequest } from './useResearch';

export function useResearchJob({ userId, workspaceId, path, enabled = true }) {
  const client = useQueryClient();
  const refreshed = useRef(null);
  const key = researchKey(userId, workspaceId, 'job', path);
  const query = useQuery({ queryKey: key, enabled, queryFn: ({ signal }) => researchRequest(path, { signal }), retry: false,
    refetchInterval: q => ['queued', 'running'].includes(q.state.data?.status) ? 2000 : false });
  const start = useMutation({ mutationFn: ({ endpoint, body }) => researchRequest(endpoint, { method: 'POST', body: JSON.stringify(body || {}) }),
    onSuccess: data => { client.setQueryData(key, data); client.invalidateQueries({ queryKey: key }); } });
  const cancel = useMutation({ mutationFn: () => researchRequest(`/jobs/${query.data.id}/cancel`, { method: 'POST' }),
    onSuccess: data => { client.setQueryData(key, data); client.invalidateQueries({ queryKey: key }); } });
  useEffect(() => {
    if (query.data?.status !== 'completed' || refreshed.current === query.data.id) return;
    refreshed.current = query.data.id;
    for (const part of ['results', 'interview', 'interviews']) client.invalidateQueries({ queryKey: researchKey(userId, workspaceId, part) });
  }, [query.data?.id, query.data?.status, client, userId, workspaceId]);
  return { ...query, start, cancel, busy: start.isPending || ['queued', 'running'].includes(query.data?.status), error: start.error || cancel.error || query.error };
}
