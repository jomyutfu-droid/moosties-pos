import { describe, expect, it, vi } from 'vitest'
import { buildLineManPrintHTML, type LineManReceiptInfo } from './LineManReceiptModal'

vi.mock('@/hooks/useSettings', () => ({ useSettings: () => ({ data: {} }) }))

describe('LINE MAN stored receipt printing', () => {
  it('prints the POS bill number when the external order number was omitted', () => {
    const order: LineManReceiptInfo = {
      source: 'line_man', orderNo: 'LM-TEST-123',
      lineManOrderId: 'POS-LM-00000000-0000-4000-8000-000000000001',
      createdAt: '2026-10-10T12:00:00Z', totalCups: 1,
      items: [{ name_snapshot: 'ชา', qty: 1, options_text: '', recipe: [] }],
    }
    const html = buildLineManPrintHTML(order, 'MOOSTIES', '')
    expect(html).toContain('LM-TEST-123')
    expect(html).toContain('ไม่ระบุเลขคำสั่งซื้อ LINE MAN')
    expect(html).not.toContain(order.lineManOrderId)
    expect(html).not.toContain('undefined')
  })
  it('separates a price-free order bill from one recipe sticker per cup', () => {
    const stored: LineManReceiptInfo = JSON.parse(JSON.stringify({
      source: 'line_man', orderNo: 'LM-20260923-D332F4CB', lineManOrderId: '1111',
      createdAt: '2026-09-23T11:33:23Z', totalCups: 2,
      items: [{ product_id: 'example', name_snapshot: 'ชา <ทดสอบ>', qty: 2,
        options_text: 'หวานน้อย, เจลลี่',
        recipe: [{ name: 'น้ำเชื่อม', qty: 10, unit: 'ml', adjusted: true }] }],
    }))
    const html = buildLineManPrintHTML(stored, 'MOOSTIES', 'ขอบคุณ')
    const recipes = buildLineManPrintHTML(stored, 'MOOSTIES', 'ขอบคุณ', 'recipes')
    expect(html).not.toContain('class="sticker"')
    expect(html).not.toContain('น้ำเชื่อม')
    expect(recipes.match(/class="sticker"/g)).toHaveLength(2)
    expect(recipes).not.toContain('class="receipt"')
    expect(recipes).toContain('หวานน้อย, เจลลี่')
    expect(html).toContain('ชา &lt;ทดสอบ&gt;')
    expect(html).toContain('หวานน้อย, เจลลี่')
    expect(recipes).toContain('น้ำเชื่อม')
    expect(html).toContain('window.print()')
    expect(html).not.toContain('undefined')
    expect(html).not.toContain('ยอดสุทธิ')
    expect(html).not.toContain('ใบงานเตรียมเครื่องดื่ม')
    expect(html).not.toContain('ตัดสต็อก')
    expect(html).not.toContain('ไม่มีข้อมูลราคา')
    expect(html).toContain('รวม 2 แก้ว')
    expect(html).toContain('ขอบคุณ')
    expect(buildLineManPrintHTML(stored, 'MOOSTIES', 'ขอบคุณ')).toBe(html)
  })
})
