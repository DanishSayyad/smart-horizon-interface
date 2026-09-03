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
