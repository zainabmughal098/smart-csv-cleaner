import { test } from 'node:test'
import assert from 'node:assert/strict'
import { File } from 'node:buffer'
import { DEFAULT_OPTIONS, parseCsv, buildProposal, getMetrics, toCsv } from '../src/lib/csv.js'
import { readCsvStream } from '../src/lib/streamCsv.js'
import { ExactRowIndex } from '../src/lib/rowIndex.js'
import { Workspace } from '../src/workers/workspace.js'
import { CSV_LIMITS, RESOURCE_LIMITS } from '../src/lib/limits.js'

const sample = '\uFEFF Full Name ,City,Notes\r\n" Alice ",,"\u6771\u4eac,\r\nline2"\nBob,Paris,"He said ""hi"""\rBob,Paris,"He said ""hi"""\r\n\r\n'
const file = (text = sample) => new File([text], 'test.csv')
const settings = { ...DEFAULT_OPTIONS, trim: true, standardize: true, deduplicate: true, missing: 'fill', fillValue: 'Unknown' }

async function loaded(workspace = new Workspace(), input = file()) {
  const pending = await workspace.handle('import', { file: input })
  const snapshot = await workspace.handle('commitImport', pending)
  return { workspace, snapshot }
}

test('stream parser equals strict legacy parser at every byte chunk size from 1 to 80', async () => {
  const expected = parseCsv(sample)
  for (let chunkBytes = 1; chunkBytes <= 80; chunkBytes += 1) {
    assert.deepEqual(await readCsvStream(file(), { chunkBytes }), expected, `chunk size ${chunkBytes}`)
  }
})

test('blank batches, explicit empty final cells, headers only and all line endings are retained', async () => {
  for (const text of ['a,b\n\n\n', 'a\n""', 'a,b\r\n', 'a\nx\rx\nx\r\n', 'a,b\n"a\n\rb",x\n']) {
    assert.deepEqual(await readCsvStream(file(text), { chunkBytes: 1 }), parseCsv(text))
  }
})

test('stream parser rejects malformed quotes and invalid UTF-8 even at chunk boundaries', async () => {
  for (const text of ['a,b\nx"y,z', 'a,b\n"x"oops,z', 'a,b\n"unclosed,z', 'a,b\n1,2,3', 'a,b\n1', '', '\n']) {
    await assert.rejects(readCsvStream(file(text), { chunkBytes: 1 }))
  }
  await assert.rejects(readCsvStream(new File([new Uint8Array([97, 10, 0xc3])], 'utf8.csv'), { chunkBytes: 1 }), /UTF-8/)
})

test('stream shape and byte limits reject early; no records or cells are silently dropped', async () => {
  const limits = { bytes: 1024, rows: 2, columns: 2, cells: 4 }
  assert.equal((await readCsvStream(file('a,b\nx,y\nx,y\n'), { limits, chunkBytes: 2 })).rows.length, 2)
  for (const text of ['a,b\nx,y\nx,y\nx,y', 'a,b,c\nx,y,z']) await assert.rejects(readCsvStream(file(text), { limits }), /limit/)
  await assert.rejects(readCsvStream(file('a,b\nx,y\nx,y'), { limits: { ...limits, cells: 3 } }), /limit/)
  await assert.rejects(readCsvStream(file('x'.repeat(1025)), { limits }), /upload limit/)
})

test('hash collisions use exact comparisons, including ambiguous concatenations and Unicode', () => {
  const index = new ExactRowIndex(() => 1)
  assert.equal(index.add(['a,b', 'c']), true)
  assert.equal(index.add(['a', 'b,c']), true)
  assert.equal(index.add(['\u6771\u4eac', '001']), true)
  assert.equal(index.add(['\u6771\u4eac', '1']), true)
  assert.equal(index.add(['\u6771\u4eac', '001']), false)
})

test('copy-on-write shares unchanged rows/values; no-op proposals keep the dataset identity', () => {
  const original = parseCsv('name,city\n Alice ,Paris\nBob,Rome')
  const result = buildProposal(original, { ...DEFAULT_OPTIONS, trim: true })
  assert.equal(buildProposal(original, DEFAULT_OPTIONS).dataset, original)
  assert.equal(result.dataset.rows[1], original.rows[1])
  assert.notEqual(result.dataset.rows[0], original.rows[0])
  assert.equal(original.rows[0].values[0], ' Alice ')
})

test('worker snapshots/pages are bounded and never contain full datasets or change arrays', async () => {
  const { workspace, snapshot } = await loaded(new Workspace(), file('name\n' + 'x'.repeat(4000)))
  assert.equal(snapshot.current.rowCount, 1)
  assert.equal(snapshot.current.rows, undefined)
  assert.equal(workspace.page().rows[0].values[0].length, RESOURCE_LIMITS.previewCharacters)
  const output = await workspace.handle('exportCsv', { protectFormulas: false })
  assert.deepEqual(parseCsv(await output.blob.text()), workspace.current)
})

test('all missing strategies and cleaning match the original semantics and preserve the original', async () => {
  for (const missing of ['keep', 'fill', 'remove']) {
    const { workspace } = await loaded()
    const original = structuredClone(workspace.original)
    const options = { ...settings, missing }
    const expected = buildProposal(original, options)
    const proposal = await workspace.handle('propose', { options })
    assert.deepEqual(proposal.metrics, getMetrics(expected.dataset))
    assert.deepEqual(workspace.current, original)
    await workspace.handle('apply', { token: proposal.token })
    assert.deepEqual(workspace.current, expected.dataset)
    assert.deepEqual(workspace.original, original)
    assert.deepEqual(workspace.entries.find((event) => event.type === 'apply').changes, expected.changes)
  }
})

test('replacement import is transactional; failed/cancelled/discarded imports keep the previous workspace', async () => {
  const { workspace } = await loaded()
  const before = workspace.snapshot()
  await assert.rejects(workspace.handle('import', { file: file('a,b\nx"y,z') }))
  assert.deepEqual(workspace.snapshot(), before)
  const pending = await workspace.handle('import', { file: file('new\nvalue') })
  assert.deepEqual(workspace.snapshot(), before)
  await workspace.handle('discardImport')
  await assert.rejects(workspace.handle('commitImport', pending), /no longer/)
  assert.deepEqual(workspace.snapshot(), before)
  const job = workspace.handle('import', { file: file('a,b\n' + 'x,y\n'.repeat(1000)) }, 'cancel-import', () => workspace.cancel('cancel-import'))
  await assert.rejects(job, { name: 'AbortError' })
  assert.deepEqual(workspace.snapshot(), before)
})

test('cancelled cleaning does not change current data or history; stale proposal tokens cannot apply', async () => {
  const { workspace } = await loaded(new Workspace(), file('name\n' + ' x \n'.repeat(20000)))
  const before = workspace.snapshot()
  const job = workspace.handle('propose', { options: settings }, 'cancel-plan')
  setTimeout(() => workspace.cancel('cancel-plan'), 0)
  await assert.rejects(job, { name: 'AbortError' })
  assert.deepEqual(workspace.snapshot(), before)
  const first = await workspace.handle('propose', { options: settings })
  await workspace.handle('propose', { options: DEFAULT_OPTIONS })
  await assert.rejects(workspace.handle('apply', { token: first.token }), /stale/)
})

test('starting a replacement invalidates previous proposal tokens even if it fails or is discarded', async () => {
  const { workspace } = await loaded()
  const before = workspace.snapshot()
  const first = await workspace.handle('propose', { options: settings })
  await assert.rejects(workspace.handle('import', { file: file('a,b\ninvalid') }))
  await assert.rejects(workspace.handle('apply', first), /stale/)
  assert.deepEqual(workspace.snapshot(), before)
  const second = await workspace.handle('propose', { options: settings })
  await workspace.handle('import', { file: file('Name\nreplacement') })
  await workspace.handle('discardImport')
  await assert.rejects(workspace.handle('apply', second), /stale/)
  assert.deepEqual(workspace.snapshot(), before)
  const third = await workspace.handle('propose', { options: settings })
  await workspace.handle('apply', third)
  assert.equal(workspace.snapshot().version, before.version + 1)
})

test('proposal detail, session history and data expansion budgets reject transactionally', async () => {
  for (const resources of [
    { ...RESOURCE_LIMITS, proposalChanges: 1 },
    { ...RESOURCE_LIMITS, proposalBytes: 32 },
    { ...RESOURCE_LIMITS, textUnits: 10 },
    { ...RESOURCE_LIMITS, historyBytes: 4500 },
  ]) {
    const { workspace } = await loaded(new Workspace({ resources }))
    const before = workspace.snapshot()
    await assert.rejects(workspace.handle('propose', { options: { ...settings, fillValue: 'x'.repeat(5000) } }), /budget|expansion/)
    assert.deepEqual(workspace.snapshot(), before)
  }
})

test('CSV and JSON exports are complete, formula protected, replayable, and exclude pending proposals', async () => {
  const { workspace } = await loaded(new Workspace(), file(' Name ,City\n Alice ,\n Alice ,\n=1+1,Paris'))
  const original = structuredClone(workspace.original)
  const proposal = await workspace.handle('propose', { options: settings })
  const before = await workspace.handle('exportCsv', { protectFormulas: false })
  assert.deepEqual(parseCsv(await before.blob.text()), original)
  await workspace.handle('commitExport', before)
  await workspace.handle('apply', proposal)
  const csv = await workspace.handle('exportCsv', { protectFormulas: true })
  assert.equal(await csv.blob.text(), toCsv(workspace.current))
  await workspace.handle('commitExport', csv)
  const output = await workspace.handle('exportLog')
  const log = JSON.parse(await output.blob.text())
  const applied = log.events.find((event) => event.type === 'apply')
  const replay = structuredClone(original)
  for (const change of applied.changes) {
    if (change.kind === 'rename-column') replay.columns[change.column - 1] = change.after
    else if (change.kind === 'remove-row') replay.rows.splice(replay.rows.findIndex((row) => row.id === change.row), 1)
    else replay.rows.find((row) => row.id === change.row).values[change.column - 1] = change.after
  }
  assert.deepEqual(replay, workspace.current)
  assert.deepEqual(workspace.original, original)
  assert.equal(log.currentVersion, 2)
  assert.deepEqual(log.currentMetrics, getMetrics(workspace.current))
  assert.equal(log.events.at(-1).message, 'Change log download requested')
  assert.equal(workspace.entries.at(-1).message.startsWith('CSV download'), true)
})

test('cancellation and export-size failures produce no partial export event', async () => {
  const { workspace } = await loaded(new Workspace(), file('name\n' + ' x \n'.repeat(2000)))
  const before = workspace.snapshot()
  await assert.rejects(workspace.handle('exportCsv', {}, 'cancel-csv', () => workspace.cancel('cancel-csv')), { name: 'AbortError' })
  assert.deepEqual(workspace.snapshot(), before)
  workspace.resources = { ...RESOURCE_LIMITS, exportBytes: 100 }
  await assert.rejects(workspace.handle('exportCsv'), /export exceeds/)
  assert.deepEqual(workspace.snapshot(), before)
})

test('current supported import profile is enforced by the worker, not just the UI', async () => {
  await assert.rejects(new Workspace().handle('import', { file: { name: 'large.csv', size: CSV_LIMITS.bytes + 1 } }), /upload limit/)
})

test('wide previews paginate with arbitrary capped sizes and do not cut surrogate pairs', async () => {
  const columns = Array.from({ length: 70 }, (_, index) => `c${index}`)
  const row = columns.map(() => 'x').join(',')
  const { workspace } = await loaded(new Workspace(), file(columns.join(',') + '\n' + (row + '\n').repeat(30)))
  assert.equal(workspace.page({ pageSize: 25 }).rows.length, 14)
  assert.equal(workspace.page({ pageSize: 14, page: 1 }).rows[0].id, 15)
  const emoji = await loaded(new Workspace(), file('name\n' + 'x'.repeat(499) + '\ud83d\ude00'))
  assert.equal(emoji.workspace.page().rows[0].values[0], 'x'.repeat(499))
})

test('bounded activity summaries preserve stable session/workflow metadata and complete history', async () => {
  const { workspace, snapshot } = await loaded(new Workspace(), file('name\n x '))
  const proposal = await workspace.handle('propose', { options: { ...DEFAULT_OPTIONS, trim: true } })
  await workspace.handle('apply', proposal)
  for (let index = 0; index < 105; index += 1) {
    const output = await workspace.handle('exportCsv')
    await workspace.handle('commitExport', output)
  }
  const current = workspace.snapshot()
  assert.equal(current.events.length, 100)
  assert.equal(current.eventCount, 107)
  assert.equal(current.sessionId, snapshot.sessionId)
  assert.equal(current.hasApplied, true)
  assert.equal(current.hasExported, true)
  const output = await workspace.handle('exportLog')
  assert.equal(JSON.parse(await output.blob.text()).events.length, 108)
})

test('a maximum-size import can reject a change whose full before/after log is too large', async () => {
  const text = 'name\n ' + 'x'.repeat(CSV_LIMITS.bytes - 7) + ' '
  const { workspace, snapshot } = await loaded(new Workspace(), file(text))
  assert.equal(file(text).size, CSV_LIMITS.bytes)
  await assert.rejects(workspace.handle('propose', { options: { ...DEFAULT_OPTIONS, trim: true } }), /complete proposed change log/)
  assert.deepEqual(workspace.snapshot(), snapshot)
  assert.equal(workspace.current, workspace.original)
  assert.equal(workspace.current.rows[0].values[0].startsWith(' '), true)
})
