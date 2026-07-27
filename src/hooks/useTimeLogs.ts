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
      // ไม่กรองด้วยวันที่ — พนักงานกะดึกที่ข้ามเที่ยงคืนต้องยังนับว่ากำลังทำงานอยู่
      const { data, error } = await supabase
        .from('time_logs')
        .select('*, user:users(name)')
        .is('clock_out', null)
        .order('clock_in')
      if (error) throw error
      return (data ?? []).map((r: any) => ({ ...r, user_name: r.user?.name ?? r.user_id }))
    },
    refetchInterval: 30_000,
  })
}

/**
 * หารายการ clock-in ที่ยังเปิดอยู่ล่าสุดของพนักงาน — ไม่จำกัดเฉพาะวันนี้
 * เพราะกะที่ข้ามเที่ยงคืน (เช่น เข้า 22:00 ออก 01:00) จะหาไม่เจอถ้ากรองด้วยวันที่
 */
async function findOpenLog(userId: string): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('time_logs')
    .select('id')
    .eq('user_id', userId)
    .is('clock_out', null)
    .order('clock_in', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as { id: string } | null
}

/** Clock-in */
export function useClockIn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, note }: { userId: string; note?: string }) => {
      // ห้าม clock-in ซ้ำถ้ายังไม่ clock-out (รวมกะที่ข้ามคืนมา)
      if (await findOpenLog(userId)) {
        throw new Error('พนักงานยังไม่ได้ clock-out จากรอบก่อน')
      }

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
      const open = await findOpenLog(userId)
      if (!open) throw new Error('ไม่พบรายการ clock-in ที่ยังเปิดอยู่')

      const { error } = await supabase
        .from('time_logs')
        .update({ clock_out: new Date().toISOString() })
        .eq('id', open.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['time-logs-today'] })
      qc.invalidateQueries({ queryKey: ['time-logs-active'] })
    },
  })
}
