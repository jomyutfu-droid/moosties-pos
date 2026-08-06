/**
 * useTimeLogs — check-in / check-out พนักงาน (Feature 8)
 * ตาราง time_logs: id, user_id, clock_in, clock_out, note
 */
import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** ช่วงเวลาที่นำไปคิดเป็นเวลาทำงานของร้าน (เวลาเครื่อง/เวลาไทย) */
export const WORK_START_HOUR = 10
export const WORK_START_MINUTE = 0
export const WORK_END_HOUR = 20
export const WORK_END_MINUTE = 30

export function getWorkWindow(date: Date) {
  const start = new Date(date)
  start.setHours(WORK_START_HOUR, WORK_START_MINUTE, 0, 0)
  const end = new Date(date)
  end.setHours(WORK_END_HOUR, WORK_END_MINUTE, 0, 0)
  return { start, end }
}

export function isWithinWorkWindow(date = new Date()) {
  const { start, end } = getWorkWindow(date)
  return date >= start && date < end
}

/** นาทีที่คิดค่าแรงจริง โดยตัดเวลานอก 10:00–20:30 ออก */
export function getBillableMinutes(clockIn: string, clockOut: string | null, now = new Date()) {
  const started = new Date(clockIn)
  const { start, end } = getWorkWindow(started)
  const actualEnd = clockOut ? new Date(clockOut) : now
  const billableStart = started > start ? started : start
  const billableEnd = actualEnd < end ? actualEnd : end
  return Math.max(0, Math.floor((billableEnd.getTime() - billableStart.getTime()) / 60_000))
}

export interface TimeLog {
  id: string
  user_id: string
  clock_in: string
  clock_out: string | null
  note: string | null
  created_at: string
}

export interface TimeLogReport extends TimeLog {
  user_name: string
  hourly_wage: number
}

/** รายการเข้า–ออกงานตามช่วงวันที่ ใช้สำหรับคำนวณชั่วโมงและค่าแรง */
export function useTimeLogsByRange(from: string, to: string) {
  return useQuery({
    queryKey: ['time-logs-range', from, to],
    queryFn: async (): Promise<TimeLogReport[]> => {
      const start = new Date(`${from}T00:00:00`)
      const end = new Date(`${to}T23:59:59.999`)
      const { data, error } = await supabase
        .from('time_logs')
        .select('*, user:users(name, hourly_wage)')
        .gte('clock_in', start.toISOString())
        .lte('clock_in', end.toISOString())
        .order('clock_in', { ascending: true })
      if (error) throw error
      return (data ?? []).map((r: any) => ({
        ...r,
        user_name: r.user?.name ?? r.user_id,
        hourly_wage: Number(r.user?.hourly_wage ?? 0),
      }))
    },
    enabled: Boolean(from && to),
  })
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
      // ไม่กรองด้วยวันที่ เพื่อให้ปิดกะค้างจากวันก่อนหน้าได้อัตโนมัติ
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
async function findOpenLog(userId: string): Promise<{ id: string; clock_in: string } | null> {
  const { data, error } = await supabase
    .from('time_logs')
    .select('id, clock_in')
    .eq('user_id', userId)
    .is('clock_out', null)
    .order('clock_in', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as { id: string; clock_in: string } | null
}

/** ปิดรายการที่ค้างอยู่ทันที ณ เวลาที่ระบุ (ค่าเริ่มต้น = ตอนนี้) */
async function closeLog(logId: string, at: Date = new Date()): Promise<void> {
  const { error } = await supabase
    .from('time_logs')
    .update({ clock_out: at.toISOString() })
    .eq('id', logId)
  if (error) throw error
}

/** ปิดกะที่เลย 20:30 แล้ว โดยไม่ล็อกหน้าจอหรือเปลี่ยนพนักงานที่กำลังใช้งาน */
async function closeExpiredLogs(logs: TimeLog[]) {
  const now = new Date()
  for (const log of logs) {
    const { end } = getWorkWindow(new Date(log.clock_in))
    if (now >= end) await closeLog(log.id, end)
  }
}

/** เรียกจากหน้าหลัก เพื่อปิดกะอัตโนมัติเมื่อถึง 20:30 */
export function useAutoCloseExpiredTimeLogs() {
  const { data: openLogs = [] } = useActiveTimeLogs()
  const qc = useQueryClient()
  const running = useRef(false)

  useEffect(() => {
    const run = () => {
      if (running.current || openLogs.length === 0) return
      running.current = true
      closeExpiredLogs(openLogs)
        .then(() => {
          qc.invalidateQueries({ queryKey: ['time-logs-today'] })
          qc.invalidateQueries({ queryKey: ['time-logs-active'] })
        })
        .catch(() => undefined)
        .finally(() => { running.current = false })
    }

    run()
    const interval = window.setInterval(run, 30_000)
    return () => window.clearInterval(interval)
  }, [openLogs, qc])
}

/** Clock-in — force = ปิดกะที่ค้างอยู่ให้อัตโนมัติแล้วเข้างานใหม่ */
export function useClockIn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      userId,
      note,
      force = false,
      automatic = false,
    }: {
      userId: string
      note?: string
      force?: boolean
      automatic?: boolean
    }) => {
      const now = new Date()
      const open = await findOpenLog(userId)
      if (open) {
        const openedAt = new Date(open.clock_in)
        const { end: openedDayEnd } = getWorkWindow(openedAt)
        const sameLocalDay = openedAt.toDateString() === now.toDateString()

        // PIN ซ้ำในวันเดียวกันไม่ควรสร้างกะซ้ำ
        if (automatic && sameLocalDay && now < openedDayEnd) return 'already-active' as const

        // ปิดกะเก่า ณ 20:30 ของวันนั้น ไม่ลากเวลาข้ามเที่ยงคืน
        if (now >= openedDayEnd || !sameLocalDay) {
          await closeLog(open.id, openedDayEnd)
        } else if (force) {
          await closeLog(open.id, now)
        } else {
          const since = new Date(open.clock_in).toLocaleString('th-TH', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })
          throw new Error(`ยังมีกะค้างอยู่ตั้งแต่ ${since} — กด "ปิดกะค้าง & เข้างานใหม่" เพื่อดำเนินการต่อ`)
        }
      }

      // หลัง 20:30 รวมถึงช่วงหลังเที่ยงคืน ไม่สร้างกะใหม่และไม่คิดเป็นเวลาทำงาน
      if (!isWithinWorkWindow(now)) return 'outside-hours' as const

      const { error } = await supabase
        .from('time_logs')
        .insert({ user_id: userId, note: note ?? null })
      if (error) throw error
      return 'started' as const
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
      const now = new Date()
      const { end } = getWorkWindow(new Date(open.clock_in))
      const clockOutAt = now > end ? end : now
      // ถ้าออกก่อน 10:00 ให้เก็บเวลาออกจริง แต่รายงานจะคิดเป็น 0 นาที
      await closeLog(open.id, clockOutAt)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['time-logs-today'] })
      qc.invalidateQueries({ queryKey: ['time-logs-active'] })
    },
  })
}
