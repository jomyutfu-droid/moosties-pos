import { round3 } from '@/lib/money'
import type { Ingredient, ProductWithRecipe, SelectedOption, SweetnessIngredient, SweetnessLevel } from '@/types'

export const sweetnessLabels: Record<SweetnessLevel, string> = { less: 'หวานน้อย', normal: 'หวานปกติ', more: 'หวานมาก' }
export function legacySweetnessLevel(name: string): SweetnessLevel | null {
  const n = name.replace(/\s/g, '')
  if (['หวานน้อย', 'ลดหวาน'].includes(n)) return 'less'
  if (['เพิ่มหวาน', 'เพิ่มหวานมาก', 'หวานมาก'].includes(n)) return 'more'
  if (['หวานปกติ', 'ปกติ'].includes(n)) return 'normal'
  return null
}
export function baseIngredientQty(product: Pick<ProductWithRecipe, 'recipe_items'>, id: string) {
  return round3(product.recipe_items.filter(r => r.ingredient_id === id).reduce((s, r) => s + Number(r.qty), 0))
}
/** Only import unambiguous legacy deltas; never guess missing/contradictory recipes. */
export function sweetnessIngredients(product: ProductWithRecipe): SweetnessIngredient[] {
  if (product.sweetness_config != null) return product.sweetness_config
  const options = product.options.filter(o => legacySweetnessLevel(o.name) && o.linked_ingredient_id)
  return [...new Set(options.map(o => o.linked_ingredient_id!))].map(id => {
    const base = baseIngredientQty(product, id)
    const value = (level: 'less' | 'more') => {
      const candidates = options.filter(o => o.linked_ingredient_id === id && legacySweetnessLevel(o.name) === level)
      if (!candidates.length) return null
      const amounts = [...new Set(candidates.map(o => round3(base + Number(o.qty_delta))))]
      if (amounts.length !== 1 || candidates.some(o => Number(o.price_delta) !== 0)) return null
      const qty = amounts[0]
      return qty >= 0 && (level === 'less' ? qty <= base : qty >= base) ? qty : null
    }
    return { ingredient_id: id, less: value('less'), more: value('more') }
  })
}
export function sweetnessError(product: ProductWithRecipe, level: SweetnessLevel, ingredients: Map<string, Ingredient>): string | null {
  if (level === 'normal') return null
  const rows = sweetnessIngredients(product)
  if (!rows.length) return `ยังไม่ได้ตั้งสูตร${sweetnessLabels[level]} กรุณาตั้งค่าในเมนู/สูตร`
  for (const row of rows) {
    const ing = ingredients.get(row.ingredient_id)
    const qty = row[level]
    const base = baseIngredientQty(product, row.ingredient_id)
    if (!ing || qty == null || !Number.isFinite(qty) || qty < 0 || (level === 'less' ? qty > base : qty < base)) {
      return `กรุณาตรวจปริมาณ${sweetnessLabels[level]}${ing ? `ของ ${ing.name}` : ''} ในเมนู/สูตร`
    }
  }
  return null
}
export function sweetnessOptions(product: ProductWithRecipe, level: SweetnessLevel, ingredients: Map<string, Ingredient>): SelectedOption[] {
  const error = sweetnessError(product, level, ingredients)
  if (error) throw new Error(error)
  const result: SelectedOption[] = [{ option_id: `sweetness:${level}`, name: sweetnessLabels[level], price_delta: 0, qty_delta: 0, linked_ingredient_id: null, sweetness_level: level }]
  if (level === 'normal') return result
  for (const row of sweetnessIngredients(product)) {
    const ing = ingredients.get(row.ingredient_id)!
    const qty = row[level]!
    result.push({ option_id: `sweetness:${level}:${row.ingredient_id}`, name: `${ing.name} ${qty} ${ing.unit}`, price_delta: 0, qty_delta: round3(qty - baseIngredientQty(product, row.ingredient_id)), linked_ingredient_id: row.ingredient_id, ingredient_name: ing.name, ingredient_unit: ing.unit, ingredient_category: ing.category, hidden_label: true })
  }
  return result
}
export function optionLabel(options: SelectedOption[]) {
  return options.filter(o => !o.hidden_label).map(o => o.name).join(', ')
}
