import { round3 } from '@/lib/money'
import type { ProductWithRecipe, SelectedOption, StockMovementType } from '@/types'

/**
 * การตัดสต็อก/คืนสต็อก ตามสเปกหัวข้อ 8 (ขายแบบ atomic) และหัวข้อ 9 (void คืนสต็อก)
 * stock_movements คือ source of truth ของคงเหลือ — ตัดสต็อกเฉพาะตอนสถานะออเดอร์เป็น 'paid'
 */

export interface StockMovementDraft {
  ingredient_id: string
  type: StockMovementType
  qty_delta: number // ลบ = ตัดออก, บวก = เติม/คืน
  note: string | null
}

/**
 * คำนวณรายการตัดสต็อกสำหรับ 1 รายการสินค้าในออเดอร์ (รวมตัวเลือก)
 * @param sign -1 สำหรับขาย (ตัดออก), +1 สำหรับคืนสต็อกเมื่อ void
 */
export function stockMovementsForOrderItem(
  product: Pick<ProductWithRecipe, 'recipe_items'>,
  qty: number,
  selectedOptions: SelectedOption[],
  type: StockMovementType,
  sign: 1 | -1 = -1,
): StockMovementDraft[] {
  const movements: StockMovementDraft[] = []

  for (const item of product.recipe_items) {
    const delta = sign * round3(item.qty * qty)
    if (delta === 0) continue
    movements.push({
      ingredient_id: item.ingredient_id,
      type,
      qty_delta: delta,
      note: item.note,
    })
  }

  for (const opt of selectedOptions) {
    if (!opt.linked_ingredient_id || !opt.qty_delta) continue
    const delta = sign * round3(opt.qty_delta * qty)
    if (delta === 0) continue
    movements.push({
      ingredient_id: opt.linked_ingredient_id,
      type,
      qty_delta: delta,
      note: `ตัวเลือก: ${opt.name}`,
    })
  }

  // รวมรายการที่ใช้วัตถุดิบเดียวกันให้เหลือบรรทัดเดียว
  const merged = new Map<string, StockMovementDraft>()
  for (const m of movements) {
    const existing = merged.get(m.ingredient_id)
    if (existing) {
      existing.qty_delta = round3(existing.qty_delta + m.qty_delta)
    } else {
      merged.set(m.ingredient_id, { ...m })
    }
  }
  return Array.from(merged.values())
}

/** รวมรายการตัดสต็อกของหลายรายการในออเดอร์ */
export function stockMovementsForOrder(
  lines: {
    product: Pick<ProductWithRecipe, 'recipe_items'>
    qty: number
    selectedOptions: SelectedOption[]
  }[],
  type: StockMovementType = 'sale',
  sign: 1 | -1 = -1,
): StockMovementDraft[] {
  const all = lines.flatMap((l) =>
    stockMovementsForOrderItem(l.product, l.qty, l.selectedOptions, type, sign),
  )
  const merged = new Map<string, StockMovementDraft>()
  for (const m of all) {
    const existing = merged.get(m.ingredient_id)
    if (existing) {
      existing.qty_delta = round3(existing.qty_delta + m.qty_delta)
    } else {
      merged.set(m.ingredient_id, { ...m })
    }
  }
  return Array.from(merged.values())
}

export interface LowStockIngredient {
  id: string
  name: string
  unit: string
  stock_qty: number
  reorder_point: number
}

/** รายชื่อวัตถุดิบที่ต่ำกว่าจุดสั่งซื้อซ้ำ (สเปกหัวข้อ 8 — low-stock alert) */
export function getLowStockIngredients<
  T extends { id: string; name: string; unit: string; stock_qty: number; reorder_point: number; is_active: boolean },
>(ingredients: T[]): LowStockIngredient[] {
  return ingredients
    .filter((i) => i.is_active && i.stock_qty <= i.reorder_point)
    .map((i) => ({
      id: i.id,
      name: i.name,
      unit: i.unit,
      stock_qty: i.stock_qty,
      reorder_point: i.reorder_point,
    }))
    .sort((a, b) => a.stock_qty - b.stock_qty)
}
