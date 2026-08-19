import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { getPinSessionToken } from '@/hooks/useAuth'
import { useSessionStore } from '@/store/session'

export interface BillHistory {
  id: string
  order_no: string | null
  status: 'paid' | 'void'
  channel: string
  total: number
  created_at: string
  closed_at: string | null
  user_id: string | null
  note: string | null
}

export function useBillHistory(limit = 50) {
  const token = useSessionStore((s) => s.pinSessionToken)
  const role = useSessionStore((s) => s.activeStaff?.role)

  return useQuery({
    queryKey: ['bill-history', limit],
    queryFn: async (): Promise<BillHistory[]> => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_no, status, channel, total, created_at, closed_at, user_id, note')
        .in('status', ['paid', 'void'])
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []).map((row: any) => ({
        ...row,
        total: Number(row.total ?? 0),
      })) as BillHistory[]
    },
    enabled: Boolean(token && role === 'owner'),
    refetchInterval: 30_000,
  })
}

export function useVoidBill() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { orderId: string; reason: string }) => {
      const { error } = await supabase.rpc('void_order_owner', {
        p_token: getPinSessionToken(),
        p_order_id: params.orderId,
        p_reason: params.reason,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bill-history'] })
      queryClient.invalidateQueries({ queryKey: ['sales-summary'] })
      queryClient.invalidateQueries({ queryKey: ['cash-sessions'] })
      queryClient.invalidateQueries({ queryKey: ['queue-orders'] })
    },
  })
}
