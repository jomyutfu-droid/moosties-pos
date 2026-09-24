import { describe, expect, it } from 'vitest'
import { productionPreview, type ProductionRecipe } from './production'
import type { Ingredient } from '@/types'

describe('production quantity preview', () => {
  const recipe={items:[{ingredient_id:'A',input_qty:0.5,input_unit:'pack',factor:100,base_unit:'g'}]} as ProductionRecipe
  const ingredients=[{id:'A',name:'ชีส',unit:'g',is_active:true,stock_qty:80,cost_per_unit:0.3,units:[{name:'pack',factor_to_base:100}]}] as Ingredient[]
  it('converts packs before scaling and identifies exact stock shortage',()=>{
    const [row]=productionPreview(recipe,2,ingredients)
    expect(row.qty).toBe(100)
    expect(row.cost).toBe(30)
    expect(row.shortage).toBe(20)
    expect(row.unavailable).toBe(false)
    expect(ingredients[0].stock_qty).toBe(80)
  })
  it('requires recipe review after a unit conversion or active status changes',()=>{
    expect(productionPreview(recipe,1,[{...ingredients[0],units:[]}])[0].unavailable).toBe(true)
    expect(productionPreview(recipe,1,[{...ingredients[0],is_active:false}])[0].unavailable).toBe(true)
  })
})
