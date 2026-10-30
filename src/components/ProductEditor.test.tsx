import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProductWithRecipe } from '@/types'

const mocks = vi.hoisted(() => ({
  detail: undefined as ProductWithRecipe | undefined,
  save: vi.fn(), recipe: vi.fn(), insert: vi.fn(), remove: vi.fn(),
  recalc: vi.fn(), refresh: vi.fn(), close: vi.fn(),
}))
vi.mock('@/hooks/useMenu', () => ({
  useCategories: () => ({ data: [{ id: 'smoothie', name: 'สมูทตี้' }] }),
  useIngredients: () => ({ data: [{ id: 'grape', name: 'องุ่น', unit: 'g', cost_per_unit: 1, units: [{ id: 'piece', name: 'ลูก', factor_to_base: 20, kind: 'usage' }] }] }),
  useProductDetail: () => ({ data: mocks.detail }),
  useSaveProduct: () => ({ mutateAsync: mocks.save }),
  useSaveRecipeItems: () => ({ mutateAsync: mocks.recipe }),
  recalcProductCost: mocks.recalc,
}))
vi.mock('@/lib/sync', () => ({ refreshReferenceData: mocks.refresh }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ insert: mocks.insert, delete: mocks.remove }) } }))
vi.mock('@/components/SearchSelect', () => ({ SearchSelect: () => null }))
vi.mock('@/components/SweetnessEditor', () => ({ SweetnessEditor: () => null }))
vi.mock('@/components/NumberField', () => ({ NumberField: (props: object) => <input {...props} /> }))
import { ProductEditor } from './ProductEditor'

const original = {
  id: 'source', name: 'องุ่นปั่น', price: 79, category_id: 'smoothie', sku: 'OLD',
  prep_steps: 'ปั่นให้ละเอียด', is_active: false, sort_order: 7,
  sweetness_config: [{ ingredient_id: 'grape', less: 80, more: 120 }],
  recipe_items: [{ id: 'source-row', ingredient_id: 'grape', qty: 100, unit_name: 'ลูก', unit_factor: 20, sort_order: 0, note: 'เดิม' }],
} as unknown as ProductWithRecipe
let tree: ReactTestRenderer
function open(productId: string | null, copyFromId?: string) {
  act(() => { tree = create(<ProductEditor productId={productId} copyFromId={copyFromId} onClose={mocks.close} />) })
}
function saveButton() { return tree.root.findAllByType('button').find(b => b.children.includes('บันทึก'))! }
async function save() { await act(async () => { await saveButton().props.onClick() }) }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.detail = undefined
  mocks.save.mockResolvedValue({ id: 'new-product' })
  mocks.insert.mockResolvedValue({ error: null })
})
afterEach(() => { act(() => tree?.unmount()) })

describe('menu copy and required category', () => {
  it('starts new menus without a category and refuses writes until one is selected', async () => {
    open(null)
    act(() => tree.root.findAllByType('input')[0].props.onChange({ target: { value: 'ใหม่' } }))
    expect(tree.root.findByProps({ id: 'product-category' }).props.value).toBe('')
    await save()
    expect(mocks.save).not.toHaveBeenCalled()
    expect(tree.root.findByProps({ role: 'alert' }).children.join('')).toContain('กรุณาเลือกหมวดหมู่')
  })
  it('copies quantities, units and instructions into a new product without touching the source', async () => {
    mocks.detail = original
    open(null, 'source')
    expect(tree.root.findAllByType('input')[0].props.value).toBe('องุ่นปั่น (สำเนา)')
    expect(tree.root.findAllByType('input')[2].props.value).toBe('') // SKU must be unique
    expect(tree.root.findByProps({ 'aria-label': 'ปริมาณ องุ่น' }).props.value).toBe(5)
    expect(mocks.save).not.toHaveBeenCalled()
    expect(tree.root.findByProps({ id: 'product-category' }).props.value).toBe('')
    act(() => tree.root.findByProps({ id: 'product-category' }).props.onChange({ target: { value: 'smoothie' } }))
    await save()
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ id: undefined, category_id: 'smoothie', price: 79, prep_steps: 'ปั่นให้ละเอียด', sku: null, is_active: true, sweetness_config: original.sweetness_config }))
    expect(mocks.insert).toHaveBeenCalledWith([{ product_id: 'new-product', ingredient_id: 'grape', qty: 100, unit_name: 'ลูก', unit_factor: 20, sort_order: 0, note: 'เดิม' }])
    expect(mocks.recipe).not.toHaveBeenCalled()
    expect(mocks.remove).not.toHaveBeenCalled()
    expect(mocks.recalc).toHaveBeenCalledWith('new-product')
    expect(original.recipe_items[0].id).toBe('source-row')
  })
  it('removing a copied ingredient never deletes an original recipe row', async () => {
    mocks.detail = { ...original, sweetness_config: [] }
    open(null, 'source')
    act(() => tree.root.findByProps({ 'aria-label': 'ลบ องุ่น' }).props.onClick())
    act(() => tree.root.findByProps({ id: 'product-category' }).props.onChange({ target: { value: 'smoothie' } }))
    await save()
    expect(mocks.save).toHaveBeenCalled()
    expect(mocks.remove).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
  })
  it('keeps an existing menu category and its disabled status', async () => {
    mocks.detail = original
    open('source')
    expect(tree.root.findByProps({ id: 'product-category' }).props.value).toBe('smoothie')
    await save()
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'source', is_active: false, sku: 'OLD' }))
    expect(mocks.recipe).toHaveBeenCalledWith(expect.objectContaining({ upserts: [expect.objectContaining({ id: 'source-row', qty: 100 })] }))
  })
  it('preserves user edits when source data refetches', () => {
    mocks.detail = original
    open(null, 'source')
    act(() => tree.root.findAllByType('input')[0].props.onChange({ target: { value: 'สูตรใหม่' } }))
    mocks.detail = { ...original }
    act(() => tree.update(<ProductEditor productId={null} copyFromId="source" onClose={mocks.close} />))
    expect(tree.root.findAllByType('input')[0].props.value).toBe('สูตรใหม่')
  })
  it('blocks saving until the source recipe is loaded', () => {
    open(null, 'source')
    expect(saveButton().props.disabled).toBe(true)
  })
})
