import { useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronRight, Download, Info, ShieldCheck, X } from 'lucide-react'
import Sidebar from './components/Sidebar'
import UploadPanel from './components/UploadPanel'
import Metrics from './components/Metrics'
import DatasetTable from './components/DatasetTable'
import CleaningPanel from './components/CleaningPanel'
import ChangePreview from './components/ChangePreview'
import ActivityLog from './components/ActivityLog'
import ExportPanel from './components/ExportPanel'
import SettingsPanel from './components/SettingsPanel'
import WorkflowSteps from './components/WorkflowSteps'
import { buildProposal, createChangeLog, DEFAULT_OPTIONS, downloadFile, getFormulaRiskCount, getMetrics, readCsvFile, toCsv } from './lib/csv'

const pages = {
  dashboard: { title: 'Workspace overview', description: 'Good data starts with a clean slate. Let’s get yours ready.' },
  cleaning: { title: 'Data cleaning', description: 'Make thoughtful changes, one clean dataset at a time.' },
  reports: { title: 'Session reports', description: 'A transparent record of what changed and when.' },
  settings: { title: 'Workspace settings', description: 'A small workspace. A few useful preferences.' },
}

function createEntry(type, message, details, extra = {}) {
  return { id: crypto.randomUUID(), time: new Date().toISOString(), type, message, details, ...extra }
}

export default function App() {
  const [active, setActive] = useState('dashboard')
  const [file, setFile] = useState(null)
  const [original, setOriginal] = useState(null)
  const [dataset, setDataset] = useState(null)
  const [options, setOptions] = useState({ ...DEFAULT_OPTIONS })
  const [entries, setEntries] = useState([])
  const [version, setVersion] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [pageSize, setPageSize] = useState(10)
  const [protectFormulas, setProtectFormulas] = useState(true)
  const loadingRef = useRef(false)
  const metrics = useMemo(() => getMetrics(dataset), [dataset])
  const proposal = useMemo(() => buildProposal(dataset, options), [dataset, options])
  const formulaRisks = useMemo(() => getFormulaRiskCount(dataset), [dataset])
  const busy = loading || !dataset
  const page = pages[active]
  const basename = file?.name.replace(/\.csv$/i, '') || 'dataset'

  async function importFile(selected) {
    if (loadingRef.current) return
    setError('')
    setNotice('')
    loadingRef.current = true
    setLoading(true)
    try {
      const parsed = await readCsvFile(selected)
      if (dataset && !window.confirm('Replace the current workspace with this file? Current applied changes, pending selections, and session history will be cleared. Your original files will stay untouched. Export anything you want to keep first.')) return
      setOriginal(parsed)
      setDataset(parsed)
      setFile({ name: selected.name, size: selected.size, lastModified: selected.lastModified })
      setOptions({ ...DEFAULT_OPTIONS })
      setVersion(1)
      setEntries([createEntry('import', `Imported ${selected.name}`, `${parsed.rows.length.toLocaleString()} rows · ${parsed.columns.length} columns · Read locally; original file unchanged.`)])
      setNotice('CSV imported locally. No cleaning operations have been applied.')
    } catch (cause) {
      setError(cause.message || 'The file could not be read. Please choose it again.')
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }

  function applyChanges() {
    if (busy || !proposal?.changes.length || (options.missing === 'fill' && !options.fillValue.trim())) return
    const { summary, changes } = proposal
    const removed = summary.missingRows + summary.duplicates
    const description = `${summary.trimmed} cells trimmed; ${summary.renamed} columns renamed; ${summary.filled} missing cells filled; ${removed} rows removed (${summary.missingRows} with missing values, ${summary.duplicates} duplicates).`
    if (!window.confirm(`Apply these proposed changes to your working copy?\n\n${description}\n\nThis replaces the current working version. The original upload stays available and unchanged.`)) return
    setDataset(proposal.dataset)
    setVersion((value) => value + 1)
    setEntries((current) => [...current, createEntry('apply', `Applied cleaning · version ${version + 1}`, description, { fromVersion: version, toVersion: version + 1, options: { ...options }, summary, changes })])
    setOptions({ ...DEFAULT_OPTIONS })
    setNotice(`Changes applied to version ${version + 1}. Your original upload is preserved.`)
  }

  function resetData() {
    if (busy || version === 1) return
    if (!window.confirm('Restore the original uploaded data? This replaces your current working copy and clears pending selections. Applied changes remain recorded in the session log.')) return
    setDataset(original)
    setOptions({ ...DEFAULT_OPTIONS })
    setVersion((value) => value + 1)
    setEntries((current) => [...current, createEntry('reset', `Restored original upload · version ${version + 1}`, 'Working data restored. Previous applied changes remain in this log.', { fromVersion: version, toVersion: version + 1 })])
    setNotice('Original data restored in the working copy.')
  }

  function exportCsv() {
    if (busy) return
    if (formulaRisks && !window.confirm(protectFormulas
      ? `Formula protection will prefix ${formulaRisks} potentially risky headers or cells with an apostrophe in the download. This changes exported text, including negative numeric strings, but does not change your working data or original file. No CSV protection works in every spreadsheet. Continue?`
      : `Export without formula protection? ${formulaRisks} headers or cells may be interpreted as spreadsheet formulas. Do not open an untrusted raw export in a spreadsheet. Your working data and original file remain unchanged. Continue?`)) return
    try {
      downloadFile(toCsv(dataset, { protectFormulas }), `${basename}_v${version}${protectFormulas && formulaRisks ? '_protected' : ''}.csv`, 'text/csv;charset=utf-8')
      setEntries((current) => [...current, createEntry('export', `CSV download requested · version ${version}`, `${dataset.rows.length.toLocaleString()} rows. Pending proposals excluded. ${protectFormulas ? `${formulaRisks} formula-risk values prefixed for export.` : 'Raw values exported without formula protection.'}`, { version, format: 'csv', protectFormulas, formulaRiskCells: formulaRisks, escapedCells: protectFormulas ? formulaRisks : 0 })])
      setNotice(`CSV download requested for applied version ${version}. Pending changes are excluded.`)
    } catch { setError('The CSV download could not be started. Please try again.') }
  }

  function exportLog() {
    if (busy) return
    try {
      const entry = createEntry('export', 'Change log download requested', 'Includes session events and full applied cell and row changes; excludes pending proposals.')
      const logEntries = [...entries, entry]
      const log = createChangeLog({ file, version, dataset, entries: logEntries, exportedAt: entry.time })
      downloadFile(JSON.stringify(log, null, 2), `${basename}_change-log.json`, 'application/json;charset=utf-8')
      setEntries(logEntries)
      setNotice('Change log download requested. It contains applied changes and session events.')
    } catch { setError('The change log download could not be started. Please try again.') }
  }

  const exportProps = {
    disabled: busy,
    version,
    hasProposals: !!proposal?.changes.length,
    onCsv: exportCsv,
    onLog: exportLog,
    onReset: resetData,
    protectFormulas,
    onProtectFormulasChange: setProtectFormulas,
    formulaRisks,
  }

  function navigate(nextPage) {
    setActive(nextPage)
    requestAnimationFrame(() => document.getElementById('main-content')?.focus())
  }

  return (
    <div className="min-h-screen bg-[#f7f8fc] font-sans text-slate-700">
      <a href="#main-content" className="sr-only fixed top-3 left-3 z-50 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white focus:not-sr-only">
        Skip to main content
      </a>
      <Sidebar active={active} onNavigate={navigate} />
      <div className="lg:ml-60">
        <header className="flex min-h-17 items-center justify-between gap-4 border-b border-slate-200 bg-white/90 px-5 sm:px-8 xl:px-10">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Workspace</span><ChevronRight size={13} />
            <span className="font-medium text-slate-700">
              {{ dashboard: 'Dashboard', cleaning: 'Data Cleaning', reports: 'Reports', settings: 'Settings' }[active]}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50/60 px-2.5 py-1 text-[10px] font-medium text-emerald-700">
              <span className="size-1.5 rounded-full bg-emerald-500" />Browser only
            </span>
            <span className="hidden text-[11px] text-slate-500 sm:inline">No account needed</span>
          </div>
        </header>
        <main id="main-content" className="mx-auto max-w-[1480px] px-5 py-7 sm:px-8 sm:py-9 xl:px-10" tabIndex={-1}>
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold tracking-[0.15em] text-indigo-600">
                <span className="h-px w-5 bg-indigo-300" /> LESS MESS. MORE CLARITY.
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-[28px]">{page.title}</h1>
              <p className="mt-2 text-xs leading-relaxed text-slate-500 sm:text-sm">{page.description}</p>
            </div>
            <button className="secondary-button" disabled={busy} onClick={exportCsv}>
              <Download size={15} />Export current CSV
            </button>
          </div>
          {error && (
            <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <p className="flex-1">{error}</p>
              <button onClick={() => setError('')} aria-label="Dismiss error"><X size={16} /></button>
            </div>
          )}
          {notice && (
            <div role="status" className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs leading-relaxed text-emerald-800">
              <CheckCircle2 size={16} className="shrink-0" />
              <p className="flex-1">{notice}</p>
              <button onClick={() => setNotice('')} aria-label="Dismiss notification"><X size={14} /></button>
            </div>
          )}
          {(active === 'dashboard' || active === 'cleaning') && (
            <>
              <WorkflowSteps
                hasDataset={!!dataset}
                hasApplied={entries.some((entry) => entry.type === 'apply')}
                hasExported={entries.some((entry) => entry.type === 'export')}
              />
              <div className="mb-5 flex items-center justify-between gap-3">
                <h2 className="text-[13px] font-semibold text-slate-800">Dataset overview</h2>
                <span className="text-[11px] text-slate-500">
                  {dataset ? `Current applied data · v${version}` : 'Awaiting your first dataset'}
                </span>
              </div>
              <Metrics metrics={metrics} />
              <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
                <div className="min-w-0 space-y-6">
                  <UploadPanel onFile={importFile} loading={loading} file={file} />
                  <DatasetTable
                    key={entries.find((entry) => entry.type === 'import')?.id || 'empty'}
                    dataset={dataset}
                    original={original}
                    pageSize={pageSize}
                    version={version}
                  />
                  <ChangePreview proposal={proposal} metrics={metrics} />
                </div>
                <div className="min-w-0 space-y-6">
                  <CleaningPanel options={options} onChange={setOptions} disabled={busy} proposal={proposal} onApply={applyChanges} />
                  <ExportPanel {...exportProps} />
                  <div className="flex items-start gap-2 px-1 text-[11px] leading-relaxed text-slate-500">
                    <ShieldCheck size={15} className="mt-0.5 shrink-0" />
                    <p>All processing happens on your device. Closing or reloading this tab clears the workspace.</p>
                  </div>
                </div>
              </div>
              <div className="mt-6"><ActivityLog entries={entries} /></div>
            </>
          )}
          {active === 'reports' && (
            <div className="space-y-6">
              <Metrics metrics={metrics} />
              <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
                <ActivityLog entries={entries} />
                <ExportPanel {...exportProps} />
              </div>
              <div className="flex gap-2 text-xs text-slate-500">
                <Info size={15} className="shrink-0" />
                <p>The JSON change log contains exact before/after values for all applied changes. It may contain personal data from your CSV; store it with the same care as your dataset.</p>
              </div>
            </div>
          )}
          {active === 'settings' && <SettingsPanel pageSize={pageSize} onPageSizeChange={setPageSize} />}
          <footer className="mt-9 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5 text-[10px] text-slate-500">
            <p>Smart CSV Cleaner <span className="mx-1.5 text-slate-300">/</span> A clearer path from raw to ready.</p>
            <span className="flex items-center gap-1.5"><ShieldCheck size={12} /> Local processing. Original files preserved.</span>
          </footer>
        </main>
      </div>
    </div>
  )
}
