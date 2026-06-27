import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStaffList } from '@/hooks/useAuth'
import { verifyPin } from '@/lib/pin'
import { useSessionStore } from '@/store/session'
import type { AppUser } from '@/types'

export default function PinPage() {
  const { data: staff, isLoading } = useStaffList()
  const setActiveStaff = useSessionStore((s) => s.setActiveStaff)
  const navigate = useNavigate()
  const [selected, setSelected] = useState<AppUser | null>(null)
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

  async function confirm(user: AppUser) {
    setChecking(true)
    setError(null)
    try {
      const ok = await verifyPin(pin, user.pin_hash)
      if (!ok) {
        setError('PIN ไม่ถูกต้อง')
        setPin('')
        return
      }
      setActiveStaff(user)
      navigate('/', { replace: true })
    } finally {
      setChecking(false)
    }
  }

  if (!selected) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <h1 className="text-xl font-bold text-brand-700 mb-4">เลือกพนักงาน</h1>
        {isLoading && <p className="text-gray-500">กำลังโหลด…</p>}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {staff?.map((u) => (
            <button
              key={u.id}
              onClick={() => setSelected(u)}
              className="card p-4 text-center hover:border-brand-500 hover:shadow"
            >
              <div className="text-lg font-semibold">{u.name}</div>
              <div className="text-xs text-gray-500 mt-1">{roleLabel(u.role)}</div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="card w-full max-w-sm p-6 text-center">
        <h1 className="text-lg font-bold mb-1">{selected.name}</h1>
        <p className="text-gray-500 text-sm mb-4">กรอก PIN เพื่อเข้าใช้งาน</p>
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
          <button className="btn-ghost text-sm" onClick={() => setSelected(null)}>
            ย้อนกลับ
          </button>
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
          onClick={() => confirm(selected)}
        >
          {checking ? 'กำลังตรวจสอบ…' : 'ยืนยัน'}
        </button>
      </div>
    </div>
  )
}

function roleLabel(role: AppUser['role']): string {
  switch (role) {
    case 'owner':
      return 'เจ้าของร้าน'
    case 'manager':
      return 'ผู้จัดการ'
    default:
      return 'พนักงาน'
  }
}
