import { test, expect } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { Buffer } from 'node:buffer'
import { CSV_LIMITS } from '../../src/lib/limits.js'

function syntheticFile(path, bytes = CSV_LIMITS.bytes) {
  const header = ' Name ,City,Notes\r\n'
  const rows = 10000
  const row = (index, padding) => ` row${index} ,${index % 10 ? 'Paris' : ''},"line,\r\n\u6771\u4eac ""hi""${'p'.repeat(padding)}"\r\n`
  const size = new TextEncoder()
  let base = size.encode(header).length
  for (let index = 0; index < rows; index += 1) base += size.encode(row(index, 0)).length
  const pad = Math.floor((bytes - base) / rows)
  const extra = (bytes - base) % rows
  const parts = [header]
  for (let index = 0; index < rows; index += 1) parts.push(row(index, pad + (index < extra ? 1 : 0)))
  const text = parts.join('')
  expect(size.encode(text).length).toBe(bytes)
  writeFileSync(path, text, 'utf8')
}

test('25 MiB real UI remains interactive and cancellable; complete applied exports retain large values', async ({ page }, testInfo) => {
  test.setTimeout(120000)
  const path = testInfo.outputPath('synthetic-25m.csv')
  syntheticFile(path)
  await page.goto('/')
  await page.getByLabel('Choose CSV file', { exact: true }).setInputFiles(path)
  await expect(page.getByRole('button', { name: 'Cancel operation' })).toBeVisible()
  await page.evaluate(() => {
    window.heartbeatGaps = []
    let last = performance.now()
    window.heartbeat = setInterval(() => { const now = performance.now(); window.heartbeatGaps.push(now - last); last = now }, 10)
  })
  // This is a real navigation event while the worker is importing.
  const navigationStart = Date.now()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Workspace settings' })).toBeVisible()
  const navigationMs = Date.now() - navigationStart
  expect(navigationMs).toBeLessThan(750)
  await expect(page.getByRole('button', { name: 'Cancel operation' })).toBeVisible()
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Choose another file' })).toBeEnabled({ timeout: 30000 })
  await expect(page.getByRole('article').filter({ hasText: 'Total rows' }).locator('.tabular-nums')).toHaveText('10,000')
  const heartbeat = await page.evaluate(() => {
    clearInterval(window.heartbeat)
    return { ticks: window.heartbeatGaps.length, maxGapMs: Math.max(0, ...window.heartbeatGaps) }
  })
  expect(heartbeat.ticks).toBeGreaterThan(5)
  expect(heartbeat.maxGapMs).toBeLessThan(500)
  const heartbeatPath = testInfo.outputPath('ui-heartbeat.json')
  writeFileSync(heartbeatPath, JSON.stringify({ ...heartbeat, navigationMs }))
  await testInfo.attach('ui-heartbeat.json', { path: heartbeatPath, contentType: 'application/json' })
  await expect(page.getByRole('region', { name: 'CSV data table' })).toContainText('line,')
  const maximumCell = await page.getByRole('region', { name: 'CSV data table' }).locator('td').evaluateAll((cells) => Math.max(...cells.map((cell) => cell.textContent.length)))
  expect(maximumCell).toBeLessThanOrEqual(500)

  // Cancellation of a replacement keeps the original/current session intact.
  await page.getByLabel('Choose CSV file', { exact: true }).setInputFiles(path)
  await page.getByRole('button', { name: 'Cancel operation' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Operation cancelled' })).toBeVisible()
  await expect(page.getByRole('article').filter({ hasText: 'Total rows' }).locator('.tabular-nums')).toHaveText('10,000')

  await page.getByRole('checkbox', { name: /Trim whitespace/ }).check()
  await page.getByRole('button', { name: 'Preview changes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Cancel operation' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel operation' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Operation cancelled' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Apply changes', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Preview changes', exact: true }).click()
  await page.getByRole('checkbox', { name: 'I have reviewed the proposed changes' }).check({ timeout: 30000 })
  await expect(page.getByRole('button', { name: 'Apply changes', exact: true })).toBeEnabled()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click()
  await expect(page.getByText('Changes applied to version 2. Your original upload is preserved.', { exact: true })).toBeVisible()

  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download CSV', exact: true }).click()
  const download = await pending
  expect(await download.failure()).toBeNull()
  const stream = await download.createReadStream()
  let bytes = 0
  for await (const chunk of stream) bytes += chunk.byteLength
  expect(bytes).toBeGreaterThan(24 * 1024 * 1024)
  await expect(page.getByRole('button', { name: 'Download CSV', exact: true })).toBeEnabled()
  // Cancellation before the download leaves no claimed export event.
  await page.getByRole('button', { name: 'Download CSV', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel operation' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Operation cancelled' })).toBeVisible()
  await expect(page.getByText('CSV download requested · version 2', { exact: true })).toHaveCount(1)
})

test('over-limit files and worker resource failures are explicit and do not auto-retry', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Choose CSV file', { exact: true }).setInputFiles({ name: 'over.csv', mimeType: 'text/csv', buffer: Buffer.alloc(CSV_LIMITS.bytes + 1) })
  await expect(page.getByRole('alert')).toContainText('25 MB upload limit')
  const text = 'a,b\n' + ',\n'.repeat(5000)
  await page.getByLabel('Choose CSV file', { exact: true }).setInputFiles({ name: 'missing.csv', mimeType: 'text/csv', buffer: Buffer.from(text) })
  await expect(page.getByRole('button', { name: 'Choose another file' })).toBeEnabled()
  await page.getByLabel('Missing values', { exact: true }).selectOption('fill')
  await page.getByLabel('Replacement value').fill('x'.repeat(5000))
  await page.getByRole('button', { name: 'Preview changes', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(/budget|expansion/)
  await expect(page.getByRole('button', { name: 'Cancel operation' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Preview changes', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Workspace settings' })).toBeVisible()
})

test('million-cell, 200-column UI keeps page DOM bounded and pagination consistent', async ({ page }) => {
  test.setTimeout(60000)
  const columns = Array.from({ length: 200 }, (_, index) => `c${index}`).join(',')
  const text = columns + '\n' + (Array(200).fill('x').join(',') + '\n').repeat(5000)
  await page.goto('/')
  await page.getByLabel('Choose CSV file', { exact: true }).setInputFiles({ name: 'wide.csv', mimeType: 'text/csv', buffer: Buffer.from(text) })
  await expect(page.getByRole('button', { name: 'Choose another file' })).toBeEnabled({ timeout: 30000 })
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByLabel('Preview rows per page').selectOption('50')
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
  const table = page.getByRole('region', { name: 'CSV data table' })
  await expect(table.locator('td')).toHaveCount(1000)
  await expect(page.getByText('1–5 of 5,000 rows', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(table.getByRole('rowheader').first()).toHaveText('6')
})
