import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { db } from '@/lib/db'
import type { Settings } from '@/types'

const DEFAULTS: Settings = {
  store_name: 'MOOSTTIES',
  promptpay_id: '',
  receipt_header: 'MOOSTTIES',
  receipt_footer: 'ขอบคุณที่ใช้บริการ',
  currency: 'THB',
  vat_percent: 0,
  low_stock_alert_on: true,
  staff_discount_limit: 0,
  target_margin_percent: 60,
  recipe_card_mode: 'before_add',
}

/** ตาราง settings เป็น key/value — รวมเป็น object เดียวสำหรับใช้งานในแอป และแคชไว้ใน Dexie สำหรับออฟไลน์ */
export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async (): Promise<Settings> => {
      try {
        const { data, error } = await supabase.from('settings').select('key, value')
        if (error) throw error
        const merged: Settings = { ...DEFAULTS }
        for (const row of data ?? []) {
          if (row.key in merged) {
            ;(merged as unknown as Record<string, unknown>)[row.key] = row.value
          }
        }
        await db.settings.put({ ...merged, id: 'singleton' })
        return merged
      } catch {
        const cached = await db.settings.get('singleton')
        return cached ?? DEFAULTS
      }
    },
    staleTime: 60_000,
  })
}

/** บันทึกค่า settings (key/value) ทีละหลายคีย์ */
export function useSaveSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: Partial<Settings>) => {
      const rows = Object.entries(values).map(([key, value]) => ({
        key,
        value,
        updated_at: new Date().toISOString(),
      }))
      const { error } = await supabase.from('settings').upsert(rows)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })
}
