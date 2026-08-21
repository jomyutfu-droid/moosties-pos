import { round2 } from '@/lib/money'
import type { Ingredient, ProductWithRecipe, SelectedOption } from '@/types'

/**
 * COGS ตามสเปกหัวข้อ 9:
 *   ต้นทุนต่อหน่วย = Σ(recipe_item.qty × ingredient.cost_per_unit)
 *   ถ้ามีตัวเลือก (option) ที่ผูกกับวัตถุดิบและมี qty_delta จะปรับต้นทุนเพิ่ม/ลดตามนั้น
 */

/** คำนวณต้นทุนพื้นฐานของสินค้า 1 หน่วยจากสูตร (ไม่รวมตัวเลือก) */
export function baseCost(product: Pick<ProductWithRecipe, 'recipe_items'>): number {
  const total = product.recipe_items.reduce(
    (sum, item) => sum + item.qty * item.ingredient.cost_per_unit,
    0,
  )
  return round2(total)
}

/** ส่วนต้นทุนเพิ่ม/ลดจากตัวเลือกที่เลือก (เช่น เพิ่มไข่มุก, เพิ่มชอต) */
export function optionsCostDelta(
  options: SelectedOption[],
  ingredientsById: Map<string, Ingredient>,
): number {
  const total = options.reduce((sum, opt) => {
    if (!opt.linked_ingredient_id || !opt.qty_delta) return sum
    const ing = ingredientsById.get(opt.linked_ingredient_id)
    if (!ing) return sum
    return sum + opt.qty_delta * ing.cost_per_unit
  }, 0)
  return round2(total)
}

/** ต้นทุนต่อหน่วยรวมตัวเลือกที่เลือก */
export function unitCost(
  product: Pick<ProductWithRecipe, 'recipe_items'>,
  options: SelectedOption[],
  ingredientsById: Map<string, Ingredient>,
): number {
  return round2(baseCost(product) + optionsCostDelta(options, ingredientsById))
}

/** ราคาต่อหน่วยรวมตัวเลือกที่เลือก */
export function unitPrice(
  product: Pick<ProductWithRecipe, 'price'>,
  options: SelectedOption[],
): number {
  const delta = options.reduce((sum, o) => sum + (o.price_delta ?? 0), 0)
  return round2(product.price + delta)
}

/** กำไรต่อหน่วย (บาท) */
export function unitProfit(price: number, cost: number): number {
  return round2(price - cost)
}

/** % กำไรขั้นต้น */
export function marginPercent(price: number, cost: number): number {
  if (price <= 0) return 0
  return round2(((price - cost) / price) * 100)
}
