import * as baseline from '../../.tmp/baseline-csv.js'

const worker = new Worker(new URL('./benchmark.worker.js', import.meta.url), { type: 'module' })
const pending = new Map()
let sequence = 0
worker.onmessage = ({ data }) => {
  const job = pending.get(data.id)
  if (!job) return
  if (data.progress) { job.progress?.(data.progress); return }
  pending.delete(data.id)
  if (data.error) job.reject(new Error(data.error.message))
  else job.resolve(data.value)
}
window.rpc = (method, args = {}) => new Promise((resolve, reject) => {
  const id = ++sequence
  pending.set(id, { resolve, reject })
  worker.postMessage({ id, method, args })
})
window.makeFile = async (shape) => { window.inputFile = await window.rpc('generate', shape); return { bytes: window.inputFile.size } }
window.timedWorker = async () => {
  const times = {}
  let start = performance.now()
  const parsed = await window.rpc('import', { file: window.inputFile })
  const snapshot = await window.rpc('commitImport', parsed)
  times.importMs = performance.now() - start
  start = performance.now()
  const proposal = await window.rpc('propose', { options: { trim: true, standardize: true, deduplicate: true, missing: 'fill', fillValue: 'Unknown' } })
  await window.rpc('apply', proposal)
  times.cleanMs = performance.now() - start
  start = performance.now()
  const csv = await window.rpc('exportCsv', { protectFormulas: true })
  await window.rpc('commitExport', { token: csv.token })
  times.csvMs = performance.now() - start
  start = performance.now()
  const log = await window.rpc('exportLog')
  await window.rpc('commitExport', { token: log.token })
  times.logMs = performance.now() - start
  return { ...times, metrics: snapshot.metrics, changes: proposal.changeCount, csvBytes: csv.blob.size, logBytes: log.blob.size }
}
window.timedBaseline = async () => {
  const times = {}
  let start = performance.now()
  const original = baseline.parseCsv(await window.inputFile.text())
  const metrics = baseline.getMetrics(original)
  const emptyProposal = baseline.buildProposal(original, baseline.DEFAULT_OPTIONS)
  baseline.getMetrics(emptyProposal.dataset)
  baseline.getFormulaRiskCount(original)
  times.importMs = performance.now() - start
  start = performance.now()
  const proposal = baseline.buildProposal(original, { trim: true, standardize: true, deduplicate: true, missing: 'fill', fillValue: 'Unknown' })
  baseline.getMetrics(proposal.dataset)
  baseline.getFormulaRiskCount(proposal.dataset)
  times.cleanMs = performance.now() - start
  start = performance.now()
  const csv = baseline.toCsv(proposal.dataset)
  const csvBlob = new Blob([csv])
  times.csvMs = performance.now() - start
  start = performance.now()
  const entries = [{ type: 'apply', options: {}, summary: proposal.summary, changes: proposal.changes }]
  const log = baseline.createChangeLog({ file: { name: 'synthetic.csv' }, version: 2, dataset: proposal.dataset, entries, exportedAt: new Date().toISOString() })
  const logBlob = new Blob([JSON.stringify(log)])
  times.logMs = performance.now() - start
  window.baselineState = { original, proposal, csvBlob, logBlob }
  return { ...times, metrics, changes: proposal.changes.length, csvBytes: csvBlob.size, logBytes: logBlob.size }
}
window.startHeartbeat = () => {
  window.gaps = []
  let previous = performance.now()
  window.timer = setInterval(() => { const now = performance.now(); window.gaps.push(now - previous); previous = now }, 10)
}
window.stopHeartbeat = async () => {
  await new Promise((resolve) => setTimeout(resolve, 25))
  clearInterval(window.timer)
  return { ticks: window.gaps.length, maxGapMs: Math.max(0, ...window.gaps) }
}
window.benchReady = true
