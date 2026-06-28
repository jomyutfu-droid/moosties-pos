/**
 * Feature 8: TimePage — บันทึกเวลาพนักงาน (Check-in / Check-out)
 * แสดงรายการ time_logs ของวันนี้ พร้อมปุ่ม Clock-in / Clock-out ตามพนักงานที่ active
 */
import { useState } from 'react'
import { useSessionStore } from '@/store/session'
import { useStaffList } from '@/hooks/useAuth'
import { useTodayTimeLogs, useClockIn, useClockOut } from '@/hooks/useTimeLogs'

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}

function formatDuration(clockIn: string, clockOut: string | null): string {
  const end = clockOut ? new Date(clockOut) : new Date()
  const mins = Math.floor((end.getTime() - new Date(clockIn).getTime()) / 60_000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h > 0 ? `${h} ชม. ` : ''}${m} นาที${!clockOut ? ' (ยังทำงานอยู่)' : ''}`
}

export default function TimePage() {
  const activeStaff = useSessionStore((s) => s.activeStaff)
  const { data: staffList } = useStaffList()
  const { data: logs, isLoading } = useTodayTimeLogs()
  const clockIn = useClockIn()
  const clockOut = useClockOut()

  const [selectedUserId, setSelectedUserId] = useState<string>(activeStaff?.id ?? '')
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // ตรวจสอบว่าพนักงานที่เลือกยัง clock-in อยู่ไหม
  const activeLogs = (logs ?? []).filter((l) => l.user_id === selectedUserId && !l.clock_out)
  const isClockdIn = activeLogs.length > 0

  async function handleClockIn() {
    if (!selectedUserId) return
    setMsg(null)
    try {
      await clockIn.mutateAsync({ userId: selectedUserId, note: note || undefined })
      setMsg({ type: 'ok', text: 'Clock-in สำเร็จ' })
      setNote('')
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด' })
    }
  }

  async function handleClockOut() {
    if (!selectedUserId) return
    setMsg(null)
    try {
      await clockOut.mutateAsync({ userId: selectedUserId })
      setMsg({ type: 'ok', text: 'Clock-out สำเร็จ' })
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด' })
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold text-gray-800">บันทึกเวลาพนักงาน</h1>

      {/* Clock-in / Clock-out form */}
      <div className="card p-5 space-y-4">
        <h2 className="font-semibold text-gray-700">เข้า / ออกงาน</h2>

        <div>
          <label className="label">พนักงาน</label>
          <select
            className="input"
            value={selectedUserId}
            onChange={(e) => { setSelectedUserId(e.target.value); setMsg(null) }}
          >
            <option value="">— เลือกพนักงาน —</option>
            {(staffList ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {!isClockdIn && (
          <div>
            <label className="label">หมายเหตุ (ถ้ามี)</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น กะเช้า" />
          </div>
        )}

        {msg && (
          <p className={`text-sm px-3 py-2 rounded-lg ${msg.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {msg.text}
          </p>
        )}

        <div className="flex gap-2">
          <button
            className="btn-primary flex-1"
            disabled={!selectedUserId || isClockdIn || clockIn.isPending}
            onClick={handleClockIn}
          >
            เข้างาน (Clock-in)
          </button>
          <button
            className="btn-secondary flex-1"
            disabled={!selectedUserId || !isClockdIn || clockOut.isPending}
            onClick={handleClockOut}
          >
            ออกงาน (Clock-out)
          </button>
        </div>
      </div>

      {/* รายการวันนี้ */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 font-semibold text-sm text-gray-600">
          บันทึกวันนี้ ({new Date().toLocaleDateString('th-TH')})
        </div>
        {isLoading && <p className="p-4 text-gray-400">กำลังโหลด…</p>}
        {!isLoading && (logs ?? []).length === 0 && (
          <p className="p-4 text-gray-400">ยังไม่มีบันทึก</p>
        )}
        <table className="w-full text-sm">
          <tbody>
            {(logs ?? []).map((log) => (
              <tr key={log.id} className="border-t border-gray-100">
                <td className="p-3 font-medium">{log.user_name}</td>
                <td className="p-3 text-gray-600">{formatTime(log.clock_in)}</td>
                <td className="p-3 text-gray-600">{log.clock_out ? formatTime(log.clock_out) : <span className="text-green-600">ยังทำงานอยู่</span>}</td>
                <td className="p-3 text-gray-400 text-xs">{formatDuration(log.clock_in, log.clock_out)}</td>
                {log.note && <td className="p-3 text-gray-400 text-xs">{log.note}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
