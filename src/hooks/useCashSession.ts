import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { getPinSessionToken } from '@/hooks/useAuth'
import { useSessionStore } from '@/store/session'
import type { CashSession } from '@/types'

export interface CashSessionSummary extends CashSession {
  user_name: string
  cash_sales: number
  cash_in: number
  cash_out: number
}

export type CashMovementType = 'cash_in' | 'cash_out'

export interface CashMovement {
  id: string
  session_id: string
  user_id: string
  type: CashMovementType
  amount: number
  note: string | null
  created_at: string
  user_name?: string
}

export interface CashCloseResult {
  cash_session_id: string
  counted_cash: number
  expected_cash: number
  variance: number
  cash_sales: number
  cash_in: number
  cash_out: number
}

function firstRow<T>(data: unknown): T {
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('ไม่พบผลลัพธ์จากฐานข้อมูล')
  return row as T
}

/** รายการกะเงินสดที่ผู้ใช้มีสิทธิ์เห็น — พนักงานเห็นเฉพาะของตัวเอง */
export function useCashSessionSummaries(limit = 20) {
  const token = useSessionStore((s) => s.pinSessionToken)
  const activeStaffId = useSessionStore((s) => s.activeStaff?.id)
  return useQuery({
    queryKey: ['cash-sessions', activeStaffId, limit],
    queryFn: async (): Promise<CashSessionSummary[]> => {
      const { data, error } = await supabase.rpc('get_cash_session_summary', {
        p_token: getPinSessionToken(),
        p_limit: limit,
      })
      if (error) throw error
      return (data ?? []).map((row: any) => ({
        ...row,
        opening_cash: Number(row.opening_cash ?? 0),
        counted_cash: row.counted_cash == null ? null : Number(row.counted_cash),
        expected_cash: row.expected_cash == null ? null : Number(row.expected_cash),
        variance: row.variance == null ? null : Number(row.variance),
        cash_sales: Number(row.cash_sales ?? 0),
        cash_in: Number(row.cash_in ?? 0),
        cash_out: Number(row.cash_out ?? 0),
      })) as CashSessionSummary[]
    },
    enabled: Boolean(token),
    refetchInterval: 30_000,
  })
}

/** กะเงินสดที่เปิดอยู่ของพนักงานที่กำลังใช้งาน */
export function useOpenCashSession() {
  const activeStaffId = useSessionStore((s) => s.activeStaff?.id)
  const query = useCashSessionSummaries(50)
  return {
    ...query,
    data: query.data?.find((session) => !session.closed_at && session.user_id === activeStaffId) ?? null,
  }
}

export function useOpenSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (openingCash: number): Promise<CashSession> => {
      const { data, error } = await supabase.rpc('open_cash_session', {
        p_token: getPinSessionToken(),
        p_opening_cash: openingCash,
      })
      if (error) throw error
      return firstRow<CashSession>(data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cash-sessions'] }),
  })
}

export function useCashMovements(sessionId: string | null) {
  const token = useSessionStore((s) => s.pinSessionToken)
  const activeStaffId = useSessionStore((s) => s.activeStaff?.id)
  return useQuery({
    queryKey: ['cash-movements', activeStaffId, sessionId],
    queryFn: async (): Promise<CashMovement[]> => {
      const { data, error } = await supabase.rpc('get_cash_movements', {
        p_token: getPinSessionToken(),
        p_session_id: sessionId,
      })
      if (error) throw error
      return (data ?? []).map((row: any) => ({
        ...row,
        amount: Number(row.amount ?? 0),
      })) as CashMovement[]
    },
    enabled: Boolean(token && sessionId),
    refetchInterval: 30_000,
  })
}

export function useAddCashMovement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      sessionId: string
      type: CashMovementType
      amount: number
      note: string | null
    }): Promise<CashMovement> => {
      const { data, error } = await supabase.rpc('add_cash_movement', {
        p_token: getPinSessionToken(),
        p_session_id: params.sessionId,
        p_type: params.type,
        p_amount: params.amount,
        p_note: params.note,
      })
      if (error) throw error
      return firstRow<CashMovement>(data)
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['cash-sessions'] })
      qc.invalidateQueries({ queryKey: ['cash-movements', variables.sessionId] })
    },
  })
}

export function useCloseSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      session: CashSession
      countedCash: number
      note: string | null
      cupsSold: number
    }): Promise<CashCloseResult> => {
      const { data, error } = await supabase.rpc('close_cash_session_with_cups', {
        p_token: getPinSessionToken(),
        p_session_id: params.session.id,
        p_counted_cash: params.countedCash,
        p_note: params.note,
        p_cups_sold: params.cupsSold,
      })
      if (error) throw error
      return firstRow<CashCloseResult>(data)
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['cash-sessions'] })
      qc.invalidateQueries({ queryKey: ['cash-movements', variables.session.id] })
      // ปิดกะแล้ว RPC จะสร้าง sales_volume reward เมื่อได้ 25 แก้วขึ้นไป
      // ให้หน้ารายงานเจ้าของร้านเห็นรายการใหม่ทันที ไม่ค้างค่าเดิมเป็น 0
      qc.invalidateQueries({ queryKey: ['staff-rewards'] })
    },
  })
}
