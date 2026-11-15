import { CSV_LIMITS } from '../lib/limits.js'
import { FileSpreadsheet, HardDrive, ShieldCheck, Sparkles } from 'lucide-react'

const workspaceDetails = [
  {
    icon: HardDrive,
    title: 'Explicit memory budgets',
    text: 'Proposals allow 250,000 detailed changes / 32 MiB of serialized change text. Session history is limited to 64 MiB; expanded text to 33,554,432 UTF-16 code units; each export to 128 MiB. Excess operations are rejected before applying. Complete logs and original data are retained. Progress is per phase; cancellation waits for the current batch.',
  },
  {
    icon: ShieldCheck,
    title: 'Private, browser-only processing',
    text: 'A dedicated local worker processes data. No CSV is uploaded and no backend or cloud storage is connected.',
  },
  {
    icon: HardDrive,
    title: 'A temporary local session',
    text: 'Data lives in a local worker; preferences and bounded previews live in React memory. Reloading or closing the tab clears them. Export your current CSV and log before leaving.',
  },
  {
    icon: FileSpreadsheet,
    title: 'Supported CSV format',
    text: `UTF-8 comma-delimited CSV with headers. Up to ${CSV_LIMITS.bytes / 1024 / 1024} MB, ${CSV_LIMITS.rows.toLocaleString()} rows, ${CSV_LIMITS.columns} columns and ${CSV_LIMITS.cells.toLocaleString()} cells. Quoted fields, blank records and mixed record endings are preserved. Strict quoting and UTF-8 validation apply.`,
  },
  {
    icon: Sparkles,
    title: 'Predictable cleaning',
    text: 'All values remain strings. Missing means empty or whitespace-only. Cleaning order: rename headers, trim cells, handle missing values, then remove exact duplicate rows. Nothing changes until you confirm.',
  },
]

export default function SettingsPanel({ pageSize, onPageSizeChange }) {
  return (
    <section className="surface max-w-3xl p-6 sm:p-8" aria-labelledby="preferences-title">
      <h2 id="preferences-title" className="section-title">Your workspace, your preferences</h2>
      <div className="mt-6 border-t border-slate-100 pt-6">
        <label htmlFor="page-size" className="text-sm font-medium text-slate-700">Preview rows per page</label>
        <p className="mt-1 text-xs text-slate-500">Applies to both dataset previews, capped at 1,000 visible cells and 500 characters per cell/header.</p>
        <select id="page-size" className="form-input mt-3 max-w-48" value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
          {[5, 10, 25, 50].map((size) => <option key={size} value={size}>{size} rows</option>)}
        </select>
      </div>
      <div className="mt-6 space-y-5 border-t border-slate-100 pt-6">
        {workspaceDetails.map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex items-start gap-3">
            <Icon size={18} className="mt-0.5 shrink-0 text-indigo-500" />
            <div>
              <h3 className="text-xs font-semibold text-slate-700">{title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{text}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
