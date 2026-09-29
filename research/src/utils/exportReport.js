export function slugifyTitle(value, fallback = 'research-export') {
  const cleaned = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return cleaned || fallback;
}

export function escapeCsvCell(value) {
  const raw = value == null ? '' : String(value);
  const safe = /^[\s]*[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function toCsvString(rows) {
  return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')}`;
}

export function buildResultsCsv({ study, data, t }) {
  const tasks = data?.tasks || [];
  const sessions = data?.sessions || [];
  const summaryHeader = [
    t('research.task_title'),
    t('research.outcome_success'),
    t('research.outcome_partial'),
    t('research.outcome_failure'),
    t('research.outcome_not_attempted'),
    t('research.outcome_unknown'),
    'Attempts',
    'Success %',
    'Analyzed',
    t('research.sessionsLabel'),
  ];
  const summaryRows = tasks.map((task, index) => [
    `${index + 1}. ${task.title}`,
    task.counts?.success ?? 0,
    task.counts?.partial ?? 0,
    task.counts?.failure ?? 0,
    task.counts?.not_attempted ?? 0,
    task.counts?.unknown ?? 0,
    task.attempts ?? 0,
    task.success_rate == null ? '' : `${Math.round(task.success_rate * 100)}%`,
    task.analyzed ?? 0,
    task.sessions ?? 0,
  ]);
  const matrixHeader = [
    t('research.interviews'),
    ...tasks.flatMap((task, index) => [
      `${index + 1}. ${task.title}`,
      `${index + 1}. ${t('research.reason')}`,
    ]),
  ];
  const matrixRows = sessions.map((session) => {
    const byTask = new Map((session.tasks || []).map((item) => [item.task_id, item]));
    return [
      session.title || session.id,
      ...tasks.flatMap((task) => {
        const entry = byTask.get(task.id);
        const statusKey = entry?.status || 'unknown';
        return [
          t(`research.outcome_${statusKey}`),
          entry?.outcome?.reason || '',
        ];
      }),
    ];
  });
  return toCsvString([
    [study?.title || '', t('research.taskComparison')],
    [],
    summaryHeader,
    ...summaryRows,
    [],
    matrixHeader,
    ...matrixRows,
  ]);
}

export function buildStudyReportMarkdown({ study, findings = [], interviews = [], t }) {
  const names = new Map((interviews || []).map((item) => [item.id, item.title]));
  const sections = [`# ${study?.title || t('research.studies')}`];
  if (study?.goal) {
    sections.push(`## ${t('research.sharedGoal')}\n\n${study.goal}`);
  }
  if (study?.brief) {
    sections.push(`## ${t('research.brief')}\n\n${study.brief}`);
  }
  const plan = study?.plan;
  if (plan) {
    const planLines = [];
    if (plan.prototype?.name) {
      planLines.push(`- **${t('research.prototype_name')}:** ${plan.prototype.name}${plan.prototype.version ? ` (${plan.prototype.version})` : ''}`);
    }
    if (plan.questions?.length) {
      planLines.push(`### ${t('research.plan_questions')}\n\n${plan.questions.map((q) => `- ${q}`).join('\n')}`);
    }
    if (plan.hypotheses?.length) {
      planLines.push(`### ${t('research.plan_hypotheses')}\n\n${plan.hypotheses.map((h) => `- ${h}`).join('\n')}`);
    }
    if (plan.tasks?.length) {
      const taskBlocks = plan.tasks.map((task, idx) => (
        `${idx + 1}. **${task.title}**\n   - ${t('research.task_instruction')}: ${task.instruction}\n   - ${t('research.task_success_criteria')}: ${task.success_criteria}`
      ));
      planLines.push(`### ${t('research.sharedTasks')}\n\n${taskBlocks.join('\n')}`);
    }
    if (planLines.length) {
      sections.push(`## ${t('research.researchPlan')}\n\n${planLines.join('\n\n')}`);
    }
  }
  if (findings.length) {
    const findingBlocks = findings.map((finding, index) => {
      const sources = (finding.source_ids || []).map((id) => names.get(id) || id).join(', ');
      return `### ${t('research.findingNumber', { number: index + 1 })}\n\n${finding.text}${sources ? `\n\n*${t('research.interviews')}: ${sources}*` : ''}`;
    });
    sections.push(`## ${t('research.synthesisTitle')}\n\n${findingBlocks.join('\n\n')}`);
  }
  return `${sections.join('\n\n')}\n`;
}

export function buildInterviewMarkdown({ study, record, summaryText = '', segments = [], t }) {
  const sections = [`# ${record?.title || t('research.interviews')}`];
  const meta = [];
  if (study?.title) meta.push(`- **${t('research.studies')}:** ${study.title}`);
  if (study?.goal) meta.push(`- **${t('research.sharedGoal')}:** ${study.goal}`);
  if (meta.length) sections.push(meta.join('\n'));
  if (summaryText && summaryText.trim()) {
    sections.push(`## ${t('research.summary')}\n\n${summaryText.trim()}`);
  }
  if (segments.length) {
    const lines = segments.map((row, index) => {
      const time = row.timestamp ? `[${row.timestamp}] ` : '';
      const speaker = row.speaker ? `**${row.speaker}:** ` : `**#${index + 1}:** `;
      return `- ${time}${speaker}${row.text || ''}`;
    });
    sections.push(`## ${t('research.transcript')}\n\n${lines.join('\n')}`);
  }
  return `${sections.join('\n\n')}\n`;
}

export function buildTranscriptCsv({ segments = [], t }) {
  const header = ['#', t('research.timestamp'), t('research.speaker'), t('research.segmentText')];
  const rows = segments.map((row, index) => [
    index + 1,
    row.timestamp || '',
    row.speaker || '',
    row.text || '',
  ]);
  return toCsvString([header, ...rows]);
}

export function downloadFile({ filename, content, mimeType = 'text/plain;charset=utf-8' }) {
  const payload = { filename, content, mimeType };
  if (typeof window !== 'undefined') {
    window.__lastResearchDownload = payload;
    if (Array.isArray(window.__researchDownloads)) {
      window.__researchDownloads.push(payload);
    }
  }
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
