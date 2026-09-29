import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { researchKey, researchRequest } from './useResearch';

export function useAnalysisJob({ userId, workspaceId, studyId, interviewId }) {
  const client = useQueryClient();
  const refreshed = useRef(null);
  const resource = interviewId ? `/interviews/${interviewId}/summary-job` : `/studies/${studyId}/synthesis-job`;
  const key = researchKey(userId, workspaceId, 'analysis-job', resource);
  const job = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => researchRequest(resource, { signal }),
    retry: false,
    refetchInterval: (query) => ['queued', 'running'].includes(query.state.data?.status) ? 2000 : false,
  });
  const enqueue = useMutation({
    mutationFn: () => researchRequest(`${resource}s`, { method: 'POST' }),
    onSuccess: (data) => client.setQueryData(key, data),
  });
  const cancel = useMutation({
    mutationFn: () => researchRequest(`/jobs/${job.data.id}/cancel`, { method: 'POST' }),
    onSuccess: (data) => client.setQueryData(key, data),
  });
  useEffect(() => {
    const marker = `${job.data?.id}:${job.data?.status}`;
    if (job.data?.status !== 'completed' || refreshed.current === marker) return;
    refreshed.current = marker;
    const parts = interviewId ? ['interview', interviewId] : ['synthesis', studyId];
    client.invalidateQueries({ queryKey: researchKey(userId, workspaceId, ...parts) });
    client.invalidateQueries({ queryKey: researchKey(userId, workspaceId, 'interviews', studyId) });
    if (interviewId) client.invalidateQueries({ queryKey: researchKey(userId, workspaceId, 'synthesis', studyId) });
  }, [job.data?.id, job.data?.status, client, userId, workspaceId, studyId, interviewId]);
  return { job: job.data, loading: job.isPending, error: enqueue.error || cancel.error || job.error,
    busy: enqueue.isPending || ['queued', 'running'].includes(job.data?.status),
    canceling: cancel.isPending,
    enqueue: () => enqueue.mutate(),
    cancel: () => job.data?.id && cancel.mutate() };
}
