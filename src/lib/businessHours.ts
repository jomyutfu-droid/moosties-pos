import type {
  BusinessHoursSettings,
  BusinessDaySetting,
  SpecialBusinessDate,
} from '@/types'

export const BUSINESS_DAY_LABELS = [
  'วันอาทิตย์',
  'วันจันทร์',
  'วันอังคาร',
  'วันพุธ',
  'วันพฤหัสบดี',
  'วันศุกร์',
  'วันเสาร์',
] as const

export const DEFAULT_OPEN_TIME = '10:00'
export const DEFAULT_CLOSE_TIME = '20:30'

export function createDefaultBusinessHours(): BusinessHoursSettings {
  return {
    timezone: 'Asia/Bangkok',
    weekly: BUSINESS_DAY_LABELS.map((_, day) => ({
      day,
      is_open: day !== 3,
      open_time: DEFAULT_OPEN_TIME,
      close_time: DEFAULT_CLOSE_TIME,
      allow_ot: true,
    })),
    special_dates: [],
  }
}

function isDateString(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function isTimeString(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

function normaliseDay(value: unknown, fallback: BusinessDaySetting): BusinessDaySetting {
  const row = value && typeof value === 'object' ? value as Partial<BusinessDaySetting> : {}
  return {
    day: fallback.day,
    is_open: typeof row.is_open === 'boolean' ? row.is_open : fallback.is_open,
    open_time: isTimeString(row.open_time) ? row.open_time : fallback.open_time,
    close_time: isTimeString(row.close_time) ? row.close_time : fallback.close_time,
    allow_ot: typeof row.allow_ot === 'boolean' ? row.allow_ot : fallback.allow_ot,
  }
}

function normaliseSpecialDate(value: unknown): SpecialBusinessDate | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Partial<SpecialBusinessDate>
  if (!isDateString(row.date)) return null
  const mode = row.mode === 'open' ? 'open' : 'closed'
  return {
    date: row.date,
    label: typeof row.label === 'string' && row.label.trim() ? row.label.trim() : 'วันพิเศษ',
    mode,
    open_time: isTimeString(row.open_time) ? row.open_time : DEFAULT_OPEN_TIME,
    close_time: isTimeString(row.close_time) ? row.close_time : DEFAULT_CLOSE_TIME,
    allow_ot: typeof row.allow_ot === 'boolean' ? row.allow_ot : true,
  }
}

export function normaliseBusinessHours(value: unknown): BusinessHoursSettings {
  const defaults = createDefaultBusinessHours()
  if (!value || typeof value !== 'object') return defaults

  const input = value as Partial<BusinessHoursSettings>
  const weeklyInput = Array.isArray(input.weekly) ? input.weekly : []
  const specialInput = Array.isArray(input.special_dates) ? input.special_dates : []
  const byDay = new Map(
    weeklyInput
      .filter((row): row is BusinessDaySetting => Boolean(row && typeof row === 'object'))
      .map((row) => [row.day, row]),
  )

  return {
    timezone: input.timezone === 'Asia/Bangkok' ? input.timezone : defaults.timezone,
    weekly: defaults.weekly.map((fallback) => normaliseDay(byDay.get(fallback.day), fallback)),
    special_dates: specialInput
      .map(normaliseSpecialDate)
      .filter((row): row is SpecialBusinessDate => row !== null)
      .sort((a, b) => a.date.localeCompare(b.date)),
  }
}

export interface EffectiveBusinessHours {
  date: string
  is_open: boolean
  open_time: string
  close_time: string
  allow_ot: boolean
  label: string
  is_special: boolean
}

function localDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getEffectiveBusinessHours(
  date: Date,
  settings: BusinessHoursSettings = createDefaultBusinessHours(),
): EffectiveBusinessHours {
  const config = normaliseBusinessHours(settings)
  const dateKey = localDateKey(date)
  const special = config.special_dates.find((row) => row.date === dateKey)
  if (special) {
    return {
      date: dateKey,
      is_open: special.mode === 'open',
      open_time: special.open_time,
      close_time: special.close_time,
      allow_ot: special.allow_ot,
      label: special.label,
      is_special: true,
    }
  }

  const day = config.weekly[date.getDay()] ?? config.weekly[0]
  return {
    date: dateKey,
    is_open: day.is_open,
    open_time: day.open_time,
    close_time: day.close_time,
    allow_ot: day.allow_ot,
    label: BUSINESS_DAY_LABELS[date.getDay()],
    is_special: false,
  }
}

function setTime(date: Date, value: string) {
  const [hour, minute] = value.split(':').map(Number)
  const result = new Date(date)
  result.setHours(hour, minute, 0, 0)
  return result
}

export function getWorkWindow(
  date: Date,
  settings: BusinessHoursSettings = createDefaultBusinessHours(),
) {
  const schedule = getEffectiveBusinessHours(date, settings)
  return {
    ...schedule,
    start: setTime(date, schedule.open_time),
    end: setTime(date, schedule.close_time),
  }
}

export function isWithinWorkWindow(
  date = new Date(),
  settings: BusinessHoursSettings = createDefaultBusinessHours(),
) {
  const window = getWorkWindow(date, settings)
  return window.is_open && date >= window.start && date < window.end
}

export function getBillableMinutes(
  clockIn: string,
  clockOut: string | null,
  settings: BusinessHoursSettings = createDefaultBusinessHours(),
  now = new Date(),
) {
  const started = new Date(clockIn)
  const window = getWorkWindow(started, settings)
  if (!window.is_open || window.end <= window.start) return 0
  const actualEnd = clockOut ? new Date(clockOut) : now
  const billableStart = started > window.start ? started : window.start
  const billableEnd = actualEnd < window.end ? actualEnd : window.end
  return Math.max(0, Math.floor((billableEnd.getTime() - billableStart.getTime()) / 60_000))
}

export function getOvertimeStart(
  clockIn: string,
  settings: BusinessHoursSettings = createDefaultBusinessHours(),
) {
  const started = new Date(clockIn)
  const window = getWorkWindow(started, settings)
  if (!window.allow_ot) return null
  if (!window.is_open) return started
  return started >= window.end ? started : window.end
}

export function validateBusinessHours(settings: BusinessHoursSettings): string | null {
  const config = normaliseBusinessHours(settings)
  const dates = new Set<string>()
  for (const day of config.weekly) {
    if (!day.is_open) continue
    if (day.close_time <= day.open_time) {
      return `${BUSINESS_DAY_LABELS[day.day]}: เวลาปิดต้องอยู่หลังเวลาเปิด`
    }
  }
  for (const special of config.special_dates) {
    if (dates.has(special.date)) return `วันพิเศษ ${special.date} ซ้ำกัน`
    dates.add(special.date)
    if (special.mode === 'open' && special.close_time <= special.open_time) {
      return `${special.date}: เวลาปิดต้องอยู่หลังเวลาเปิด`
    }
  }
  return null
}
