import { useState } from 'react'
import { useDeactivateUser, useSaveUser, useUsers, ROLE_LABELS, type UserInput } from '@/hooks/useUsers'
import type { AppUser, Role } from '@/types'

export default function UsersPage() {
  const { data: users, isLoading } = useUsers()
  const [editing, setEditing] = useState<AppUser | null | undefined>(undefined)
  const deactivate = useDeactivateUser()

  const active = (users ?? []).filter((u) => u.is_active)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">ผู้ใช้ / สิทธิ์</h1>
        <button className="btn-primary" onClick={() => setEditing(null)}>
          + เพิ่มผู้ใช้
        </button>
      </div>

      {isLoading && <p className="text-gray-500">กำลังโหลด…</p>}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left p-3">ชื่อ</th>
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
                <td className="p-3 text-gray-500">{u.email ?? '-'}</td>
                <td className="p-3">{ROLE_LABELS[u.role]}</td>
                <td className="p-3 text-gray-500">{u.pin_hash ? 'ตั้งแล้ว' : '-'}</td>
                <td className="p-3 text-right space-x-2 whitespace-nowrap">
                  <button className="btn-ghost text-xs" onClick={() => setEditing(u)}>
                    แก้ไข
                  </button>
                  <button className="btn-ghost text-xs text-red-600" onClick={() => deactivate.mutate(u.id)}>
                    ปิดใช้งาน
                  </button>
                </td>
              </tr>
            ))}
            {active.length === 0 && !isLoading && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-gray-400">
                  ยังไม่มีผู้ใช้
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setError(null)
    if (pin && (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin))) {
      setError('PIN ต้องเป็นเลข 4-6 หลัก')
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
      }
      if (pin) input.pin = pin
      await save.mutateAsync(input)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ')
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
