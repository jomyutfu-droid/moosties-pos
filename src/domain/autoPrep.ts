import type { Ingredient } from '@/types'
import type { ProductionRecipe } from './production'

export function autoPrepUsage(recipe: ProductionRecipe, qty: number) {
  return recipe.items.map(item => ({ ingredient_id: item.ingredient_id,
    qty: Math.round(qty * item.input_qty * item.factor / recipe.expected_qty * 1000) / 1000 }))
}

/** The composite is a recipe reference; its cost follows the current raw ingredients. */
export function withAutoPrepCosts(ingredients: Ingredient[], recipes: ProductionRecipe[]): Ingredient[] {
  return ingredients.map(ingredient => {
    const recipe = recipes.find(r => r.output_id === ingredient.id && r.deduction_mode === 'sale')
    if (!recipe) return ingredient
    const cost = recipe.items.reduce((sum, row) => sum + row.input_qty * row.factor *
      Number(ingredients.find(i => i.id === row.ingredient_id)?.cost_per_unit ?? 0), 0) / recipe.expected_qty
    return { ...ingredient, daily_prep: true, auto_prep: true, auto_prep_inputs: recipe.items.map(row => ({ ingredient_id: row.ingredient_id, qty_per_unit: row.input_qty * row.factor / recipe.expected_qty })), cost_per_unit: cost }
  })
}

/** Keep outbox movements in recipe units; expand only the local stock preview. */
export function localPrepMovements(movements: { ingredient_id: string; qty_delta: number }[], ingredients: Ingredient[]) {
  return movements.flatMap(movement => {
    const inputs = ingredients.find(i => i.id === movement.ingredient_id)?.auto_prep_inputs
    return inputs ? inputs.map(input => ({ ingredient_id: input.ingredient_id,
      qty_delta: Math.round(movement.qty_delta * input.qty_per_unit * 1000) / 1000 })) : [movement]
  })
}
