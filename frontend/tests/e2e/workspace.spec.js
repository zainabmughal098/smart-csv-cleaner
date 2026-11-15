import { test, expect } from '@playwright/test'
import { Buffer } from 'node:buffer'
import AxeBuilder from '@axe-core/playwright'
import { parseCsv, buildProposal, DEFAULT_OPTIONS, toCsv } from '../../src/lib/csv.js'
import { CSV_LIMITS } from '../../src/lib/limits.js'

const sample = ' Full Name ,City,Notes,Code\r\n" Alice ","Karachi, PK","line one\nline two",001\r\nBob,,"He said ""hello""",002\r\nBob,,"He said ""hello""",002\r\n'
const options = { ...DEFAULT_OPTIONS, trim: true, standardize: true, deduplicate: true }

async function upload(page, content = sample, name = 'sample.csv') {
  const input = page.getByLabel('Choose CSV file', { exact: true })
  await expect(input).toBeEnabled()
  await input.setInputFiles({
    name,
    mimeType: 'text/csv',
    buffer: Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8'),
  })
  // setInputFiles dispatches change; the asynchronous File read is still pending.
  await expect(input).toBeEnabled()
}

function metric(page, label) {
  return page.getByRole('article').filter({ hasText: label }).locator('.tabular-nums')
}

async function downloadText(page, action) {
  const pending = page.waitForEvent('download')
  await action()
  const download = await pending
  const stream = await download.createReadStream()
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  expect(await download.failure()).toBeNull()
  return { text: Buffer.concat(chunks).toString('utf8'), filename: download.suggestedFilename() }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('empty state is accurate, has proper em dashes and disables operations', async ({ page }) => {
  await expect(page.getByRole('article').locator('.tabular-nums')).toHaveText(['—', '—', '—', '—'])
  for (const name of [/Trim whitespace/, /Remove exact duplicates/, /Standardize column names/]) {
    await expect(page.getByRole('checkbox', { name })).toBeDisabled()
  }
  await expect(page.getByLabel('Missing values', { exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Review & apply changes' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Export current CSV' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Download change log' })).toBeDisabled()
})

test('proposals do not change applied data; cancel and confirm work; original stays intact', async ({ page }) => {
  await upload(page)
  await expect(metric(page, 'Total rows')).toHaveText('3')
  await expect(metric(page, 'Columns')).toHaveText('4')
  await expect(metric(page, 'Missing cells')).toHaveText('2')
  await expect(metric(page, 'Exact duplicate rows')).toHaveText('1')
  await expect(page.getByRole('region', { name: 'CSV data table' })).toContainText('Karachi, PK')
  await expect(page.getByRole('region', { name: 'CSV data table' })).toContainText('line one\nline two')
  for (const name of [/Trim whitespace/, /Remove exact duplicates/, /Standardize column names/]) {
    await page.getByRole('checkbox', { name }).check()
  }
  await expect(page.getByText('Proposed · not applied', { exact: true })).toBeVisible()
  await expect(metric(page, 'Total rows')).toHaveText('3')
  const pendingExport = await downloadText(page, () => page.getByRole('button', { name: 'Export current CSV' }).click())
  expect(parseCsv(pendingExport.text)).toEqual(parseCsv(sample))
  page.once('dialog', async (dialog) => { expect(dialog.message()).toContain('1 rows removed'); await dialog.dismiss() })
  await page.getByRole('button', { name: 'Review & apply changes' }).click()
  await expect(metric(page, 'Total rows')).toHaveText('3')
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Review & apply changes' }).click()
  await expect(metric(page, 'Total rows')).toHaveText('2')
  await expect(metric(page, 'Missing cells')).toHaveText('1')
  await expect(page.getByRole('checkbox', { name: /Trim whitespace/ })).not.toBeChecked()
  const expected = buildProposal(parseCsv(sample), options)
  const exported = await downloadText(page, () => page.getByRole('button', { name: 'Download CSV', exact: true }).click())
  expect(parseCsv(exported.text)).toEqual({ ...expected.dataset, rows: expected.dataset.rows.map((row, index) => ({ ...row, id: index + 1 })) })
  const { text } = await downloadText(page, () => page.getByRole('button', { name: 'Download change log' }).click())
  const log = JSON.parse(text)
  expect(log.currentVersion).toBe(2)
  expect(log.events.filter((event) => event.type === 'apply')[0].changes).toEqual(expected.changes)
  expect(log.events.filter((event) => event.type === 'apply')[0].summary).toEqual(expected.summary)
  await page.getByRole('button', { name: 'Original upload', exact: true }).click()
  await expect(page.getByRole('region', { name: 'CSV data table' }).getByRole('row')).toHaveCount(4)
  await expect(page.getByRole('region', { name: 'CSV data table' })).toContainText(' Alice ')
  await page.getByRole('button', { name: 'Current data', exact: true }).click()
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'Restore original data' }).click()
  await expect(metric(page, 'Total rows')).toHaveText('2')
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Restore original data' }).click()
  await expect(metric(page, 'Total rows')).toHaveText('3')
})

test('missing-value keep, fill and removal require explicit choices and confirmation', async ({ page }) => {
  await upload(page)
  await expect(page.getByLabel('Missing values', { exact: true })).toHaveValue('keep')
  await page.getByLabel('Missing values', { exact: true }).selectOption('fill')
  await expect(page.getByRole('button', { name: 'Review & apply changes' })).toBeDisabled()
  await page.getByLabel('Replacement value').fill('Unknown')
  page.once('dialog', async (dialog) => { expect(dialog.message()).toContain('2 missing cells filled'); await dialog.accept() })
  await page.getByRole('button', { name: 'Review & apply changes' }).click()
  await expect(metric(page, 'Missing cells')).toHaveText('0')
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Restore original data' }).click()
  await page.getByLabel('Missing values', { exact: true }).selectOption('remove')
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'Review & apply changes' }).click()
  await expect(metric(page, 'Total rows')).toHaveText('3')
  page.once('dialog', async (dialog) => { expect(dialog.message()).toContain('2 rows removed'); await dialog.accept() })
  await page.getByRole('button', { name: 'Review & apply changes' }).click()
  await expect(metric(page, 'Total rows')).toHaveText('1')
})

test('replacement confirms, invalid files keep working data, and all import limits are enforced', async ({ page }) => {
  await upload(page)
  const errors = [
    ['bad.csv', 'a,b\nx"y,z', /quotes/],
    ['bad.csv', 'a,b\n1', /record 2 has 1 fields/],
    ['empty.csv', '', /empty/],
    ['invalid.csv', Buffer.from([0xc3, 0x28]), /UTF-8/],
    ['large.csv', Buffer.alloc(CSV_LIMITS.bytes + 1, 120), /25 MB.*smaller sample/],
    ['rows.csv', 'a\n' + 'x\n'.repeat(CSV_LIMITS.rows + 1), /limit/],
    ['columns.csv', Array.from({ length: 201 }, (_, index) => `c${index}`).join(','), /limit/],
    ['cells.csv', Array.from({ length: 200 }, (_, index) => `c${index}`).join(',') + '\n' + (','.repeat(199) + '\n').repeat(CSV_LIMITS.cells / 200 + 1), /limit/],
    ['wrong.xlsx', 'a\nb', /\.csv/],
  ]
  for (const [name, content, message] of errors) {
    await upload(page, content, name)
    await expect(page.getByRole('alert')).toContainText(message)
    await expect(metric(page, 'Total rows')).toHaveText('3')
  }
  page.once('dialog', (dialog) => dialog.dismiss())
  await upload(page, 'new\nvalue', 'replacement.csv')
  await expect(metric(page, 'Total rows')).toHaveText('3')
  page.once('dialog', (dialog) => dialog.accept())
  await upload(page, 'new\nvalue', 'replacement.csv')
  await expect(metric(page, 'Total rows')).toHaveText('1')
  await expect(page.getByRole('region', { name: 'CSV data table' })).toContainText('value')
})

test('protected and raw exports require informed confirmation and log their serialization options', async ({ page }) => {
  const data = { columns: ['=header'], rows: [{ id: 1, values: ['=1+1'] }] }
  await upload(page, toCsv(data, { protectFormulas: false }))
  const checkbox = page.getByRole('checkbox', { name: 'Reduce spreadsheet formula risks' })
  await expect(checkbox).toBeChecked()
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'Export current CSV' }).click()
  await expect(page.getByText('CSV download requested · version 1', { exact: true })).toHaveCount(0)
  page.once('dialog', async (dialog) => { expect(dialog.message()).toContain('prefix 2'); await dialog.accept() })
  const safe = await downloadText(page, () => page.getByRole('button', { name: 'Export current CSV' }).click())
  expect(safe.filename).toContain('_protected.csv')
  expect(parseCsv(safe.text).rows[0].values[0]).toBe("'=1+1")
  await checkbox.uncheck()
  page.once('dialog', async (dialog) => { expect(dialog.message()).toContain('without formula protection'); await dialog.accept() })
  const raw = await downloadText(page, () => page.getByRole('button', { name: 'Export current CSV' }).click())
  expect(parseCsv(raw.text)).toEqual(data)
  const log = JSON.parse((await downloadText(page, () => page.getByRole('button', { name: 'Download change log' }).click())).text)
  const exports = log.events.filter((event) => event.format === 'csv')
  expect(exports.map((event) => event.escapedCells)).toEqual([2, 0])
  expect(log.events.filter((event) => event.type === 'apply')).toHaveLength(0)
  await expect(page.getByRole('region', { name: 'CSV data table' })).toContainText('=1+1')
})

test('CSV content is rendered as text and is neither logged nor sent over the network', async ({ page }) => {
  const marker = 'PRIVATE_CSV_AUDIT_MARKER_7c91'
  const messages = []
  const requests = []
  const errors = []
  page.on('console', (message) => messages.push(message.text()))
  page.on('request', (request) => requests.push({ url: request.url(), method: request.method(), body: request.postData() }))
  page.on('pageerror', (error) => errors.push(error.message))
  await upload(page, `name,content\n${marker},"<img src='https://example.invalid/${marker}' onerror='window.csvExecuted=true'>"`)
  await expect(page.getByRole('region', { name: 'CSV data table' })).toContainText(marker)
  expect(await page.evaluate(() => window.csvExecuted)).toBeUndefined()
  await page.getByRole('checkbox', { name: /Trim whitespace/ }).check()
  await page.getByRole('button', { name: 'Reports', exact: true }).click()
  await downloadText(page, () => page.getByRole('button', { name: 'Download change log' }).click())
  expect(messages.some((message) => message.includes(marker))).toBe(false)
  expect(requests.some((request) => request.url.includes(marker) || request.body?.includes(marker))).toBe(false)
  expect(requests.filter((request) => request.method !== 'GET')).toEqual([])
  expect(requests.filter((request) => !request.url.startsWith('http://127.0.0.1:4173/'))).toEqual([])
  expect(errors).toEqual([])
})

test('pagination and settings work on applied data; blank rows and UTF-8 remain visible', async ({ page }) => {
  await upload(page, 'Name,City\r\n' + Array.from({ length: 12 }, (_, index) => `person${index},\u6771\u4eac`).join('\r\n'))
  await expect(page.getByRole('region', { name: 'CSV data table' }).getByRole('row')).toHaveCount(11)
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(page.getByRole('region', { name: 'CSV data table' })).toContainText('person10')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByLabel('Preview rows per page').selectOption('5')
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
  await expect(page.getByRole('region', { name: 'CSV data table' }).getByRole('row')).toHaveCount(6)
  await expect(page.getByRole('region', { name: 'CSV data table' })).toContainText('\u6771\u4eac')
  page.once('dialog', (dialog) => dialog.accept())
  await upload(page, 'Name,City\r\n\r\n\u0646\u0627\u0645,\u6771\u4eac')
  await expect(metric(page, 'Total rows')).toHaveText('2')
  await expect(metric(page, 'Missing cells')).toHaveText('2')
})

test('drag-and-drop is supported and multiple dropped files show a useful error', async ({ page }) => {
  const zone = page.locator('[aria-busy]')
  async function drop(count) {
    const dataTransfer = await page.evaluateHandle(({ text, count }) => {
      const transfer = new DataTransfer()
      for (let index = 0; index < count; index += 1) transfer.items.add(new File([text], `sample${index}.csv`, { type: 'text/csv' }))
      return transfer
    }, { text: sample, count })
    await zone.dispatchEvent('drop', { dataTransfer })
    await dataTransfer.dispose()
  }
  await drop(2)
  await expect(page.getByRole('alert')).toContainText('exactly one CSV')
  await drop(1)
  await expect(metric(page, 'Total rows')).toHaveText('3')
})

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`layout at ${width}px has no page overflow with empty and uploaded data`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    expect(await fits()).toBe(true)
    await upload(page, `${'longheader'.repeat(25)},value\nx,${'longvalue'.repeat(25)}`)
    await expect(metric(page, 'Total rows')).toHaveText('1')
    expect(await fits()).toBe(true)
    await expect(page.getByRole('button', { name: 'Browse files', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Choose another file' })).toBeVisible()
    if (width === 320 || width === 1440) {
      await page.screenshot({ path: test.info().outputPath('workspace.png'), fullPage: true })
    }
  })
}

test('mobile navigation and cleaning controls are keyboard operable with visible focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main-content')).toBeFocused()
  const toggle = page.getByRole('button', { name: 'Open navigation' })
  await toggle.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Close navigation' })).toHaveAttribute('aria-expanded', 'true')
  const settings = page.getByRole('button', { name: 'Settings', exact: true })
  await settings.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Workspace settings' })).toBeVisible()
  await expect(page.locator('#main-content')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Preview rows per page')).toBeFocused()
  expect(await page.getByLabel('Preview rows per page').evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none')
})

test('desktop sidebar remains usable on short screens', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 })
  const footer = page.getByText('Local workspace', { exact: true })
  await footer.scrollIntoViewIfNeeded()
  await expect(footer).toBeInViewport()
})

test('file picker and cleaning can be operated with the keyboard', async ({ page }) => {
  const pendingChooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Browse files', exact: true }).focus()
  await page.keyboard.press('Enter')
  const chooser = await pendingChooser
  await chooser.setFiles({ name: 'keyboard.csv', mimeType: 'text/csv', buffer: Buffer.from(sample) })
  await expect(metric(page, 'Total rows')).toHaveText('3')
  const trim = page.getByRole('checkbox', { name: /Trim whitespace/ })
  await trim.focus()
  await page.keyboard.press('Space')
  await expect(trim).toBeChecked()
  const missing = page.getByLabel('Missing values', { exact: true })
  await missing.focus()
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(missing).toHaveValue('fill')
  await page.getByLabel('Replacement value').focus()
  await page.keyboard.type('Unknown')
  const apply = page.getByRole('button', { name: 'Review & apply changes' })
  await expect(apply).toBeEnabled()
  await apply.focus()
  page.once('dialog', (dialog) => dialog.accept())
  await page.keyboard.press('Enter')
  await expect(metric(page, 'Missing cells')).toHaveText('0')
  await expect(metric(page, 'Total rows')).toHaveText('3')
})

for (const width of [390, 1440]) {
  test(`automated accessibility checks at ${width}px for empty, loaded and navigated screens`, async ({ page }) => {
    test.setTimeout(60000)
    await page.setViewportSize({ width, height: 900 })
    async function check() {
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      expect(results.violations.map((violation) => ({
        id: violation.id,
        nodes: violation.nodes.map((node) => ({ target: node.target, failureSummary: node.failureSummary })),
      }))).toEqual([])
    }
    await check()
    await upload(page)
    await expect(metric(page, 'Total rows')).toHaveText('3')
    await check()
    await page.getByRole('checkbox', { name: /Trim whitespace/ }).check()
    await page.getByLabel('Missing values', { exact: true }).selectOption('fill')
    await check()
    for (const name of ['Reports', 'Settings', 'Data Cleaning']) {
      const link = page.getByRole('button', { name, exact: true })
      if (!(await link.isVisible())) await page.getByRole('button', { name: 'Open navigation' }).click()
      await link.click()
      await check()
    }
  })
}
