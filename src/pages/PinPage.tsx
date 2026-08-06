import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStaffList, verifySelectedStaffPin } from '@/hooks/useAuth'
import { useSessionStore } from '@/store/session'
import { useClockIn } from '@/hooks/useTimeLogs'
import { explainSupabaseError } from '@/lib/errors'
import type { AppUser } from '@/types'

export default function PinPage() {
  const setActiveStaff = useSessionStore((s) => s.setActiveStaff)
  const navigate = useNavigate()
  const clockIn = useClockIn()
  const { data: staff = [], isLoading: loadingStaff, error: staffError } = useStaffList()
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  function pressDigit(d: string) {
    setError(null)
    setPin((p) => (p.length < 6 ? p + d : p))
  }

  function backspace() {
    setError(null)
    setPin((p) => p.slice(0, -1))
  }

  async function confirm() {
    if (!selectedUser) return
    setChecking(true)
    setError(null)
    try {
      const user = await verifySelectedStaffPin(pin, selectedUser.id)
      if (!user) {
        setError('PIN ไม่ถูกต้อง')
        setPin('')
        return
      }
      await clockIn.mutateAsync({
        userId: user.id,
        note: 'เริ่มงานอัตโนมัติจาก PIN',
        automatic: true,
      })
      setActiveStaff(user)
      // ถ้าเริ่มหลังเวลาปกติ ระบบจะเปิดกะไว้เป็น OT และแจ้งเจ้าของตอนออกงาน
      navigate('/', { replace: true })
    } catch (err) {
      setError(explainSupabaseError(err))
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="card w-full max-w-sm p-6 text-center">
        <h1 className="text-lg font-bold mb-1">เข้าสู่ระบบพนักงาน</h1>
        {!selectedUser ? (
          <>
            <p className="text-gray-500 text-sm mb-4">เลือกผู้ใช้ก่อนกรอก PIN</p>
            {loadingStaff && <p className="text-sm text-gray-500 py-6">กำลังโหลดรายชื่อผู้ใช้…</p>}
            {staffError && <p className="text-sm text-red-600 mb-3">{explainSupabaseError(staffError, 'โหลดรายชื่อผู้ใช้ไม่สำเร็จ')}</p>}
            {!loadingStaff && !staffError && staff.length === 0 && (
              <p className="text-sm text-gray-500 py-6">ยังไม่มีผู้ใช้ที่เปิดใช้งาน</p>
            )}
            <div className="space-y-2 text-left">
              {staff.map((user) => (
                <button
                  key={user.id}
                  className="w-full rounded-xl border border-white/80 bg-white/70 px-4 py-3 text-left transition hover:bg-white active:scale-[0.99]"
                  onClick={() => { setSelectedUser(user); setError(null) }}
                >
                  <span className="block font-semibold text-brand-950">{user.name}</span>
                  <span className="text-xs text-gray-500">
                    {user.role === 'owner' ? 'เจ้าของร้าน' : user.role === 'manager' ? 'ผู้จัดการ' : 'พนักงาน'}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="text-gray-500 text-sm mb-1">ผู้ใช้ที่เลือก</p>
            <p className="font-semibold text-brand-950 mb-1">{selectedUser.name}</p>
            <button className="text-xs text-brand-700 hover:underline mb-4" onClick={() => { setSelectedUser(null); setPin(''); setError(null) }}>
              เปลี่ยนผู้ใช้
            </button>
            <p className="text-gray-500 text-sm mb-4">กรอก PIN เพื่อเริ่มงานและเข้าใช้งาน</p>
            <div className="flex justify-center gap-2 mb-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-8 h-10 rounded-lg border flex items-center justify-center text-lg ${
                    i < pin.length ? 'bg-brand-50 border-brand-400' : 'border-gray-300'
                  }`}
                >
                  {i < pin.length ? '•' : ''}
                </div>
              ))}
            </div>
            {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <button key={d} className="btn-secondary text-lg py-4" onClick={() => pressDigit(d)}>
                  {d}
                </button>
              ))}
              <span />
              <button className="btn-secondary text-lg py-4" onClick={() => pressDigit('0')}>
                0
              </button>
              <button className="btn-ghost text-sm" onClick={backspace}>
                ลบ
              </button>
            </div>
            <button
              className="btn-primary w-full"
              disabled={pin.length < 4 || checking}
              onClick={confirm}
            >
              {checking ? 'กำลังตรวจสอบ…' : 'ยืนยัน'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
