import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { refreshReferenceData } from '@/lib/sync'
import { baseCost } from '@/domain/cogs'
import type { Category, Ingredient, Product, ProductOption, ProductWithRecipe, RecipeItem } from '@/types'

/**
 * หน้าขาย (usePosCatalog) อ่านจากแคช Dexie ไม่ใช่ react-query
 * ทุก mutation ที่แก้เมนู/สูตร/ตัวเลือก/หมวด ต้องดึงข้อมูลอ้างอิงใหม่ลงแคช
 * ไม่งั้นหน้าขายจะยังใช้ราคา/สูตรเดิมจนกว่าจะรีโหลดหน้า
 */
function syncCatalogCache() {
  refreshReferenceData().catch(() => undefined)
}

/** คำนวณ cost_cached ของสินค้าใหม่จากสูตรล่าสุด — ต้องเรียกทุกครั้งที่สูตรเปลี่ยน */
export async function recalcProductCost(productId: string): Promise<number> {
  const [recipeRes, ingredientsRes] = await Promise.all([
    supabase.from('recipe_items').select('qty, ingredient_id').eq('product_id', productId),
    supabase.from('ingredients').select('id, cost_per_unit'),
  ])
  if (recipeRes.error) throw recipeRes.error
  if (ingredientsRes.error) throw ingredientsRes.error

  const costMap = new Map((ingredientsRes.data ?? []).map((i) => [i.id, i.cost_per_unit as number]))
  const cost = baseCost({
    recipe_items: (recipeRes.data ?? []).map((r) => ({
      qty: r.qty as number,
      ingredient: { cost_per_unit: costMap.get(r.ingredient_id as string) ?? 0 } as Ingredient,
    })) as unknown as ProductWithRecipe['recipe_items'],
  })

  const { error } = await supabase.from('products').update({ cost_cached: cost }).eq('id', productId)
  if (error) throw error
  return cost
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase.from('categories').select('*').order('sort_order')
      if (error) throw error
      return (data ?? []) as Category[]
    },
  })
}

export function useIngredients() {
  return useQuery({
    queryKey: ['ingredients'],
    queryFn: async (): Promise<Ingredient[]> => {
      const { data, error } = await supabase.from('ingredients').select('*').order('name')
      if (error) throw error
      return (data ?? []) as Ingredient[]
    },
  })
}

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('sort_order')
      if (error) throw error
      return (data ?? []) as Product[]
    },
  })
}

/** สินค้า 1 ตัว พร้อมสูตร (BOM) และตัวเลือก ใช้แก้ไขในหน้าเมนู/สูตร และใช้ในหน้าขาย */
export function useProductDetail(productId: string | null) {
  return useQuery({
    queryKey: ['product-detail', productId],
    queryFn: async (): Promise<ProductWithRecipe | null> => {
      if (!productId) return null
      const [productRes, recipeRes, optionsRes] = await Promise.all([
        supabase.from('products').select('*').eq('id', productId).single(),
        supabase
          .from('recipe_items')
          .select('*, ingredient:ingredients(*)')
          .eq('product_id', productId)
          .order('sort_order'),
        supabase.from('product_options').select('*').eq('product_id', productId).order('sort_order'),
      ])
      if (productRes.error) throw productRes.error
      if (recipeRes.error) throw recipeRes.error
      if (optionsRes.error) throw optionsRes.error

      return {
        ...(productRes.data as Product),
        recipe_items: (recipeRes.data ?? []) as (RecipeItem & { ingredient: Ingredient })[],
        options: (optionsRes.data ?? []) as ProductOption[],
      }
    },
    enabled: !!productId,
  })
}

export type ProductInput = Pick<
  Product,
  'name' | 'price' | 'category_id' | 'sku' | 'prep_steps' | 'is_active' | 'sort_order'
> & { id?: string }

export function useSaveProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ProductInput) => {
      const { data, error } = await supabase
        .from('products')
        .upsert(input.id ? input : { ...input })
        .select()
        .single()
      if (error) throw error
      return data as Product
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      syncCatalogCache()
    },
  })
}

export function useDeleteProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('products').update({ is_active: false }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      syncCatalogCache()
    },
  })
}

/** Feature 1: สลับ active/inactive สำหรับ owner/manager */
export function useToggleProductActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('products').update({ is_active }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      syncCatalogCache()
    },
  })
}

export function useSaveCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: Pick<Category, 'name' | 'sort_order' | 'is_active'> & { id?: string }) => {
      const { data, error } = await supabase.from('categories').upsert(input).select().single()
      if (error) throw error
      return data as Category
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      syncCatalogCache()
    },
  })
}

export function useDeleteEmptyCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: linkedProduct, error: checkError } = await supabase
        .from('products')
        .select('id')
        .eq('category_id', id)
        .limit(1)
        .maybeSingle()
      if (checkError) throw checkError
      if (linkedProduct) throw new Error('หมวดนี้ยังมีเมนูอยู่ กรุณาย้ายเมนูไปหมวดอื่นก่อน')

      const { data: deletedCategory, error } = await supabase
        .from('categories')
        .delete()
        .eq('id', id)
        .select('id')
        .maybeSingle()
      if (error) throw error
      if (!deletedCategory) throw new Error('ลบหมวดไม่สำเร็จ กรุณาตรวจสอบสิทธิ์แล้วลองอีกครั้ง')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      syncCatalogCache()
    },
  })
}

/** บันทึกรายการสูตร (เพิ่ม/แก้/ลบ) แล้วคำนวณ cost_cached ของสินค้าใหม่ */
export function useSaveRecipeItems(productId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      upserts: (Pick<RecipeItem, 'ingredient_id' | 'qty' | 'sort_order' | 'note'> & { id?: string })[]
      deleteIds: string[]
    }) => {
      if (params.deleteIds.length) {
        const { error } = await supabase.from('recipe_items').delete().in('id', params.deleteIds)
        if (error) throw error
      }

      // Do not mix existing rows (with an id) and new rows (without an id)
      // in one bulk upsert. PostgREST determines the payload columns for the
      // whole array, so a missing id on a new row can become NULL and violate
      // the generated UUID primary key constraint.
      const existingRows = params.upserts
        .filter((r): r is typeof r & { id: string } => Boolean(r.id))
        .map((r) => ({
          id: r.id,
          product_id: productId,
          ingredient_id: r.ingredient_id,
          qty: r.qty,
          sort_order: r.sort_order,
          note: r.note,
        }))
      const newRows = params.upserts
        .filter((r) => !r.id)
        .map((r) => ({
          product_id: productId,
          ingredient_id: r.ingredient_id,
          qty: r.qty,
          sort_order: r.sort_order,
          note: r.note,
        }))

      if (existingRows.length) {
        const { error } = await supabase.from('recipe_items').upsert(existingRows)
        if (error) throw error
      }
      if (newRows.length) {
        const { error } = await supabase.from('recipe_items').insert(newRows)
        if (error) throw error
      }

      return recalcProductCost(productId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-detail', productId] })
      qc.invalidateQueries({ queryKey: ['products'] })
      syncCatalogCache()
    },
  })
}

export function useSaveProductOptions(productId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      upserts: (Pick<ProductOption, 'name' | 'price_delta' | 'linked_ingredient_id' | 'qty_delta' | 'sort_order'> & {
        id?: string
      })[]
      deleteIds: string[]
    }) => {
      if (params.deleteIds.length) {
        const { error } = await supabase.from('product_options').delete().in('id', params.deleteIds)
        if (error) throw error
      }

      // Apply the same split for options because they also have generated UUID
      // primary keys and can be edited together with newly-added options.
      const existingRows = params.upserts
        .filter((r): r is typeof r & { id: string } => Boolean(r.id))
        .map((r) => ({
          id: r.id,
          product_id: productId,
          name: r.name,
          price_delta: r.price_delta,
          linked_ingredient_id: r.linked_ingredient_id,
          qty_delta: r.qty_delta,
          sort_order: r.sort_order,
        }))
      const newRows = params.upserts
        .filter((r) => !r.id)
        .map((r) => ({
          product_id: productId,
          name: r.name,
          price_delta: r.price_delta,
          linked_ingredient_id: r.linked_ingredient_id,
          qty_delta: r.qty_delta,
          sort_order: r.sort_order,
        }))

      if (existingRows.length) {
        const { error } = await supabase.from('product_options').upsert(existingRows)
        if (error) throw error
      }
      if (newRows.length) {
        const { error } = await supabase.from('product_options').insert(newRows)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-detail', productId] })
      syncCatalogCache()
    },
  })
}
