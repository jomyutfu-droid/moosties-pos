import { describe, expect, it, vi } from 'vitest'
import { buildPrintHTML, type ReceiptInfo } from './ReceiptModal'

vi.mock('@/hooks/useSettings', () => ({ useSettings: () => ({ data: {} }) }))

const order: ReceiptInfo = JSON.parse(JSON.stringify({
  orderNo: 'TEST-PRINT', total: 118, paid: 120, change: 2,
  createdAt: '2026-10-10T05:00:00Z',
  lines: [{ uid: 'cup', qty: 2, unitPrice: 59, unitCogs: 10,
    product: { name: 'ชา <พิเศษ>', recipe_items: [], options: [] },
    selectedOptions: [{ name: 'หวานน้อย', price_delta: 0, recipe_snapshot: [
      { name: 'น้ำเชื่อม', qty: 5, unit: 'ml', adjusted: true },
    ] }],
  }],
}))
const text = { header: 'MOOSTIES', footer: 'ขอบคุณ' }

describe('separate receipt and recipe printing', () => {
  it('prints only the bill by default, including the Grab automatic-print call', () => {
    const html = buildPrintHTML(order, text)
    expect(html).toContain('class="receipt"')
    expect(html).not.toContain('class="sticker"')
    expect(html).not.toContain('น้ำเชื่อม')
    expect(html).toContain('ยอดสุทธิ')
    expect(html).toContain('เงินทอน')
    expect(html).toContain('ชา &lt;พิเศษ&gt;')
    expect(html).toContain('หวานน้อย')
    expect(html).toContain('window.print()')
  })
  it('prints one adjusted recipe per cup without reprinting the bill', () => {
    const html = buildPrintHTML(order, text, 'recipes')
    expect(html.match(/class="sticker"/g)).toHaveLength(2)
    expect(html).not.toContain('class="receipt"')
    expect(html).toContain('น้ำเชื่อม')
    expect(html).toContain('5')
    expect(html).toContain('หวานน้อย')
    expect(html).toContain('(1/2)')
    expect(html).toContain('(2/2)')
  })
})
