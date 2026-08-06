import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStaffList } from '@/hooks/useAuth'
import { verifyPin } from '@/lib/pin'
import { useSessionStore } from '@/store/session'
import type { AppUser } from '@/types'
import { useClockIn } from '@/hooks/useTimeLogs'
import { explainSupabaseError } from '@/lib/errors'

export default function PinPage() {
  const { data: staff, isLoading } = useStaffList()
  const setActiveStaff = useSessionStore((s) => s.setActiveStaff)
  const navigate = useNavigate()
  const clockIn = useClockIn()
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
    setChecking(true)
    setError(null)
    try {
      const matches: AppUser[] = []
      for (const user of staff ?? []) {
        if (await verifyPin(pin, user.pin_hash)) matches.push(user)
      }
      if (matches.length === 0) {
        setError('PIN ไม่ถูกต้อง')
        setPin('')
        return
      }
      if (matches.length > 1) {
        setError('พบ PIN ซ้ำกัน กรุณาให้เจ้าของร้านตั้ง PIN ใหม่')
        setPin('')
        return
      }
      const user = matches[0]
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
          disabled={pin.length < 4 || checking || isLoading}
          onClick={confirm}
        >
          {checking ? 'กำลังตรวจสอบ…' : 'ยืนยัน'}
        </button>
      </div>
    </div>
  )
}
