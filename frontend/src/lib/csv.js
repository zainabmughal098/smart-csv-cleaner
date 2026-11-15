import Papa from 'papaparse'
import { FORMULA_PREFIX, getMetrics } from './processing.js'
import { CSV_LIMITS, shapeLimitMessage, validateFile } from './limits.js'
export { isMissing, getMetrics, getFormulaRiskCount, buildProposal } from './processing.js'

export const MAX_FILE_SIZE = CSV_LIMITS.bytes
export const LIMITS = { rows: CSV_LIMITS.rows, columns: CSV_LIMITS.columns, cells: CSV_LIMITS.cells }
const DATASET_LIMIT_ERROR = shapeLimitMessage()
export const DEFAULT_OPTIONS = {
  trim: false,
  deduplicate: false,
  standardize: false,
  missing: 'keep',
  fillValue: '',
}

export async function readCsvFile(file) {
  // Compatibility helper for deterministic unit tests; the UI uses readCsvStream in a worker.
  validateFile(file)
  const bytes = await file.arrayBuffer()
  let text
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error('This file could not be read as UTF-8 text. Save it as UTF-8 CSV and try again.')
  }
  return parseCsv(text)
}

// Validate quoting without parsing values ourselves. Normalize only record
// separators; CR/LF characters inside quoted values must remain byte-for-byte.
function prepareCsv(text) {
  const parts = []
  let state = 'start'
  let record = 1
  let column = 1
  let segmentStart = 0
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (state === 'quoted') {
      if (character === '"') {
        if (text[index + 1] === '"') index += 1
        else state = 'closed'
      }
      continue
    }
    if (character === ',' || character === '\r' || character === '\n') {
      state = 'start'
      if (character === ',') {
        column += 1
        if (column > LIMITS.columns) throw new Error(DATASET_LIMIT_ERROR)
      } else {
        parts.push(text.slice(segmentStart, index), '\n')
        if (character === '\r' && text[index + 1] === '\n') index += 1
        segmentStart = index + 1
        record += 1
        column = 1
        // The last terminator does not create another data record.
        if (record > LIMITS.rows + 1 && segmentStart < text.length) throw new Error(DATASET_LIMIT_ERROR)
      }
    } else if (character === '"' && state === 'start') {
      state = 'quoted'
    } else if (state === 'closed' || character === '"') {
      throw new Error(`CSV could not be parsed at record ${record}: quotes must enclose the entire field; double any quotes inside it.`)
    } else {
      state = 'unquoted'
    }
  }
  if (state === 'quoted') throw new Error(`CSV could not be parsed at record ${record}: a quoted field is not closed.`)
  parts.push(text.slice(segmentStart))
  return parts.join('')
}

export function parseCsv(text) {
  if (!text.trim()) throw new Error('This file is empty. Choose a CSV with a header row.')
  text = prepareCsv(text.replace(/^\uFEFF/, ''))
  const result = Papa.parse(text, {
    delimiter: ',',
    newline: '\n',
    header: false,
    dynamicTyping: false,
    skipEmptyLines: false,
  })
  if (result.errors.length) {
    const error = result.errors[0]
    throw new Error(`CSV could not be parsed${Number.isInteger(error.row) ? ` at record ${error.row + 1}` : ''}: ${error.message}`)
  }
  const records = [...result.data]
  // A final line terminator is not another record. Interior blank records remain.
  if (/(?:\r\n|\n|\r)$/.test(text) && records.at(-1)?.length === 1 && records.at(-1)[0] === '') records.pop()
  const columns = records.shift()
  if (!columns?.some((column) => column.trim())) throw new Error('The first CSV record must contain at least one column name.')
  if (columns.length > LIMITS.columns || records.length > LIMITS.rows || records.length * columns.length > LIMITS.cells) {
    throw new Error(DATASET_LIMIT_ERROR)
  }
  const rows = records.map((record, index) => {
    const values = record.length === 1 && record[0] === '' ? columns.map(() => '') : record
    if (values.length !== columns.length) {
      throw new Error(`CSV record ${index + 2} has ${values.length} fields; the header has ${columns.length}. Check delimiters and quoting. No data was imported.`)
    }
    return { id: index + 1, values }
  })
  return { columns, rows }
}

export function toCsv(dataset, { protectFormulas = true } = {}) {
  // Quote every field so a final empty, single-column record remains explicit.
  return Papa.unparse([dataset.columns, ...dataset.rows.map((row) => row.values)], {
    newline: '\r\n',
    quotes: true,
    escapeFormulae: protectFormulas ? FORMULA_PREFIX : false,
  })
}

export function createChangeLog({ file, version, dataset, entries, exportedAt }) {
  return {
    application: 'Smart CSV Cleaner',
    scope: 'Browser-only session',
    source: file,
    exportedAt,
    currentVersion: version,
    rowReferences: '1-based data-row IDs from the original upload; header excluded',
    currentMetrics: getMetrics(dataset),
    events: entries,
  }
}

export function downloadFile(content, filename, type) {
  const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
