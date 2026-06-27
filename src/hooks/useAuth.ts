import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useSessionStore } from '@/store/session'
import type { AppUser } from '@/types'

/** ติดตามสถานะ Supabase Auth และ sync เข้ากับ session store */
export function useAuthListener() {
  const setAuthUser = useSessionStore((s) => s.setAuthUser)
  const logout = useSessionStore((s) => s.logout)
  const queryClient = useQueryClient()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user
      if (user) setAuthUser(user.id, user.email ?? null)
      setReady(true)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setAuthUser(session.user.id, session.user.email ?? null)
      } else {
        logout()
      }
      queryClient.invalidateQueries({ queryKey: ['current-app-user'] })
    })

    return () => sub.subscription.unsubscribe()
  }, [setAuthUser, logout, queryClient])

  return { ready }
}

/** ดึงแถวใน public.users ที่ตรงกับอีเมลของผู้ใช้ Supabase Auth ที่ล็อกอินอยู่ (เจ้าของ/ผู้จัดการ) */
export function useCurrentAppUser() {
  const authEmail = useSessionStore((s) => s.authEmail)

  return useQuery({
    queryKey: ['current-app-user', authEmail],
    queryFn: async (): Promise<AppUser | null> => {
      if (!authEmail) return null
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', authEmail)
        .eq('is_active', true)
        .maybeSingle()
      if (error) throw error
      return data as AppUser | null
    },
    enabled: !!authEmail,
  })
}

/** รายชื่อพนักงานที่เลือกได้สำหรับสลับ PIN (ทุกคนในสาขา/ร้าน ที่ active) */
export function useStaffList() {
  return useQuery({
    queryKey: ['staff-list'],
    queryFn: async (): Promise<AppUser[]> => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return (data ?? []) as AppUser[]
    },
  })
}

export async function signInWithPassword(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

export async function signOut() {
  await supabase.auth.signOut()
}
