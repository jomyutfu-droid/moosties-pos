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
  activeStaff: AppUser | null
  setAuthUser: (id: string | null, email: string | null) => void
  setActiveStaff: (user: AppUser | null) => void
  clearActiveStaff: () => void
  logout: () => void
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      authUserId: null,
      authEmail: null,
      activeStaff: null,
      setAuthUser: (id, email) => set({ authUserId: id, authEmail: email }),
      setActiveStaff: (user) => set({ activeStaff: user }),
      clearActiveStaff: () => set({ activeStaff: null }),
      logout: () => set({ authUserId: null, authEmail: null, activeStaff: null }),
    }),
    { name: 'moosties-session' },
  ),
)
