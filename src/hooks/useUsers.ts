import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { hashPin } from '@/lib/pin'
import { getPinSessionToken } from '@/hooks/useAuth'
import type { AppUser, Role } from '@/types'

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async (): Promise<AppUser[]> => {
      const token = getPinSessionToken()
      if (!token) throw new Error('ไม่พบ PIN session กรุณาเข้าสู่ระบบด้วย PIN ใหม่')
      const { data, error } = await supabase.rpc('get_users_admin', { p_token: token })
      if (error) throw error
      return (data ?? []) as AppUser[]
    },
  })
}

export type UserInput = Pick<AppUser, 'name' | 'email' | 'role' | 'is_active' | 'branch_id'> & {
  id?: string
  pin?: string // ถ้ามีค่า จะแฮชและบันทึกเป็น pin_hash ใหม่
}

export function useSaveUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: UserInput) => {
      const payload: Record<string, unknown> = {
        id: input.id,
        name: input.name,
        email: input.email || null,
        role: input.role,
        is_active: input.is_active,
        branch_id: input.branch_id,
      }
      if (input.pin) {
        payload.pin_hash = await hashPin(input.pin)
      }
      const { data, error } = await supabase.rpc('save_user_admin', {
        p_token: getPinSessionToken(), p_id: input.id ?? null, p_branch_id: input.branch_id,
        p_name: input.name, p_email: input.email || null, p_role: input.role,
        p_is_active: input.is_active, p_hourly_wage: 0, p_pin_hash: (payload.pin_hash as string | undefined) ?? null,
      })
      if (error) throw error
      return data as AppUser
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      qc.invalidateQueries({ queryKey: ['staff-list'] })
    },
  })
}

export function useDeactivateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('deactivate_user_admin', {
        p_token: getPinSessionToken(), p_id: id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      qc.invalidateQueries({ queryKey: ['staff-list'] })
    },
  })
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'เจ้าของร้าน',
  manager: 'ผู้จัดการ',
  staff: 'พนักงาน',
}
