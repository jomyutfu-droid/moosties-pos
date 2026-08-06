/**
 * useTimeLogs — check-in / check-out พนักงาน (Feature 8)
 * ตาราง time_logs: id, user_id, clock_in, clock_out, note
 */
import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useSessionStore } from '@/store/session'
import { getPinSessionToken } from '@/hooks/useAuth'
import { useSettings } from '@/hooks/useSettings'
import {
  createDefaultBusinessHours,
  getBillableMinutes as getConfiguredBillableMinutes,
  getEffectiveBusinessHours,
  getOvertimeStart,
  getWorkWindow as getConfiguredWorkWindow,
  isWithinWorkWindow as isConfiguredWithinWorkWindow,
} from '@/lib/businessHours'
import type { BusinessHoursSettings } from '@/types'

/** ช่วงเวลาที่นำไปคิดเป็นเวลาทำงานของร้าน (เวลาเครื่อง/เวลาไทย) */
export const WORK_START_HOUR = 10
export const WORK_START_MINUTE = 0
export const WORK_END_HOUR = 20
export const WORK_END_MINUTE = 30

export function getWorkWindow(date: Date, settings: BusinessHoursSettings = createDefaultBusinessHours()) {
  return getConfiguredWorkWindow(date, settings)
}

export function isRegularWorkDay(date: Date, settings: BusinessHoursSettings = createDefaultBusinessHours()) {
  return getEffectiveBusinessHours(date, settings).is_open
}

export function isWithinWorkWindow(date = new Date(), settings: BusinessHoursSettings = createDefaultBusinessHours()) {
  return isConfiguredWithinWorkWindow(date, settings)
}

export function getBillableMinutes(
  clockIn: string,
  clockOut: string | null,
  settings: BusinessHoursSettings = createDefaultBusinessHours(),
  now = new Date(),
) {
  return getConfiguredBillableMinutes(clockIn, clockOut, settings, now)
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
export async function upsertOvertimeRequest(
  log: TimeLog,
  clockOut: Date,
  settings: BusinessHoursSettings = createDefaultBusinessHours(),
) {
  const otStart = getOvertimeStart(log.clock_in, settings)
  if (!otStart) return
  const minutes = Math.max(0, Math.floor((clockOut.getTime() - otStart.getTime()) / 60_000))
  if (minutes <= 0) return

  const { error } = await supabase.rpc('submit_overtime_request', {
    p_token: getPinSessionToken(),
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
      const { data, error } = await supabase.rpc('get_time_logs_report', {
        p_token: getPinSessionToken(), p_from: start.toISOString(), p_to: end.toISOString(),
      })
      if (error) throw error
      return (data ?? []).map((r: any) => ({
        ...r,
        user_name: r.user_name ?? r.user_id,
        hourly_wage: Number(r.hourly_wage ?? 0),
      }))
    },
    enabled: Boolean(from && to),
  })
}

/** รายการ time_logs ของวันนี้ */
export function useTodayTimeLogs() {
  const activeStaffId = useSessionStore((s) => s.activeStaff?.id)
  const pinSessionToken = useSessionStore((s) => s.pinSessionToken)

  return useQuery({
    queryKey: ['time-logs-today', activeStaffId],
    queryFn: async (): Promise<(TimeLog & { user_name: string })[]> => {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      const end = new Date(start)
      end.setHours(23, 59, 59, 999)
      const { data, error } = await supabase.rpc('get_time_logs_session', {
        p_token: getPinSessionToken(), p_open_only: false,
        p_from: start.toISOString(), p_to: end.toISOString(),
      })
      if (error) throw error
      return (data ?? []).map((r: any) => ({
        ...r,
        user_name: r.user_name ?? r.user_id,
      }))
    },
    enabled: Boolean(activeStaffId && pinSessionToken),
    refetchInterval: 30_000,
  })
}

/** ช่วงเวลาของเดือนตามเวลาเครื่อง ซึ่งตั้งค่าเป็นเวลาไทยในเครื่อง POS */
function getLocalMonthRange(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  if (!year || !monthNumber || monthNumber < 1 || monthNumber > 12) {
    throw new Error('รูปแบบเดือนไม่ถูกต้อง')
  }

  return {
    start: new Date(year, monthNumber - 1, 1, 0, 0, 0, 0),
    end: new Date(year, monthNumber, 0, 23, 59, 59, 999),
  }
}

/** ประวัติเวลาของพนักงานที่กำลังใช้งาน เฉพาะรายการของตนเองตาม PIN session */
export function useMyTimeLogsByMonth(month: string) {
  const activeStaffId = useSessionStore((s) => s.activeStaff?.id)
  const pinSessionToken = useSessionStore((s) => s.pinSessionToken)

  return useQuery({
    queryKey: ['my-time-logs-month', activeStaffId, month],
    queryFn: async (): Promise<(TimeLog & { user_name: string })[]> => {
      const { start, end } = getLocalMonthRange(month)
      const { data, error } = await supabase.rpc('get_time_logs_session', {
        p_token: getPinSessionToken(),
        p_open_only: false,
        p_from: start.toISOString(),
        p_to: end.toISOString(),
      })
      if (error) throw error
      return (data ?? []).map((r: any) => ({
        ...r,
        user_name: r.user_name ?? r.user_id,
      }))
    },
    enabled: Boolean(month && activeStaffId && pinSessionToken),
    refetchInterval: 30_000,
  })
}

/** พนักงานที่ยังไม่ clock-out วันนี้ */
export function useActiveTimeLogs() {
  const activeStaffId = useSessionStore((s) => s.activeStaff?.id)
  const pinSessionToken = useSessionStore((s) => s.pinSessionToken)

  return useQuery({
    queryKey: ['time-logs-active', activeStaffId],
    queryFn: async (): Promise<(TimeLog & { user_name: string })[]> => {
      // ไม่กรองด้วยวันที่ เพื่อให้ปิดกะค้างจากวันก่อนหน้าได้อัตโนมัติ
      const { data, error } = await supabase.rpc('get_time_logs_session', {
        p_token: getPinSessionToken(), p_open_only: true, p_from: null, p_to: null,
      })
      if (error) throw error
      return (data ?? []).map((r: any) => ({ ...r, user_name: r.user_name ?? r.user_id }))
    },
    enabled: Boolean(activeStaffId && pinSessionToken),
    refetchInterval: 30_000,
  })
}

/**
 * หารายการ clock-in ที่ยังเปิดอยู่ล่าสุดของพนักงาน — ไม่จำกัดเฉพาะวันนี้
 * เพราะกะที่ข้ามเที่ยงคืน (เช่น เข้า 22:00 ออก 01:00) จะหาไม่เจอถ้ากรองด้วยวันที่
 */
async function findOpenLog(userId: string): Promise<{ id: string; clock_in: string } | null> {
  const { data, error } = await supabase.rpc('get_open_time_log', {
    p_token: getPinSessionToken(), p_user_id: userId,
  })
  if (error) throw error
  return ((data ?? [])[0] ?? null) as { id: string; clock_in: string } | null
}

/** ปิดรายการที่ค้างอยู่ทันที ณ เวลาที่ระบุ (ค่าเริ่มต้น = ตอนนี้) */
async function closeLog(logId: string, at: Date = new Date()): Promise<void> {
  const { error } = await supabase.rpc('close_time_log', {
    p_token: getPinSessionToken(), p_log_id: logId, p_clock_out: at.toISOString(),
  })
  if (error) throw error
}

/** เมื่อเลยเวลาปิดร้านให้เปิดกะต่อเพื่อเก็บ OT จนกว่าจะออกงานหรือถึงเที่ยงคืน */
async function closeExpiredLogs(logs: TimeLog[], settings: BusinessHoursSettings) {
  const now = new Date()
  for (const log of logs) {
    const workDate = new Date(log.clock_in)
    const { end: regularEnd, is_open: isOpen } = getWorkWindow(workDate, settings)
    const midnight = getNextMidnight(workDate)
    if ((!isOpen || now >= regularEnd) && now > new Date(log.clock_in)) {
      await upsertOvertimeRequest(log, now >= midnight ? midnight : now, settings)
    }
    if (now >= midnight) {
      await closeLog(log.id, midnight)
    }
  }
}

/** เรียกจากหน้าหลัก เพื่อปิดกะอัตโนมัติเมื่อถึง 20:30 */
export function useAutoCloseExpiredTimeLogs() {
  const { data: openLogs = [] } = useActiveTimeLogs()
  const { data: settings } = useSettings()
  const qc = useQueryClient()
  const running = useRef(false)

  useEffect(() => {
    const run = () => {
      if (running.current || openLogs.length === 0) return
      running.current = true
      closeExpiredLogs(openLogs, settings?.business_hours ?? createDefaultBusinessHours())
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
  }, [openLogs, qc, settings?.business_hours])
}

/** Clock-in — force = ปิดกะที่ค้างอยู่ให้อัตโนมัติแล้วเข้างานใหม่ */
export function useClockIn() {
  const { data: settings } = useSettings()
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
      const businessHours = settings?.business_hours ?? createDefaultBusinessHours()
      const todayWindow = getWorkWindow(now, businessHours)
      if (!todayWindow.is_open && !todayWindow.allow_ot) {
        throw new Error('วันนี้ร้านปิดและไม่ได้อนุญาตให้พนักงานเข้ามาทำ OT')
      }
      const open = await findOpenLog(userId)
      if (open) {
        const openedAt = new Date(open.clock_in)
        const { end: openedDayEnd, is_open: openedDayIsOpen } = getWorkWindow(openedAt, businessHours)
        const sameLocalDay = openedAt.toDateString() === now.toDateString()

        // PIN ซ้ำในวันเดียวกันไม่ควรสร้างกะซ้ำ
        if (automatic && sameLocalDay) return 'already-active' as const

        // ปิดกะเก่า และเก็บ OT ที่เกิดขึ้นก่อนการเปิดกะใหม่/แก้กะค้าง
        if (now >= openedDayEnd || !sameLocalDay) {
          const midnight = getNextMidnight(openedAt)
          const closeAt = sameLocalDay ? now : midnight
          const oldLog = { ...open, user_id: userId, clock_out: null, note: null, created_at: open.clock_in } as TimeLog
          if (closeAt > openedDayEnd || !openedDayIsOpen) {
            await upsertOvertimeRequest(oldLog, closeAt > midnight ? midnight : closeAt, businessHours)
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

      const { data, error } = await supabase.rpc('create_time_log', {
        p_token: getPinSessionToken(), p_user_id: userId, p_note: note ?? null,
      })
      if (error) throw error
      if (!data?.[0]) throw new Error('ไม่สามารถบันทึกเวลาเข้างานได้')
      return isWithinWorkWindow(now, businessHours) ? 'started' as const : 'started-overtime' as const
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['time-logs-today'] })
      qc.invalidateQueries({ queryKey: ['time-logs-active'] })
    },
  })
}

/** Clock-out */
export function useClockOut() {
  const { data: settings } = useSettings()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      const open = await findOpenLog(userId)
      if (!open) throw new Error('ไม่พบรายการ clock-in ที่ยังเปิดอยู่')
      const now = new Date()
      const midnight = getNextMidnight(new Date(open.clock_in))
      const clockOutAt = now > midnight ? midnight : now
      const log = { ...open, user_id: userId, clock_out: null, note: null, created_at: open.clock_in } as TimeLog
      const businessHours = settings?.business_hours ?? createDefaultBusinessHours()
      const window = getWorkWindow(new Date(open.clock_in), businessHours)
      if (clockOutAt > window.end || !window.is_open) {
        await upsertOvertimeRequest(log, clockOutAt, businessHours)
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
  const pinSessionToken = useSessionStore((s) => s.pinSessionToken)
  return useQuery({
    queryKey: ['overtime-requests', 'pending'],
    queryFn: async (): Promise<OvertimeRequest[]> => {
      const { data, error } = await supabase.rpc('get_overtime_requests', {
        p_token: getPinSessionToken(), p_status: 'pending', p_from: null, p_to: null,
      })
      if (error) throw error
      return (data ?? []).map((row: any) => ({
        ...row,
        user_name: row.user_name ?? row.user_id,
        reviewer_name: row.reviewer_name,
        hourly_wage: Number(row.hourly_wage ?? 0),
        amount: Number(row.amount ?? 0),
        minutes: Number(row.minutes ?? 0),
      }))
    },
    refetchInterval: 30_000,
    enabled: Boolean(pinSessionToken),
  })
}

/** OT ที่อนุมัติแล้วสำหรับรวมในรายงานค่าแรงตามช่วงวันที่ */
export function useApprovedOvertimeByRange(from: string, to: string) {
  const pinSessionToken = useSessionStore((s) => s.pinSessionToken)
  return useQuery({
    queryKey: ['overtime-requests', 'approved', from, to],
    queryFn: async (): Promise<OvertimeRequest[]> => {
      const start = new Date(`${from}T00:00:00`)
      const end = new Date(`${to}T23:59:59.999`)
      const { data, error } = await supabase.rpc('get_overtime_requests', {
        p_token: getPinSessionToken(), p_status: 'approved', p_from: start.toISOString(), p_to: end.toISOString(),
      })
      if (error) throw error
      return (data ?? []).map((row: any) => ({
        ...row,
        user_name: row.user_name ?? row.user_id,
        hourly_wage: Number(row.hourly_wage ?? 0),
        amount: Number(row.amount ?? 0),
        minutes: Number(row.minutes ?? 0),
      }))
    },
    enabled: Boolean(from && to && pinSessionToken),
  })
}

export function useReviewOvertime() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status, reviewerId }: { id: string; status: 'approved' | 'rejected'; reviewerId: string }) => {
      void reviewerId
      const { error } = await supabase.rpc('review_overtime_request', {
        p_token: getPinSessionToken(), p_id: id, p_status: status,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['overtime-requests'] })
      qc.invalidateQueries({ queryKey: ['time-logs-range'] })
    },
  })
}
