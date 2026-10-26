import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/production',()=>({productionAction:vi.fn()}))
vi.mock('./IngredientEditor',()=>({IngredientEditor:()=>null}))
import { ProductionRecipeEditor } from './ProductionRecipeEditor'
import type { ProductionRecipe } from '@/domain/production'
import type { Ingredient } from '@/types'
const milk={id:'milk',name:'นมสด',unit:'ML',stock_qty:1000,is_active:true,units:[{name:'ML',factor_to_base:1}]} as Ingredient
const recipe={id:'recipe',name:'ครีมชีส',output_id:'cheese',expected_qty:80,deduction_mode:'produce',items:[{ingredient_id:'milk',input_qty:80,input_unit:'มล.',base_unit:'มล.',factor:1}]} as ProductionRecipe
function render(value:ProductionRecipe|null){return renderToStaticMarkup(<ProductionRecipeEditor recipe={value} ingredients={[milk]} token="test" onClose={()=>{}} onSaved={()=>{}} reload={()=>{}} />)}
describe('recipe editor defaults and persisted unit names',()=>{
  it('starts a new recipe with sale deduction selected',()=>{
    const selected=render(null).match(/<input\b[^>]*checked=""[^>]*>/g)??[]
    expect(selected.some(input=>input.includes('value="sale"'))).toBe(true)
  })
  it('preserves an explicitly saved production mode and selects the equivalent ML option',()=>{
    const html=render(recipe)
    expect(html.match(/<input\b[^>]*checked=""[^>]*>/g)?.some(input=>input.includes('value="produce"'))).toBe(true)
    expect(html.match(/<option\b[^>]*selected=""[^>]*>/g)?.some(option=>option.includes('value="ML"'))).toBe(true)
    expect(html).not.toContain('หน่วยเดิม มล.')
  })
})
