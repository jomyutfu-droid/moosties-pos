/**
 * useTimeLogs — check-in / check-out พนักงาน (Feature 8)
 * ตาราง time_logs: id, user_id, clock_in, clock_out, note
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface TimeLog {
  id: string
  user_id: string
  clock_in: string
  clock_out: string | null
  note: string | null
  created_at: string
}

/** รายการ time_logs ของวันนี้ */
export function useTodayTimeLogs() {
  return useQuery({
    queryKey: ['time-logs-today'],
    queryFn: async (): Promise<(TimeLog & { user_name: string })[]> => {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      const { data, error } = await supabase
        .from('time_logs')
        .select('*, user:users(name)')
        .gt('clock_in', start.toISOString())
        .order('clock_in', { ascending: false })
      if (error) throw error
      return (data ?? []).map((r: any) => ({
        ...r,
        user_name: r.user?.name ?? r.user_id,
      }))
    },
    refetchInterval: 30_000,
  })
}

/** พนักงานที่ยังไม่ clock-out วันนี้ */
export function useActiveTimeLogs() {
  return useQuery({
    queryKey: ['time-logs-active'],
    queryFn: async (): Promise<(TimeLog & { user_name: string })[]> => {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      const { data, error } = await supabase
        .from('time_logs')
        .select('*, user:users(name)')
        .gt('clock_in', start.toISOString())
        .is('clock_out', null)
        .order('clock_in')
      if (error) throw error
      return (data ?? []).map((r: any) => ({ ...r, user_name: r.user?.name ?? r.user_id }))
    },
    refetchInterval: 30_000,
  })
}

/** Clock-in */
export function useClockIn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, note }: { userId: string; note?: string }) => {
      // ห้าม clock-in ซ้ำถ้ายังไม่ clock-out
      const start = new Date(); start.setHours(0, 0, 0, 0)
      const { data: existing } = await supabase
        .from('time_logs')
        .select('id')
        .eq('user_id', userId)
        .gt('clock_in', start.toISOString())
        .is('clock_out', null)
        .maybeSingle()
      if (existing) throw new Error('พนักงานยังไม่ได้ clock-out จากรอบก่อน')

      const { error } = await supabase
        .from('time_logs')
        .insert({ user_id: userId, note: note ?? null })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['time-logs-today'] })
      qc.invalidateQueries({ queryKey: ['time-logs-active'] })
    },
  })
}

/** Clock-out */
export function useClockOut() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      const start = new Date(); start.setHours(0, 0, 0, 0)
      const { data, error: fetchErr } = await supabase
        .from('time_logs')
        .select('id')
        .eq('user_id', userId)
        .gt('clock_in', start.toISOString())
        .is('clock_out', null)
        .maybeSingle()
      if (fetchErr) throw fetchErr
      if (!data) throw new Error('ไม่พบรายการ clock-in ของวันนี้')

      const { error } = await supabase
        .from('time_logs')
        .update({ clock_out: new Date().toISOString() })
        .eq('id', data.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['time-logs-today'] })
      qc.invalidateQueries({ queryKey: ['time-logs-active'] })
    },
  })
}
