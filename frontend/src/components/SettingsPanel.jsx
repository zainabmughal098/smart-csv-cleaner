import { FileSpreadsheet, HardDrive, ShieldCheck, Sparkles } from 'lucide-react'

const workspaceDetails = [
  {
    icon: ShieldCheck,
    title: 'Private, browser-only processing',
    text: 'No CSV is uploaded to a server. There is no backend or cloud storage connected.',
  },
  {
    icon: HardDrive,
    title: 'A temporary local session',
    text: 'Data and preferences live in memory. Reloading or closing the tab clears them. Export your current CSV and log before leaving.',
  },
  {
    icon: FileSpreadsheet,
    title: 'Supported CSV format',
    text: 'UTF-8, comma-delimited CSV with a header record. Up to 5 MB, 25,000 data rows, 200 columns, and 250,000 cells. Blank records are kept. Inconsistent field counts and invalid quotes are rejected.',
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
        <p className="mt-1 text-xs text-slate-500">Applies to both the current and original dataset previews.</p>
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
