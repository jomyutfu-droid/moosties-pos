/**
 * useTimeLogs — check-in / check-out พนักงาน (Feature 8)
 * ตาราง time_logs: id, user_id, clock_in, clock_out, note
 */
import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useSessionStore } from '@/store/session'

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

/** ร้านปิดตามปกติทุกวันพุธ (ค่าเริ่มต้นของร้าน) */
export function isRegularWorkDay(date: Date) {
  return date.getDay() !== 3
}

export function isWithinWorkWindow(date = new Date()) {
  const { start, end } = getWorkWindow(date)
  return isRegularWorkDay(date) && date >= start && date < end
}

/** นาทีที่คิดค่าแรงจริง โดยตัดเวลานอก 10:00–20:30 ออก */
export function getBillableMinutes(clockIn: string, clockOut: string | null, now = new Date()) {
  const started = new Date(clockIn)
  const { start, end } = getWorkWindow(started)
  if (!isRegularWorkDay(started)) return 0
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

export interface OvertimeRequest {
  id: string
  time_log_id: string
  user_id: string
  user_name: string
  ot_start: string
  ot_end: string
  minutes: number
  hourly_wage: number
  amount: number
  status: 'pending' | 'approved' | 'rejected'
  requested_at: string
  reviewed_at: string | null
  reviewer_name?: string
  note: string | null
}

function getNextMidnight(date: Date) {
  const next = new Date(date)
  next.setHours(24, 0, 0, 0)
  return next
}

/** บันทึก/ปรับปรุงคำขอ OT จากเวลาออกงานจริง โดยคิดเป็นรายนาที */
export async function upsertOvertimeRequest(log: TimeLog, clockOut: Date) {
  const started = new Date(log.clock_in)
  const { end } = getWorkWindow(started)
  const otStart = !isRegularWorkDay(started) || started > end ? started : end
  const minutes = Math.max(0, Math.floor((clockOut.getTime() - otStart.getTime()) / 60_000))
  if (minutes <= 0) return

  const { error } = await supabase.rpc('submit_overtime_request', {
    p_time_log_id: log.id,
    p_ot_start: otStart.toISOString(),
    p_ot_end: clockOut.toISOString(),
    p_note: null,
  })
  if (error) throw error
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

/** เมื่อเลยเวลาปิดร้านให้เปิดกะต่อเพื่อเก็บ OT จนกว่าจะออกงานหรือถึงเที่ยงคืน */
async function closeExpiredLogs(logs: TimeLog[]) {
  const now = new Date()
  for (const log of logs) {
    const workDate = new Date(log.clock_in)
    const { end: regularEnd } = getWorkWindow(workDate)
    const midnight = getNextMidnight(workDate)
    if ((!isRegularWorkDay(workDate) || now >= regularEnd) && now > new Date(log.clock_in)) {
      await upsertOvertimeRequest(log, now >= midnight ? midnight : now)
    }
    if (now >= midnight) {
      await closeLog(log.id, midnight)
    }
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
        if (automatic && sameLocalDay) return 'already-active' as const

        // ปิดกะเก่า และเก็บ OT ที่เกิดขึ้นก่อนการเปิดกะใหม่/แก้กะค้าง
        if (now >= openedDayEnd || !sameLocalDay) {
          const midnight = getNextMidnight(openedAt)
          const closeAt = sameLocalDay ? now : midnight
          const oldLog = { ...open, user_id: userId, clock_out: null, note: null, created_at: open.clock_in } as TimeLog
          if (closeAt > openedDayEnd || !isRegularWorkDay(openedAt)) {
            await upsertOvertimeRequest(oldLog, closeAt > midnight ? midnight : closeAt)
          }
          await closeLog(open.id, closeAt > midnight ? midnight : closeAt)
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

      // หลัง 20:30 ยังเปิดกะไว้เพื่อเก็บเวลาส่วน OT จนกว่าจะออกงาน/เที่ยงคืน

      const { error } = await supabase
        .from('time_logs')
        .insert({ user_id: userId, note: note ?? null })
        .select('id, user_id, clock_in, clock_out, note, created_at')
        .single()
      if (error) throw error
      return isWithinWorkWindow(now) ? 'started' as const : 'started-overtime' as const
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
      const midnight = getNextMidnight(new Date(open.clock_in))
      const clockOutAt = now > midnight ? midnight : now
      const log = { ...open, user_id: userId, clock_out: null, note: null, created_at: open.clock_in } as TimeLog
      if (clockOutAt > getWorkWindow(new Date(open.clock_in)).end) {
        await upsertOvertimeRequest(log, clockOutAt)
      }
      await closeLog(open.id, clockOutAt)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['time-logs-today'] })
      qc.invalidateQueries({ queryKey: ['time-logs-active'] })
    },
  })
}

/** OT ที่เจ้าของ/ผู้จัดการต้องตรวจสอบ */
export function usePendingOvertimeRequests() {
  const activeStaff = useSessionStore((s) => s.activeStaff)
  return useQuery({
    queryKey: ['overtime-requests', 'pending'],
    queryFn: async (): Promise<OvertimeRequest[]> => {
      const { data, error } = await supabase
        .from('overtime_requests')
        .select('*, user:users!overtime_requests_user_id_fkey(name), reviewer:users!overtime_requests_reviewed_by_fkey(name)')
        .eq('status', 'pending')
        .order('requested_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map((row: any) => ({
        ...row,
        user_name: row.user?.name ?? row.user_id,
        reviewer_name: row.reviewer?.name,
        hourly_wage: Number(row.hourly_wage ?? 0),
        amount: Number(row.amount ?? 0),
        minutes: Number(row.minutes ?? 0),
      }))
    },
    refetchInterval: 30_000,
    enabled: activeStaff?.role === 'owner' || activeStaff?.role === 'manager',
  })
}

/** OT ที่อนุมัติแล้วสำหรับรวมในรายงานค่าแรงตามช่วงวันที่ */
export function useApprovedOvertimeByRange(from: string, to: string) {
  const authEmail = useSessionStore((s) => s.authEmail)
  return useQuery({
    queryKey: ['overtime-requests', 'approved', from, to],
    queryFn: async (): Promise<OvertimeRequest[]> => {
      const start = new Date(`${from}T00:00:00`)
      const end = new Date(`${to}T23:59:59.999`)
      const { data, error } = await supabase
        .from('overtime_requests')
        .select('*, user:users!overtime_requests_user_id_fkey(name)')
        .eq('status', 'approved')
        .gte('ot_start', start.toISOString())
        .lte('ot_start', end.toISOString())
        .order('ot_start', { ascending: true })
      if (error) throw error
      return (data ?? []).map((row: any) => ({
        ...row,
        user_name: row.user?.name ?? row.user_id,
        hourly_wage: Number(row.hourly_wage ?? 0),
        amount: Number(row.amount ?? 0),
        minutes: Number(row.minutes ?? 0),
      }))
    },
    enabled: Boolean(from && to && (activeStaff?.role === 'owner' || activeStaff?.role === 'manager')),
  })
}

export function useReviewOvertime() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status, reviewerId }: { id: string; status: 'approved' | 'rejected'; reviewerId: string }) => {
      const { error } = await supabase.from('overtime_requests').update({
        status,
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
      }).eq('id', id).eq('status', 'pending')
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['overtime-requests'] })
      qc.invalidateQueries({ queryKey: ['time-logs-range'] })
    },
  })
}
