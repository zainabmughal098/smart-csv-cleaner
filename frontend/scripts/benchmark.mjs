import { chromium } from '@playwright/test'
import { createServer } from 'vite'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import process from 'node:process'

mkdirSync('.tmp', { recursive: true })
writeFileSync('.tmp/baseline-csv.js', execFileSync('git', ['show', '06ebe60:frontend/src/lib/csv.js']))
const server = await createServer({ server: { host: '127.0.0.1', port: 4174, strictPort: true, hmr: false, watch: null }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const root = await browser.newBrowserCDPSession()
let sequence = 0
const responses = new Map()
root.on('Target.receivedMessageFromTarget', ({ sessionId, message }) => {
  const result = JSON.parse(message)
  const callback = responses.get(`${sessionId}:${result.id}`)
  if (callback) { responses.delete(`${sessionId}:${result.id}`); callback(result.result ?? {}) }
})
function workerHeap(sessionId, method = 'Runtime.getHeapUsage') {
  return new Promise((resolve) => {
    const id = ++sequence
    const key = `${sessionId}:${id}`
    responses.set(key, resolve)
    root.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method }) }).catch(() => { responses.delete(key); resolve({}) })
    setTimeout(() => { if (responses.delete(key)) resolve({}) }, 3000).unref()
  })
}

const results = { environment: { date: '2026-11-14', platform: os.platform(), cpu: os.cpus()[0].model, logicalCpus: os.cpus().length, ramGiB: os.totalmem() / 1024 ** 3, node: process.version, browser: browser.version(), baseline: '06ebe60', source: 'Vite-transformed local modules; synthetic file generation and post-run verification excluded from timing' }, cases: [] }
const shapes = [5, 10, 25, 50].map((mib) => ({ mib, rows: 10000, columns: 10 }))
shapes.push({ mib: 10, rows: 100000, columns: 10 }, { mib: 25, rows: 5000, columns: 200 })
try {
  for (const shape of shapes) {
    for (const pipeline of shape.rows * shape.columns > 250000 ? ['worker'] : ['baseline', 'worker']) {
      for (let repetition = 1; repetition <= 2; repetition += 1) {
        const context = await browser.newContext()
        const page = await context.newPage()
        await page.goto('http://127.0.0.1:4174/tests/benchmarks/harness.html')
        await page.waitForFunction(() => window.benchReady)
        const input = await page.evaluate((shape) => window.makeFile(shape), shape)
        const pageCdp = await context.newCDPSession(page)
        const target = (await root.send('Target.getTargets')).targetInfos.find((target) => target.type === 'worker' && target.url.includes('benchmark.worker'))
        const attached = target ? await root.send('Target.attachToTarget', { targetId: target.targetId, flatten: false }) : null
        await pageCdp.send('HeapProfiler.collectGarbage')
        if (attached) await workerHeap(attached.sessionId, 'HeapProfiler.collectGarbage')
        let sampling = true
        let pagePeak = 0
        let workerPeak = 0
        let samples = 0
        const sample = (async () => {
          while (sampling) {
            const [main, worker] = await Promise.all([pageCdp.send('Runtime.getHeapUsage').catch(() => ({})), attached ? workerHeap(attached.sessionId) : {}])
            pagePeak = Math.max(pagePeak, main.usedSize ?? 0)
            workerPeak = Math.max(workerPeak, worker.usedSize ?? 0)
            samples += 1
            await new Promise((resolve) => setTimeout(resolve, 25))
          }
        })()
        await page.evaluate(() => window.startHeartbeat())
        let result
        try {
          result = await page.evaluate((pipeline) => pipeline === 'worker' ? window.timedWorker() : window.timedBaseline(), pipeline)
          const heartbeat = await page.evaluate(() => window.stopHeartbeat())
          sampling = false
          await sample
          const verified = pipeline === 'worker' ? await page.evaluate(() => window.rpc('verify')) : { comparisonOnly: true }
          const record = { ...shape, bytes: input.bytes, pipeline, repetition, ...result, ...heartbeat, pagePeakMiB: pagePeak / 1024 ** 2, workerPeakMiB: workerPeak / 1024 ** 2, memorySamples: samples, verified }
          results.cases.push(record)
          console.log(JSON.stringify(record))
        } catch (error) {
          sampling = false
          await sample
          const record = { ...shape, pipeline, repetition, error: error.message, pagePeakMiB: pagePeak / 1024 ** 2, workerPeakMiB: workerPeak / 1024 ** 2 }
          results.cases.push(record)
          console.log(JSON.stringify(record))
        }
        if (attached) await root.send('Target.detachFromTarget', { sessionId: attached.sessionId }).catch(() => {})
        await context.close()
        writeFileSync('tests/benchmarks/results.json', JSON.stringify(results, null, 2) + '\n')
      }
    }
  }
} finally { await browser.close(); await server.close() }
