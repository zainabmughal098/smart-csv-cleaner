import { ArrowRight, GitCompareArrows } from 'lucide-react'
import { memo } from 'react'

const labels = {
  'trim-cell': 'Trim cell',
  'fill-cell': 'Fill missing cell',
  'rename-column': 'Rename column',
  'remove-row': 'Remove row',
}
const metricLabels = [['rows', 'Rows'], ['missing', 'Missing cells'], ['duplicates', 'Exact duplicates']]

function Value({ value }) {
  const text = value === null ? 'Row removed' : value === '' ? '(empty)' : JSON.stringify(value)
  return <span className="font-mono text-[11px] whitespace-pre-wrap break-all">{text}</span>
}

function ChangePreview({ proposal, metrics }) {
  const after = proposal?.metrics ?? null
  const summaryItems = proposal ? {
    'Cells trimmed': proposal.summary.trimmed,
    'Columns renamed': proposal.summary.renamed,
    'Cells filled': proposal.summary.filled,
    'Rows removed': proposal.summary.missingRows + proposal.summary.duplicates,
  } : {}

  return (
    <section className="surface overflow-hidden" aria-labelledby="changes-title">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5 sm:px-6">
        <div className="flex items-center gap-2">
          <GitCompareArrows size={17} className="text-slate-500" />
          <h2 id="changes-title" className="section-title">Before & after</h2>
        </div>
        <span className="badge">Proposed · not applied</span>
      </div>
      <p className="mt-2 px-5 text-xs text-slate-500 sm:px-6">Review the impact before changing your working dataset.</p>
      {proposal ? (
        <div className="p-5 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-3">
            {metricLabels.map(([key, label]) => (
              <div key={key} className="rounded-lg border border-slate-200 px-4 py-3">
                <p className="text-[11px] text-slate-500">{label}</p>
                <div className="mt-2 flex items-center gap-3 text-lg font-semibold tabular-nums">
                  <span className="sr-only">Current:</span>
                  <span className="text-slate-500">{metrics[key].toLocaleString()}</span>
                  <ArrowRight size={14} className="text-slate-300" />
                  <span className="sr-only">Proposed:</span>
                  <span className={metrics[key] !== after[key] ? 'text-indigo-600' : 'text-slate-700'}>{after[key].toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
          {proposal.changeCount ? (
            <>
              <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                {Object.entries(summaryItems).map(([label, count]) => (
                  <span key={label}>{label}: <strong className="font-semibold text-slate-700">{count.toLocaleString()}</strong></span>
                ))}
              </div>
              <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Proposed changes">
                <table className="w-full text-left text-xs">
                  <caption className="sr-only">First eight proposed cleaning steps. Preview strings may be shortened; the exported applied log retains complete values.</caption>
                  <thead>
                    <tr>
                      <th scope="col" className="table-header">Proposed step</th>
                      <th scope="col" className="table-header">Before step</th>
                      <th scope="col" className="table-header">After step</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposal.changes.slice(0, 8).map((change, index) => (
                      <tr key={index} className="border-t border-slate-100">
                        <th scope="row" className="table-cell min-w-36 font-normal">
                          <span className="font-medium text-slate-700">{labels[change.kind]}</span>
                          <span className="mt-1 block text-[10px] text-slate-500">
                            {change.row ? `Source row ${change.row}` : 'Header'}
                            {change.column ? ` · column ${change.column}` : ''}
                            {change.reason ? ` · ${change.reason.replaceAll('-', ' ')}` : ''}
                          </span>
                        </th>
                        <td className="table-cell min-w-32 bg-rose-50/40 text-rose-800"><Value value={change.before} /></td>
                        <td className="table-cell min-w-32 bg-emerald-50/50 text-emerald-800"><Value value={change.after} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                Showing {Math.min(8, proposal.changeCount)} of {proposal.changeCount.toLocaleString()} proposed steps, in cleaning order.
                Preview strings are limited to 500 characters. Later steps may use earlier proposed values. All complete applied steps are included in the exported log.
              </p>
            </>
          ) : (
            <p className="mt-5 rounded-lg bg-slate-50 p-4 text-xs text-slate-500">
              No changes proposed. Select cleaning options to compare current and proposed values.
            </p>
          )}
        </div>
      ) : (
        <div className="flex min-h-40 flex-col items-center justify-center px-6 py-8 text-center">
          <GitCompareArrows size={25} className="mb-3 text-slate-300" />
          <p className="text-xs font-medium text-slate-600">See exactly what will change</p>
          <p className="mt-2 text-xs text-slate-500">Your before-and-after comparison will appear here.</p>
        </div>
      )}
    </section>
  )
}

export default memo(ChangePreview)
