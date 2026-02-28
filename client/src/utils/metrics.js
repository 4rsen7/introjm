// Shared palette for series charts (line, area, pie, donut).
// Use by index: seriesData[i].color || CHART_PALETTE[i % CHART_PALETTE.length]
export const CHART_PALETTE = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899'
];

/** Default single color for bar chart (all bars same unless row has custom color). */
export const DEFAULT_BAR_COLOR = CHART_PALETTE[0];

/** True when label looks like a date (e.g. 02.25, 02/25, 2025-01-15); avoids parsing plain numbers like "1" or "2". */
function looksLikeDate(label) {
  if (!label || typeof label !== 'string') return false;
  const s = label.trim();
  if (/^\d{1,3}$/.test(s)) return false;
  return /[./-]/.test(s) || /^\d{4}-\d{2}/.test(s) || /[a-zA-Zа-яА-ЯіІїЇєЄ]/.test(s);
}

/**
 * Format a series label for display. When format is 'date', parse only date-like labels and show short month+year in the given locale (e.g. "лют. 25", "Feb. 25").
 * @param {string} label - Raw label (e.g. "02.25", "02/25", "2025-01-15")
 * @param {'text'|'date'} format
 * @param {string} [locale] - BCP 47 locale (e.g. 'uk', 'en') for month/year; uses app language so metrics match profile.
 * @returns {string}
 */
export function formatSeriesLabel(label, format, locale) {
  if (format !== 'date' || !label) return label ?? '';
  if (!looksLikeDate(label)) return label;
  const d = new Date(label);
  if (Number.isNaN(d.getTime())) return label;
  const loc = locale || undefined;
  const month = d.toLocaleDateString(loc, { month: 'short' });
  const year = d.toLocaleDateString(loc, { year: '2-digit' });
  return `${month} ${year}`;
}
