import { round3 } from '@/lib/money'
import type { Ingredient, IngredientUnit } from '@/types'

/**
 * Returns configured units, with the legacy ingredient.unit as a safe fallback
 * while older cached data is being refreshed.
 */
export function unitsForIngredient(ingredient: Ingredient | null | undefined): IngredientUnit[] {
  if (!ingredient) return []
  if (ingredient.units?.length) return ingredient.units
  return [
    {
      id: `base-${ingredient.id}`,
      ingredient_id: ingredient.id,
      name: ingredient.unit,
      factor_to_base: 1,
      kind: 'both',
      is_default_purchase: true,
      is_default_usage: true,
      created_at: ingredient.created_at,
      updated_at: ingredient.updated_at,
    },
  ]
}

export function usageUnitsForIngredient(ingredient: Ingredient | null | undefined): IngredientUnit[] {
  return unitsForIngredient(ingredient).filter((unit) => unit.kind === 'usage' || unit.kind === 'both')
}

export function purchaseUnitsForIngredient(ingredient: Ingredient | null | undefined): IngredientUnit[] {
  return unitsForIngredient(ingredient).filter((unit) => unit.kind === 'purchase' || unit.kind === 'both')
}

export function defaultUsageUnit(ingredient: Ingredient | null | undefined): IngredientUnit | null {
  const units = usageUnitsForIngredient(ingredient)
  return units.find((unit) => unit.is_default_usage) ?? units[0] ?? null
}

export function defaultPurchaseUnit(ingredient: Ingredient | null | undefined): IngredientUnit | null {
  const units = purchaseUnitsForIngredient(ingredient)
  return units.find((unit) => unit.is_default_purchase) ?? units[0] ?? null
}

export function unitByName(ingredient: Ingredient | null | undefined, name: string | null | undefined) {
  if (!name) return null
  return unitsForIngredient(ingredient).find((unit) => unit.name === name) ?? null
}

export function toBaseQty(inputQty: number, factorToBase: number): number {
  return round3(inputQty * factorToBase)
}

export function fromBaseQty(baseQty: number, factorToBase: number): number {
  if (!factorToBase) return baseQty
  return round3(baseQty / factorToBase)
}
