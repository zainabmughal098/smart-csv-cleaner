import { Columns3, Copy, Rows3, ScanLine } from 'lucide-react'

const cards = [
  { key: 'rows', label: 'Total rows', detail: 'Data records, excluding headers', icon: Rows3, color: 'bg-indigo-50 text-indigo-600' },
  { key: 'columns', label: 'Columns', detail: 'Fields in your dataset', icon: Columns3, color: 'bg-sky-50 text-sky-600' },
  { key: 'missing', label: 'Missing cells', detail: 'Empty or whitespace-only cells', icon: ScanLine, color: 'bg-amber-50 text-amber-600' },
  { key: 'duplicates', label: 'Exact duplicate rows', detail: 'Repeated records beyond the first', icon: Copy, color: 'bg-violet-50 text-violet-600' },
]

export default function Metrics({ metrics }) {
  return <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 xl:grid-cols-4">{cards.map(({ key, label, detail, icon: Icon, color }) => <article key={key} className="surface p-5"><div className="flex items-center justify-between gap-2"><p className="text-xs font-medium text-slate-500">{label}</p><span className={`flex size-8 items-center justify-center rounded-lg ${color}`}><Icon size={16} strokeWidth={1.8} /></span></div><p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">{metrics ? metrics[key].toLocaleString() : <span className="text-slate-300">&mdash;</span>}</p><p className="mt-2 text-[11px] text-slate-500">{metrics ? detail : 'Available after upload'}</p></article>)}</div>
}
