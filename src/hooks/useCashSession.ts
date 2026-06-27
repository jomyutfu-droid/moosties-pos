import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { round2 } from '@/lib/money'
import { useSessionStore } from '@/store/session'
import type { CashSession } from '@/types'

/** กะปัจจุบันที่ยังเปิดอยู่ (closed_at is null) */
export function useOpenCashSession() {
  return useQuery({
    queryKey: ['cash-session', 'open'],
    queryFn: async (): Promise<CashSession | null> => {
      const { data, error } = await supabase
        .from('cash_sessions')
        .select('*')
        .is('closed_at', null)
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as CashSession | null
    },
  })
}

export function useOpenSession() {
  const qc = useQueryClient()
  const activeStaff = useSessionStore((s) => s.activeStaff)
  return useMutation({
    mutationFn: async (openingCash: number) => {
      const { data, error } = await supabase
        .from('cash_sessions')
        .insert({
          branch_id: activeStaff?.branch_id ?? null,
          user_id: activeStaff?.id ?? null,
          opening_cash: openingCash,
        })
        .select()
        .single()
      if (error) throw error
      return data as CashSession
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cash-session'] }),
  })
}

/** เงินสดที่ขายได้ตั้งแต่เปิดกะ (สำหรับคำนวณยอดคาดหวัง) */
export async function getCashSalesSince(openedAt: string): Promise<number> {
  const { data, error } = await supabase
    .from('payments')
    .select('amount, orders!inner(status, created_at)')
    .eq('method', 'cash')
    .eq('orders.status', 'paid')
    .gte('orders.created_at', openedAt)
  if (error) throw error
  return round2((data ?? []).reduce((s, p) => s + (p.amount as number), 0))
}

export function useCloseSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: { session: CashSession; countedCash: number; note: string | null }) => {
      const cashSales = await getCashSalesSince(params.session.opened_at)
      const expected = round2(params.session.opening_cash + cashSales)
      const variance = round2(params.countedCash - expected)

      const { error } = await supabase
        .from('cash_sessions')
        .update({
          closed_at: new Date().toISOString(),
          counted_cash: params.countedCash,
          expected_cash: expected,
          variance,
          note: params.note,
        })
        .eq('id', params.session.id)
      if (error) throw error
      return { expected, variance }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cash-session'] }),
  })
}
