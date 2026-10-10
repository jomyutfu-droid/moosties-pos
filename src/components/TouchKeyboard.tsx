import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { useTouchKeyboard } from '@/store/touchKeyboard'
import { editableField, editKeyboardValue, keyboardKind, writeKeyboardValue, type KeyboardField } from '@/lib/touchKeyboard'
import { TouchKeyboardToggle } from './TouchKeyboardToggle'

const english = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm']
const englishShift = ['!@#$%^&*()', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM']
const thai = ['ๅ/-ภถุึคตจขช', 'ๆไำพะัีรนยบลฃ', 'ฟหกดเ้่าสวง', 'ผปแอิืทมใฝ']
const thaiShift = ['+๑๒๓๔ู฿๕๖๗๘๙', '๐"ฎฑธํ๊ณฯญฐ,ฅ', 'ฤฆฏโฌ็๋ษศซ.', '(ฉฮฺ์?ฒฬฦ']
const symbols = ['1234567890', '!@#$%^&*()', '-_=+[]{}\\|', '.,:;/?\'"<>']

export function TouchKeyboard() {
  const enabled = useTouchKeyboard(s => s.enabled)
  const { pathname } = useLocation()
  // Phones always use their own keyboard, even if a browser preference was copied.
  const [phone, setPhone] = useState(() => /iPhone|iPod|Android.*Mobile/i.test(navigator.userAgent))
  const [field, setField] = useState<KeyboardField | null>(null)
  const [draft, setDraft] = useState('')
  const [language, setLanguage] = useState<'th' | 'en'>('th')
  const [shift, setShift] = useState(false)
  const [symbol, setSymbol] = useState(false)
  const panel = useRef<HTMLElement>(null)
  const current = useRef<KeyboardField | null>(null)
  const buffer = useRef('')
  const writing = useRef(false)
  const originalMode = useRef<string | null>(null)
  const replaceNumber = useRef(false)
  const active = enabled && !phone && pathname !== '/display'

  useEffect(() => {
    const media = window.matchMedia('(max-width: 600px) and (pointer: coarse)')
    const update = () => setPhone(/iPhone|iPod|Android.*Mobile/i.test(navigator.userAgent) || media.matches)
    update(); media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    function release() {
      if (current.current && originalMode.current !== null) current.current.inputMode = originalMode.current
      current.current = null; originalMode.current = null; setField(null)
    }
    if (!active) { release(); return }
    let pointerActive = false
    let pendingFocus: EventTarget | null = null
    let pointerTimer: ReturnType<typeof setTimeout> | undefined
    function open(target: EventTarget | null) {
      if (!editableField(target) || current.current === target) return
      release()
      current.current = target; originalMode.current = target.inputMode
      target.dataset.keyboardMode = target.dataset.keyboardMode ?? target.inputMode
      target.inputMode = 'none'
      buffer.current = target.value; setDraft(target.value); setField(target)
      replaceNumber.current = target instanceof HTMLInputElement && target.type === 'number'
      setShift(false); setSymbol(false)
      if (target.type === 'email' || target.type === 'password' || target.type === 'url') setLanguage('en')
      if (keyboardKind(target) !== 'text' && target instanceof HTMLInputElement && target.type !== 'number') target.select()
    }
    function focus(event: FocusEvent) {
      if (panel.current?.contains(event.target as Node)) return
      // Resizing during pointerdown moves the control before pointerup and can lose the click.
      if (pointerActive) { pendingFocus = event.target; return }
      if (editableField(event.target)) open(event.target); else release()
    }
    function pointer(event: PointerEvent) {
      if (panel.current?.contains(event.target as Node)) return
      pointerActive = true; pendingFocus = null
    }
    function pointerEnd() {
      clearTimeout(pointerTimer)
      pointerTimer = setTimeout(() => { pointerActive = false }, 0)
    }
    function click(event: MouseEvent) {
      if (panel.current?.contains(event.target as Node)) return
      pointerActive = false
      if (editableField(event.target)) open(event.target)
      else if (editableField(pendingFocus) && pendingFocus === document.activeElement) open(pendingFocus)
      else release()
      pendingFocus = null
    }
    function input(event: Event) {
      if (!writing.current && event.target === current.current) {
        buffer.current = current.current!.value; setDraft(buffer.current)
        replaceNumber.current = false
      }
    }
    function escape(event: KeyboardEvent) { if (event.key === 'Escape') release() }
    // A field may disappear or become disabled after submitting a modal.
    const observer = new MutationObserver(() => {
      if (current.current && (!current.current.isConnected || !editableField(current.current))) release()
    })
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'readonly'] })
    document.addEventListener('focusin', focus)
    document.addEventListener('pointerdown', pointer)
    document.addEventListener('pointerup', pointerEnd)
    document.addEventListener('pointercancel', pointerEnd)
    document.addEventListener('click', click)
    document.addEventListener('input', input)
    document.addEventListener('keydown', escape)
    return () => {
      observer.disconnect(); release()
      clearTimeout(pointerTimer)
      document.removeEventListener('focusin', focus); document.removeEventListener('pointerdown', pointer)
      document.removeEventListener('pointerup', pointerEnd); document.removeEventListener('pointercancel', pointerEnd)
      document.removeEventListener('click', click); document.removeEventListener('input', input)
      document.removeEventListener('keydown', escape)
    }
  }, [active, pathname])

  useEffect(() => {
    if (!field || !panel.current) return
    const resize = () => {
      document.documentElement.style.setProperty('--touch-keyboard-height', `${panel.current!.getBoundingClientRect().height + 8}px`)
      document.documentElement.classList.add('touch-keyboard-open')
      field.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
    const observer = new ResizeObserver(resize)
    observer.observe(panel.current); resize()
    return () => {
      observer.disconnect(); document.documentElement.classList.remove('touch-keyboard-open')
      document.documentElement.style.removeProperty('--touch-keyboard-height')
    }
  }, [field])

  function close() {
    if (current.current && originalMode.current !== null) current.current.inputMode = originalMode.current
    current.current?.blur(); current.current = null; originalMode.current = null; setField(null)
  }
  function press(key: string) {
    if (!field || !editableField(field) || !field.isConnected) { close(); return }
    const numeric = field instanceof HTMLInputElement && field.type === 'number'
    const start = numeric ? (replaceNumber.current ? 0 : buffer.current.length) : field.selectionStart ?? buffer.current.length
    const end = numeric ? buffer.current.length : field.selectionEnd ?? start
    const signed = field.dataset.keyboardSigned === 'true' || (numeric && field.min !== '' && Number(field.min) < 0)
    const result = editKeyboardValue(buffer.current, start, end, key, keyboardKind(field), signed, field.maxLength)
    buffer.current = result.value; setDraft(result.value)
    replaceNumber.current = false
    writing.current = true
    writeKeyboardValue(field, result.value)
    writing.current = false
    // React may normalize a number; preserve the decimal-in-progress in the keypad buffer.
    requestAnimationFrame(() => {
      if (!field.isConnected || current.current !== field) return
      if (field instanceof HTMLTextAreaElement || (!numeric && ['text', 'search', 'password', 'tel'].includes(field.type))) {
        const cursor = Math.min(result.cursor, field.value.length)
        field.setSelectionRange(cursor, cursor)
      }
    })
    if (shift && key.length === 1) setShift(false)
  }
  function next() {
    if (!field) return
    const scope = field.closest('[role="dialog"]') ?? field.form ?? document.getElementById('root')!
    const fields = Array.from(scope.querySelectorAll('input, textarea')).filter(el => editableField(el) && el.getClientRects().length) as KeyboardField[]
    const following = fields[fields.indexOf(field) + 1]
    if (following) following.focus(); else close()
  }

  const kind = field ? keyboardKind(field) : 'text'
  const rows = symbol ? symbols : language === 'th' ? (shift ? thaiShift : thai) : (shift ? englishShift : english)
  const signed = field?.dataset.keyboardSigned === 'true' || (field instanceof HTMLInputElement && field.type === 'number' && field.min !== '' && Number(field.min) < 0)
  const keyButton = (label: string, key = label) => <button type="button" className="touch-key" key={label} onClick={() => press(key)}>{label}</button>
  return <>
    {!phone && ['/pin', '/login'].includes(pathname) && <div className="fixed top-3 right-3 z-20"><TouchKeyboardToggle /></div>}
    {active && field && createPortal(<section ref={panel} className="touch-keyboard" aria-label="คีย์บอร์ดจอสัมผัส"
      onPointerDown={event => event.preventDefault()}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-semibold min-w-0 flex-1 truncate">{field.getAttribute('aria-label') || field.labels?.[0]?.textContent || field.placeholder || 'กรอกข้อมูล'}{kind !== 'text' ? `: ${field.type === 'password' ? '•'.repeat(draft.length) : draft}` : ''}</span>
        <button type="button" className="touch-key px-3" onClick={next}>ถัดไป</button>
        <button type="button" className="touch-key touch-key-done px-4" onClick={close}>เสร็จ</button>
      </div>
      {kind !== 'text' ? <div className="grid grid-cols-4 gap-2 max-w-xl mx-auto">
        {['7', '8', '9'].map(k => keyButton(k))}{keyButton('ลบ', 'backspace')}
        {['4', '5', '6'].map(k => keyButton(k))}{keyButton('ล้าง', 'clear')}
        {['1', '2', '3'].map(k => keyButton(k))}{kind === 'decimal' ? keyButton('.') : <span />}
        {signed ? keyButton('±', 'sign') : <span />}{keyButton('0')}<span /><span />
      </div> : <div className="space-y-1.5 max-w-5xl mx-auto">
        {rows.map((row, index) => <div key={index} className="flex gap-1.5 justify-center">{Array.from(row).map(k => keyButton(k))}</div>)}
        <div className="flex gap-1.5">
          <button type="button" className="touch-key" aria-pressed={shift} onClick={() => { setSymbol(false); setShift(s => !s) }}>Shift</button>
          <button type="button" className="touch-key" onClick={() => { setLanguage(l => l === 'th' ? 'en' : 'th'); setSymbol(false) }}>{language === 'th' ? 'EN' : 'ไทย'}</button>
          <button type="button" className="touch-key" aria-pressed={symbol} onClick={() => setSymbol(s => !s)}>123 / #</button>
          <button type="button" className="touch-key grow" onClick={() => press(' ')}>เว้นวรรค</button>
          {field instanceof HTMLTextAreaElement && keyButton('ขึ้นบรรทัด', '\n')}
          {keyButton('ลบ', 'backspace')}{keyButton('ล้าง', 'clear')}
        </div>
      </div>}
    </section>, document.body)}
  </>
}
