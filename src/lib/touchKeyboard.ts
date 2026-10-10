export type KeyboardField = HTMLInputElement | HTMLTextAreaElement
export type KeyboardKind = 'text' | 'integer' | 'decimal'

export function nativeKeyboardDevice(userAgent: string, compactTouch = false) {
  return /iPhone|iPod|Android.*Mobile/i.test(userAgent) || compactTouch
}

export function editableField(target: EventTarget | null): target is KeyboardField {
  return (target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement &&
    ['text', 'search', 'email', 'password', 'tel', 'url', 'number'].includes(target.type))) &&
    !target.disabled && !target.readOnly && target.dataset.touchKeyboard !== 'off'
}

export function keyboardKind(field: KeyboardField): KeyboardKind {
  const mode = field.dataset.keyboardMode ?? field.inputMode
  if (mode === 'numeric') return 'integer'
  if (mode === 'decimal') return 'decimal'
  if (field instanceof HTMLInputElement && field.type === 'number') {
    return field.step === 'any' || (field.step !== '' && Number(field.step) % 1 !== 0) ? 'decimal' : 'integer'
  }
  return 'text'
}

export function editKeyboardValue(value: string, start: number, end: number, key: string,
  kind: KeyboardKind, signed: boolean, maxLength = -1) {
  const before = value.slice(0, start), after = value.slice(end)
  let next: string, cursor: number
  if (key === 'clear') { next = ''; cursor = 0 }
  else if (key === 'backspace') {
    const previous = Array.from(before)
    if (start === end) previous.pop()
    next = previous.join('') + after; cursor = previous.join('').length
  } else if (key === 'sign') {
    if (!signed) return { value, cursor: start }
    next = value.startsWith('-') ? value.slice(1) : '-' + value
    cursor = Math.max(0, start + (value.startsWith('-') ? -1 : 1))
  } else { next = before + key + after; cursor = start + key.length }
  if (maxLength >= 0 && next.length > maxLength) return { value, cursor: start }
  if (kind !== 'text' && !(kind === 'decimal' ? /^-?\d*\.?\d*$/ : /^-?\d*$/).test(next)) return { value, cursor: start }
  if (!signed && kind !== 'text' && next.startsWith('-')) return { value, cursor: start }
  return { value: next, cursor }
}

/** Use the native setter so React controlled inputs receive their normal onChange event. */
export function writeKeyboardValue(field: KeyboardField, value: string) {
  const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  const numeric = field instanceof HTMLInputElement && field.type === 'number'
  const committed = numeric ? (value === '-' || value === '.' || value === '-.' ? '' : value.replace(/\.$/, '')) : value
  setter?.call(field, committed)
  field.dispatchEvent(new Event('input', { bubbles: true }))
  field.dispatchEvent(new Event('change', { bubbles: true }))
}
