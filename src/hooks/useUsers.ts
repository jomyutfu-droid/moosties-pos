import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { hashPin } from '@/lib/pin'
import type { AppUser, Role } from '@/types'

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async (): Promise<AppUser[]> => {
      const { data, error } = await supabase.from('users').select('*').order('name')
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
      const { data, error } = await supabase.from('users').upsert(payload).select().single()
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
      const { error } = await supabase.from('users').update({ is_active: false }).eq('id', id)
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
