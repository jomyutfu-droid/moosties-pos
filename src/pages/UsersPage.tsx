import { useState } from 'react'
import { useDeactivateUser, useSaveUser, useUsers, ROLE_LABELS, type UserInput } from '@/hooks/useUsers'
import { explainSupabaseError } from '@/lib/errors'
import { formatBahtSymbol } from '@/lib/money'
import type { AppUser, Role } from '@/types'

export default function UsersPage() {
  const { data: users, isLoading, error, refetch } = useUsers()
  const [editing, setEditing] = useState<AppUser | null | undefined>(undefined)
  const deactivate = useDeactivateUser()

  const active = (users ?? []).filter((u) => u.is_active)

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">ผู้ใช้ / สิทธิ์</h1>
        <button className="btn-primary" onClick={() => setEditing(null)}>
          + เพิ่มผู้ใช้
        </button>
      </div>

      <p className="-mt-3 text-sm text-gray-500">
        ค่าแรงของแต่ละคนแสดงอยู่ในรายการด้านล่าง กด <span className="font-semibold text-brand-700">แก้ไขค่าแรง</span> เพื่อปรับค่าได้ทันที
      </p>

      {isLoading && <p className="text-gray-500">กำลังโหลด…</p>}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 whitespace-pre-line">
          <p className="font-medium">โหลดรายชื่อผู้ใช้ไม่สำเร็จ</p>
          <p className="mt-1">{explainSupabaseError(error, 'ไม่สามารถโหลดข้อมูลผู้ใช้ได้')}</p>
          <button className="btn-ghost mt-2 text-xs" onClick={() => refetch()}>
            ลองใหม่
          </button>
        </div>
      )}

      <div className="hidden md:block card overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left p-3">ชื่อ</th>
              <th className="text-left p-3">ค่าแรง/ชม.</th>
              <th className="text-left p-3">อีเมล</th>
              <th className="text-left p-3">สิทธิ์</th>
              <th className="text-left p-3">PIN</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {active.map((u) => (
              <tr key={u.id} className="border-t border-gray-100">
                <td className="p-3 font-medium">{u.name}</td>
                <td className="p-3 font-semibold text-brand-700">{formatBahtSymbol(u.hourly_wage)}/ชม.</td>
                <td className="p-3 text-gray-500">{u.email ?? '-'}</td>
                <td className="p-3">{ROLE_LABELS[u.role]}</td>
                <td className="p-3 text-gray-500">{u.pin_hash ? 'ตั้งแล้ว' : '-'}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  <button className="btn-primary text-xs" onClick={() => setEditing(u)}>
                    แก้ไขค่าแรง
                  </button>
                  <button className="btn-ghost text-xs text-red-600 ml-2" onClick={() => deactivate.mutate(u.id)}>
                    ปิดใช้งาน
                  </button>
                </td>
              </tr>
            ))}
            {active.length === 0 && !isLoading && !error && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-gray-400">
                  ยังไม่มีผู้ใช้
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="md:hidden card divide-y divide-gray-100">
        {active.map((u) => (
          <div key={u.id} className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-gray-800 truncate">{u.name}</p>
                <p className="mt-1 text-xs text-gray-500">{ROLE_LABELS[u.role]} · PIN {u.pin_hash ? 'ตั้งแล้ว' : 'ยังไม่ตั้ง'}</p>
                {u.email && <p className="mt-1 text-xs text-gray-500 truncate">{u.email}</p>}
              </div>
              <div className="shrink-0 rounded-xl bg-green-50 px-3 py-2 text-right">
                <p className="text-[11px] text-gray-500">ค่าแรง/ชม.</p>
                <p className="font-bold text-brand-700">{formatBahtSymbol(u.hourly_wage)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="btn-primary flex-1 text-xs" onClick={() => setEditing(u)}>
                แก้ไขค่าแรง
              </button>
              <button className="btn-ghost text-xs text-red-600" onClick={() => deactivate.mutate(u.id)}>
                ปิดใช้งาน
              </button>
            </div>
          </div>
        ))}
        {active.length === 0 && !isLoading && !error && <p className="p-6 text-center text-gray-400">ยังไม่มีผู้ใช้</p>}
      </div>

      {editing !== undefined && <UserEditor user={editing} onClose={() => setEditing(undefined)} />}
    </div>
  )
}

function UserEditor({ user, onClose }: { user: AppUser | null; onClose: () => void }) {
  const save = useSaveUser()
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [role, setRole] = useState<Role>(user?.role ?? 'staff')
  const [hourlyWage, setHourlyWage] = useState(String(user?.hourly_wage ?? 0))
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setError(null)
    if (pin && (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin))) {
      setError('PIN ต้องเป็นเลข 4-6 หลัก')
      return
    }
    const parsedHourlyWage = Number(hourlyWage)
    if (!Number.isFinite(parsedHourlyWage) || parsedHourlyWage < 0) {
      setError('ค่าแรงต้องเป็นตัวเลขตั้งแต่ 0 บาท/ชั่วโมงขึ้นไป')
      return
    }
    // ผู้ใช้ใหม่ที่ไม่มีทั้งอีเมล (ล็อกอินด้วยรหัสผ่าน) และ PIN (สลับหน้าร้าน) จะเข้าระบบไม่ได้เลย
    if (!user && !pin && !email) {
      setError('ต้องตั้ง PIN หรือกรอกอีเมลอย่างน้อยหนึ่งอย่าง ไม่งั้นผู้ใช้นี้จะเข้าระบบไม่ได้')
      return
    }
    try {
      const input: UserInput = {
        id: user?.id,
        name,
        email: email || null,
        role,
        is_active: true,
        branch_id: user?.branch_id ?? null,
        hourly_wage: parsedHourlyWage,
      }
      if (pin) input.pin = pin
      await save.mutateAsync(input)
      onClose()
    } catch (err) {
      setError(explainSupabaseError(err, 'บันทึกไม่สำเร็จ'))
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md">
        <div className="p-5 border-b border-gray-200">
          <h2 className="text-lg font-bold">{user ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้'}</h2>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="label">ชื่อ</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">อีเมล (สำหรับเจ้าของ/ผู้จัดการที่ล็อกอินด้วยรหัสผ่าน)</label>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label">สิทธิ์</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="staff">พนักงาน</option>
              <option value="manager">ผู้จัดการ</option>
              <option value="owner">เจ้าของร้าน</option>
            </select>
          </div>
          <div>
            <label className="label">ค่าแรงต่อชั่วโมง (บาท/ชม.)</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={hourlyWage}
              onChange={(e) => setHourlyWage(e.target.value)}
              placeholder="เช่น 50"
            />
            <p className="mt-1 text-xs text-gray-500">ใช้คำนวณค่าแรงและค่าล่วงเวลา</p>
          </div>
          <div>
            <label className="label">ตั้ง PIN ใหม่ (4-6 หลัก, เว้นไว้ถ้าไม่เปลี่ยน)</label>
            <input
              className="input"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="p-5 border-t border-gray-200 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn-primary" disabled={save.isPending || !name} onClick={handleSave}>
            {save.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  )
}
