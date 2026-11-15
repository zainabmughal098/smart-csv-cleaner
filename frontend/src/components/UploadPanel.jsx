import { CSV_LIMITS } from '../lib/limits.js'
import { FileSpreadsheet, FolderOpen, LockKeyhole, UploadCloud } from 'lucide-react'
import { useRef, useState } from 'react'

export default function UploadPanel({ onFile, loading, disabled = loading, file }) {
  const input = useRef(null)
  const [dragging, setDragging] = useState(false)
  return (
    <section className="surface p-5 sm:p-6" aria-labelledby="upload-title">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><h2 id="upload-title" className="section-title">Start with your dataset</h2><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-slate-500">CSV</span></div><span className="flex items-center gap-1.5 text-xs text-slate-500"><LockKeyhole size={12} /> Private by default</span></div>
      <div
        onDragOver={(event) => { event.preventDefault(); if (!disabled) setDragging(true) }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false) }}
        onDrop={(event) => { event.preventDefault(); setDragging(false); if (disabled) return; if (event.dataTransfer.files.length !== 1) { onFile(null); return } onFile(event.dataTransfer.files[0]) }}
        className={`flex flex-col items-center rounded-xl border border-dashed px-4 py-9 text-center transition-colors ${dragging ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-slate-50/40'}`}
        aria-busy={loading}
      >
        <span className="mb-4 flex size-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-indigo-600 shadow-sm"><UploadCloud size={24} strokeWidth={1.6} /></span>
        <p className="text-sm font-semibold text-slate-800">{loading ? 'Reading your CSV\u2026' : 'Drop your CSV file here'}</p>
        <p className="mt-1.5 text-xs text-slate-500">or choose a file from your computer</p>
        <input ref={input} aria-label="Choose CSV file" type="file" accept=".csv,text/csv" className="sr-only" tabIndex={-1} disabled={disabled} onChange={(event) => { const selected = event.target.files?.[0]; event.target.value = ''; if (selected) onFile(selected) }} />
        <button className="primary-button mt-5" onClick={() => input.current.click()} disabled={disabled}><FolderOpen size={15} />{file ? 'Choose another file' : 'Browse files'}</button>
        <p className="mt-4 text-[11px] text-slate-500">UTF-8 CSV &middot; Up to {CSV_LIMITS.bytes / 1024 / 1024} MB &middot; First record used as headers</p>
      </div>
      <div className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-slate-500"><FileSpreadsheet size={15} className="mt-0.5 shrink-0 text-slate-500" /><p>{file ? <><span className="font-medium text-slate-700 break-all">{file.name}</span> &middot; {(file.size / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KB &middot; Original file preserved</> : 'Quoted commas, multiline fields, and empty cells are supported. Blank records are preserved.'}</p></div>
    </section>
  )
}
