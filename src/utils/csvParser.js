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

  return parsedData.rows.map((row, idx) => {
    const rawTime = String(row[timeKey] ?? `Point ${idx + 1}`);
    const timeMs = parseCsvTimestampToMs(rawTime);
    return {
      origIndex: idx,
      time: rawTime,
      timeMs: timeMs,
      x: typeof row[xKey] === 'number' ? row[xKey] : Number(row[xKey]) || 0,
      y: typeof row[yKey] === 'number' ? row[yKey] : Number(row[yKey]) || 0,
      z: typeof row[zKey] === 'number' ? row[zKey] : Number(row[zKey]) || 0,
      clock: typeof row[clockKey] === 'number' ? row[clockKey] : Number(row[clockKey]) || 0,
    };
  });
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

/**
 * Robust parsing of various date/time formats commonly seen in GNSS/satellite telemetry:
 * - M/D/YYYY H:mm or M/D/YYYY H:mm:ss (e.g. "9/8/2025 0:11")
 * - YYYY-MM-DD HH:mm:ss or ISO 8601 strings
 * Returns epoch timestamp in milliseconds, or NaN if unparseable.
 */
export function parseCsvTimestampToMs(str) {
  if (!str || typeof str !== 'string') return NaN;
  const trimmed = str.trim();

  // M/D/YYYY or MM/DD/YYYY H:mm[:ss]
  const m1 = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (m1) {
    const month = parseInt(m1[1], 10);
    const day = parseInt(m1[2], 10);
    const year = parseInt(m1[3], 10);
    const hour = parseInt(m1[4] || '0', 10);
    const min = parseInt(m1[5] || '0', 10);
    const sec = parseInt(m1[6] || '0', 10);
    return Date.UTC(year, month - 1, day, hour, min, sec);
  }

  // YYYY-MM-DD[T| ]HH:mm[:ss]
  const m2 = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (m2) {
    const year = parseInt(m2[1], 10);
    const month = parseInt(m2[2], 10);
    const day = parseInt(m2[3], 10);
    const hour = parseInt(m2[4] || '0', 10);
    const min = parseInt(m2[5] || '0', 10);
    const sec = parseInt(m2[6] || '0', 10);
    return Date.UTC(year, month - 1, day, hour, min, sec);
  }

  // Fallback for other parseable dates containing date or time patterns
  if (/\d{1,4}[/-]\d{1,2}[/-]\d{1,4}|\d{1,2}:\d{2}/.test(trimmed)) {
    const fallback = Date.parse(trimmed);
    if (Number.isFinite(fallback)) return fallback;
  }

  return NaN;
}

/**
 * Formats an epoch millisecond timestamp as "dd:hh:mm:ss" in UTC.
 * - dd: 2-digit day of month
 * - hh: 2-digit 24-hour hour
 * - mm: 2-digit minute
 * - ss: 2-digit second
 */
export function formatTimestampDdhhmmss(ms) {
  if (!Number.isFinite(ms)) return '00:00:00:00';
  const d = new Date(ms);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${dd}:${hh}:${mm}:${ss}`;
}

