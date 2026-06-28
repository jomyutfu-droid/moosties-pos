import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useSessionStore } from '@/store/session'
import type { Role } from '@/types'

/**
 * Feature 4: แสดง spinner ขณะ anonymous session กำลัง init
 * เมื่อ authReady = true จะผ่านเสมอ (anonymous users มี authUserId อยู่แล้ว)
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const authReady = useSessionStore((s) => s.authReady)

  if (!authReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-500 text-sm">กำลังโหลด…</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

/** ต้องเลือกพนักงาน (PIN) ก่อนเข้าหน้าขาย/ปฏิบัติงาน */
export function RequireStaff({ children }: { children: ReactNode }) {
  const activeStaff = useSessionStore((s) => s.activeStaff)
  if (!activeStaff) return <Navigate to="/pin" replace />
  return <>{children}</>
}

/** จำกัดสิทธิ์ตาม role ของพนักงานที่ active */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const activeStaff = useSessionStore((s) => s.activeStaff)
  if (!activeStaff) return <Navigate to="/pin" replace />
  if (!roles.includes(activeStaff.role)) {
    return (
      <div className="p-6">
        <div className="card p-6 text-center">
          <p className="text-lg font-semibold text-gray-800">ไม่มีสิทธิ์เข้าถึงหน้านี้</p>
          <p className="text-gray-500 mt-1">ต้องเป็น {roles.join(' / ')}</p>
        </div>
      </div>
    )
  }
  return <>{children}</>
}
