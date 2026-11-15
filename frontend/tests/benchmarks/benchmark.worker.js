import { Workspace } from '../../src/workers/workspace.js'
import { RESOURCE_LIMITS } from '../../src/lib/limits.js'
import { readCsvStream } from '../../src/lib/streamCsv.js'

// Benchmark-only candidate. The production worker cannot accept this override.
const workspace = new Workspace({ limits: { bytes: 50 * 1024 * 1024, rows: 100000, columns: 200, cells: 1000000 }, resources: { ...RESOURCE_LIMITS, textUnits: 64 * 1024 * 1024 } })
let csvBlob
let logBlob
function generate({ mib, rows = 10000, columns = 10 }) {
  const encoder = new TextEncoder()
  const header = Array.from({ length: columns }, (_, index) => ` Column ${index} `).join(',') + '\r\n'
  function record(index, padding = 0) {
    const logical = index % 100 === 99 ? index - 1 : index
    const values = Array.from({ length: columns }, (_, column) => column === 0 ? ` row${logical} ` : column === 1 && logical % 10 === 0 ? '' : `v${column}`)
    values[columns - 1] = `"line,\r\n\u6771\u4eac caf\u00e9 ""hello""${'p'.repeat(padding)}"`
    return values.join(',') + ['\n', '\r\n', '\r'][index % 3]
  }
  let base = encoder.encode(header).byteLength
  for (let index = 0; index < rows; index += 1) base += encoder.encode(record(index)).byteLength
  const target = Math.round(mib * 1024 * 1024)
  if (base > target) throw new Error('The requested shape cannot fit in this byte target.')
  const padding = Math.floor((target - base) / rows)
  const extra = (target - base) % rows
  const parts = [header]
  for (let index = 0; index < rows; index += 1) parts.push(record(index, padding + (index < extra ? 1 : 0)))
  const file = new File(parts, 'synthetic.csv', { type: 'text/csv' })
  if (file.size !== target) throw new Error('Synthetic file size is incorrect.')
  return file
}

self.onmessage = async ({ data: { id, method, args } }) => {
  try {
    let value
    if (method === 'generate') value = generate(args)
    else if (method === 'verify') {
      const exported = await readCsvStream(new File([csvBlob], 'roundtrip.csv'), { limits: { bytes: 128 * 1024 * 1024, rows: 100000, columns: 200, cells: 1000000 } })
      const expected = workspace.current
      if (exported.columns.some((value, index) => value !== expected.columns[index]) || exported.rows.length !== expected.rows.length || exported.rows.some((row, index) => row.values.some((value, column) => value !== expected.rows[index].values[column]))) throw new Error('CSV round-trip mismatch')
      const log = JSON.parse(await logBlob.text())
      const applied = log.events.find((event) => event.type === 'apply')
      if (JSON.stringify(applied.changes) !== JSON.stringify(workspace.entries.find((event) => event.type === 'apply').changes)) throw new Error('JSON log mismatch')
      value = { csvRoundtrip: true, completeLog: true }
    } else {
      value = await workspace.handle(method, args, id, (progress) => self.postMessage({ id, progress }))
      if (method === 'exportCsv') csvBlob = value.blob
      if (method === 'exportLog') logBlob = value.blob
    }
    self.postMessage({ id, value })
  } catch (error) { self.postMessage({ id, error: { message: error.message } }) }
}
