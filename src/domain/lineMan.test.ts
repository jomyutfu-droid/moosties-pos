import { describe, expect, it } from 'vitest'
import { displayLineManRef, isAutomaticLineManRef, lineManOrderItems, normalizeLineManRef, resolveLineManRef } from './lineMan'
import type { CartLine } from '@/types'

const cartLine = (qty = 2): CartLine => ({
  uid: 'line', qty, unitPrice: 70, unitCogs: 12,
  product: { id: 'drink', name: 'ชา', recipe_items: [], options: [] } as unknown as CartLine['product'],
  selectedOptions: [
    { option_id:'sweetness:less', name:'หวานน้อย', price_delta:0, qty_delta:0, linked_ingredient_id:null },
    { option_id:'sweetness:less:syrup', name:'ปรับน้ำเชื่อม', price_delta:0, qty_delta:-10, linked_ingredient_id:'syrup', hidden_label:true },
    { option_id:'jelly', name:'เจลลี่ ×2', quantity:2, price_delta:20, qty_delta:40, linked_ingredient_id:'jelly', ingredient_name:'เจลลี่', ingredient_unit:'g' },
  ],
} as CartLine)

describe('LINE MAN inventory orders', () => {
  it('uses a unique internal reference for blank input and reuses it for the same checkout', () => {
    const uuid = '00000000-0000-4000-8000-000000000001'
    const ref = resolveLineManRef('', uuid)
    expect(resolveLineManRef('   ', uuid)).toBe(ref)
    expect(resolveLineManRef('', '00000000-0000-4000-8000-000000000002')).not.toBe(ref)
    expect(isAutomaticLineManRef(ref)).toBe(true)
    expect(displayLineManRef(ref, 'LM-TEST-1')).toBe('LM-TEST-1')
    expect(resolveLineManRef(' 000ab-123 ', uuid)).toBe('000AB-123')
    expect(displayLineManRef('000AB-123', 'LM-TEST-1')).toBe('000AB-123')
  })
  it('requires full external reference, normalizes it, and preserves leading zeroes', () => {
    expect(normalizeLineManRef(' 000ab-123 ')).toBe('000AB-123')
    for (const ref of ['', ' ', 'a b', '<script>', 'x'.repeat(81)]) expect(() => normalizeLineManRef(ref)).toThrow()
  })

  it('keeps only order/recipe descriptors and never sends monetary fields', () => {
    const items = lineManOrderItems([cartLine()])
    expect(items).toEqual([{ product_id:'drink', name_snapshot:'ชา', qty:2, options_text:'หวานน้อย, เจลลี่ ×2' }])
    expect(JSON.stringify(items)).not.toMatch(/price|total|cost|payment/i)
  })

  it.each([0, -1, 1.2, 1000])('rejects invalid quantity %s', qty => {
    expect(() => lineManOrderItems([cartLine(qty)])).toThrow()
  })
})
