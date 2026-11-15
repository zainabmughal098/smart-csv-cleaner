import Papa from 'papaparse'
import { CSV_LIMITS, RESOURCE_LIMITS, shapeLimitMessage, validateFile } from './limits.js'

// Only frame complete logical records. Papa Parse remains the CSV value parser.
// State persists across byte chunks, including a quote or CR at a chunk boundary.
export class CsvRecordFramer {
  constructor(limits = CSV_LIMITS) {
    this.limits = limits
    this.parts = []
    this.state = 'start'
    this.record = 1
    this.column = 1
    this.skipLf = false
  }

  push(text, final = false) {
    const records = []
    let start = 0
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index]
      if (this.skipLf) {
        this.skipLf = false
        if (character === '\n') { start = index + 1; continue }
      }
      if (this.record > this.limits.rows + 1) throw new Error(shapeLimitMessage(this.limits))
      if (this.state === 'quoted') {
        if (character === '"') this.state = 'quote'
        continue
      }
      if (this.state === 'quote' && character === '"') {
        this.state = 'quoted'
        continue
      }
      if (character === '\r' || character === '\n') {
        this.parts.push(text.slice(start, index))
        records.push(this.parts.join(''))
        this.parts = []
        start = index + 1
        this.record += 1
        this.column = 1
        this.state = 'start'
        this.skipLf = character === '\r'
      } else if (character === ',') {
        this.column += 1
        if (this.column > this.limits.columns) throw new Error(shapeLimitMessage(this.limits))
        this.state = 'start'
      } else if (character === '"' && this.state === 'start') {
        this.state = 'quoted'
      } else if (this.state === 'quote' || character === '"') {
        throw new Error(`CSV could not be parsed at record ${this.record}: quotes must enclose the entire field; double any quotes inside it.`)
      } else {
        this.state = 'unquoted'
      }
    }
    if (start < text.length) this.parts.push(text.slice(start))
    if (final) {
      if (this.state === 'quoted') throw new Error(`CSV could not be parsed at record ${this.record}: a quoted field is not closed.`)
      if (this.parts.length) records.push(this.parts.join(''))
      this.parts = []
    }
    return records
  }
}

export function abortIfNeeded(signal) {
  if (signal?.aborted) throw new DOMException('Operation cancelled. Current data is unchanged.', 'AbortError')
}

export const yieldToWorker = () => new Promise((resolve) => setTimeout(resolve, 0))

export async function readCsvStream(file, { signal, onProgress = () => {}, limits = CSV_LIMITS, chunkBytes = RESOURCE_LIMITS.chunkBytes } = {}) {
  validateFile(file, limits)
  const decoder = new TextDecoder('utf-8', { fatal: true })
  const framer = new CsvRecordFramer(limits)
  const rows = []
  let columns
  let lastYield = performance.now()
  function consume(records) {
    if (!records.length) return
    // An explicit terminator makes even a single blank record unambiguous.
    const result = Papa.parse(records.join('\n') + '\n', { delimiter: ',', newline: '\n', header: false, dynamicTyping: false, skipEmptyLines: false })
    if (result.errors.length) throw new Error(`CSV could not be parsed: ${result.errors[0].message}`)
    result.data.pop() // Only the batch's artificial terminal record.
    for (const record of result.data) {
      if (!columns) {
        columns = record
        if (!columns.some((column) => column.trim())) throw new Error('The first CSV record must contain at least one column name.')
        continue
      }
      if (rows.length >= limits.rows || (rows.length + 1) * columns.length > limits.cells) throw new Error(shapeLimitMessage(limits))
      const values = record.length === 1 && record[0] === '' ? columns.map(() => '') : record
      if (values.length !== columns.length) throw new Error(`CSV record ${rows.length + 2} has ${values.length} fields; the header has ${columns.length}. Check delimiters and quoting. No data was imported.`)
      rows.push({ id: rows.length + 1, values })
    }
  }
  onProgress({ phase: 'Reading CSV bytes', completed: 0, total: file.size })
  for (let offset = 0; offset < file.size; offset += chunkBytes) {
    abortIfNeeded(signal)
    const end = Math.min(offset + chunkBytes, file.size)
    const buffer = await file.slice(offset, end).arrayBuffer()
    abortIfNeeded(signal)
    let text
    try { text = decoder.decode(buffer, { stream: true }) } catch { throw new Error('This file could not be read as UTF-8 text. Save it as UTF-8 CSV and try again.') }
    consume(framer.push(text))
    onProgress({ phase: 'Reading CSV bytes', completed: end, total: file.size })
    if (performance.now() - lastYield >= 8) {
      await yieldToWorker()
      lastYield = performance.now()
    }
  }
  abortIfNeeded(signal)
  let tail
  try { tail = decoder.decode() } catch { throw new Error('This file could not be read as UTF-8 text. Save it as UTF-8 CSV and try again.') }
  consume(framer.push(tail, true))
  if (!columns) throw new Error('This file is empty. Choose a CSV with a header row.')
  return { columns, rows }
}
