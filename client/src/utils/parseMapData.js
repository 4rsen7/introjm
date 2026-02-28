/**
 * Parses journey map_data (string or object) into normalized state shape.
 * Returns safe defaults when map_data is missing or invalid.
 * @param {object|string|null|undefined} mapData - Raw map_data from API
 * @returns {{ lanes: array, cells: object, gridColumns: array, emotionValues: object, persona: object|null }}
 */
export function parseMapData(mapData) {
  const empty = {
    lanes: [],
    cells: {},
    gridColumns: Array.from({ length: 5 }, (_, i) => ({ id: `col-${i + 1}` })),
    emotionValues: {},
    persona: null,
  };

  if (mapData == null) return empty;

  let data = mapData;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return empty;
    }
  }
  if (typeof data !== 'object') return empty;

  const lanes = Array.isArray(data.lanes)
    ? data.lanes.map((lane, i) => ({
        ...lane,
        id: lane?.id != null ? String(lane.id) : `lane-${i}`,
      }))
    : empty.lanes;

  const cells = data.cells && typeof data.cells === 'object' ? data.cells : empty.cells;
  const gridColumns = Array.isArray(data.gridColumns) && data.gridColumns.length > 0
    ? data.gridColumns
    : empty.gridColumns;
  const emotionValues = data.emotionValues && typeof data.emotionValues === 'object'
    ? data.emotionValues
    : empty.emotionValues;
  const persona = data.persona && typeof data.persona === 'object' ? data.persona : null;

  return { lanes, cells, gridColumns, emotionValues, persona };
}
