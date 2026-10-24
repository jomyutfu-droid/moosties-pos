import { describe, expect, it } from 'vitest'
import { compareMenuNames } from './menuOrder'

describe('menu alphabetical order', () => {
  it('sorts Thai and English names, ignoring old menu positions', () => {
    const names = ['Banana', 'ส้ม', 'Apple', 'มะม่วง', 'กล้วย']
    const menus = names.map((name, index) => ({ id: String(index), name, sort_order: index }))
    expect(menus.sort(compareMenuNames).map((menu) => menu.name))
      .toEqual(['กล้วย', 'มะม่วง', 'ส้ม', 'Apple', 'Banana'])
  })

  it('keeps namesakes stable after edits and a differently ordered reload', () => {
    const menus = [
      { id: 'b', name: 'ส้ม', cost_cached: 10 },
      { id: 'a', name: 'ส้ม', cost_cached: 20 },
    ]
    const before = [...menus].sort(compareMenuNames).map((menu) => menu.id)
    const after = menus.reverse().map((menu) => ({ ...menu, cost_cached: 30 }))
      .sort(compareMenuNames).map((menu) => menu.id)
    expect(after).toEqual(before)
    expect(after).toEqual(['a', 'b'])
  })
})
