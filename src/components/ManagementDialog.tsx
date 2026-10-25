import { useEffect, useRef, type ReactNode } from 'react'

export function ManagementDialog({ title, busy = false, onClose, children }: {
  title: string; busy?: boolean; onClose: () => void; children: ReactNode
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current!
    element.showModal()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { element.close(); document.body.style.overflow = previous }
  }, [])
  return <dialog ref={dialog} aria-labelledby="management-dialog-title"
    className="m-auto p-0 w-[calc(100%-1.5rem)] max-w-5xl max-h-[90dvh] rounded-2xl shadow-xl backdrop:bg-black/50"
    onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <div className="flex flex-col max-h-[90dvh]">
      <header className="p-4 border-b flex items-center justify-between gap-3 shrink-0">
        <h2 id="management-dialog-title" className="text-xl font-bold">{title}</h2>
        <button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>ปิด</button>
      </header>
      <div className="p-4 overflow-y-auto min-h-0">{children}</div>
    </div>
  </dialog>
}
