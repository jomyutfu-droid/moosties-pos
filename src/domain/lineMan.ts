import type { CartLine } from '@/types'

export function normalizeLineManRef(value: string): string {
  const ref = value.trim().toUpperCase()
  if (!/^[A-Z0-9][A-Z0-9_-]{0,79}$/.test(ref)) {
    throw new Error('กรอกเลขคำสั่งซื้อ LINE MAN แบบเต็ม (ตัวอักษรอังกฤษ ตัวเลข - หรือ _ ไม่เกิน 80 ตัว)')
  }
  return ref
}

/** Strip every price/cost and stock-bearing field; this is an operational order snapshot only. */
export function lineManOrderItems(lines: CartLine[]) {
  if (!lines.length) throw new Error('ยังไม่มีรายการในตะกร้า')
  return lines.map(line => {
    if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > 999) throw new Error('จำนวนแก้วไม่ถูกต้อง')
    return {
      product_id: line.product.id,
      name_snapshot: line.product.name,
      qty: line.qty,
      options_text: line.selectedOptions.filter(o => !o.hidden_label).map(o => o.name).join(', '),
    }
  })
}
