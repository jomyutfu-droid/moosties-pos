import { describe, expect, it } from 'vitest'
import { autoPrepUsage, localPrepMovements, withAutoPrepCosts } from './autoPrep'
import type { ProductionRecipe } from './production'
import type { Ingredient } from '@/types'
const protein = { output_id:'mix',expected_qty:300,deduction_mode:'sale',items:[
  {ingredient_id:'h',input_qty:180,factor:1},{ingredient_id:'d',input_qty:120,factor:1},
]} as ProductionRecipe

describe('automatic prep', () => {
  it('expands a Protein Berry cup and mixed-protein waste at 60:40', () => {
    expect(autoPrepUsage(protein,30)).toEqual([{ingredient_id:'h',qty:18},{ingredient_id:'d',qty:12}])
    expect(autoPrepUsage(protein,50)).toEqual([{ingredient_id:'h',qty:30},{ingredient_id:'d',qty:20}])
  })
  it('converts tea volume into dry tea for sales and daily waste', () => {
    const tea={expected_qty:200,items:[{ingredient_id:'tea',input_qty:5,factor:1}]} as ProductionRecipe
    expect(autoPrepUsage(tea,100)[0].qty).toBe(2.5)
    expect(autoPrepUsage(tea,200)[0].qty).toBe(5)
  })
  it('updates raw inventory locally while retaining original outbox quantities', () => {
    const ingredients=withAutoPrepCosts([{id:'mix'},{id:'h',cost_per_unit:1},{id:'d',cost_per_unit:2}] as Ingredient[],[protein])
    const outbox=[{ingredient_id:'mix',qty_delta:-30}]
    expect(localPrepMovements(outbox,ingredients)).toEqual([{ingredient_id:'h',qty_delta:-18},{ingredient_id:'d',qty_delta:-12}])
    expect(outbox).toEqual([{ingredient_id:'mix',qty_delta:-30}])
  })
  it('uses weighted raw costs and leaves the source inventory unchanged', () => {
    const ingredients=[{id:'mix',cost_per_unit:0},{id:'h',cost_per_unit:1},{id:'d',cost_per_unit:2},{id:'other',cost_per_unit:3}] as Ingredient[]
    const enriched=withAutoPrepCosts(ingredients,[protein])
    expect(enriched[0]).toMatchObject({cost_per_unit:1.4,daily_prep:true,auto_prep:true})
    expect(enriched[3]).toBe(ingredients[3])
    expect(ingredients[0].cost_per_unit).toBe(0)
  })
})
