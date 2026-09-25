import { describe, expect, it } from 'vitest'
import { recipeUnitIsValid, recipeUnitSelectValue } from './recipeUnits'
import { adjustedRecipe } from './recipe'
import { fromBaseQty, toBaseQty } from './units'
import type { Ingredient, CartLine } from '@/types'

const ingredient = { unit: 'ชิ้น', units: [{ name: 'ชิ้น', kind: 'usage', factor_to_base: 1 }] } as Ingredient

describe('persisted recipe units', () => {
  it('does not pretend an unavailable legacy unit is the first select option', () => {
    expect(recipeUnitIsValid(ingredient, 'ลูก', 1)).toBe(false)
    expect(recipeUnitSelectValue(ingredient, 'ลูก', 1)).toBe('__legacy_recipe_unit__')
    expect(recipeUnitSelectValue(ingredient, 'ชิ้น', 1)).toBe('ชิ้น')
  })
  it('requires confirmation even if the name matches but conversion changed', () => {
    expect(recipeUnitSelectValue(ingredient, 'ชิ้น', 8)).toBe('__legacy_recipe_unit__')
    for (const factor of [0, -1, NaN, Infinity]) expect(recipeUnitIsValid(ingredient, 'ชิ้น', factor)).toBe(false)
  })
  it('requires a unit and rejects purchase-only units', () => {
    expect(recipeUnitIsValid(undefined, null, 1)).toBe(false)
    const purchase = { ...ingredient, units: [{ name: 'ถุง', kind: 'purchase', factor_to_base: 100 }] } as Ingredient
    expect(recipeUnitIsValid(purchase, 'ถุง', 100)).toBe(false)
  })
  it('keeps the saved unit for POS and printing, then uses the explicitly confirmed unit', () => {
    const product = { recipe_items: [{ ingredient_id: 'a', qty: 1, unit_name: 'ลูก', unit_factor: 1, ingredient: { ...ingredient, name: 'แต่งแก้ว' } }] } as unknown as CartLine['product']
    expect(adjustedRecipe({ product, selectedOptions: [] })[0]).toMatchObject({ qty: 1, unit: 'ลูก' })
    product.recipe_items[0].unit_name = 'ชิ้น'
    expect(adjustedRecipe({ product, selectedOptions: [] })[0]).toMatchObject({ qty: 1, unit: 'ชิ้น' })
    expect(toBaseQty(fromBaseQty(100, 10), 10)).toBe(100)
  })
})
