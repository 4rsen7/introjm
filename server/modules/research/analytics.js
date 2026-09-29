const STATUSES = ['success', 'partial', 'failure', 'not_attempted', 'unknown'];

function studyResults(snapshot) {
    const { study, interviews, outcomes } = snapshot;
    const current = new Map();
    for (const outcome of outcomes) {
        const key = `${outcome.interview_id}:${outcome.task_id}`;
        if (!current.has(key) || current.get(key).revision < outcome.revision) current.set(key, outcome);
    }
    const sessions = interviews.map(interview => ({ id: interview.id, title: interview.title, participant_id: interview.research_participant_id,
        evidence_revision: interview.evidence_revision,
        tasks: study.plan.tasks.map(task => {
            const candidate = current.get(`${interview.id}:${task.id}`);
            const valid = candidate && candidate.job_id === interview.evidence_job_id && candidate.study_version_id === study.current_version_id
                && candidate.transcript_version_id === interview.current_transcript_version_id;
            return { task_id: task.id, status: valid ? candidate.status : 'unknown', outcome: valid ? candidate : null,
                excluded_reason: valid ? null : candidate ? 'stale_source' : 'not_analyzed' };
        }) }));
    const tasks = study.plan.tasks.map(task => {
        const counts = Object.fromEntries(STATUSES.map(status => [status, 0]));
        let analyzed = 0;
        for (const session of sessions) {
            const result = session.tasks.find(item => item.task_id === task.id);
            counts[result.status]++;
            if (result.outcome) analyzed++;
        }
        const attempts = counts.success + counts.partial + counts.failure;
        return { ...task, counts, attempts, success_rate: attempts ? counts.success / attempts : null, analyzed, sessions: sessions.length };
    });
    return { study_version_id: study.current_version_id, tasks, sessions,
        coverage: { sessions: sessions.length, linked_participants: new Set(sessions.map(row => row.participant_id).filter(Boolean)).size,
            unlinked_sessions: sessions.filter(row => !row.participant_id).length,
            current_summaries: interviews.filter(row => !row.summary_stale && row.summary_source_study_revision === study.context_revision && row.summary_source_job_id).length },
        counting_unit: 'session' };
}
module.exports = { studyResults };
