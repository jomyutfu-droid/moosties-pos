import { legacySweetnessLevel } from '@/domain/sweetness'
import type { Ingredient, ProductOption, SelectedOption, StoreTopping } from '@/types'

/** Preserve unambiguous cached toppings when an existing POS upgrades while offline. */
export function migrateCachedToppings(legacy: ProductOption[]): StoreTopping[] {
  const groups = new Map<string, ProductOption[]>()
  for (const option of legacy) {
    if (legacySweetnessLevel(option.name) || option.name.replace(/\s/g, '') === 'ไม่เพิ่ม') continue
    const key = option.name.replace(/\s/g, '').toLowerCase()
    const group = groups.get(key) ?? []
    group.push(option)
    groups.set(key, group)
  }
  return [...groups.values()].flatMap(group => {
    const first = group[0]
    const valid = first.name.trim() && Number.isFinite(Number(first.price_delta)) && Number.isFinite(Number(first.qty_delta)) && Number(first.price_delta) >= 0 && Number(first.qty_delta) >= 0 &&
      (first.linked_ingredient_id ? Number(first.qty_delta) > 0 : Number(first.qty_delta) === 0)
    if (!valid || group.some(o => Number(o.price_delta) !== Number(first.price_delta) || Number(o.qty_delta) !== Number(first.qty_delta) || o.linked_ingredient_id !== first.linked_ingredient_id)) return []
    return [{ id: first.id, name: first.name, price_delta: Number(first.price_delta), qty_delta: Number(first.qty_delta),
      linked_ingredient_id: first.linked_ingredient_id, sort_order: first.sort_order,
      created_at: first.created_at, updated_at: first.updated_at, is_active: true, is_available: true, revision: 0 }]
  })
}

/** Legacy sweetness stays menu-specific; every menu receives the same store catalog. */
export function optionsForProduct(productId: string, legacy: ProductOption[], toppings: StoreTopping[]): ProductOption[] {
  return [
    ...legacy.filter(o => o.product_id === productId && legacySweetnessLevel(o.name)),
    ...toppings.filter(t => t.is_active).map(t => ({ ...t, product_id: productId })),
  ].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'th'))
}

export function toppingIsAvailable(option: ProductOption, ingredients: Map<string, Ingredient>): boolean {
  return option.is_active !== false && option.is_available !== false &&
    (!option.linked_ingredient_id || ingredients.get(option.linked_ingredient_id)?.is_active === true)
}

/** Copy values at selection time so changes to the catalog never rewrite an old sale. */
export function selectedToppings(options: ProductOption[], quantities: Record<string, number>, ingredients: Map<string, Ingredient>): SelectedOption[] {
  return options.filter(o => !legacySweetnessLevel(o.name) && o.name.trim() !== 'ไม่เพิ่ม' && (quantities[o.id] ?? 0) > 0).map(o => {
    const quantity = quantities[o.id]
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99 || !toppingIsAvailable(o, ingredients)) {
      throw new Error(`ท็อปปิ้ง ${o.name} ไม่พร้อมขาย หรือจำนวนไม่ถูกต้อง`)
    }
    const ingredient = o.linked_ingredient_id ? ingredients.get(o.linked_ingredient_id) : undefined
    return {
      option_id: o.id, quantity, name: quantity > 1 ? `${o.name} ×${quantity}` : o.name,
      price_delta: Number(o.price_delta) * quantity, qty_delta: Number(o.qty_delta) * quantity,
      linked_ingredient_id: o.linked_ingredient_id, ingredient_name: ingredient?.name,
      ingredient_unit: ingredient?.unit, ingredient_category: ingredient?.category,
    }
  })
}
