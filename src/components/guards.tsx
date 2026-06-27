import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useSessionStore } from '@/store/session'
import type { Role } from '@/types'

/** ต้องล็อกอินด้วย Supabase Auth (เจ้าของ/ผู้จัดการ) ก่อนเข้าได้ */
export function RequireAuth({ children }: { children: ReactNode }) {
  const authUserId = useSessionStore((s) => s.authUserId)
  const location = useLocation()
  if (!authUserId) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  return <>{children}</>
}

/** ต้องเลือกพนักงาน (PIN) ก่อนเข้าหน้าขาย/ปฏิบัติงาน */
export function RequireStaff({ children }: { children: ReactNode }) {
  const authUserId = useSessionStore((s) => s.authUserId)
  const activeStaff = useSessionStore((s) => s.activeStaff)
  if (!authUserId) return <Navigate to="/login" replace />
  if (!activeStaff) return <Navigate to="/pin" replace />
  return <>{children}</>
}

/** จำกัดสิทธิ์ตาม role ของพนักงานที่ active (สเปกหัวข้อ 3) */
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
