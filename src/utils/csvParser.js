/**
 * Parses CSV text into column arrays.
 * 
 * Returns:
 * {
 *   headers: string[],                 // Array of column header names
 *   columns: Record<string, any[]>,   // Raw header -> array of parsed values (numbers or strings)
 *   normalizedColumns: Record<string, any[]>, // Normalized header name -> array of values
 *   rows: Record<string, any>[],       // Array of row objects
 *   rowCount: number                   // Total number of data rows
 * }
 */
export function parseCSVToColumns(csvText) {
  if (!csvText || typeof csvText !== 'string') {
    return {
      headers: [],
      columns: {},
      normalizedColumns: {},
      rows: [],
      rowCount: 0,
    };
  }

  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return {
      headers: [],
      columns: {},
      normalizedColumns: {},
      rows: [],
      rowCount: 0,
    };
  }

  // Parse header row
  const headers = parseCSVLine(lines[0]);
  const columns = {};
  const normalizedColumns = {};

  headers.forEach((header) => {
    columns[header] = [];
    // Normalized key: remove units in parentheses and non-alphanumeric chars
    const normKey = header
      .toLowerCase()
      .replace(/\s*\([^)]*\)/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    normalizedColumns[normKey] = columns[header];
  });

  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0 || (values.length === 1 && values[0] === '')) continue;

    const rowObj = {};
    headers.forEach((header, colIdx) => {
      const rawVal = values[colIdx] !== undefined ? values[colIdx].trim() : '';
      const numVal = Number(rawVal);
      const val = rawVal !== '' && !Number.isNaN(numVal) ? numVal : rawVal;

      columns[header].push(val);
      rowObj[header] = val;
    });
    rows.push(rowObj);
  }

  return {
    headers,
    columns,
    normalizedColumns,
    rows,
    rowCount: rows.length,
  };
}

/**
 * Splits a single CSV line into tokens, respecting double-quoted values.
 */
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);

  return values;
}

/**
 * Identifies the 5 key columns (timestamp, x_error, y_error, z_error, clock_error)
 * using flexible regex patterns or index fallbacks.
 */
export function detectErrorColumns(headers) {
  if (!headers || !headers.length) {
    return { timeKey: null, xKey: null, yKey: null, zKey: null, clockKey: null };
  }

  function findCol(patterns, fallbackIdx) {
    for (const p of patterns) {
      const found = headers.find((h) => p.test(h));
      if (found) return found;
    }
    return headers[fallbackIdx] || null;
  }

  return {
    timeKey: findCol([/time/i, /date/i, /utc/i, /stamp/i], 0),
    xKey: findCol([/x.*err/i, /^x$/i, /\bx\b/i], 1),
    yKey: findCol([/y.*err/i, /^y$/i, /\by\b/i], 2),
    zKey: findCol([/z.*err/i, /^z$/i, /\bz\b/i], 3),
    clockKey: findCol([/clock/i, /clk/i, /sat/i], 4),
  };
}

/**
 * Extracts normalized error data points { time, x, y, z, clock, origIndex }
 * from parsed CSV data.
 */
export function extractNormalizedPoints(parsedData) {
  if (!parsedData || !parsedData.rows || !parsedData.rows.length) {
    return [];
  }

  const { timeKey, xKey, yKey, zKey, clockKey } = detectErrorColumns(parsedData.headers);

  return parsedData.rows.map((row, idx) => ({
    origIndex: idx,
    time: String(row[timeKey] ?? `Point ${idx + 1}`),
    x: typeof row[xKey] === 'number' ? row[xKey] : Number(row[xKey]) || 0,
    y: typeof row[yKey] === 'number' ? row[yKey] : Number(row[yKey]) || 0,
    z: typeof row[zKey] === 'number' ? row[zKey] : Number(row[zKey]) || 0,
    clock: row[clockKey] !== undefined ? row[clockKey] : 0,
  }));
}

/**
 * Calculates the required sphere axis steps: integer(maximum value + 1)
 * so that the satellite cube never goes outside the sphere.
 */
export function calculateSphereSteps(points) {
  if (!points || !points.length) return 7;

  let maxVal = 0;
  for (const pt of points) {
    const absX = Math.abs(pt.x || 0);
    const absY = Math.abs(pt.y || 0);
    const absZ = Math.abs(pt.z || 0);
    const norm = Math.hypot(pt.x || 0, pt.y || 0, pt.z || 0);

    if (absX > maxVal) maxVal = absX;
    if (absY > maxVal) maxVal = absY;
    if (absZ > maxVal) maxVal = absZ;
    if (norm > maxVal) maxVal = norm;
  }

  return Math.max(1, Math.floor(maxVal + 1));
}

/**
 * Subsamples points according to the user-selected interval:
 * - 15 mins: every row (stride 1)
 * - 30 mins: alternate rows (stride 2)
 * - 1 hour: every 4th row (stride 4)
 * - 2 hours: every 8th row (stride 8)
 */
export function samplePointsByInterval(allPoints, intervalString) {
  if (!allPoints || !allPoints.length) return [];

  let stride = 1;
  const lower = (intervalString || '').toLowerCase();

  if (lower.includes('30')) {
    stride = 2; // Alternate rows for 30 minutes
  } else if (lower.includes('2 hour')) {
    stride = 8; // Every 8th row for 2 hours (8 * 15m = 120m)
  } else if (lower.includes('1 hour') || lower.includes('hour')) {
    stride = 4; // Every 4th row for 1 hour (4 * 15m = 60m)
  }

  return allPoints.filter((_, idx) => idx % stride === 0);
}
