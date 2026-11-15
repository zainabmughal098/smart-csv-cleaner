import { test } from 'node:test'
import assert from 'node:assert/strict'
import { File } from 'node:buffer'
import { buildProposal, createChangeLog, DEFAULT_OPTIONS, getFormulaRiskCount, getMetrics, LIMITS, MAX_FILE_SIZE, parseCsv, readCsvFile, toCsv } from '../src/lib/csv.js'

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}

test('strict quoting rejects bare quotes and text after a closing quote', () => {
  for (const text of ['a,b\nx"y,z', 'a,b\n"x"tail,y', 'a,b\n "x",y', 'a,b\n"x" ,y']) {
    assert.throws(() => parseCsv(text), /record 2.*quotes/)
  }
  assert.deepEqual(parseCsv('a,b\n"x""y",z').rows[0].values, ['x"y', 'z'])
})

test('mixed record separators do not pollute cells; quoted separators remain intact', () => {
  const data = parseCsv('a,b\rx,1\nx,1\r\n"line1\r\nline2\nline3\rend",2\r\n')
  assert.deepEqual(data.rows[0].values, data.rows[1].values)
  assert.equal(getMetrics(data).duplicates, 1)
  assert.equal(data.rows[2].values[0], 'line1\r\nline2\nline3\rend')
  assert.deepEqual(parseCsv(toCsv(data)), data)
})

test('all cleaning operations and strategies work on deeply frozen input', () => {
  const original = freeze(parseCsv(' Full Name ,Full Name,\r\n"  Zo\u00eb  "," \t ",001\r\n"  Zo\u00eb  "," \t ",001'))
  for (const missing of ['keep', 'fill', 'remove']) {
    const result = buildProposal(original, { trim: true, deduplicate: true, standardize: true, missing, fillValue: 'N/A' })
    assert.deepEqual(result.dataset.columns, ['full_name', 'full_name_2', 'column_3'])
    assert.equal(result.dataset.rows.length, missing === 'remove' ? 0 : 1)
    if (missing !== 'remove') {
      assert.deepEqual(result.dataset.rows[0].values, ['Zo\u00eb', missing === 'fill' ? 'N/A' : '', '001'])
    }
  }
  assert.equal(original.rows[0].values[0], '  Zo\u00eb  ')
  assert.equal(original.rows[0].values[1], ' \t ')
})

test('trim preserves interior whitespace, Unicode content, and exact duplicate semantics', () => {
  const data = parseCsv('text,code\n" \u0646\u0627\u0645  \u6771\u4eac \ud83d\ude00 ",001\n"\u0646\u0627\u0645 \u6771\u4eac \ud83d\ude00",1')
  const result = buildProposal(data, { ...DEFAULT_OPTIONS, trim: true, deduplicate: true })
  assert.equal(result.dataset.rows[0].values[0], '\u0646\u0627\u0645  \u6771\u4eac \ud83d\ude00')
  assert.equal(result.dataset.rows.length, 2)
  assert.deepEqual(parseCsv(toCsv(result.dataset)), result.dataset)
})

test('header normalization handles collisions, blanks, punctuation and UTF-8 names without overwrites', () => {
  const data = parseCsv('A,A,a_2,!!!,,\u0646\u0627\u0645,\u6771\u4eac\nx,y,z,1,2,3,4')
  const result = buildProposal(data, { ...DEFAULT_OPTIONS, standardize: true })
  assert.deepEqual(result.dataset.columns, ['a', 'a_2', 'a_2_2', 'column_4', 'column_5', '\u0646\u0627\u0645', '\u6771\u4eac'])
  assert.deepEqual(result.dataset.rows, data.rows)
})

test('blank and duplicate headers remain unchanged with no proposed normalization', () => {
  const data = parseCsv('a,a,,__proto__\n001,1,,constructor')
  assert.deepEqual(parseCsv(toCsv(data)), data)
  assert.deepEqual(buildProposal(data, DEFAULT_OPTIONS).dataset, data)
})

test('default formula mitigation covers headers, prefixes, whitespace, controls and full-width variants', () => {
  const risks = ['=1+1', '+1', '-1', '@SUM(A1)', '\ttext', '\rtext', '\ntext', '  =1', '\uFF1D1', '\uFF0B1', '\uFF0D1', '\uFF20SUM(1)', '\u0000=1']
  const dataset = freeze({ columns: ['=header', 'text'], rows: risks.map((value, index) => ({ id: index + 1, values: [value, '001'] })) })
  assert.equal(getFormulaRiskCount(dataset), risks.length + 1)
  const protectedData = parseCsv(toCsv(dataset))
  assert.equal(protectedData.columns[0], "'=header")
  risks.forEach((value, index) => assert.equal(protectedData.rows[index].values[0], `'${value}`))
  assert.deepEqual(parseCsv(toCsv(dataset, { protectFormulas: false })), dataset)
  assert.equal(dataset.columns[0], '=header')
})

test('CSV delimiter and quote injection cannot create extra exported cells', () => {
  const dataset = { columns: ['text'], rows: [{ id: 1, values: ['x",=HYPERLINK("https://example.invalid"),"y'] }] }
  assert.deepEqual(parseCsv(toCsv(dataset)), dataset)
  assert.equal(getFormulaRiskCount(dataset), 0)
})

test('configured byte boundary is inclusive; legacy 5 MB inputs work; oversize rejects before reading', async () => {
  assert.equal(MAX_FILE_SIZE, 25 * 1024 * 1024)
  assert.equal((await readCsvFile(new File(['a\n', 'x'.repeat(5 * 1024 * 1024 - 2)], 'legacy.csv'))).rows.length, 1)
  const exact = new File(['a\n', 'x'.repeat(MAX_FILE_SIZE - 2)], 'boundary.csv')
  assert.equal(exact.size, MAX_FILE_SIZE)
  assert.equal((await readCsvFile(exact)).rows.length, 1)
  let read = false
  await assert.rejects(readCsvFile({ name: 'large.csv', size: MAX_FILE_SIZE + 1, arrayBuffer() { read = true } }), /25 MB.*smaller sample.*100,000 rows.*200 columns.*1,000,000 cells/)
  assert.equal(read, false)
})

test('file validation rejects bad extensions, no file, empty content and invalid UTF-8', async () => {
  await assert.rejects(readCsvFile(null), /exactly one/)
  await assert.rejects(readCsvFile(new File(['a\nb'], 'data.xlsx')), /\.csv/)
  await assert.rejects(readCsvFile(new File([], 'empty.csv')), /empty/)
  await assert.rejects(readCsvFile(new File([new Uint8Array([0xc3, 0x28])], 'invalid.csv')), /UTF-8/)
  const valid = await readCsvFile(new File(['\uFEFFname\r\n\u0646\u0627\u0645'], 'DATA.CSV'))
  assert.equal(valid.rows[0].values[0], '\u0646\u0627\u0645')
})

test('legacy 25,000 rows and the configured inclusive row boundary exclude header/final terminator', () => {
  assert.equal(parseCsv('a\n' + 'x\n'.repeat(25000)).rows.length, 25000)
  const text = 'a\r\n' + 'x\r\n'.repeat(LIMITS.rows)
  assert.equal(parseCsv(text).rows.length, LIMITS.rows)
  assert.throws(() => parseCsv(text + 'x'), /limit/)
  assert.throws(() => parseCsv(text + '\r\n'), /limit/)
})

test('200-column boundary is inclusive even for header-only datasets', () => {
  const header = Array.from({ length: LIMITS.columns }, (_, index) => `c${index}`).join(',')
  assert.equal(parseCsv(header).columns.length, LIMITS.columns)
  assert.throws(() => parseCsv(header + ',extra'), /limit/)
})

test('legacy 250,000 cells and the configured cell boundary work, including empty cells', () => {
  const header = Array.from({ length: 200 }, (_, index) => `c${index}`).join(',')
  const row = ','.repeat(199)
  assert.equal(parseCsv(`${header}\n${(row + '\n').repeat(1250)}`).rows.length * 200, 250000)
  const text = `${header}\n${(row + '\n').repeat(LIMITS.cells / 200)}`
  const data = parseCsv(text)
  assert.equal(data.rows.length * data.columns.length, LIMITS.cells)
  assert.equal(getMetrics(data).missing, LIMITS.cells)
  assert.throws(() => parseCsv(text + row), /limit/)
})

test('JSON applied-change log can reconstruct the result, including removals and multiple cell steps', () => {
  const original = freeze(parseCsv(' Full Name ,City\n" Alice "," \t "\n" Alice "," \t "\nBob,Paris'))
  const options = { ...DEFAULT_OPTIONS, trim: true, standardize: true, missing: 'fill', fillValue: 'Unknown', deduplicate: true }
  const proposal = buildProposal(original, options)
  const entries = [{ type: 'apply', fromVersion: 1, toVersion: 2, options, summary: proposal.summary, changes: proposal.changes }]
  const log = JSON.parse(JSON.stringify(createChangeLog({ file: { name: 'test.csv' }, version: 2, dataset: proposal.dataset, entries, exportedAt: '2026-11-14T00:00:00.000Z' })))
  const replay = structuredClone(original)
  for (const change of log.events[0].changes) {
    if (change.kind === 'rename-column') {
      assert.equal(replay.columns[change.column - 1], change.before)
      replay.columns[change.column - 1] = change.after
    } else if (change.kind === 'remove-row') {
      const index = replay.rows.findIndex((row) => row.id === change.row)
      assert.deepEqual(replay.rows[index].values, change.before)
      replay.rows.splice(index, 1)
    } else {
      const row = replay.rows.find((row) => row.id === change.row)
      assert.equal(row.values[change.column - 1], change.before)
      row.values[change.column - 1] = change.after
    }
  }
  assert.deepEqual(replay, proposal.dataset)
  assert.deepEqual(log.currentMetrics, getMetrics(replay))
  assert.equal(log.currentVersion, 2)
  assert.equal('proposal' in log, false)
  assert.equal(original.rows.length, 3)
})
