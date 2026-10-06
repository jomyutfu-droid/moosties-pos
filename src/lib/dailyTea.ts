import { supabase } from '@/lib/supabase'
import { pendingOutboxCount } from '@/lib/db'

export interface TeaTotal {
  id: string; business_date: string; brewed_ml: number; used_ml: number; waste_ml: number
  spoons: number; powder_grams: number | null; revision: number; current_used_ml: number
}
export interface TeaData {
  date: string; used_ml: number; grams_per_spoon: number | null; started_at: string
  can_manage: boolean; total: TeaTotal | null; history: TeaTotal[]
}
export function normalizeTeaData(data: TeaData): TeaData {
  // Older RPC responses represent an absent SQL row as an object of null fields.
  return { ...data, total: data.total?.id ? data.total : null }
}
export function bangkokDate(value: string | number = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
}
export function teaPreview(brewed: number, used: number) {
  return { valid: Number.isFinite(brewed) && brewed >= used && brewed <= 1_000_000 && brewed >= 0,
    waste: Math.max(0, Math.round((brewed - used) * 1000) / 1000), spoons: brewed / 200 }
}
export async function dailyTeaAction<T>(token: string | null, action: string, data: object = {}): Promise<T> {
  if (!navigator.onLine) throw new Error('เชื่อมต่ออินเทอร์เน็ตก่อนสรุปชา')
  if (!token) throw new Error('กรุณาเข้าสู่ระบบด้วย PIN อีกครั้ง')
  if (action !== 'load' && await pendingOutboxCount() > 0) throw new Error('มีบิลรอซิงก์ กรุณารอให้ซิงก์เสร็จก่อนปิดร้าน')
  const { data: result, error } = await supabase.rpc('daily_tea_action', { p_token: token, p_action: action, p_data: data })
  if (error) throw new Error(error.message)
  return result as T
}
