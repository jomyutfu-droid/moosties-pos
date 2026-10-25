import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

/** Touch scrolling remains available on the card. Only this handle captures a drag. */
export function MenuReorderHandle({ id, name, categoryId, onMove, disabled }: {
  id: string; name: string; categoryId: string | null; onMove: (from: string, to: string) => void; disabled: boolean
}) {
  const drag = useRef<{ pointerId: number; timer: ReturnType<typeof setTimeout> | null; active: boolean; x: number; y: number; target: string | null; frame: number; cleanup: () => void } | null>(null)
  const [active, setActive] = useState(false)
  useEffect(() => () => drag.current?.cleanup(), [])

  function start(event: ReactPointerEvent<HTMLButtonElement>) {
    if (disabled || !event.isPrimary || event.button !== 0) return
    drag.current?.cleanup()
    const button = event.currentTarget
    button.setPointerCapture(event.pointerId)
    const state = { pointerId: event.pointerId, timer: null as ReturnType<typeof setTimeout> | null, active: false,
      x: event.clientX, y: event.clientY, target: null as string | null, frame: 0, cleanup: () => {} }
    let highlighted: HTMLElement | null = null
    function hit() {
      highlighted?.classList.remove('ring-2', 'ring-green-500')
      highlighted = document.elementsFromPoint(state.x, state.y)
        .map(el => el.closest<HTMLElement>('[data-menu-reorder-id]'))
        .find(el => el && el.dataset.menuCategory === (categoryId ?? '') && el.dataset.menuReorderId !== id) ?? null
      state.target = highlighted?.dataset.menuReorderId ?? null
      highlighted?.classList.add('ring-2', 'ring-green-500')
    }
    function scroll() {
      if (!state.active) return
      const edge = 90
      const delta = state.y < edge ? -12 : state.y > window.innerHeight - edge ? 12 : 0
      if (delta) { window.scrollBy(0, delta); hit() }
      state.frame = requestAnimationFrame(scroll)
    }
    function activate() { state.active = true; setActive(true); hit(); scroll() }
    function move(e: PointerEvent) {
      if (e.pointerId !== state.pointerId) return
      state.x = e.clientX; state.y = e.clientY
      if (state.active) { e.preventDefault(); hit() }
    }
    function finish(e: PointerEvent) {
      if (e.pointerId !== state.pointerId) return
      const target = state.target
      const shouldMove = state.active && e.type === 'pointerup' && target
      state.cleanup(); setActive(false)
      if (shouldMove) onMove(id, target!)
    }
    function escape(e: KeyboardEvent) { if (e.key === 'Escape') { state.cleanup(); setActive(false) } }
    state.cleanup = () => {
      if (state.timer) clearTimeout(state.timer)
      cancelAnimationFrame(state.frame)
      highlighted?.classList.remove('ring-2', 'ring-green-500')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      window.removeEventListener('keydown', escape)
      if (button.hasPointerCapture(state.pointerId)) button.releasePointerCapture(state.pointerId)
      drag.current = null
    }
    drag.current = state
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    window.addEventListener('keydown', escape)
    if (event.pointerType === 'mouse') activate()
    else state.timer = setTimeout(activate, 320)
  }
  return <button type="button" className={`btn-secondary min-h-11 cursor-grab select-none ${active ? 'bg-green-100 ring-2 ring-green-600 cursor-grabbing' : ''}`}
    style={{ touchAction: 'none' }} aria-label={`กดค้างแล้วลาก ${name}`} disabled={disabled}
    onPointerDown={start} onContextMenu={event => event.preventDefault()}>
    {active ? 'ปล่อยบนเมนูปลายทาง' : '⠿ กดค้างเพื่อลาก'}
  </button>
}
