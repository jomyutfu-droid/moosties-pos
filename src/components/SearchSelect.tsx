import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface SearchSelectOption { value: string; label: string }

/** A searchable picker shared by ingredient fields, including fields inside scrollable dialogs. */
export function SearchSelect({ value, onChange, options, label, placeholder = 'เลือกวัตถุดิบ', emptyLabel,
  required = false, disabled = false, className = '' }: {
  value: string; onChange: (value: string) => void; options: SearchSelectOption[]; label: string
  placeholder?: string; emptyLabel?: string; required?: boolean; disabled?: boolean; className?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const id = useId()
  const selected = options.find(option => option.value === value)
  const terms = query.normalize('NFC').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const matches = options.filter(option => {
    const name = option.label.normalize('NFC').toLocaleLowerCase()
    return terms.every(term => name.includes(term))
  })

  useEffect(() => {
    if (!open) return
    const button = trigger.current
    search.current?.focus()
    return () => { button?.focus() }
  }, [open])

  function show() { setQuery(''); setOpen(true) }
  function choose(next: string) { onChange(next); setOpen(false) }

  return <div className={`min-w-0 ${className}`}>
    <button ref={trigger} type="button" disabled={disabled} aria-label={label} aria-haspopup="dialog"
      aria-expanded={open} aria-controls={open ? `${id}-dialog` : undefined}
      onClick={show} className="input flex w-full items-center justify-between gap-2 text-left min-h-11">
      <span className={`min-w-0 break-words ${selected ? '' : 'text-gray-500'}`}>{selected?.label ?? (value ? 'ไม่พบรายการเดิม กรุณาเลือกใหม่' : emptyLabel ?? placeholder)}</span>
      <span aria-hidden="true" className="shrink-0 text-green-800">⌕</span>
    </button>
    {required && <select className="sr-only" tabIndex={-1} aria-hidden="true"
      required disabled={disabled} value={value} onChange={e => onChange(e.target.value)}
      onInvalid={e => {
        e.preventDefault()
        const firstInvalid = e.currentTarget.form?.querySelector(':invalid')
        if (!firstInvalid || firstInvalid === e.currentTarget) show()
      }}>
      <option value="">{placeholder}</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>}
    {open && createPortal(<div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-3"
      onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}>
      <section ref={panel} id={`${id}-dialog`} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90dvh] flex flex-col overflow-hidden"
        onKeyDown={e => {
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false) }
          if (e.key === 'Tab') {
            const controls = panel.current?.querySelectorAll<HTMLElement>('input, button:not(:disabled)')
            if (!controls?.length) return
            const first = controls[0], last = controls[controls.length - 1]
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
          }
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            const rows = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('[data-search-option]') ?? [])
            if (!rows.length) return
            e.preventDefault()
            const current = rows.findIndex(row => row === document.activeElement)
            const next = current < 0 ? (e.key === 'ArrowDown' ? 0 : rows.length - 1)
              : (current + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length
            rows[next].focus()
          }
        }}>
        <header className="p-4 border-b space-y-3">
          <div className="flex items-start justify-between gap-3"><h2 id={`${id}-title`} className="font-bold text-lg break-words">{label}</h2>
            <button type="button" className="btn-ghost shrink-0" onClick={() => setOpen(false)}>ปิด</button></div>
          <input ref={search} type="search" className="input" aria-label={`ค้นหา ${label}`} placeholder="พิมพ์ชื่อเพื่อค้นหา…"
            autoComplete="off" value={query} onChange={e => setQuery(e.target.value)} />
          <p role="status" className="text-xs text-gray-500">พบ {matches.length} รายการ</p>
        </header>
        <div className="overflow-y-auto overscroll-contain p-2 min-h-0">
          {emptyLabel !== undefined && <button type="button" data-search-option className="w-full text-left rounded-xl p-3 text-gray-600 hover:bg-gray-100 focus-visible:bg-gray-100"
            onClick={() => choose('')}>{emptyLabel}</button>}
          {matches.map(option => <button key={option.value} type="button" data-search-option aria-pressed={option.value === value}
            className={`w-full text-left rounded-xl p-3 min-h-12 break-words hover:bg-green-50 focus-visible:bg-green-50 ${option.value === value ? 'bg-green-100 text-green-950 font-semibold' : 'text-gray-900'}`}
            onClick={() => choose(option.value)}>{option.label}{option.value === value && <span aria-hidden="true"> ✓</span>}</button>)}
          {!matches.length && <p className="p-5 text-center text-gray-500 text-sm">ไม่พบรายการ ลองพิมพ์ชื่อบางส่วนใหม่</p>}
        </div>
      </section>
    </div>, document.body)}
  </div>
}
