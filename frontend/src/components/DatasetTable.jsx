import { ChevronLeft, ChevronRight, FileSpreadsheet, Table2 } from 'lucide-react'
import { useState } from 'react'

function CellValue({ value }) {
  if (value.trim() !== '') return value
  return (
    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
      {value === '' ? 'empty' : 'whitespace'}
    </span>
  )
}

export default function DatasetTable({ dataset, original, pageSize, version }) {
  const [page, setPage] = useState(0)
  const [mode, setMode] = useState('current')
  const selected = mode === 'original' ? original : dataset
  const pages = Math.max(1, Math.ceil((selected?.rows.length ?? 0) / pageSize))
  const safePage = Math.min(page, pages - 1)
  const start = safePage * pageSize

  function selectVersion(value) {
    setMode(value)
    setPage(0)
  }

  return (
    <section className="surface overflow-hidden" aria-labelledby="dataset-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Table2 size={17} className="text-slate-500" />
          <h2 id="dataset-title" className="section-title">Dataset preview</h2>
          {dataset && <span className="badge">v{version}</span>}
        </div>
        <div className="flex rounded-lg bg-slate-100 p-1" role="group" aria-label="Dataset version">
          {['current', 'original'].map((value) => (
            <button
              key={value}
              disabled={!dataset}
              aria-pressed={mode === value}
              onClick={() => selectVersion(value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${mode === value ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
            >
              {value === 'current' ? 'Current data' : 'Original upload'}
            </button>
          ))}
        </div>
      </div>
      {!selected ? (
        <div className="flex min-h-60 flex-col items-center justify-center px-6 py-10 text-center">
          <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-slate-50 text-slate-300">
            <FileSpreadsheet size={24} strokeWidth={1.5} />
          </span>
          <h3 className="text-sm font-medium text-slate-700">Your data, at a glance</h3>
          <p className="mt-2 max-w-xs text-xs leading-relaxed text-slate-500">
            Upload a CSV to explore its rows, spot missing values, and plan your next steps.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="CSV data table">
            <table className="w-full border-collapse text-left text-xs">
              <caption className="sr-only">
                {mode === 'original' ? 'Original uploaded data' : `Current applied data, version ${version}`}.
                Row IDs refer to the original data records, excluding the header.
                Empty or whitespace-only values count as missing.
              </caption>
              <thead>
                <tr className="bg-slate-50/80">
                  <th scope="col" className="table-header w-20">Source row</th>
                  {selected.columns.map((column, index) => (
                    <th key={index} scope="col" className="table-header whitespace-pre-wrap">
                      {column || <span className="italic">Unnamed {index + 1}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selected.rows.slice(start, start + pageSize).map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                    <th scope="row" className="table-cell font-normal text-slate-500 tabular-nums">{row.id}</th>
                    {row.values.map((value, index) => (
                      <td key={index} className="table-cell min-w-32 max-w-80 whitespace-pre-wrap break-words">
                        <CellValue value={value} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {selected.rows.length === 0 && (
              <p className="p-10 text-center text-xs text-slate-500">This dataset has headers but no data rows.</p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 text-xs text-slate-500 sm:px-6">
            <p>
              {selected.rows.length ? `${start + 1}–${Math.min(start + pageSize, selected.rows.length)} of ${selected.rows.length.toLocaleString()} rows` : '0 rows'}
              <span className="ml-2 text-slate-500">· {mode === 'original' ? 'Original upload' : `Applied version ${version}`}</span>
            </p>
            <div className="flex items-center gap-2">
              <button className="icon-button" aria-label="Previous page" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                <ChevronLeft size={16} />
              </button>
              <span className="px-1 tabular-nums" aria-live="polite">{safePage + 1} / {pages}</span>
              <button className="icon-button" aria-label="Next page" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
