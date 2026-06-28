import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useSessionStore } from '@/store/session'
import type { AppUser } from '@/types'

/**
 * ติดตามสถานะ Supabase Auth และ sync เข้ากับ session store
 * Feature 4: ถ้าไม่มี session จะ signInAnonymously อัตโนมัติ
 * (ผู้ใช้ที่เป็น owner/manager จะยืนยันตัวด้วย PIN ผ่านตาราง users)
 */
export function useAuthListener() {
  const setAuthUser = useSessionStore((s) => s.setAuthUser)
  const setAuthReady = useSessionStore((s) => s.setAuthReady)
  const logout = useSessionStore((s) => s.logout)
  const queryClient = useQueryClient()

  useEffect(() => {
    // รับการเปลี่ยนแปลง auth state (INITIAL_SESSION, SIGNED_IN, SIGNED_OUT ฯลฯ)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setAuthUser(session.user.id, session.user.email ?? null)
      } else {
        logout()
      }
      queryClient.invalidateQueries({ queryKey: ['current-app-user'] })
    })

    // ตรวจสอบ session ปัจจุบัน — ถ้าไม่มีให้ sign in แบบ anonymous
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        // ไม่มี session → สร้าง anonymous session เพื่อให้ RLS ผ่าน
        const { error } = await supabase.auth.signInAnonymously()
        if (error) console.error('[auth] signInAnonymously error:', error.message)
      }
      setAuthReady(true)
    })

    return () => sub.subscription.unsubscribe()
  }, [setAuthUser, setAuthReady, logout, queryClient])
}

/**
 * ดึงแถวใน public.users ที่ตรงกับ Supabase auth user id
 * Anonymous users จะไม่มี email → คืน null (ไม่มีสิทธิ์ owner/manager)
 */
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
