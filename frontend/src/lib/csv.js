import Papa from 'papaparse'

export const MAX_FILE_SIZE = 5 * 1024 * 1024
export const LIMITS = { rows: 25000, columns: 200, cells: 250000 }
const DATASET_LIMIT_ERROR = 'This dataset exceeds the browser workspace limit: 25,000 rows, 200 columns, or 250,000 cells. Choose a smaller CSV.'
const FORMULA_PREFIX = /^(?:[\s\p{Cc}]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]|[\t\r\n])/u
export const DEFAULT_OPTIONS = {
  trim: false,
  deduplicate: false,
  standardize: false,
  missing: 'keep',
  fillValue: '',
}

export async function readCsvFile(file) {
  if (!file) throw new Error('Choose or drop exactly one CSV file.')
  if (!/\.csv$/i.test(file.name)) throw new Error('Please choose a .csv file. Other formats are not supported.')
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('This file exceeds the 5 MB upload limit for this browser workspace. To try a smaller sample, open a copy in a spreadsheet editor, keep the header row and fewer complete data rows, then export it as a UTF-8 CSV of 5 MB or less. The sample must also stay within 25,000 rows, 200 columns, and 250,000 cells. Your original file is unchanged.')
  }
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

export const isMissing = (value) => value.trim() === ''

export function getMetrics(dataset) {
  if (!dataset) return null
  const seen = new Set()
  let duplicates = 0
  let missing = 0
  for (const { values } of dataset.rows) {
    missing += values.filter(isMissing).length
    const key = JSON.stringify(values)
    if (seen.has(key)) duplicates += 1
    seen.add(key)
  }
  return { rows: dataset.rows.length, columns: dataset.columns.length, missing, duplicates }
}

function standardizeColumns(columns) {
  const used = new Set()
  return columns.map((column, index) => {
    const base = column.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '') || `column_${index + 1}`
    let name = base
    let suffix = 2
    while (used.has(name)) name = `${base}_${suffix++}`
    used.add(name)
    return name
  })
}

export function buildProposal(dataset, options) {
  if (!dataset) return null
  const changes = []
  const summary = { trimmed: 0, renamed: 0, filled: 0, missingRows: 0, duplicates: 0 }
  const columns = options.standardize ? standardizeColumns(dataset.columns) : [...dataset.columns]
  columns.forEach((column, index) => {
    if (column !== dataset.columns[index]) {
      summary.renamed += 1
      changes.push({ kind: 'rename-column', column: index + 1, before: dataset.columns[index], after: column })
    }
  })
  const seen = new Set()
  const rows = []
  for (const row of dataset.rows) {
    const pending = []
    let trimmed = 0
    let filled = 0
    const values = row.values.map((value, index) => {
      let next = options.trim ? value.trim() : value
      if (next !== value) {
        trimmed += 1
        pending.push({ kind: 'trim-cell', row: row.id, column: index + 1, before: value, after: next })
      }
      if (options.missing === 'fill' && options.fillValue.trim() && isMissing(next)) {
        filled += 1
        pending.push({ kind: 'fill-cell', row: row.id, column: index + 1, before: next, after: options.fillValue })
        next = options.fillValue
      }
      return next
    })
    const key = JSON.stringify(values)
    const missingRow = options.missing === 'remove' && values.some(isMissing)
    if (missingRow || (options.deduplicate && seen.has(key))) {
      const reason = missingRow ? 'missing-values' : 'exact-duplicate'
      summary[missingRow ? 'missingRows' : 'duplicates'] += 1
      changes.push({ kind: 'remove-row', row: row.id, reason, before: row.values, after: null })
      continue
    }
    seen.add(key)
    summary.trimmed += trimmed
    summary.filled += filled
    changes.push(...pending)
    rows.push({ id: row.id, values })
  }
  return { dataset: { columns, rows }, changes, summary }
}

export function getFormulaRiskCount(dataset) {
  if (!dataset) return 0
  return dataset.columns.filter((value) => FORMULA_PREFIX.test(value)).length
    + dataset.rows.reduce((count, row) => count + row.values.filter((value) => FORMULA_PREFIX.test(value)).length, 0)
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
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
