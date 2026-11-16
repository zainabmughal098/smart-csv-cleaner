import { useState } from 'react'
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
import useCsvWorkspace from './hooks/useCsvWorkspace'

const pages = {
  dashboard: { title: 'Workspace overview', description: 'Good data starts with a clean slate. Let’s get yours ready.' },
  cleaning: { title: 'Data cleaning', description: 'Make thoughtful changes, one clean dataset at a time.' },
  reports: { title: 'Session reports', description: 'A transparent record of what changed and when.' },
  settings: { title: 'Workspace settings', description: 'A small workspace. A few useful preferences.' },
}

export default function App() {
  const [active, setActive] = useState('dashboard')
  const [pageSize, setPageSize] = useState(10)
  const { dataset, original, file, sessionId, hasApplied, hasExported, version, metrics, entries, eventCount, proposal, options, setOptions,
    error, setError, notice, setNotice, operation, importFile, applyChanges, loadPage,
    busy, loading, previewChanges, reviewed, onReview, appliedVersion, hasSelections, cancel, exportProps, exportCsv } = useCsvWorkspace()
  const page = pages[active]
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
          {operation && (
            <section className="surface mb-5 flex flex-wrap items-center gap-4 p-4" aria-label="Local CSV processing">
              <div className="min-w-0 flex-1">
                <p role="status" className="text-xs font-medium text-slate-700">{operation.phase}</p>
                <progress aria-label={operation.phase} className="mt-2 h-2 w-full accent-indigo-600" max={Math.max(operation.total ?? 1, 1)} value={operation.completed} />
                {operation.total !== undefined && <p className="mt-1 text-[11px] text-slate-500">{operation.completed.toLocaleString()} / {operation.total.toLocaleString()} in this phase</p>}
              </div>
              <button className="secondary-button" onClick={cancel} disabled={!operation.cancellable}>Cancel operation</button>
            </section>
          )}
          {(active === 'dashboard' || active === 'cleaning') && (
            <>
              <WorkflowSteps
                hasDataset={!!dataset}
                hasApplied={hasApplied}
                hasExported={hasExported}
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
                  <UploadPanel onFile={importFile} loading={loading} disabled={!!operation} file={file} />
                  <DatasetTable
                    key={sessionId || 'empty'}
                    dataset={dataset}
                    original={original}
                    pageSize={pageSize}
                    version={version}
                    loadPage={loadPage}
                  />
                  <ChangePreview proposal={proposal} metrics={metrics} reviewed={reviewed} onReview={onReview} disabled={busy} appliedVersion={appliedVersion} />
                </div>
                <div className="min-w-0 space-y-6">
                  <CleaningPanel options={options} onChange={setOptions} disabled={busy} proposal={proposal} reviewed={reviewed} hasSelections={hasSelections} onPreview={previewChanges} onApply={applyChanges} />
                  <ExportPanel {...exportProps} />
                  <div className="flex items-start gap-2 px-1 text-[11px] leading-relaxed text-slate-500">
                    <ShieldCheck size={15} className="mt-0.5 shrink-0" />
                    <p>All processing happens on your device. Closing or reloading this tab clears the workspace.</p>
                  </div>
                </div>
              </div>
              <div className="mt-6"><ActivityLog entries={entries} eventCount={eventCount} /></div>
            </>
          )}
          {active === 'reports' && (
            <div className="space-y-6">
              <Metrics metrics={metrics} />
              <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
                <ActivityLog entries={entries} eventCount={eventCount} />
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
