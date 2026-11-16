import { CaseSensitive, CopyMinus, Info, Scissors, SlidersHorizontal, Sparkles } from 'lucide-react'

const optionsList = [
  { key: 'trim', label: 'Trim whitespace', description: 'Remove spaces at the start and end of cells.', icon: Scissors },
  { key: 'deduplicate', label: 'Remove exact duplicates', description: 'Keep the first identical row after other steps.', icon: CopyMinus },
  { key: 'standardize', label: 'Standardize column names', description: 'Use unique, lowercase snake_case names.', icon: CaseSensitive },
]

export default function CleaningPanel({ options, onChange, disabled, proposal, reviewed, hasSelections, onPreview, onApply }) {
  const update = (key, value) => onChange({ ...options, [key]: value })
  const invalidFill = options.missing === 'fill' && !options.fillValue.trim()

  return (
    <section className="surface flex h-full flex-col p-5 sm:p-6" aria-labelledby="cleaning-title">
      <div className="mb-1 flex items-center gap-2">
        <SlidersHorizontal size={17} className="text-slate-500" />
        <h2 id="cleaning-title" className="section-title">Cleaning options</h2>
      </div>
      <p className="mt-1 text-xs text-slate-500">A little tidying goes a long way.</p>
      <fieldset disabled={disabled} className="mt-5 flex-1 disabled:opacity-50">
        <legend className="sr-only">Choose proposed cleaning operations</legend>
        <div className="divide-y divide-slate-100">
          {optionsList.map(({ key, label, description, icon: Icon }) => (
            <label key={key} className="flex cursor-pointer items-start gap-3 py-4 first:pt-0">
              <span className="mt-0.5 text-slate-500"><Icon size={17} strokeWidth={1.7} /></span>
              <span className="flex-1">
                <span className="block text-xs font-semibold text-slate-700">{label}</span>
                <span className="mt-1 block text-[11px] leading-relaxed text-slate-500">{description}</span>
              </span>
              <input type="checkbox" checked={options[key]} onChange={(event) => update(key, event.target.checked)} className="mt-0.5 size-4 accent-indigo-600" />
            </label>
          ))}
        </div>
        <div className="border-t border-slate-100 pt-4">
          <label htmlFor="missing-strategy" className="text-xs font-semibold text-slate-700">Missing values</label>
          <select id="missing-strategy" className="form-input mt-2" value={options.missing} onChange={(event) => update('missing', event.target.value)}>
            <option value="keep">Keep as-is (recommended default)</option>
            <option value="fill">Fill with a value I choose</option>
            <option value="remove">Remove rows with missing values</option>
          </select>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            Empty and whitespace-only cells count as missing. No values are inferred.
          </p>
          {options.missing === 'fill' && (
            <div className="mt-3">
              <label htmlFor="fill-value" className="text-xs text-slate-600">Replacement value</label>
              <input
                id="fill-value"
                className="form-input mt-1"
                placeholder="e.g. Not provided"
                value={options.fillValue}
                onChange={(event) => update('fillValue', event.target.value)}
                aria-invalid={invalidFill}
                aria-describedby="fill-help"
              />
              <p id="fill-help" className="mt-1.5 text-[11px] text-slate-500">
                {invalidFill ? 'Enter a non-empty value to enable this operation.' : 'This exact text will replace each missing cell.'}
              </p>
            </div>
          )}
          {options.missing === 'remove' && (
            <p className="mt-2 text-xs text-amber-700">
              Entire rows containing any missing cell will be removed. Review and confirm before applying.
            </p>
          )}
        </div>
      </fieldset>
      <div className="mt-5 flex gap-2 rounded-lg bg-indigo-50/70 p-3">
        <Info size={14} className="mt-0.5 shrink-0 text-indigo-500" />
        <p className="text-[11px] leading-relaxed text-indigo-800">
          {disabled
            ? 'Upload a CSV to enable cleaning. Your original file will always stay untouched.'
            : 'Choose options, preview their impact, then acknowledge your review before applying. Current data changes only after confirmation.'}
        </p>
      </div>
      <button className="primary-button mt-4 w-full justify-center" disabled={disabled || invalidFill || !hasSelections} onClick={onPreview}>
        <Sparkles size={15} />Preview changes
      </button>
      <button className="secondary-button mt-2 w-full justify-center" aria-describedby="apply-help" disabled={disabled || invalidFill || !proposal?.changeCount || !reviewed} onClick={onApply}>
        Apply changes
      </button>
      <p id="apply-help" className="mt-2 text-[11px] leading-relaxed text-slate-500">Review the before-and-after preview and acknowledge it to enable Apply changes. Confirmation is required.</p>
    </section>
  )
}
