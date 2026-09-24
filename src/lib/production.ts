import { supabase } from '@/lib/supabase'
import { pendingOutboxCount } from '@/lib/db'
import { refreshReferenceData } from '@/lib/sync'

export async function productionAction<T>(token: string | null, action: string, data: object = {}): Promise<T> {
  if (!navigator.onLine) throw new Error('กรุณาเชื่อมต่ออินเทอร์เน็ตเพื่อใช้งานการผลิต')
  if (!token) throw new Error('กรุณาเข้าสู่ระบบด้วย PIN อีกครั้ง')
  if (['produce', 'cancel'].includes(action) && await pendingOutboxCount() > 0) {
    throw new Error('มีบิลขายรอซิงก์ กรุณารอให้ซิงก์เสร็จก่อนปรับสต็อกการผลิต')
  }
  const { data: result, error } = await supabase.rpc('production_action', {p_token: token, p_action: action, p_data: data})
  if (error) throw new Error(error.message)
  return result as T
}
export function refreshProductionStock() {
  // A successful database write remains successful even if cache refresh fails.
  void pendingOutboxCount().then(count => count === 0 ? refreshReferenceData() : undefined).catch(() => undefined)
}
