import { round3 } from '@/lib/money'
import type { Ingredient } from '@/types'

export interface ProductionInput {
  ingredient_id: string; input_qty: number; input_unit: string; factor: number; base_unit: string
}
export interface ProductionRecipe {
  id: string; name: string; output_id: string; output_unit: string; expected_qty: number
  instructions: string; is_active: boolean; revision: number; items: ProductionInput[]
}
export interface ProductionBatch {
  id: string; recipe_name: string; output_name: string; output_unit: string
  actual_qty: number; expected_qty: number; rounds: number; total_cost: number; batch_unit_cost: number
  user_name: string; created_at: string; status: 'completed' | 'cancelled'; note: string; cancel_reason: string | null
  items: { ingredient_id: string; name: string; qty: number; unit: string; unit_cost: number }[]
}
export interface ProductionData {
  can_manage: boolean; ingredients: Ingredient[]; recipes: ProductionRecipe[]; history: ProductionBatch[]
}
export function productionPreview(recipe: ProductionRecipe, rounds: number, ingredients: Ingredient[]) {
  return recipe.items.map(item => {
    const ingredient = ingredients.find(i => i.id === item.ingredient_id)
    const qty = round3(item.input_qty * item.factor * rounds)
    const changedUnit = ingredient && item.input_unit !== ingredient.unit && !ingredient.units?.some(u => u.name === item.input_unit && u.factor_to_base === item.factor)
    return { ...item, name: ingredient?.name ?? 'ไม่พบวัตถุดิบ', qty,
      stock: ingredient?.stock_qty ?? 0, cost: qty * (ingredient?.cost_per_unit ?? 0),
      unavailable: !ingredient?.is_active || ingredient.unit !== item.base_unit || !!changedUnit,
      shortage: Math.max(0, round3(qty - (ingredient?.stock_qty ?? 0))),
    }
  })
}
