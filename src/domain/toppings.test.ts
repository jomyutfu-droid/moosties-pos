import { describe, expect, it } from 'vitest'
import { migrateCachedToppings, optionsForProduct, selectedToppings, toppingIsAvailable } from './toppings'
import { stockMovementsForOrder } from './stock'
import { adjustedRecipe } from './recipe'
import { unitCost, unitPrice } from './cogs'
import { lineManOrderItems } from './lineMan'
import type { CartLine, Ingredient, ProductOption, ProductWithRecipe, StoreTopping } from '@/types'

const ingredient = { id: 'cheese', name: 'ครีมชีส', unit: 'ส่วน', is_active: true, cost_per_unit: 7, category: null } as Ingredient
const ingredients = new Map([[ingredient.id, ingredient]])
const topping = { id: 't', name: 'ครีมชีส', price_delta: 20, qty_delta: 1, linked_ingredient_id: 'cheese', sort_order: 1, is_active: true, is_available: true, revision: 1 } as StoreTopping
const legacy = [
  { ...topping, id: 'legacy-topping', product_id: 'old' },
  { ...topping, id: 'sweet', name: 'เพิ่มหวาน', product_id: 'old', linked_ingredient_id: 'syrup', qty_delta: 10 },
  { ...topping, id: 'no', name: 'ไม่เพิ่ม', product_id: 'old' },
] as ProductOption[]
const product = (id: string): ProductWithRecipe => ({ id, name: 'ชา', price: 59, recipe_items: [], options: optionsForProduct(id, legacy, [topping]) }) as unknown as ProductWithRecipe

describe('store-wide toppings', () => {
  it('migrates an offline cache without duplicating toppings or sharing sweetness', () => {
    const migrated = migrateCachedToppings([...legacy, { ...legacy[0], id: 'copy', product_id: 'other' }])
    expect(migrated).toHaveLength(1)
    expect(migrated[0]).toMatchObject({ name: 'ครีมชีส', price_delta: 20, qty_delta: 1, revision: 0 })
    expect(optionsForProduct('new', legacy, migrated)).toHaveLength(1)
  })
  it('never guesses a canonical recipe when cached prices conflict', () => {
    expect(migrateCachedToppings([legacy[0], { ...legacy[0], id: 'conflict', price_delta: 30 }])).toEqual([])
  })
  it('gives old and brand-new menus exactly the same toppings without legacy duplicates', () => {
    expect(product('old').options.filter(o => o.id === 't')).toHaveLength(1)
    expect(product('old').options.map(o => o.id).sort()).toEqual(['sweet', 't'])
    expect(product('new').options.map(o => o.id)).toEqual(['t'])
  })
  it('keeps legacy sweetness on its own menu and excludes disabled toppings everywhere', () => {
    expect(optionsForProduct('new', legacy, [{ ...topping, is_active: false }])).toEqual([])
    expect(optionsForProduct('old', legacy, []).map(o => o.id)).toEqual(['sweet'])
  })
  it('defaults to no topping and never charges or deducts all available toppings', () => {
    const selected = selectedToppings(product('new').options, {}, ingredients)
    expect(selected).toEqual([])
    expect(unitPrice(product('new'), selected)).toBe(59)
    expect(stockMovementsForOrder([{ product: product('new'), selectedOptions: selected, qty: 1 }])).toEqual([])
  })
  it('uses two portions consistently for price, cost, printing and two cups of stock', () => {
    const p = product('new')
    const selected = selectedToppings(p.options, { t: 2 }, ingredients)
    expect(unitPrice(p, selected)).toBe(99)
    expect(unitCost(p, selected, ingredients)).toBe(14)
    expect(stockMovementsForOrder([{ product: p, qty: 2, selectedOptions: selected }])[0].qty_delta).toBe(-4)
    expect(adjustedRecipe({ product: p, selectedOptions: selected })[0]).toMatchObject({ name: 'ครีมชีส', qty: 2, unit: 'ส่วน' })
  })
  it('selects multiple kinds independently and snapshots the old price and recipe', () => {
    const second = { ...topping, id: 'j', name: 'เจลลี่', linked_ingredient_id: 'jelly', price_delta: 5, qty_delta: 30 }
    const catalog = optionsForProduct('new', [], [topping, second])
    const map = new Map([...ingredients, ['jelly', { ...ingredient, id: 'jelly', name: 'เจลลี่', unit: 'กรัม' }]])
    const selected = selectedToppings(catalog, { t: 2, j: 1 }, map)
    const snapshot = adjustedRecipe({ product: product('new'), selectedOptions: selected })
    selected[0].recipe_snapshot = snapshot
    catalog[0].price_delta = 100
    catalog[0].qty_delta = 50
    expect(selected.reduce((s, o) => s + o.price_delta, 0)).toBe(45)
    expect(adjustedRecipe({ product: product('new'), selectedOptions: selected })).toEqual(snapshot)
    expect(snapshot).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'เจลลี่', qty: 30, unit: 'กรัม' })]))
  })
  it('LINE MAN keeps topping descriptors and stock movements while excluding every price', () => {
    const p = product('new')
    const selected = selectedToppings(p.options, { t: 2 }, ingredients)
    const line = { product: p, qty: 2, selectedOptions: selected, unitPrice: 99, unitCogs: 14 } as CartLine
    expect(lineManOrderItems([line])[0].options_text).toBe('ครีมชีส ×2')
    expect(JSON.stringify(lineManOrderItems([line]))).not.toMatch(/price|total|cost/)
    expect(stockMovementsForOrder([line])[0].qty_delta).toBe(-4)
  })
  it('blocks unavailable toppings or inactive/missing ingredients', () => {
    const opt = product('new').options[0]
    expect(toppingIsAvailable({ ...opt, is_available: false }, ingredients)).toBe(false)
    expect(() => selectedToppings([{ ...opt, is_available: false }], { t: 1 }, ingredients)).toThrow()
    expect(toppingIsAvailable(opt, new Map())).toBe(false)
    expect(toppingIsAvailable(opt, new Map([['cheese', { ...ingredient, is_active: false }]]))).toBe(false)
  })
  it.each([0.5, -1, 100])('rejects an invalid portion count %s', quantity => {
    if (quantity < 0) expect(selectedToppings(product('new').options, { t: quantity }, ingredients)).toEqual([])
    else expect(() => selectedToppings(product('new').options, { t: quantity }, ingredients)).toThrow()
  })
})
