import Papa from 'papaparse'
import { DEFAULT_OPTIONS } from '../lib/csv.js'
import { analyzeDataset, FORMULA_PREFIX, proposeChanges } from '../lib/processing.js'
import { CSV_LIMITS, RESOURCE_LIMITS } from '../lib/limits.js'
import { abortIfNeeded, readCsvStream, yieldToWorker } from '../lib/streamCsv.js'

const encoder = new TextEncoder()
const entry = (type, message, details, extra = {}) => ({ id: crypto.randomUUID(), time: new Date().toISOString(), type, message, details, ...extra })
const clip = (value) => {
  if (Array.isArray(value)) return value.map(clip)
  if (typeof value !== 'string') return value
  let end = RESOURCE_LIMITS.previewCharacters
  const last = value.charCodeAt(end - 1)
  if (last >= 0xd800 && last <= 0xdbff) end -= 1
  return value.slice(0, end)
}

class BlobBuilder {
  constructor(type, limit) { this.type = type; this.limit = limit; this.parts = []; this.pending = []; this.units = 0; this.bytes = 0 }
  append(text) {
    this.pending.push(text)
    this.units += text.length
    if (this.units >= RESOURCE_LIMITS.chunkBytes) this.flush()
  }
  flush() {
    if (!this.pending.length) return
    const bytes = encoder.encode(this.pending.join(''))
    if (this.bytes + bytes.byteLength > this.limit) throw new Error('The complete export exceeds its 128 MB safety budget. Export a smaller dataset/session. No partial download was created.')
    this.bytes += bytes.byteLength
    this.parts.push(bytes)
    this.pending = []
    this.units = 0
  }
  finish() { this.flush(); return new Blob(this.parts, { type: this.type }) }
}

export class Workspace {
  constructor({ limits = CSV_LIMITS, resources = RESOURCE_LIMITS } = {}) {
    this.limits = limits
    this.resources = resources
    this.version = 0
    this.entries = []
    this.historyBytes = 0
    this.active = null
  }

  async run(iterator, signal, progress) {
    let lastYield = performance.now()
    let step = iterator.next()
    while (!step.done) {
      abortIfNeeded(signal)
      if (performance.now() - lastYield >= 8) {
        progress(step.value)
        await yieldToWorker()
        abortIfNeeded(signal)
        lastYield = performance.now()
      }
      step = iterator.next()
    }
    abortIfNeeded(signal)
    return step.value
  }

  cancel(id) {
    if (this.active?.id === id) this.active.controller.abort()
    if (this.pendingImport?.jobId === id) this.pendingImport = null
    if (this.proposal?.jobId === id) this.proposal = null
    if (this.pendingExport?.jobId === id) this.pendingExport = null
  }

  descriptor(dataset) { return dataset ? { columns: dataset.columns.map(clip), rowCount: dataset.rows.length } : null }
  snapshot() {
    return {
      file: this.file ?? null,
      sessionId: this.sessionId ?? null,
      hasApplied: this.hasApplied ?? false,
      hasExported: this.hasExported ?? false,
      version: this.version,
      current: this.descriptor(this.current),
      original: this.descriptor(this.original),
      metrics: this.analysis?.metrics ?? null,
      formulaRisks: this.analysis?.formulaRisks ?? 0,
      events: this.entries.slice(-100).map(({ id, time, type, message, details }) => ({ id, time, type, message, details })),
      eventCount: this.entries.length,
      historyBytes: this.historyBytes,
    }
  }

  appendEvent(event, changeBytes = 0) {
    const bytes = encoder.encode(JSON.stringify({ ...event, changes: undefined })).byteLength + changeBytes + 32
    if (this.historyBytes + bytes > this.resources.historyBytes) throw new Error('The complete session history exceeds its 64 MB safety budget. Export your data and log, then start a new session. No changes were applied or log details dropped.')
    this.entries.push(event)
    this.historyBytes += bytes
  }

  async handle(method, args = {}, id = crypto.randomUUID(), progress = () => {}) {
    if (method === 'page') return this.page(args)
    if (method === 'snapshot') return this.snapshot()
    if (this.active) throw new Error('Another operation is still finishing. Wait for cancellation or completion, then try again.')
    const controller = new AbortController()
    this.active = { id, controller }
    const signal = controller.signal
    try {
      switch (method) {
        case 'import': {
          this.pendingImport = null
          const data = await readCsvStream(args.file, { signal, onProgress: progress, limits: this.limits })
          const analysis = await this.run(analyzeDataset(data), signal, progress)
          const token = crypto.randomUUID()
          this.pendingImport = { data, analysis, token, jobId: id, file: { name: args.file.name, size: args.file.size, lastModified: args.file.lastModified } }
          return { token, metrics: analysis.metrics }
        }
        case 'discardImport': this.pendingImport = null; return this.snapshot()
        case 'commitImport': {
          if (!this.pendingImport || this.pendingImport.token !== args.token) throw new Error('This import is no longer available. Choose the file again.')
          const pending = this.pendingImport
          this.original = this.current = pending.data
          this.originalAnalysis = this.analysis = pending.analysis
          this.file = pending.file
          this.sessionId = crypto.randomUUID()
          this.hasApplied = this.hasExported = false
          this.version = 1
          this.entries = []
          this.historyBytes = 0
          this.proposal = this.pendingExport = this.pendingImport = null
          this.appendEvent(entry('import', `Imported ${this.file.name}`, `${this.current.rows.length.toLocaleString()} rows · ${this.current.columns.length} columns · Read locally; original file unchanged.`))
          return this.snapshot()
        }
        case 'propose': {
          this.requireData()
          this.proposal = null
          const options = { ...DEFAULT_OPTIONS, ...args.options }
          const result = await this.run(proposeChanges(this.current, options, { changeLimit: this.resources.proposalChanges, byteLimit: Math.min(this.resources.proposalBytes, this.resources.historyBytes - this.historyBytes - 4096), textUnitLimit: this.resources.textUnits }), signal, progress)
          const analysis = await this.run(analyzeDataset(result.dataset), signal, progress)
          const token = crypto.randomUUID()
          this.proposal = { ...result, options, analysis, token, version: this.version, jobId: id }
          return {
            token, version: this.version, metrics: analysis.metrics, summary: result.summary,
            changeCount: result.changes.length,
            changes: result.changes.slice(0, 8).map((change) => ({ ...change, before: clip(change.before), after: clip(change.after) })),
          }
        }
        case 'apply': {
          const proposal = this.proposal
          if (!proposal || proposal.token !== args.token || proposal.version !== this.version) throw new Error('The proposed preview is stale. Recalculate it before applying.')
          if (!proposal.changes.length) return this.snapshot()
          const s = proposal.summary
          const details = `${s.trimmed} cells trimmed; ${s.renamed} columns renamed; ${s.filled} missing cells filled; ${s.missingRows + s.duplicates} rows removed (${s.missingRows} with missing values, ${s.duplicates} duplicates).`
          this.appendEvent(entry('apply', `Applied cleaning · version ${this.version + 1}`, details, { fromVersion: this.version, toVersion: this.version + 1, options: proposal.options, summary: s, changes: proposal.changes }), proposal.logBytes)
          this.current = proposal.dataset
          this.hasApplied = true
          this.analysis = proposal.analysis
          this.version += 1
          this.proposal = null
          return this.snapshot()
        }
        case 'reset':
          this.requireData()
          this.appendEvent(entry('reset', `Restored original upload · version ${this.version + 1}`, 'Working data restored. Previous applied changes remain in this log.', { fromVersion: this.version, toVersion: this.version + 1 }))
          this.current = this.original
          this.analysis = this.originalAnalysis
          this.version += 1
          this.proposal = null
          return this.snapshot()
        case 'exportCsv': return await this.exportCsv(args, id, signal, progress)
        case 'exportLog': return await this.exportLog(id, signal, progress)
        case 'commitExport': {
          if (!this.pendingExport || this.pendingExport.token !== args.token) throw new Error('Export acknowledgement is no longer available.')
          this.appendEvent(this.pendingExport.event)
          this.hasExported = true
          this.pendingExport = null
          return this.snapshot()
        }
        default: throw new Error('Unsupported CSV operation.')
      }
    } finally { this.active = null }
  }

  requireData() { if (!this.current) throw new Error('Upload a CSV before using this operation.') }
  page({ mode = 'current', page = 0, pageSize = 10 } = {}) {
    const dataset = mode === 'original' ? this.original : this.current
    if (!dataset) return { rows: [], rowCount: 0 }
    const requested = Number.isInteger(pageSize) ? Math.max(1, Math.min(pageSize, 50)) : 10
    const size = Math.min(requested, Math.max(1, Math.floor(RESOURCE_LIMITS.previewCells / dataset.columns.length)))
    const safePage = Math.max(0, Math.min(Math.trunc(page), Math.max(0, Math.ceil(dataset.rows.length / size) - 1)))
    return {
      rows: dataset.rows.slice(safePage * size, (safePage + 1) * size).map((row) => ({ id: row.id, values: row.values.map(clip) })),
      rowCount: dataset.rows.length,
      page: safePage,
    }
  }

  prepareExport(event, id, blob) {
    // Reserve room for the acknowledgement before requesting a browser download.
    if (this.historyBytes + encoder.encode(JSON.stringify(event)).byteLength + 32 > this.resources.historyBytes) throw new Error('Session history is full. No download was created; use a smaller session.')
    const token = crypto.randomUUID()
    this.pendingExport = { token, event, jobId: id }
    return { blob, token }
  }

  async exportCsv({ protectFormulas = true }, id, signal, progress) {
    this.requireData()
    const builder = new BlobBuilder('text/csv;charset=utf-8', this.resources.exportBytes)
    const config = { quotes: true, newline: '\r\n', escapeFormulae: protectFormulas ? FORMULA_PREFIX : false }
    builder.append(Papa.unparse([this.current.columns], config))
    let lastYield = performance.now()
    for (let offset = 0; offset < this.current.rows.length; offset += 256) {
      abortIfNeeded(signal)
      builder.append('\r\n' + Papa.unparse(this.current.rows.slice(offset, offset + 256).map((row) => row.values), config))
      progress({ phase: 'Serializing CSV rows', completed: Math.min(offset + 256, this.current.rows.length), total: this.current.rows.length })
      if (performance.now() - lastYield >= 8) {
        await yieldToWorker()
        lastYield = performance.now()
      }
    }
    abortIfNeeded(signal)
    const event = entry('export', `CSV download requested · version ${this.version}`, `${this.current.rows.length.toLocaleString()} rows. Pending proposals excluded. ${protectFormulas ? `${this.analysis.formulaRisks} formula-risk values prefixed for export.` : 'Raw values exported without formula protection.'}`, { version: this.version, format: 'csv', protectFormulas, formulaRiskCells: this.analysis.formulaRisks, escapedCells: protectFormulas ? this.analysis.formulaRisks : 0 })
    return this.prepareExport(event, id, builder.finish())
  }

  async exportLog(id, signal, progress) {
    this.requireData()
    const event = entry('export', 'Change log download requested', 'Includes session events and full applied cell and row changes; excludes pending proposals.')
    const events = [...this.entries, event]
    const metadata = { application: 'Smart CSV Cleaner', scope: 'Browser-only session', source: this.file, exportedAt: event.time, currentVersion: this.version, rowReferences: '1-based data-row IDs from the original upload; header excluded', currentMetrics: this.analysis.metrics }
    const builder = new BlobBuilder('application/json;charset=utf-8', this.resources.exportBytes)
    builder.append(JSON.stringify(metadata).slice(0, -1) + ',"events":[')
    const total = events.reduce((count, item) => count + 1 + (item.changes?.length ?? 0), 0)
    let completed = 0
    let lastYield = performance.now()
    for (let index = 0; index < events.length; index += 1) {
      abortIfNeeded(signal)
      const item = events[index]
      if (index) builder.append(',')
      const json = JSON.stringify({ ...item, changes: undefined })
      if (item.changes) {
        builder.append(json.slice(0, -1) + ',"changes":[')
        for (let change = 0; change < item.changes.length; change += 1) {
          if (change) builder.append(',')
          builder.append(JSON.stringify(item.changes[change]))
          completed += 1
          if (change % 128 === 0 && performance.now() - lastYield >= 8) {
            progress({ phase: 'Serializing complete log entries', completed, total })
            await yieldToWorker()
            abortIfNeeded(signal)
            lastYield = performance.now()
          }
        }
        builder.append(']}')
      } else builder.append(json)
      completed += 1
      if (index % 128 === 0 && performance.now() - lastYield >= 8) {
        await yieldToWorker()
        abortIfNeeded(signal)
        lastYield = performance.now()
      }
    }
    builder.append(']}')
    progress({ phase: 'Serializing complete log entries', completed: total, total })
    abortIfNeeded(signal)
    return this.prepareExport(event, id, builder.finish())
  }
}
