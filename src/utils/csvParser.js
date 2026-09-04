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

/**
 * Detects the dominant time interval from parsed telemetry data points.
 * Returns one of the standard interval strings: '15 mins', '30 mins', '1 hour', '2 hours'.
 */
export function detectIntervalFromPoints(points) {
  if (!points || points.length < 2) return null;

  const deltas = [];
  for (let i = 1; i < points.length; i++) {
    const tPrev = points[i - 1]?.timeMs;
    const tCurr = points[i]?.timeMs;
    if (Number.isFinite(tPrev) && Number.isFinite(tCurr) && tCurr > tPrev) {
      deltas.push((tCurr - tPrev) / 1000); // in seconds
    }
  }

  if (deltas.length === 0) return null;

  // Use median delta to be robust against uneven gaps or missing epochs
  deltas.sort((a, b) => a - b);
  const medianSec = deltas[Math.floor(deltas.length / 2)];
  const medianMin = medianSec / 60;

  if (medianMin >= 90) {
    return '2 hours';
  } else if (medianMin >= 45) {
    return '1 hour';
  } else if (medianMin >= 22.5) {
    return '30 mins';
  } else {
    return '15 mins';
  }
}

/**
 * Maps a continuous progress value [0, 1] onto a sequence of points that may have uneven time intervals.
 * 
 * If points have valid timestamps (timeMs), target time is:
 *   targetTime = tStart + progress * (tEnd - tStart)
 * and it finds the exact bracketing pair of points (p_i, p_i+1) where t_i <= targetTime <= t_i+1,
 * interpolating error values proportionally across the actual elapsed time.
 */
export function interpolateUnevenPointsByProgress(points, progress) {
  if (!points || !points.length) return null;
  if (points.length === 1) {
    const pt = points[0];
    return {
      point: pt,
      x: pt.x || 0,
      y: pt.y || 0,
      z: pt.z || 0,
      clock: typeof pt.clock === 'number' ? pt.clock : Number(pt.clock) || 0,
      time: pt.time || '',
      timeMs: pt.timeMs,
    };
  }

  const safeProg = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const tStart = points[0]?.timeMs;
  const tEnd = points[points.length - 1]?.timeMs;

  if (Number.isFinite(tStart) && Number.isFinite(tEnd) && tEnd > tStart) {
    const targetMs = tStart + safeProg * (tEnd - tStart);

    if (targetMs <= tStart) {
      const p = points[0];
      return {
        point: p,
        x: p.x || 0,
        y: p.y || 0,
        z: p.z || 0,
        clock: typeof p.clock === 'number' ? p.clock : Number(p.clock) || 0,
        time: p.time || '',
        timeMs: p.timeMs,
      };
    }
    if (targetMs >= tEnd) {
      const p = points[points.length - 1];
      return {
        point: p,
        x: p.x || 0,
        y: p.y || 0,
        z: p.z || 0,
        clock: typeof p.clock === 'number' ? p.clock : Number(p.clock) || 0,
        time: p.time || '',
        timeMs: p.timeMs,
      };
    }

    // Binary search for index i such that points[i].timeMs <= targetMs <= points[i+1].timeMs
    let low = 0;
    let high = points.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const tMid = points[mid]?.timeMs ?? 0;
      if (tMid <= targetMs) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const i = Math.max(0, Math.min(high, points.length - 2));
    const p1 = points[i];
    const p2 = points[i + 1] || p1;

    const t1 = p1?.timeMs ?? targetMs;
    const t2 = p2?.timeMs ?? targetMs;
    const alpha = t2 > t1 ? Math.max(0, Math.min(1, (targetMs - t1) / (t2 - t1))) : 0;

    const p1x = p1.x ?? 0;
    const p1y = p1.y ?? 0;
    const p1z = p1.z ?? 0;
    const p2x = p2.x ?? p1x;
    const p2y = p2.y ?? p1y;
    const p2z = p2.z ?? p1z;

    const p1clk = typeof p1.clock === 'number' ? p1.clock : Number(p1.clock) || 0;
    const p2clk = typeof p2.clock === 'number' ? p2.clock : Number(p2.clock) || p1clk;

    return {
      point: alpha < 0.5 ? p1 : p2,
      x: p1x + (p2x - p1x) * alpha,
      y: p1y + (p2y - p1y) * alpha,
      z: p1z + (p2z - p1z) * alpha,
      clock: p1clk + (p2clk - p1clk) * alpha,
      time: alpha < 0.5 ? (p1.time || '') : (p2.time || p1.time || ''),
      timeMs: targetMs,
      alpha,
      segmentIndex: i,
    };
  }

  // Fallback: index-based proportional interpolation if timestamps are missing
  const totalSegments = points.length - 1;
  const floatIndex = safeProg * totalSegments;
  const lower = Math.max(0, Math.min(Math.floor(floatIndex) || 0, totalSegments));
  const upper = Math.max(0, Math.min(lower + 1, totalSegments));
  const alpha = Number.isFinite(floatIndex - lower) ? floatIndex - lower : 0;

  const p1 = points[lower] || points[0];
  const p2 = points[upper] || p1;

  const p1x = p1.x ?? 0;
  const p1y = p1.y ?? 0;
  const p1z = p1.z ?? 0;
  const p2x = p2.x ?? p1x;
  const p2y = p2.y ?? p1y;
  const p2z = p2.z ?? p1z;

  const p1clk = typeof p1.clock === 'number' ? p1.clock : Number(p1.clock) || 0;
  const p2clk = typeof p2.clock === 'number' ? p2.clock : Number(p2.clock) || p1clk;

  return {
    point: alpha < 0.5 ? p1 : p2,
    x: p1x + (p2x - p1x) * alpha,
    y: p1y + (p2y - p1y) * alpha,
    z: p1z + (p2z - p1z) * alpha,
    clock: p1clk + (p2clk - p1clk) * alpha,
    time: alpha < 0.5 ? (p1.time || '') : (p2.time || p1.time || ''),
    timeMs: p1.timeMs,
    alpha,
    segmentIndex: lower,
  };
}

