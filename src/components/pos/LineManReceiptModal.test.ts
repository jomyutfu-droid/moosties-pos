import { describe, expect, it, vi } from 'vitest'
import { buildLineManPrintHTML, type LineManReceiptInfo } from './LineManReceiptModal'

vi.mock('@/hooks/useSettings', () => ({ useSettings: () => ({ data: {} }) }))

describe('LINE MAN stored receipt printing', () => {
  it('prints database-shaped snapshots, one recipe sticker per cup, without prices', () => {
    const stored: LineManReceiptInfo = JSON.parse(JSON.stringify({
      source: 'line_man', orderNo: 'LM-20260923-D332F4CB', lineManOrderId: '1111',
      createdAt: '2026-09-23T11:33:23Z', totalCups: 2,
      items: [{ product_id: 'example', name_snapshot: 'ชา <ทดสอบ>', qty: 2,
        options_text: 'หวานน้อย, เจลลี่',
        recipe: [{ name: 'น้ำเชื่อม', qty: 10, unit: 'ml', adjusted: true }] }],
    }))
    const html = buildLineManPrintHTML(stored, 'MOOSTIES', 'ขอบคุณ')
    expect(html.match(/class="sticker"/g)).toHaveLength(2)
    expect(html).toContain('ชา &lt;ทดสอบ&gt;')
    expect(html).toContain('หวานน้อย, เจลลี่')
    expect(html).toContain('น้ำเชื่อม')
    expect(html).toContain('window.print()')
    expect(html).not.toContain('undefined')
    expect(html).not.toContain('ยอดสุทธิ')
    expect(buildLineManPrintHTML(stored, 'MOOSTIES', 'ขอบคุณ')).toBe(html)
  })
})
