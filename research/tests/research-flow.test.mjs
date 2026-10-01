import test from 'node:test';
import assert from 'node:assert/strict';
import { STUDY_TABS, studyTabFromHash, summaryIsCurrent, summaryContextChanged, interviewStage } from '../src/utils/researchFlow.js';

test('study navigation restores the selected stage and safely falls back', () => {
  assert.deepEqual(STUDY_TABS, ['summary', 'interviews', 'brief']);
  assert.equal(studyTabFromHash('#interviews'), 'interviews');
  assert.equal(studyTabFromHash('#overview'), 'brief');
  assert.equal(studyTabFromHash('#plan'), 'brief');
  assert.equal(studyTabFromHash('#synthesis'), 'summary');
  assert.equal(studyTabFromHash('#results'), 'summary');
  assert.equal(studyTabFromHash('#unknown'), 'summary');
  assert.equal(studyTabFromHash('', 'interviews'), 'interviews');
});

test('interview readiness distinguishes pending, current, changed context, and failed work', () => {
  const study = { context_revision: 2 };
  assert.equal(interviewStage({ status: 'draft', transcript_revision: 0 }, study), 'sourcePending');
  assert.equal(interviewStage({ status: 'draft', transcript_revision: 1 }, study), 'summaryPending');
  assert.equal(interviewStage({ status: 'processing' }, study), 'processing');
  assert.equal(interviewStage({ status: 'failed' }, study), 'failed');
  const current = { summary_revision: 1, summary_stale: false, summary_source_study_revision: 2 };
  assert.equal(summaryIsCurrent(current, study), true);
  assert.equal(interviewStage(current, study), 'summaryReady');
  const changed = { ...current, summary_stale: true, summary_source_study_revision: 1 };
  assert.equal(summaryContextChanged(changed, study), true);
  assert.equal(interviewStage(changed, study), 'reviewNeeded');
  assert.equal(summaryContextChanged({ ...changed, summary_source_study_revision: 2 }, study), false);
});
