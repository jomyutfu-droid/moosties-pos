import { describe, expect, it, vi } from 'vitest'
import { sweetnessIngredients, sweetnessOptions, sweetnessError, optionLabel } from './sweetness'
import { adjustedRecipe } from './recipe'
import { stockMovementsForOrderItem } from './stock'
import { unitCost } from './cogs'
import { useCartStore } from '@/store/cart'
import { buildPrintHTML } from '@/components/pos/ReceiptModal'
import type { CartLine, Ingredient, ProductOption, ProductWithRecipe, SelectedOption } from '@/types'

vi.mock('@/hooks/useSettings', () => ({ useSettings: () => ({ data: {} }) }))
const honey = { id: 'honey', name: 'น้ำผึ้ง', unit: 'ml', category: 'วัตถุดิบ', cost_per_unit: 0.2 } as Ingredient
const milk = { id: 'milk', name: 'นมข้นหวาน', unit: 'g', category: 'วัตถุดิบ', cost_per_unit: 0.1 } as Ingredient
const cheese = { id: 'cheese', name: 'ครีมชีส', unit: 'g', category: 'ท็อปปิ้ง', cost_per_unit: 0.3 } as Ingredient
const jelly = { id: 'jelly', name: 'เจลลี่', unit: 'g', category: 'ท็อปปิ้ง', cost_per_unit: 0.1 } as Ingredient
const ingredients = new Map([honey, milk, cheese, jelly].map(i => [i.id, i]))
const product = () => ({ id: 'drink', name: 'ทดสอบน้ำผึ้ง', price: 69, recipe_items: [
  { id: 'r1', ingredient_id: honey.id, ingredient: honey, qty: 20, unit_name: 'ช้อน', unit_factor: 10, note: null },
  { id: 'r2', ingredient_id: milk.id, ingredient: milk, qty: 30, unit_name: 'g', unit_factor: 1, note: null },
], options: [], sweetness_config: [{ ingredient_id: honey.id, less: 10, more: 30 }, { ingredient_id: milk.id, less: 15, more: 40 }] } as unknown as ProductWithRecipe)
const toppings: SelectedOption[] = [
  { option_id: 't1', name: 'ครีมชีส ×2', price_delta: 40, qty_delta: 60, linked_ingredient_id: cheese.id, ingredient_name: cheese.name, ingredient_unit: 'g' },
  { option_id: 't2', name: 'เจลลี่', price_delta: 5, qty_delta: 20, linked_ingredient_id: jelly.id, ingredient_name: jelly.name, ingredient_unit: 'g' },
]

describe('sweetness, recipe print and stock integration', () => {
  it.each([['less',10,15], ['normal',20,30], ['more',30,40]] as const)('keeps %s quantities identical in print and stock with multiple toppings', (level,h,m) => {
    const p = product()
    const options = [...sweetnessOptions(p, level, ingredients), ...toppings]
    const line = { product: p, selectedOptions: options, qty: 2, unitPrice: 114, unitCogs: 0, uid: 'line' } as CartLine
    const recipe = adjustedRecipe(line)
    expect(recipe.map(r => [r.name,r.qty,r.unit])).toEqual([['น้ำผึ้ง',h/10,'ช้อน'],['นมข้นหวาน',m,'g'],['ครีมชีส',60,'g'],['เจลลี่',20,'g']])
    expect(stockMovementsForOrderItem(p,2,options,'sale').map(r => r.qty_delta)).toEqual([-h*2,-m*2,-120,-40])
    expect(unitCost(p, options, ingredients)).toBeCloseTo(h*.2+m*.1+20)
    const html = buildPrintHTML({ orderNo: 'test', total:228, paid:228, change:0, createdAt:'2026-09-21T00:00:00Z', lines:[line] },{header:'Moosties',footer:''})
    expect(html.match(/class="sticker"/g)).toHaveLength(2)
    for (const r of recipe) expect(html).toContain(`<td class="r">${r.qty}</td><td class="r unit">${r.unit}</td>`)
    expect(optionLabel(options)).toBe(`${level==='less'?'หวานน้อย':level==='more'?'หวานมาก':'หวานปกติ'}, ครีมชีส ×2, เจลลี่`)
  })
  it('keeps printed recipe and cart separate after recipe changes and JSON round trips', () => {
    const p = product()
    const options = sweetnessOptions(p,'less',ingredients)
    options[0].recipe_snapshot = adjustedRecipe({product:p,selectedOptions:options})
    useCartStore.getState().clear()
    useCartStore.getState().addLine(p, options, ingredients)
    p.recipe_items[0].qty = 100
    const line = useCartStore.getState().lines[0]
    expect(line.product.recipe_items[0].qty).toBe(20)
    const persisted = JSON.parse(JSON.stringify(options))
    expect(adjustedRecipe({ product:p, selectedOptions:persisted })[0].qty).toBe(1)
    useCartStore.getState().addLine(product(), sweetnessOptions(product(),'normal',ingredients), ingredients)
    expect(useCartStore.getState().lines).toHaveLength(2)
  })
  it('supports explicit zero and blocks incomplete or contradictory levels', () => {
    const p = product()
    p.sweetness_config![0].less = 0
    expect(sweetnessError(p,'less',ingredients)).toBeNull()
    expect(adjustedRecipe({product:p, selectedOptions:sweetnessOptions(p,'less',ingredients)})[0].qty).toBe(0)
    p.sweetness_config![1].less = null
    expect(sweetnessError(p,'less',ingredients)).toContain('ตรวจปริมาณ')
    expect(()=>sweetnessOptions(p,'less',ingredients)).toThrow()
    expect(sweetnessError(p,'normal',ingredients)).toBeNull()
  })
  it('does not turn old positive low-sugar deltas or conflicting high-sugar deltas into recipes', () => {
    const p = product(); p.sweetness_config = null
    p.options = [
      {name:'หวานน้อย', linked_ingredient_id:'honey', qty_delta:10, price_delta:0},
      {name:'เพิ่มหวาน', linked_ingredient_id:'honey', qty_delta:10, price_delta:0},
      {name:'เพิ่มหวานมาก', linked_ingredient_id:'honey', qty_delta:20, price_delta:0},
    ] as ProductOption[]
    expect(sweetnessIngredients(p)).toEqual([{ingredient_id:'honey',less:null,more:null}])
    p.options = [{name:'หวานน้อย',linked_ingredient_id:'honey',qty_delta:-10,price_delta:0}] as ProductOption[]
    expect(sweetnessIngredients(p)[0].less).toBe(10)
  })
  it('uses a delta once when a recipe ingredient occurs in multiple rows', () => {
    const p = product(); p.recipe_items.push({...p.recipe_items[0],id:'r3',qty:10})
    const options = sweetnessOptions(p,'less',ingredients)
    expect(adjustedRecipe({product:p,selectedOptions:options})[0].qty).toBe(1)
    expect(stockMovementsForOrderItem(p,1,options,'sale')[0].qty_delta).toBe(-10)
  })
})
