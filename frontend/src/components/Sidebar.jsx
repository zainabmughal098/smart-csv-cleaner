import { ArrowUpRight, ChartNoAxesCombined, ChevronDown, DatabaseZap, LayoutDashboard, Menu, Settings2, ShieldCheck, Sparkles, X } from 'lucide-react'
import { useState } from 'react'

const links = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'cleaning', label: 'Data Cleaning', icon: Sparkles },
  { id: 'reports', label: 'Reports', icon: ChartNoAxesCombined },
  { id: 'settings', label: 'Settings', icon: Settings2 },
]

export default function Sidebar({ active, onNavigate }) {
  const [open, setOpen] = useState(false)
  return (
    <aside className="border-b border-slate-200 bg-white lg:fixed lg:inset-y-0 lg:left-0 lg:z-20 lg:flex lg:w-60 lg:flex-col lg:overflow-y-auto lg:border-r lg:border-b-0">
      <div className="flex items-center justify-between px-6 py-6 lg:py-8">
        <a href="#main-content" onClick={() => onNavigate('dashboard')} className="flex items-center gap-3 text-slate-900">
          <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-200"><DatabaseZap size={23} /></span>
          <span className="text-[15px] leading-snug font-bold tracking-tight">Smart CSV<span className="block font-medium text-slate-500">Cleaner<span className="ml-1 text-indigo-500">.</span></span></span>
        </a>
        <button className="icon-button lg:hidden" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} aria-controls="sidebar-navigation" onClick={() => setOpen(!open)}>{open ? <X size={20} /> : <Menu size={20} />}</button>
      </div>
      <div id="sidebar-navigation" className={`${open ? 'block' : 'hidden'} px-4 pb-5 lg:flex lg:flex-1 lg:flex-col lg:pb-6`}>
        <div className="mx-1 mb-7 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-3">
          <span className="flex size-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600">P</span>
          <div className="flex-1"><p className="text-xs font-semibold text-slate-700">Personal workspace</p><p className="mt-0.5 text-[11px] text-slate-500">Local session</p></div>
          <ChevronDown size={14} className="text-slate-500" aria-hidden="true" />
        </div>
        <p className="mb-3 px-3 text-[10px] font-semibold tracking-[0.15em] text-slate-500">WORKSPACE</p>
        <nav aria-label="Main navigation" className="space-y-1">
          {links.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => { onNavigate(id); setOpen(false) }} aria-current={active === id ? 'page' : undefined} className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors ${active === id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}><Icon size={18} strokeWidth={1.8} /><span>{label}</span>{active === id && <span className="ml-auto size-1.5 rounded-full bg-indigo-600" />}</button>)}
        </nav>
        <div className="mt-10 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 lg:mt-auto">
          <ShieldCheck size={21} className="mb-3 text-indigo-600" /><p className="text-xs font-semibold text-slate-800">Your data stays yours.</p><p className="mt-2 text-xs leading-relaxed text-slate-500">Files are processed in this browser. No server uploads.</p>
          <button onClick={() => { onNavigate('settings'); setOpen(false) }} className="mt-3 flex items-center gap-1 text-xs font-semibold text-indigo-600">Workspace details <ArrowUpRight size={13} /></button>
        </div>
        <div className="mt-5 flex items-center gap-3 border-t border-slate-100 px-2 pt-5"><span className="flex size-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">LW</span><div><p className="text-xs font-semibold text-slate-700">Local workspace</p><p className="mt-0.5 text-[11px] text-slate-500">Frontend preview &middot; v1.0</p></div></div>
      </div>
    </aside>
  )
}
