/**
 * Map raw rows from Sheets/Excel to metric fields by type.
 * @param {string} type - 'Number' | 'Comparison' | 'Series'
 * @param {string[][]} rows - 2D array of cell values (e.g. [['Jan', 400], ['Feb', 300]])
 * @returns {{ value?: string, previous_value?: string, series_data?: Array<{label: string, value: number}> }}
 */
function mapRowsToMetric(type, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('No data in range');
  }

  const flatValues = rows.flat().filter(cell => cell !== '' && cell !== null && cell !== undefined);
  const firstNum = (arr) => {
    for (const c of arr) {
      const n = Number(c);
      if (!Number.isNaN(n)) return n;
    }
    return null;
  };

  if (type === 'Number') {
    const num = firstNum(flatValues);
    if (num === null) throw new Error('No numeric value found in range');
    return { value: String(num) };
  }

  if (type === 'Comparison') {
    const numbers = flatValues.map(c => Number(c)).filter(n => !Number.isNaN(n));
    if (numbers.length < 2) throw new Error('Comparison requires two numeric values in range');
    return {
      value: String(numbers[0]),
      previous_value: String(numbers[1])
    };
  }

  if (type === 'Series') {
    const seriesData = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row) || row.length < 2) continue;
      const label = row[0] != null ? String(row[0]).trim() : '';
      const num = Number(row[1]);
      if (Number.isNaN(num)) continue;
      seriesData.push({ label: label || `Row ${i + 1}`, value: num });
    }
    if (seriesData.length === 0) throw new Error('Series requires at least one row with label and numeric value');
    return { series_data: seriesData };
  }

  throw new Error(`Unknown metric type: ${type}`);
}

module.exports = { mapRowsToMetric };
