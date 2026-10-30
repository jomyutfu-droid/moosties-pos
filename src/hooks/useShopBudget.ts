import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useSessionStore } from '@/store/session'
import type { BudgetData, BudgetEntry } from '@/domain/shopBudget'

export function useShopBudget(from: string, to: string) {
 const token = useSessionStore(s => s.pinSessionToken)
 const user = useSessionStore(s => s.activeStaff?.id)
 const qc = useQueryClient()
 async function request(action: string, entry: Partial<BudgetEntry> = {}) {
  if (!token) throw new Error('กรุณาเข้าสู่ระบบด้วย PIN เจ้าของร้าน')
  const { data, error } = await supabase.rpc('shop_budget', { p_token: token, p_action: action, p_from: from, p_to: to, p_entry: entry })
  if (error) throw new Error(error.code === '23505' ? 'มีรายการของช่องทางนี้ในวันนี้แล้ว กรุณาแก้ไขรายการเดิมด้านล่าง' : error.message)
  return data
 }
 const query = useQuery({ queryKey: ['shop-budget', user, token, from, to], queryFn: async () => await request('read') as BudgetData, enabled: !!token && !!from && !!to && from <= to })
 const mutation = useMutation({
  mutationFn: ({ action, entry }: { action: 'save' | 'void'; entry: Partial<BudgetEntry> }) => request(action, entry),
  onSuccess: () => qc.invalidateQueries({ queryKey: ['shop-budget'] }),
 })
 return { ...query, mutation, receipt: async (id: string) => (await request('receipt', { id })).receipt as string | null }
}
