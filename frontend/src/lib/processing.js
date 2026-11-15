import { ExactRowIndex } from './rowIndex.js'
import { RESOURCE_LIMITS } from './limits.js'

export const FORMULA_PREFIX = /^(?:[\s\p{Cc}]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]|[\t\r\n])/u
export const isMissing = (value) => value.trim() === ''
const analyses = new WeakMap()
const encoder = new TextEncoder()

export function exhaust(iterator) {
  let step = iterator.next()
  while (!step.done) step = iterator.next()
  return step.value
}

export function* analyzeDataset(dataset) {
  if (!dataset) return null
  if (analyses.has(dataset)) return analyses.get(dataset)
  const index = new ExactRowIndex()
  let missing = 0
  let duplicates = 0
  let formulaRisks = 0
  let textUnits = 0
  for (const column of dataset.columns) {
    if (FORMULA_PREFIX.test(column)) formulaRisks += 1
    textUnits += column.length
  }
  for (let row = 0; row < dataset.rows.length; row += 1) {
    const values = dataset.rows[row].values
    for (const value of values) {
      if (isMissing(value)) missing += 1
      if (FORMULA_PREFIX.test(value)) formulaRisks += 1
      textUnits += value.length
    }
    if (!index.add(values)) duplicates += 1
    if (row % 256 === 0) yield { phase: 'Analyzing data rows', completed: row, total: dataset.rows.length }
  }
  const analysis = { metrics: { rows: dataset.rows.length, columns: dataset.columns.length, missing, duplicates }, formulaRisks, textUnits }
  analyses.set(dataset, analysis)
  return analysis
}

export function getMetrics(dataset) { return exhaust(analyzeDataset(dataset))?.metrics ?? null }
export function getFormulaRiskCount(dataset) { return exhaust(analyzeDataset(dataset))?.formulaRisks ?? 0 }

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

export function* proposeChanges(dataset, options, budgets = {}) {
  if (!dataset) return null
  const changeLimit = budgets.changeLimit ?? RESOURCE_LIMITS.proposalChanges
  const byteLimit = budgets.byteLimit ?? RESOURCE_LIMITS.proposalBytes
  const textUnitLimit = budgets.textUnitLimit ?? RESOURCE_LIMITS.textUnits
  const changes = []
  let logBytes = 0
  function append(change) {
    const units = (value) => typeof value === 'string' ? value.length : Array.isArray(value) ? value.reduce((total, item) => total + item.length, 0) : 0
    // UTF-8 JSON cannot be smaller than these UTF-16 string lengths. Reject an
    // obviously excessive single change before allocating its serialized copy.
    if (changes.length >= changeLimit || units(change.before) + units(change.after) > byteLimit - logBytes) throw new Error('The complete proposed change log exceeds its safe memory budget. Select fewer operations or use a smaller sample. No changes were applied and no details were dropped.')
    const bytes = encoder.encode(JSON.stringify(change)).byteLength + 1
    if (changes.length >= changeLimit || logBytes + bytes > byteLimit) throw new Error('The complete proposed change log exceeds its safe memory budget. Select fewer operations or use a smaller sample. No changes were applied and no details were dropped.')
    changes.push(change)
    logBytes += bytes
  }
  const summary = { trimmed: 0, renamed: 0, filled: 0, missingRows: 0, duplicates: 0 }
  const columns = options.standardize ? standardizeColumns(dataset.columns) : dataset.columns
  columns.forEach((column, index) => {
    if (column !== dataset.columns[index]) {
      summary.renamed += 1
      append({ kind: 'rename-column', column: index + 1, before: dataset.columns[index], after: column })
    }
  })
  if (!options.trim && !options.deduplicate && options.missing === 'keep') {
    return { dataset: summary.renamed ? { columns, rows: dataset.rows } : dataset, changes, summary, logBytes }
  }
  const seen = options.deduplicate ? new ExactRowIndex() : null
  const rows = []
  let textUnits = columns.reduce((total, value) => total + value.length, 0)
  for (let index = 0; index < dataset.rows.length; index += 1) {
    const row = dataset.rows[index]
    const pending = []
    let trimmed = 0
    let filled = 0
    let values = row.values
    if (options.trim || options.missing !== 'keep') {
      for (let column = 0; column < row.values.length; column += 1) {
        const value = row.values[column]
        let next = options.trim ? value.trim() : value
        if (next !== value) {
          trimmed += 1
          pending.push({ kind: 'trim-cell', row: row.id, column: column + 1, before: value, after: next })
        }
        if (options.missing === 'fill' && options.fillValue.trim() && isMissing(next)) {
          filled += 1
          pending.push({ kind: 'fill-cell', row: row.id, column: column + 1, before: next, after: options.fillValue })
          next = options.fillValue
        }
        if (next !== value) {
          if (values === row.values) values = [...row.values]
          values[column] = next
        }
      }
    }
    const missingRow = options.missing === 'remove' && values.some(isMissing)
    if (missingRow || (seen && !seen.add(values))) {
      summary[missingRow ? 'missingRows' : 'duplicates'] += 1
      append({ kind: 'remove-row', row: row.id, reason: missingRow ? 'missing-values' : 'exact-duplicate', before: row.values, after: null })
    } else {
      textUnits += values.reduce((total, value) => total + value.length, 0)
      if (textUnits > textUnitLimit) throw new Error('The proposed data expansion exceeds the safe text memory budget. Use a shorter replacement or smaller sample. No changes were applied.')
      summary.trimmed += trimmed
      summary.filled += filled
      pending.forEach(append)
      rows.push(values === row.values ? row : { id: row.id, values })
    }
    if (index % 256 === 0) yield { phase: 'Planning cleaning rows', completed: index, total: dataset.rows.length }
  }
  return { dataset: changes.length ? { columns, rows } : dataset, changes, summary, logBytes }
}

export function buildProposal(dataset, options) { return exhaust(proposeChanges(dataset, options)) }
