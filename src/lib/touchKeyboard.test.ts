import { describe, expect, it } from 'vitest'
import { editKeyboardValue, nativeKeyboardDevice } from './touchKeyboard'

describe('touch keyboard edits', () => {
  it('keeps the native keyboard on phones and allows an opt-in PC touch keyboard', () => {
    expect(nativeKeyboardDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(true)
    expect(nativeKeyboardDevice('Mozilla/5.0 (Linux; Android 14; Mobile)')).toBe(true)
    expect(nativeKeyboardDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false)
    expect(nativeKeyboardDevice('Mozilla/5.0', true)).toBe(true)
  })
  it('keeps decimals in progress and rejects a second decimal separator', () => {
    const first = editKeyboardValue('45', 2, 2, '.', 'decimal', false)
    expect(first.value).toBe('45.')
    expect(editKeyboardValue(first.value, 3, 3, '5', 'decimal', false).value).toBe('45.5')
    expect(editKeyboardValue('45.5', 4, 4, '.', 'decimal', false).value).toBe('45.5')
  })
  it('restricts integer and unsigned fields', () => {
    expect(editKeyboardValue('25', 2, 2, '.', 'integer', false).value).toBe('25')
    expect(editKeyboardValue('25', 2, 2, 'sign', 'decimal', false).value).toBe('25')
    expect(editKeyboardValue('25', 2, 2, 'sign', 'decimal', true).value).toBe('-25')
  })
  it('inserts and deletes at the cursor or replaces selected text', () => {
    expect(editKeyboardValue('ชาองุ่น', 2, 2, 'มะลิ', 'text', false).value).toBe('ชามะลิองุ่น')
    expect(editKeyboardValue('ABC-001', 4, 7, '002', 'text', false).value).toBe('ABC-002')
    expect(editKeyboardValue('ABC', 1, 2, 'backspace', 'text', false).value).toBe('AC')
    expect(editKeyboardValue('😀a', 2, 2, 'backspace', 'text', false).value).toBe('a')
  })
  it('respects PIN and reference length limits and preserves leading zeros', () => {
    expect(editKeyboardValue('001', 3, 3, '2', 'integer', false, 6).value).toBe('0012')
    expect(editKeyboardValue('123456', 6, 6, '7', 'integer', false, 6).value).toBe('123456')
    expect(editKeyboardValue('123', 1, 2, 'clear', 'integer', false).value).toBe('')
  })
})
