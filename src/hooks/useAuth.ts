import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useSessionStore } from '@/store/session'
import type { AppUser } from '@/types'

/**
 * ติดตามสถานะ Supabase Auth และ sync เข้ากับ session store
 * Feature 4: ถ้าไม่มี session จะ signInAnonymously อัตโนมัติ
 * ทุกระดับยืนยันตัวด้วย PIN ผ่านตาราง users
 */
export function useAuthListener() {
  const setAuthUser = useSessionStore((s) => s.setAuthUser)
  const setAuthReady = useSessionStore((s) => s.setAuthReady)
  const queryClient = useQueryClient()

  useEffect(() => {
    // รับการเปลี่ยนแปลง auth state (INITIAL_SESSION, SIGNED_IN, SIGNED_OUT ฯลฯ)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setAuthUser(session.user.id, session.user.email ?? null)
      } else {
        // ล้างเฉพาะข้อมูล auth — ห้ามล้าง activeStaff
        // เพราะ token refresh ที่ล้มเหลวตอนออฟไลน์จะเด้งพนักงานไปหน้า PIN กลางกะ
        setAuthUser(null, null)
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
  }, [setAuthUser, setAuthReady, queryClient])
}

/** คง hook เดิมไว้สำหรับข้อมูลอ้างอิง — สิทธิ์จริงใช้ PIN session ฝั่งฐานข้อมูล */
export function useCurrentAppUser() {
  return useQuery({
    queryKey: ['current-app-user'],
    queryFn: async (): Promise<AppUser | null> => {
      const { data, error } = await supabase.rpc('get_pin_session_user')
      if (error) throw error
      const rows = (data ?? []) as Omit<AppUser, 'pin_hash'>[]
      return rows.length === 1 ? ({ ...rows[0], pin_hash: null } as AppUser) : null
    },
    refetchInterval: 60_000,
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

/** ตรวจ PIN ผ่าน RPC โดยไม่ส่ง pin_hash ของพนักงานลง browser */
export async function verifyStaffPin(pin: string): Promise<AppUser[]> {
  const { data, error } = await supabase.rpc('verify_staff_pin', { p_pin: pin })
  if (error) throw error
  return ((data ?? []) as Omit<AppUser, 'pin_hash'>[]).map((user) => ({
    ...user,
    pin_hash: null,
  })) as AppUser[]
}

export async function signOut() {
  await supabase.auth.signOut()
}
