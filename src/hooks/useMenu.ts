import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { baseCost } from '@/domain/cogs'
import type { Category, Ingredient, Product, ProductOption, ProductWithRecipe, RecipeItem } from '@/types'

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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
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
      qc.invalidateQueries({ queryKey: ['pos-catalog'] })
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
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
      if (params.upserts.length) {
        const rows = params.upserts.map((r) => ({ ...r, product_id: productId }))
        const { error } = await supabase.from('recipe_items').upsert(rows)
        if (error) throw error
      }

      // คำนวณ cost_cached ใหม่จากสูตรล่าสุด
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

      const { error: updateError } = await supabase
        .from('products')
        .update({ cost_cached: cost })
        .eq('id', productId)
      if (updateError) throw updateError

      return cost
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-detail', productId] })
      qc.invalidateQueries({ queryKey: ['products'] })
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
      if (params.upserts.length) {
        const rows = params.upserts.map((r) => ({ ...r, product_id: productId }))
        const { error } = await supabase.from('product_options').upsert(rows)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-detail', productId] })
    },
  })
}
