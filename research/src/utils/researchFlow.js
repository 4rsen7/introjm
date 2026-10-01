export const STUDY_TABS = ['summary', 'interviews', 'brief'];

const legacyTabs = { overview: 'brief', plan: 'brief', synthesis: 'summary', results: 'summary' };

export function studyTabFromHash(hash, fallback = 'summary') {
  const value = String(hash || '').replace(/^#/, '');
  return STUDY_TABS.includes(value) ? value : legacyTabs[value] || fallback;
}

export function summaryIsCurrent(record, study) {
  return Boolean(record?.summary_revision > 0 && !record.summary_stale
    && (record.summary_source_study_revision == null || record.summary_source_study_revision === study?.context_revision));
}

export function summaryContextChanged(record, study) {
  return Boolean(record?.summary_stale && record.summary_source_study_revision != null
    && record.summary_source_study_revision !== study?.context_revision);
}

export function interviewStage(record, study) {
  if (record?.status === 'processing') return 'processing';
  if (record?.status === 'failed') return 'failed';
  if (record?.summary_stale || (record?.summary_revision > 0 && !summaryIsCurrent(record, study))) return 'reviewNeeded';
  if (summaryIsCurrent(record, study)) return 'summaryReady';
  if (record?.transcript_revision > 0) return 'summaryPending';
  return 'sourcePending';
}
