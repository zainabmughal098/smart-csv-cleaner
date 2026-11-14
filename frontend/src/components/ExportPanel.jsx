import { ArrowDownToLine, Download, FileJson, FileSpreadsheet, RotateCcw } from 'lucide-react'

export default function ExportPanel({ disabled, version, hasProposals, onCsv, onLog, onReset, protectFormulas, onProtectFormulasChange, formulaRisks }) {
  return (
    <section className="surface p-5 sm:p-6" aria-labelledby="export-title">
      <div className="flex items-center gap-2">
        <ArrowDownToLine size={17} className="text-slate-500" />
        <h2 id="export-title" className="section-title">Ready when you are</h2>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        Export your current applied data and a record of your changes.
      </p>
      <label className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-slate-600">
        <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-indigo-600" disabled={disabled} checked={protectFormulas} onChange={(event) => onProtectFormulasChange(event.target.checked)} />
        <span>Reduce spreadsheet formula risks</span>
      </label>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        Prefixes risky headers and cells with an apostrophe in the download only. This changes exported text. No CSV protection is universal.
        {!disabled && ` ${formulaRisks} potentially risky values in current data.`}
      </p>
      <button className="secondary-button mt-5 w-full justify-between" disabled={disabled} onClick={onCsv}>
        <span className="flex items-center gap-2"><FileSpreadsheet size={15} />Download CSV</span>
        <Download size={14} />
      </button>
      <button className="secondary-button mt-2 w-full justify-between" disabled={disabled} onClick={onLog}>
        <span className="flex items-center gap-2"><FileJson size={15} />Download change log</span>
        <Download size={14} />
      </button>
      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
        {disabled
          ? 'Upload a dataset to enable exports.'
          : `Exports applied version ${version}. ${hasProposals ? 'Pending proposals are not included.' : 'Change log uses JSON format.'}`}
      </p>
      <button
        className="mt-5 flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-800 disabled:text-slate-300"
        disabled={disabled || version === 1}
        onClick={onReset}
      >
        <RotateCcw size={13} />Restore original data
      </button>
    </section>
  )
}
