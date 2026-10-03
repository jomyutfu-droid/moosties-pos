import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { refreshReferenceData } from '@/lib/sync'
import { useSessionStore } from '@/store/session'
import type { StoreTopping } from '@/types'

export function useStoreToppings() {
  return useQuery({
    queryKey: ['store-toppings'],
    queryFn: async (): Promise<StoreTopping[]> => {
      const { data, error } = await supabase.from('store_toppings').select('*').order('sort_order').order('name')
      if (error) throw error
      return data ?? []
    },
  })
}

export type ToppingInput = Pick<StoreTopping, 'id' | 'name' | 'price_delta' | 'linked_ingredient_id' | 'qty_delta' | 'sort_order' | 'is_active' | 'is_available' | 'revision'>

export function useSaveTopping() {
  const token = useSessionStore(s => s.pinSessionToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ToppingInput) => {
      if (!navigator.onLine) throw new Error('กรุณาเชื่อมต่ออินเทอร์เน็ตเพื่อจัดการท็อปปิ้ง')
      if (!token) throw new Error('กรุณาเข้าสู่ระบบด้วย PIN อีกครั้ง')
      const { data, error } = await supabase.rpc('save_store_topping', { p_token: token, p_data: input })
      if (error) throw error
      return data as StoreTopping
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['store-toppings'] }),
        qc.invalidateQueries({ queryKey: ['product-detail'] }),
        qc.invalidateQueries({ queryKey: ['ingredient-usage'] }),
      ])
      // A committed save stays successful if a device cannot refresh its cache.
      await refreshReferenceData().catch(() => undefined)
    },
  })
}
