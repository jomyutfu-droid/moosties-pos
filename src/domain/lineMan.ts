import type { CartLine } from '@/types'
import { round2 } from '@/lib/money'

export function normalizeLineManRef(value: string): string {
  const ref = value.trim().toUpperCase()
  if (!/^[A-Z0-9][A-Z0-9_-]{0,79}$/.test(ref)) {
    throw new Error('กรอกเลขคำสั่งซื้อ LINE MAN แบบเต็ม (ตัวอักษรอังกฤษ ตัวเลข - หรือ _ ไม่เกิน 80 ตัว)')
  }
  return ref
}

function requirePrice(price: number | null | undefined, name: string): number {
  if (price == null || !Number.isFinite(Number(price)) || Number(price) < 0) {
    throw new Error(`ยังไม่ตั้งราคา LINE MAN: ${name} — ตั้งค่าที่เมนู/สูตรก่อนขาย`)
  }
  return Number(price)
}

/** Clone prices only. Recipe, stock amounts and store cart never change. */
export function lineManLines(lines: CartLine[]): CartLine[] {
  if (!lines.length) throw new Error('ยังไม่มีรายการในตะกร้า')
  return structuredClone(lines).map(line => {
    const base = requirePrice(line.product.line_man_price, line.product.name)
    line.selectedOptions = line.selectedOptions.map(selected => {
      if (selected.option_id.startsWith('sweetness:')) return { ...selected, price_delta: 0 }
      const option = line.product.options.find(o => o.id === selected.option_id)
      if (!option) throw new Error(`ไม่พบตัวเลือก ${selected.name} กรุณาเลือกเมนูใหม่`)
      // Older carts stored the selected count in the display name.
      const quantity = selected.quantity ?? Number(selected.name.match(/ ×(\d+)$/)?.[1] ?? 1)
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new Error('จำนวนท็อปปิ้งไม่ถูกต้อง')
      return { ...selected, quantity, price_delta: round2(requirePrice(option.line_man_price, `${line.product.name} / ${option.name}`) * quantity) }
    })
    line.unitPrice = round2(base + line.selectedOptions.reduce((sum, o) => sum + o.price_delta, 0))
    return line
  })
}

export function lineManTotals(lines: CartLine[], discount: number) {
  const subtotal = round2(lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0))
  if (!Number.isFinite(discount) || discount < 0 || discount > subtotal || round2(discount) !== discount) {
    throw new Error('ส่วนลดร้านค้าต้องอยู่ระหว่าง 0 ถึงยอดรวม และมีทศนิยมไม่เกิน 2 ตำแหน่ง')
  }
  // Do not floor LINE MAN totals: reconcile the exact amount, including satang.
  return { subtotal, discount, total: round2(subtotal - discount) }
}
