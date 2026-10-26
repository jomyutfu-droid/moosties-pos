import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DeductionModePicker } from './DeductionModePicker'

describe('per-recipe deduction picker', () => {
  it.each(['produce','sale'] as const)('shows both modes and selects %s explicitly', value => {
    const html=renderToStaticMarkup(<DeductionModePicker value={value} onChange={()=>{}} />)
    expect(html).toContain('เลือกวิธีตัดวัตถุดิบ')
    expect(html).toContain('ตัดวัตถุดิบเมื่อผลิต')
    expect(html).toContain('ตัดวัตถุดิบเมื่อขาย')
    const checked = html.match(/<input\b[^>]*\bchecked=""[^>]*>/g) ?? []
    expect(checked).toHaveLength(1)
    expect(checked[0]).toContain(`value="${value}"`)
    expect((html.match(/type="radio"/g) ?? [])).toHaveLength(2)
  })
})
