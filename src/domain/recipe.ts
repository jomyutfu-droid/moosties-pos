import { fromBaseQty } from '@/domain/units'
import { round3 } from '@/lib/money'
import type { CartLine, PrintedRecipeRow } from '@/types'

/** One per-cup recipe shared by the picker, recipe card and receipt stickers. */
export function adjustedRecipe(line: Pick<CartLine, 'product' | 'selectedOptions'>): PrintedRecipeRow[] {
  const snapshot = line.selectedOptions.find(o => o.recipe_snapshot)?.recipe_snapshot
  if (snapshot) return snapshot
  const deltas = new Map<string, number>()
  for (const o of line.selectedOptions) {
    if (o.linked_ingredient_id) deltas.set(o.linked_ingredient_id, (deltas.get(o.linked_ingredient_id) ?? 0) + Number(o.qty_delta))
  }
  const rows = new Map<string, PrintedRecipeRow>()
  for (const r of line.product.recipe_items) {
    if (r.ingredient.category?.trim() === 'บรรจุภัณฑ์') { deltas.delete(r.ingredient_id); continue }
    const previous = rows.get(r.ingredient_id)
    // Aggregate duplicates in base units before converting to the first display unit.
    if (previous) continue
    const base = line.product.recipe_items.filter(i => i.ingredient_id === r.ingredient_id).reduce((s, i) => s + Number(i.qty), 0)
    const delta = deltas.get(r.ingredient_id) ?? 0
    deltas.delete(r.ingredient_id)
    rows.set(r.ingredient_id, { ingredient_id: r.ingredient_id, name: r.ingredient.name, qty: round3(fromBaseQty(base + delta, Number(r.unit_factor) || 1)), unit: r.unit_name ?? r.ingredient.unit, note: r.note, adjusted: delta !== 0 })
  }
  for (const [id, qty] of deltas) {
    const opt = line.selectedOptions.find(o => o.linked_ingredient_id === id)!
    if (opt.ingredient_category?.trim() === 'บรรจุภัณฑ์' || qty === 0) continue
    rows.set(id, { ingredient_id: id, name: opt.ingredient_name ?? opt.name, qty: round3(qty), unit: opt.ingredient_unit ?? '-', note: null, adjusted: true })
  }
  return [...rows.values()]
}
