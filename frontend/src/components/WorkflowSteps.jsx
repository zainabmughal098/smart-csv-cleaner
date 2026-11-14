import { ArrowRight, CheckCircle2 } from 'lucide-react'

export default function WorkflowSteps({ hasDataset, hasApplied, hasExported }) {
  const steps = [
    { number: '01', label: 'Upload dataset', ready: hasDataset },
    { number: '02', label: 'Review & clean', ready: hasApplied },
    { number: '03', label: 'Export your data', ready: hasExported },
  ]
  return (
    <ol aria-label="CSV cleaning workflow" className="mb-7 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-slate-200 bg-white px-5 py-3.5">
      {steps.map((step, index) => (
        <li key={step.number} className="flex items-center gap-3">
          <span className={`flex size-6 items-center justify-center rounded-full text-[10px] font-semibold ${step.ready ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
            {step.ready ? <CheckCircle2 size={12} /> : step.number}
          </span>
          <span className="text-xs font-medium text-slate-600">{step.label}</span>
          {step.ready && <span className="sr-only">Completed</span>}
          {index < 2 && <ArrowRight size={13} className="ml-1 hidden text-slate-300 sm:block" />}
        </li>
      ))}
    </ol>
  )
}
