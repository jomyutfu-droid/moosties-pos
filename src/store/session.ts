import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppUser } from '@/types'

/**
 * เซสชันของแอป:
 * - authUserId/email: ผู้ใช้ที่ล็อกอินด้วย Supabase Auth (เจ้าของ/ผู้จัดการ ที่มีอีเมล)
 * - activeStaff: พนักงานที่ "สวมบทบาท" ปัจจุบันหน้าร้าน (สลับด้วย PIN ตามสเปกหัวข้อ 3)
 *
 * เครื่อง POS หนึ่งเครื่องอาจล็อกอินอุปกรณ์ค้างไว้ (authUser) แล้วให้พนักงานสลับ PIN
 * เพื่อระบุว่าใครเป็นคนขายในแต่ละบิล (audit_log, ติดตามยอดต่อคน)
 */
interface SessionState {
  authUserId: string | null
  authEmail: string | null
  authReady: boolean           // true หลัง anonymous/real session พร้อมแล้ว
  activeStaff: AppUser | null
  pinSessionToken: string | null
  setAuthUser: (id: string | null, email: string | null) => void
  setAuthReady: (ready: boolean) => void
  setActiveStaff: (user: AppUser | null) => void
  setPinSessionToken: (token: string | null) => void
  clearActiveStaff: () => void
  logout: () => void
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      authUserId: null,
      authEmail: null,
      authReady: false,
      activeStaff: null,
      pinSessionToken: null,
      setAuthUser: (id, email) => set({ authUserId: id, authEmail: email }),
      setAuthReady: (ready) => set({ authReady: ready }),
      // ตัด pin_hash ทิ้งก่อนเก็บ — session นี้ถูก persist ลง localStorage
      setActiveStaff: (user) => set({ activeStaff: user ? { ...user, pin_hash: '' } : null }),
      setPinSessionToken: (token) => set({ pinSessionToken: token }),
      clearActiveStaff: () => set({ activeStaff: null }),
      logout: () => set({ authUserId: null, authEmail: null, activeStaff: null, pinSessionToken: null }),
    }),
    {
      name: 'moosties-session',
      // ไม่ persist authReady — รีเซ็ตทุกครั้งที่โหลดหน้า
      // ไม่ persist pin_hash — กันแฮชหลุดใน localStorage (กรณีข้อมูลเก่าที่เคยเก็บไว้แล้วด้วย)
      partialize: (s) => ({
        authUserId: s.authUserId,
        authEmail: s.authEmail,
        activeStaff: s.activeStaff ? { ...s.activeStaff, pin_hash: '' } : null,
        // เก็บเฉพาะ session token แบบสุ่มที่ฐานข้อมูลออกให้ เพื่อให้ refresh แล้ว
        // RPC ที่ป้องกันด้วย PIN session ยังทำงานต่อได้ ไม่เก็บ pin_hash เด็ดขาด
        pinSessionToken: s.pinSessionToken,
      }),
    },
  ),
)
