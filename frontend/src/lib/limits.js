// Feature-branch beta profile verified in tests/benchmarks/results.json.
// Production/main is unchanged. 50 MiB remains a benchmark-only experiment.
export const CSV_LIMITS = Object.freeze({ bytes: 25 * 1024 * 1024, rows: 100000, columns: 200, cells: 1000000 })
export const RESOURCE_LIMITS = Object.freeze({
  chunkBytes: 256 * 1024,
  previewCharacters: 500,
  previewCells: 1000,
  proposalChanges: 250000,
  proposalBytes: 32 * 1024 * 1024,
  historyBytes: 64 * 1024 * 1024,
  textUnits: 32 * 1024 * 1024,
  exportBytes: 128 * 1024 * 1024,
})

export function shapeLimitMessage(limits = CSV_LIMITS) {
  return `This dataset exceeds the browser workspace limit: ${limits.rows.toLocaleString('en-US')} rows, ${limits.columns} columns, or ${limits.cells.toLocaleString('en-US')} cells. Choose a smaller CSV.`
}

export function validateFile(file, limits = CSV_LIMITS) {
  if (!file) throw new Error('Choose or drop exactly one CSV file.')
  if (!/\.csv$/i.test(file.name)) throw new Error('Please choose a .csv file. Other formats are not supported.')
  if (file.size > limits.bytes) {
    throw new Error(`This file exceeds the ${limits.bytes / 1024 / 1024} MB upload limit for this browser workspace. To try a smaller sample, keep the header row and fewer complete data records, then export a smaller UTF-8 CSV. ${shapeLimitMessage(limits)} Your original file is unchanged.`)
  }
}
