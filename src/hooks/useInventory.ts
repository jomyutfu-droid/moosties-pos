import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { round3, round2 } from '@/lib/money'
import type { Ingredient, StockMovement, StockMovementType } from '@/types'

export function useIngredientsFull() {
  return useQuery({
    queryKey: ['ingredients-full'],
    queryFn: async (): Promise<Ingredient[]> => {
      const { data, error } = await supabase.from('ingredients').select('*').order('name')
      if (error) throw error
      return (data ?? []) as Ingredient[]
    },
  })
}

export type IngredientInput = Pick<
  Ingredient,
  'name' | 'unit' | 'category' | 'pack_price' | 'pack_qty' | 'reorder_point' | 'is_active'
> & { id?: string }

export function useSaveIngredient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: IngredientInput) => {
      const cost_per_unit = input.pack_qty > 0 ? round2(input.pack_price / input.pack_qty) : 0
      const { data, error } = await supabase
        .from('ingredients')
        .upsert({ ...input, cost_per_unit })
        .select()
        .single()
      if (error) throw error
      return data as Ingredient
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ingredients-full'] })
      qc.invalidateQueries({ queryKey: ['ingredients'] })
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ingredients-full'] }),
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
      user_id: string | null
      note: string | null
      price_per_unit?: number // Feature 5: WAC — ส่งเมื่อ type='receive' เท่านั้น
    }) => {
      const { error } = await supabase.rpc('record_stock_movement', {
        p_ingredient_id: params.ingredient_id,
        p_type: params.type,
        p_qty_delta: round3(params.qty_delta),
        p_user_id: params.user_id,
        p_note: params.note,
        p_price_per_unit: params.price_per_unit != null ? round2(params.price_per_unit) : null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ingredients-full'] })
      qc.invalidateQueries({ queryKey: ['ingredients'] })
      qc.invalidateQueries({ queryKey: ['stock-movements'] })
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
