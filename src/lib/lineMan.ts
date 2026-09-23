import { supabase } from '@/lib/supabase'
import { stockMovementsForOrder } from '@/domain/stock'
import { adjustedRecipe } from '@/domain/recipe'
import { optionLabel } from '@/domain/sweetness'
import { lineManOrderItems, normalizeLineManRef } from '@/domain/lineMan'
import type { CartLine } from '@/types'
import type { LineManReceiptInfo } from '@/components/pos/LineManReceiptModal'

export function prepareLineManOrder(lines: CartLine[], reference: string, note: string) {
  const lineManOrderId = normalizeLineManRef(reference)
  return {
    client_uuid: crypto.randomUUID(),
    reference: lineManOrderId,
    note: note || null,
    items: lineManOrderItems(lines).map((item, i) => ({
      ...item,
      options_text: optionLabel(lines[i].selectedOptions),
      recipe: adjustedRecipe(lines[i]),
    })),
    stock_movements: stockMovementsForOrder(lines, 'sale', -1),
  }
}

export async function submitLineManOrder(payload: ReturnType<typeof prepareLineManOrder>, token: string | null): Promise<LineManReceiptInfo> {
  if (!navigator.onLine) throw new Error('ต้องเชื่อมต่ออินเทอร์เน็ตเพื่อยืนยันคำสั่งซื้อ LINE MAN')
  if (!token) throw new Error('กรุณาเข้าสู่ระบบด้วย PIN อีกครั้ง')
  const { data, error } = await supabase.rpc('record_line_man_order', { p_token: token, p_order: payload })
  if (error) {
    if (error.code === '23505') throw new Error('เลขคำสั่งซื้อนี้ถูกบันทึกแล้ว เปิดประวัติ LINE MAN เพื่อตรวจสอบหรือพิมพ์ซ้ำ')
    throw new Error(error.message || 'ยังยืนยันการขายไม่ได้ ตรวจประวัติ LINE MAN ก่อนทำรายการใหม่')
  }
  return data as LineManReceiptInfo
}
