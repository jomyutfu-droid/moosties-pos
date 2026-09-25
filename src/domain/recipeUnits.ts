import { usageUnitsForIngredient } from './units'
import type { Ingredient } from '@/types'

/** Never substitute a visible select option for a persisted recipe unit. */
export function recipeUnitIsValid(ingredient: Ingredient | undefined, name: string | null, factor: number): boolean {
  return Number.isFinite(factor) && factor > 0 && usageUnitsForIngredient(ingredient)
    .some(unit => unit.name === name && Number(unit.factor_to_base) === factor)
}

export function recipeUnitSelectValue(ingredient: Ingredient | undefined, name: string | null, factor: number): string {
  return recipeUnitIsValid(ingredient, name, factor) ? name! : '__legacy_recipe_unit__'
}
