// Run with node --test src/lib/csv.test.js (no test dependencies required).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildProposal, DEFAULT_OPTIONS, getMetrics, LIMITS, parseCsv, toCsv } from './csv.js'

const sample = ' Full Name ,City,Notes,Code\r\n" Alice ","Karachi, PK","line one\nline two",001\r\nBob,,"He said ""hello""",002\r\nBob,,"He said ""hello""",002\r\n'

test('the manual upload fixture has the documented metrics', () => {
  const fixture = readFileSync(new URL('../../tests/fixtures/edge-cases.csv', import.meta.url), 'utf8')
  assert.deepEqual(getMetrics(parseCsv(fixture)), { rows: 3, columns: 4, missing: 2, duplicates: 1 })
})

test('parses quoted commas, escaped quotes, multiline cells, empty fields and leading zeros', () => {
  const data = parseCsv(sample)
  assert.deepEqual(data.rows[0].values, [' Alice ', 'Karachi, PK', 'line one\nline two', '001'])
  assert.equal(data.rows[1].values[2], 'He said "hello"')
  assert.deepEqual(getMetrics(data), { rows: 3, columns: 4, missing: 2, duplicates: 1 })
})

test('default options leave data unchanged and do not fill or remove anything', () => {
  const data = parseCsv(sample)
  const proposal = buildProposal(data, DEFAULT_OPTIONS)
  assert.deepEqual(proposal.dataset, data)
  assert.deepEqual(proposal.changes, [])
})

test('cleaning is immutable, previews exact changes, and keeps stable source row IDs', () => {
  const data = parseCsv(sample)
  const snapshot = JSON.stringify(data)
  const proposal = buildProposal(data, { ...DEFAULT_OPTIONS, trim: true, standardize: true, deduplicate: true })
  assert.equal(JSON.stringify(data), snapshot)
  assert.equal(proposal.dataset.columns[0], 'full_name')
  assert.equal(proposal.dataset.rows[0].values[0], 'Alice')
  assert.deepEqual(proposal.dataset.rows.map((row) => row.id), [1, 2])
  assert.deepEqual(proposal.summary, { trimmed: 1, renamed: 4, filled: 0, missingRows: 0, duplicates: 1 })
  assert.equal(proposal.changes.find((change) => change.kind === 'remove-row').row, 3)
  assert.equal(buildProposal(proposal.dataset, { ...DEFAULT_OPTIONS, trim: true, standardize: true, deduplicate: true }).changes.length, 0)
})

test('missing-value fill and row removal are explicit, independent strategies', () => {
  const data = parseCsv(sample)
  const filled = buildProposal(data, { ...DEFAULT_OPTIONS, missing: 'fill', fillValue: 'Unknown' })
  assert.equal(filled.summary.filled, 2)
  assert.equal(filled.dataset.rows.length, 3)
  assert.equal(filled.dataset.rows[1].values[1], 'Unknown')
  assert.equal(buildProposal(data, { ...DEFAULT_OPTIONS, missing: 'fill', fillValue: '  ' }).changes.length, 0)
  const removed = buildProposal(data, { ...DEFAULT_OPTIONS, missing: 'remove' })
  assert.equal(removed.summary.missingRows, 2)
  assert.equal(removed.dataset.rows.length, 1)
  assert.deepEqual(removed.changes.map((change) => change.reason), ['missing-values', 'missing-values'])
})

test('CSV export round-trips without loss of quotes, newlines or empty cells', () => {
  const data = parseCsv(sample)
  assert.deepEqual(parseCsv(toCsv(data)), data)
})

test('export preserves a final empty record in a single-column dataset', () => {
  const data = parseCsv('value\nfirst\n""')
  assert.equal(data.rows.length, 2)
  assert.deepEqual(parseCsv(toCsv(data)), data)
})

test('missing-value handling precedes exact deduplication and can remove all rows', () => {
  const data = parseCsv('a,b\nx,\nx,Unknown')
  const proposal = buildProposal(data, { ...DEFAULT_OPTIONS, missing: 'fill', fillValue: 'Unknown', deduplicate: true })
  assert.equal(proposal.summary.filled, 1)
  assert.equal(proposal.summary.duplicates, 1)
  assert.deepEqual(proposal.dataset.rows[0].values, ['x', 'Unknown'])
  const empty = buildProposal(parseCsv('a,b\nx,\ny,'), { ...DEFAULT_OPTIONS, missing: 'remove' })
  assert.equal(empty.dataset.rows.length, 0)
  assert.deepEqual(parseCsv(toCsv(empty.dataset)).columns, ['a', 'b'])
})

test('preserves interior blank records, whitespace and final explicit empty records', () => {
  const data = parseCsv('a,b\n1,2\n\n ,\n,\n')
  assert.equal(data.rows.length, 4)
  assert.deepEqual(data.rows[1].values, ['', ''])
  assert.equal(data.rows[2].values[0], ' ')
  assert.equal(getMetrics(data).missing, 6)
  assert.equal(parseCsv('a\n""').rows.length, 1)
})

test('preserves duplicate headers until normalization and generates unique names', () => {
  const data = parseCsv('Name,Name,name_2,,!!!\nx,y,z,,')
  assert.deepEqual(data.columns, ['Name', 'Name', 'name_2', '', '!!!'])
  const proposal = buildProposal(data, { ...DEFAULT_OPTIONS, standardize: true })
  assert.equal(new Set(proposal.dataset.columns).size, 5)
  assert.ok(proposal.dataset.columns.every(Boolean))
  assert.equal(buildProposal(proposal.dataset, { ...DEFAULT_OPTIONS, standardize: true }).changes.length, 0)
})

test('exact duplicate metrics do not coerce types or normalize whitespace', () => {
  assert.equal(getMetrics(parseCsv('code\n001\n1\n 1\n1')).duplicates, 1)
})

test('rejects empty files, malformed quotes, mismatched records and oversized datasets', () => {
  assert.throws(() => parseCsv(''), /empty/)
  assert.throws(() => parseCsv('a,b\n"unclosed,b'), /parsed/)
  assert.throws(() => parseCsv('a,b\n1,2,3'), /record 2 has 3 fields/)
  assert.throws(() => parseCsv('a,b\n1'), /record 2 has 1 fields/)
  assert.throws(() => parseCsv('a\n' + 'x\n'.repeat(LIMITS.rows + 1)), /limit/)
})

test('supports a header-only dataset and preserves UTF-8 headers', () => {
  const data = parseCsv('\uFEFFنام,City\r\n')
  assert.deepEqual(getMetrics(data), { rows: 0, columns: 2, missing: 0, duplicates: 0 })
  assert.equal(data.columns[0], 'نام')
  assert.deepEqual(parseCsv(toCsv(data)), data)
})
