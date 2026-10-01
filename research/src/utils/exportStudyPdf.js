import { jsPDF } from 'jspdf';
import { slugifyTitle } from './exportReport.js';

const PAGE = { width: 210, height: 297, left: 18, right: 18, top: 20, bottom: 273 };
const WIDTH = PAGE.width - PAGE.left - PAGE.right;
const COLORS = {
  ink: [31, 41, 55], muted: [93, 103, 120], lavender: [245, 242, 255],
  lavenderEdge: [224, 216, 250], blue: [241, 247, 255], blueEdge: [216, 230, 249],
  white: [255, 255, 255], edge: [225, 231, 239], accent: [95, 80, 165],
};
const CATEGORIES = [
  ['insights', 'research.findingsInsights'],
  ['pain_points', 'research.findingsPainPoints'],
  ['what_worked', 'research.findingsWorked'],
  ['what_did_not_work', 'research.findingsDidNotWork'],
];

function safeLines(doc, value, width) {
  const paragraphs = String(value ?? '').replace(/\r\n?/g, '\n').split('\n');
  return paragraphs.flatMap(paragraph => paragraph ? doc.splitTextToSize(paragraph, width) : ['']);
}

function safeSourceUrl(origin, studyId, interviewId) {
  if (!studyId || !interviewId || !origin) return null;
  try {
    const base = new URL(origin);
    if (!['http:', 'https:'].includes(base.protocol) || base.origin !== origin) return null;
    return `${base.origin}/studies/${encodeURIComponent(String(studyId))}/interviews/${encodeURIComponent(String(interviewId))}`;
  } catch { return null; }
}

/** Build a vector, selectable-text PDF from saved Research data. `fonts` are base64 TTF strings. */
export function buildStudyPdf({ study, result, interviews = [], t, origin, fonts }) {
  if (!fonts?.regular || !fonts?.bold) throw new Error('PDF fonts are unavailable');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.addFileToVFS('NotoSans-Regular.ttf', fonts.regular);
  doc.addFileToVFS('NotoSans-Bold.ttf', fonts.bold);
  doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
  doc.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold');
  doc.setFont('NotoSans', 'normal');
  doc.setProperties({ title: `${study?.title || t('research.studies')} — ${t('research.overallSummary')}`, creator: 'IteroJM Research' });
  let y = PAGE.top;
  const names = new Map((interviews || []).map(row => [String(row.id), row.title]));
  const findings = Array.isArray(result?.output?.findings) ? result.output.findings : [];

  const newPage = () => { doc.addPage(); y = PAGE.top; };
  const need = height => { if (y + height > PAGE.bottom) newPage(); };
  const text = (value, { size = 10, bold = false, color = COLORS.ink, x = PAGE.left, maxWidth = WIDTH, lineHeight = 5.6 } = {}) => {
    doc.setFont('NotoSans', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    for (const line of safeLines(doc, value, maxWidth)) {
      need(lineHeight);
      doc.text(line || ' ', x, y + lineHeight * 0.76);
      y += lineHeight;
    }
  };
  const boxHeight = (heading, body, width = WIDTH) => {
    doc.setFont('NotoSans', 'normal');
    doc.setFontSize(10);
    const bodyHeight = safeLines(doc, body, width - 14).length * 5.8;
    doc.setFont('NotoSans', 'bold');
    doc.setFontSize(9);
    const headingHeight = heading ? safeLines(doc, heading, width - 14).length * 5.3 + 2 : 0;
    return bodyHeight + headingHeight + 14;
  };
  const label = (value, firstBox = null) => {
    doc.setFont('NotoSans', 'bold');
    doc.setFontSize(9);
    const labelHeight = safeLines(doc, String(value).toLocaleUpperCase(), WIDTH).length * 5;
    const candidateHeight = typeof firstBox === 'number' ? firstBox : firstBox ? boxHeight(firstBox.heading, firstBox.body) : 0;
    const labelLeadHeight = 4 + labelHeight + 2;
    const firstHeight = candidateHeight <= PAGE.bottom - PAGE.top - labelLeadHeight ? candidateHeight : 17;
    need(4 + labelHeight + 2 + firstHeight);
    y += 4;
    text(String(value).toLocaleUpperCase(), { size: 9, bold: true, color: COLORS.accent, lineHeight: 5 });
    y += 2;
  };
  // Every box is painted in page-sized fragments so arbitrary long text remains visible.
  const box = ({ heading, body, fill = COLORS.white, border = COLORS.edge, bodyColor = COLORS.ink, sourceUrl, x = PAGE.left, width = WIDTH, quoteAccent = false }) => {
    doc.setFont('NotoSans', 'normal');
    doc.setFontSize(10);
    const bodyLines = safeLines(doc, body, width - 14);
    doc.setFont('NotoSans', 'bold');
    doc.setFontSize(9);
    const headingLines = heading ? safeLines(doc, heading, width - 14) : [];
    const rows = [
      ...headingLines.map(value => ({ value, bold: true, size: 9, color: COLORS.muted, height: 5.3, link: sourceUrl })),
      ...(headingLines.length ? [{ value: '', height: 2 }] : []),
      ...bodyLines.map(value => ({ value, bold: false, size: 10, color: bodyColor, height: 5.8, link: sourceUrl })),
    ];
    const fullHeight = rows.reduce((sum, row) => sum + row.height, 0) + 14;
    if (fullHeight <= PAGE.bottom - PAGE.top - 20 && y + fullHeight > PAGE.bottom) newPage();
    let index = 0;
    while (index < rows.length) {
      need(13);
      const available = PAGE.bottom - y - 10;
      let end = index;
      let used = 0;
      while (end < rows.length && used + rows[end].height <= available) { used += rows[end].height; end += 1; }
      if (end === index) { newPage(); continue; }
      doc.setFillColor(...fill);
      doc.setDrawColor(...border);
      doc.roundedRect(x, y, width, used + 10, 3, 3, 'FD');
      if (quoteAccent) {
        doc.setDrawColor(139, 173, 225);
        doc.setLineWidth(0.8);
        doc.line(x + 2.5, y + 3, x + 2.5, y + used + 7);
        doc.setLineWidth(0.2);
      }
      let lineY = y + 5;
      for (let rowIndex = index; rowIndex < end; rowIndex += 1) {
        const row = rows[rowIndex];
        if (row.value) {
          doc.setFont('NotoSans', row.bold ? 'bold' : 'normal');
          doc.setFontSize(row.size);
          doc.setTextColor(...row.color);
          doc.text(row.value, x + 7, lineY + row.height * 0.76);
          if (row.link) doc.link(x + 7, lineY, width - 14, row.height, { url: row.link });
        }
        lineY += row.height;
      }
      y += used + 14;
      index = end;
      if (index < rows.length) newPage();
    }
  };

  text(study?.title || t('research.studies'), { size: 20, bold: true, lineHeight: 10.5 });
  y += 2;
  text(t('research.overallSummary'), { size: 12, color: COLORS.muted, lineHeight: 7 });
  y += 1;
  text(t('research.synthesisSourceCount', { count: result?.source_manifest?.length || 0 }), { size: 9, color: COLORS.muted, lineHeight: 5 });
  y += 4;

  if (!result?.is_current) {
    box({ body: t(result?.stale_reason === 'brief_changed' ? 'research.previousBriefResults' : 'research.pdfHistoricalNotice'), fill: COLORS.lavender, border: COLORS.lavenderEdge });
  } else {
    if (study?.goal) { label(t('research.sharedGoal'), { body: study.goal }); box({ body: study.goal, fill: COLORS.lavender, border: COLORS.lavenderEdge }); }
    const plan = study?.plan;
    if (study?.brief || plan?.prototype?.name || plan?.tasks?.some(task => task.success_criteria)) {
      const firstContext = study?.brief
        ? { heading: t('research.brief'), body: study.brief }
        : plan?.prototype?.name
          ? { heading: t('research.prototype_name'), body: `${plan.prototype.name}${plan.prototype.version ? ` (${plan.prototype.version})` : ''}` }
          : { heading: `${plan.tasks.find(task => task.success_criteria)?.title || t('research.sharedTasks')} — ${t('research.task_success_criteria')}`, body: plan.tasks.find(task => task.success_criteria)?.success_criteria };
      label(t('research.pdfContext'), firstContext);
      if (study?.brief) box({ heading: t('research.brief'), body: study.brief, fill: COLORS.blue, border: COLORS.blueEdge });
      if (plan?.prototype?.name) box({ heading: t('research.prototype_name'), body: `${plan.prototype.name}${plan.prototype.version ? ` (${plan.prototype.version})` : ''}`, fill: COLORS.blue, border: COLORS.blueEdge });
      for (const task of plan?.tasks || []) {
        if (task.success_criteria) box({ heading: `${task.title || t('research.sharedTasks')} — ${t('research.task_success_criteria')}`, body: task.success_criteria, fill: COLORS.blue, border: COLORS.blueEdge });
      }
    }
  }

  const findingBoxes = (finding, index) => {
    const items = [{ heading: t('research.findingNumber', { number: index }), body: finding.text || '' }];
    const evidence = Array.isArray(finding.evidence) ? finding.evidence : [];
    const usedIds = new Set();
    for (const source of evidence) {
      const id = source.interview_id;
      if (id) usedIds.add(String(id));
      const name = id ? names.get(String(id)) || t('research.openSource') : '';
      const sourceUrl = safeSourceUrl(origin, study?.id, id);
      if (source.quote || id) items.push({ heading: source.quote ? name : null, body: source.quote || name, fill: COLORS.blue, border: COLORS.blueEdge, sourceUrl, quoteAccent: true });
    }
    for (const id of Array.isArray(finding.source_ids) ? finding.source_ids : []) {
      if (!id || usedIds.has(String(id))) continue;
      const name = names.get(String(id)) || t('research.openSource');
      items.push({ body: name, fill: COLORS.blue, border: COLORS.blueEdge, sourceUrl: safeSourceUrl(origin, study?.id, id), quoteAccent: true });
    }
    if (!evidence.length && !(finding.source_ids || []).length) items.push({ body: t('research.findingNoEvidence'), fill: COLORS.blue, border: COLORS.blueEdge, quoteAccent: true });
    return items;
  };
  const findingHeight = (finding, index) => 8 + findingBoxes(finding, index)
    .reduce((height, item) => height + boxHeight(item.heading, item.body, WIDTH - 12), 0);
  const findingLeadHeight = (finding, index) => {
    const total = findingHeight(finding, index);
    if (total <= PAGE.bottom - PAGE.top - 20) return total;
    const first = findingBoxes(finding, index)[0];
    return boxHeight(first.heading, first.body, WIDTH - 12) + 4;
  };
  const drawFinding = (finding, index) => {
    const items = findingBoxes(finding, index);
    const height = findingHeight(finding, index);
    const fitsWhole = height <= PAGE.bottom - PAGE.top - 20;
    if (fitsWhole && y + height > PAGE.bottom) newPage();
    if (fitsWhole) {
      doc.setFillColor(...COLORS.white);
      doc.setDrawColor(...COLORS.edge);
      doc.roundedRect(PAGE.left, y, WIDTH, height - 4, 3, 3, 'FD');
    }
    y += 4;
    items.forEach((item, itemIndex) => box({
      ...item,
      x: PAGE.left + 6,
      width: WIDTH - 12,
      border: itemIndex === 0 && fitsWhole ? COLORS.white : item.border || COLORS.edge,
    }));
    y += 4;
  };
  let findingIndex = 0;
  for (const [category, titleKey] of CATEGORIES) {
    const matches = findings.filter(finding => finding.category === category);
    label(t(titleKey), matches.length
      ? findingLeadHeight(matches[0], findingIndex + 1)
      : { body: t('research.noCategoryFindings') });
    if (matches.length) matches.forEach(finding => drawFinding(finding, ++findingIndex));
    else box({ body: t('research.noCategoryFindings'), fill: COLORS.blue, border: COLORS.blueEdge });
  }
  const legacy = findings.filter(finding => !CATEGORIES.some(([category]) => category === finding.category));
  if (legacy.length) { label(t('research.legacyFindings'), findingLeadHeight(legacy[0], findingIndex + 1)); legacy.forEach(finding => drawFinding(finding, ++findingIndex)); }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...COLORS.edge);
    doc.line(PAGE.left, 280, PAGE.width - PAGE.right, 280);
    doc.setFont('NotoSans', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.muted);
    doc.text('Research', PAGE.left, 286);
    doc.text(String(page), PAGE.width - PAGE.right, 286, { align: 'right' });
  }
  return doc;
}

let fontPromise;
async function loadFonts() {
  if (!fontPromise) fontPromise = (async () => {
    const [{ default: regularUrl }, { default: boldUrl }] = await Promise.all([
      import('../assets/pdf/NotoSans-Regular.ttf?url'), import('../assets/pdf/NotoSans-Bold.ttf?url'),
    ]);
    const getBase64 = async url => {
      const resolved = new URL(url, window.location.href);
      if (resolved.origin !== window.location.origin) throw new Error('PDF font origin mismatch');
      const response = await fetch(resolved.href);
      if (!response.ok) throw new Error(`PDF font load failed (${response.status})`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      return btoa(binary);
    };
    const [regular, bold] = await Promise.all([getBase64(regularUrl), getBase64(boldUrl)]);
    return { regular, bold };
  })().catch(error => { fontPromise = null; throw error; });
  return fontPromise;
}

export async function downloadStudyPdf({ study, result, interviews, t, origin = window.location.origin }) {
  const fonts = await loadFonts();
  const doc = buildStudyPdf({ study, result, interviews, t, origin, fonts });
  doc.save(`${slugifyTitle(study?.title)}-report.pdf`);
  return doc;
}
