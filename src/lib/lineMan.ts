import { supabase } from '@/lib/supabase'
import { stockMovementsForOrder } from '@/domain/stock'
import { lineManTotals, normalizeLineManRef } from '@/domain/lineMan'
import { round2 } from '@/lib/money'
import type { CartLine } from '@/types'
import type { ReceiptInfo } from '@/components/pos/ReceiptModal'

export function prepareLineManSale(lines: CartLine[], reference: string, discount: number, note: string) {
  const lineManOrderId = normalizeLineManRef(reference)
  const totals = lineManTotals(lines, discount)
  const clientUuid = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const orderNo = `LM-${createdAt.slice(0, 10).replace(/-/g, '')}-${clientUuid.slice(0, 8).toUpperCase()}`
  const receipt: ReceiptInfo = {
    ...totals, orderNo, createdAt, paid: totals.total, change: 0,
    source: 'line_man', lineManOrderId, lines: structuredClone(lines),
  }
  return {
    client_uuid: clientUuid, reference: lineManOrderId, ...totals,
    cogs_total: round2(lines.reduce((sum, l) => sum + l.unitCogs * l.qty, 0)),
    note: note || null, receipt,
    items: lines.map(l => ({ product_id: l.product.id, name_snapshot: l.product.name,
      unit_price: l.unitPrice, qty: l.qty, options_json: l.selectedOptions,
      line_total: round2(l.unitPrice * l.qty), cogs_snapshot: l.unitCogs })),
    stock_movements: stockMovementsForOrder(lines, 'sale', -1),
  }
}

export async function submitLineManSale(payload: ReturnType<typeof prepareLineManSale>, token: string | null): Promise<ReceiptInfo> {
  if (!navigator.onLine) throw new Error('ต้องเชื่อมต่ออินเทอร์เน็ตเพื่อยืนยันคำสั่งซื้อ LINE MAN')
  if (!token) throw new Error('กรุณาเข้าสู่ระบบด้วย PIN อีกครั้ง')
  const { data, error } = await supabase.rpc('submit_line_man_order', { p_token: token, p_sale: payload })
  if (error) {
    if (error.code === '23505') throw new Error('เลขคำสั่งซื้อนี้ถูกบันทึกแล้ว เปิดประวัติ LINE MAN เพื่อตรวจสอบหรือพิมพ์ซ้ำ')
    throw new Error(error.message || 'ยังยืนยันการขายไม่ได้ ตรวจประวัติ LINE MAN ก่อนทำรายการใหม่')
  }
  return data as ReceiptInfo
}
