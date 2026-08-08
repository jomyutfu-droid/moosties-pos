import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { refreshReferenceData } from '@/lib/sync'
import { round3, round2 } from '@/lib/money'
import type { Ingredient, IngredientUnit, StockMovement, StockMovementType } from '@/types'

/** หน้าขายอ่านวัตถุดิบ/ต้นทุนจากแคช Dexie — ต้อง refresh หลังแก้สต็อกหรือราคาวัตถุดิบ */
function syncCatalogCache() {
  refreshReferenceData().catch(() => undefined)
}

export function useIngredientsFull() {
  return useQuery({
    queryKey: ['ingredients-full'],
    queryFn: async (): Promise<Ingredient[]> => {
      const { data, error } = await supabase
        .from('ingredients')
        .select('*, units:ingredient_units(*)')
        .order('name')
      if (error) throw error
      return (data ?? []) as Ingredient[]
    },
  })
}

export type IngredientUnitInput = Pick<
  IngredientUnit,
  'name' | 'factor_to_base' | 'kind' | 'is_default_purchase' | 'is_default_usage'
> & { id?: string }

export type IngredientInput = Pick<
  Ingredient,
  'name' | 'unit' | 'category' | 'pack_price' | 'pack_qty' | 'reorder_point' | 'is_active'
> & { id?: string; units?: IngredientUnitInput[] }

export function useSaveIngredient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: IngredientInput) => {
      const { units, ...ingredientFields } = input
      const defaultPurchase = units?.find((unit) => unit.is_default_purchase)
      const packQty = defaultPurchase?.factor_to_base ?? input.pack_qty
      const cost_per_unit = packQty > 0 ? round2(input.pack_price / packQty) : 0
      const { data, error } = await supabase
        .from('ingredients')
        .upsert({ ...ingredientFields, pack_qty: packQty, cost_per_unit })
        .select()
        .single()
      if (error) throw error

      if (units) {
        const { error: deleteError } = await supabase
          .from('ingredient_units')
          .delete()
          .eq('ingredient_id', data.id)
        if (deleteError) throw deleteError

        const rows = units
          .filter((unit) => unit.name.trim() && unit.factor_to_base > 0)
          .map((unit) => ({
            ingredient_id: data.id,
            name: unit.name.trim(),
            factor_to_base: round3(unit.factor_to_base),
            kind: unit.kind,
            is_default_purchase: unit.is_default_purchase,
            is_default_usage: unit.is_default_usage,
          }))
        if (rows.length) {
          const { error: insertError } = await supabase.from('ingredient_units').insert(rows)
          if (insertError) throw insertError
        }
      }

      return { ...(data as Ingredient), units }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ingredients-full'] })
      qc.invalidateQueries({ queryKey: ['ingredients'] })
      syncCatalogCache()
    },
  })
}

export function useDeactivateIngredient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ingredients').update({ is_active: false }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ingredients-full'] })
      syncCatalogCache()
    },
  })
}

/** บันทึกการรับเข้า/ปรับ/ของเสีย ผ่าน RPC แบบ atomic (supabase/migrations/0003_stock_functions.sql) */
export function useRecordStockMovement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      ingredient_id: string
      type: StockMovementType
      qty_delta: number
      input_qty: number
      input_unit: string
      conversion_factor: number
      user_id: string | null
      note: string | null
      price_per_unit?: number // Feature 5: WAC — ส่งเมื่อ type='receive' เท่านั้น
    }) => {
      const { error } = await supabase.rpc('record_stock_movement_with_unit', {
        p_ingredient_id: params.ingredient_id,
        p_type: params.type,
        p_qty_delta: round3(params.qty_delta),
        p_user_id: params.user_id,
        p_note: params.note,
        p_price_per_input_unit: params.price_per_unit != null ? round2(params.price_per_unit) : null,
        p_input_qty: round3(params.input_qty),
        p_input_unit: params.input_unit,
        p_conversion_factor: round3(params.conversion_factor),
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ingredients-full'] })
      qc.invalidateQueries({ queryKey: ['ingredients'] })
      qc.invalidateQueries({ queryKey: ['stock-movements'] })
      syncCatalogCache()
    },
  })
}

export function useStockMovements(ingredientId: string | null, limit = 20) {
  return useQuery({
    queryKey: ['stock-movements', ingredientId],
    queryFn: async (): Promise<StockMovement[]> => {
      if (!ingredientId) return []
      const { data, error } = await supabase
        .from('stock_movements')
        .select('*')
        .eq('ingredient_id', ingredientId)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as StockMovement[]
    },
    enabled: !!ingredientId,
  })
}
