/**
 * Feature 8: TimePage — บันทึกเวลาพนักงาน (Check-in / Check-out)
 * แสดงรายการ time_logs ของวันนี้ พร้อมปุ่ม Clock-in / Clock-out ตามพนักงานที่ active
 */
import { useState } from 'react'
import { useSessionStore } from '@/store/session'
import {
  useTodayTimeLogs,
  useMyTimeLogsByMonth,
  useActiveTimeLogs,
  useClockIn,
  useClockOut,
  getBillableMinutes,
} from '@/hooks/useTimeLogs'
import { explainSupabaseError } from '@/lib/errors'
import { useSettings } from '@/hooks/useSettings'

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}

function formatDuration(clockIn: string, clockOut: string | null, businessHours?: Parameters<typeof getBillableMinutes>[2]): string {
  const mins = getBillableMinutes(clockIn, clockOut, businessHours)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h > 0 ? `${h} ชม. ` : ''}${m} นาที${!clockOut ? ' (ยังทำงานอยู่)' : ''}`
}

function getMonthInput(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(month: string, amount: number) {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(year, monthNumber - 1 + amount, 1)
  return getMonthInput(date)
}

function formatMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(year, monthNumber - 1, 1).toLocaleDateString('th-TH', {
    month: 'long',
    year: 'numeric',
  })
}

function getLocalDateKey(iso: string) {
  const date = new Date(iso)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

export default function TimePage() {
  const activeStaff = useSessionStore((s) => s.activeStaff)
  const { data: logs, isLoading } = useTodayTimeLogs()
  const { data: openLogs } = useActiveTimeLogs()
  const clockIn = useClockIn()
  const clockOut = useClockOut()
  const { data: settings } = useSettings()
  const businessHours = settings?.business_hours

  const selectedUserId = activeStaff?.id ?? ''
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [selectedMonth, setSelectedMonth] = useState(getMonthInput())
  const currentMonth = getMonthInput()
  const { data: myMonthLogs = [], isLoading: monthLoading, error: monthError } = useMyTimeLogsByMonth(selectedMonth)

  const workedDays = new Set(myMonthLogs.map((log) => getLocalDateKey(log.clock_in))).size
  const totalMinutes = myMonthLogs.reduce(
    (total, log) => total + getBillableMinutes(log.clock_in, log.clock_out, businessHours),
    0,
  )
  const totalHours = Math.floor(totalMinutes / 60)
  const remainingMinutes = totalMinutes % 60

  // เช็คจากรายการที่ยังไม่ clock-out (ไม่ผูกกับวันที่)
  // ถ้าใช้ logs ของวันนี้ พนักงานกะดึกที่ข้ามเที่ยงคืนจะกดปุ่มออกงานไม่ได้
  const openLog = (openLogs ?? []).find((l) => l.user_id === selectedUserId)
  const isClockdIn = !!openLog

  // กะที่เปิดค้างข้ามวันมาแล้ว — เกือบแน่นอนว่าลืมกด clock-out
  const staleHours = openLog
    ? (Date.now() - new Date(openLog.clock_in).getTime()) / 3_600_000
    : 0
  const isStale = staleHours > 16

  async function handleForceClockIn() {
    if (!selectedUserId) return
    setMsg(null)
    try {
      await clockIn.mutateAsync({ userId: selectedUserId, note: note || undefined, force: true })
      setMsg({ type: 'ok', text: 'ปิดกะค้างและเข้างานใหม่เรียบร้อย' })
      setNote('')
    } catch (err) {
      setMsg({ type: 'err', text: explainSupabaseError(err) })
    }
  }

  async function handleClockIn() {
    if (!selectedUserId) return
    setMsg(null)
    try {
      await clockIn.mutateAsync({ userId: selectedUserId, note: note || undefined })
      setMsg({ type: 'ok', text: 'Clock-in สำเร็จ' })
      setNote('')
    } catch (err) {
      setMsg({ type: 'err', text: explainSupabaseError(err) })
    }
  }

  async function handleClockOut() {
    if (!selectedUserId) return
    setMsg(null)
    try {
      await clockOut.mutateAsync({ userId: selectedUserId })
      setMsg({ type: 'ok', text: 'Clock-out สำเร็จ' })
    } catch (err) {
      setMsg({ type: 'err', text: explainSupabaseError(err) })
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold text-gray-800">บันทึกเวลาพนักงาน</h1>

      {/* Clock-in / Clock-out form */}
      <div className="card p-5 space-y-4">
        <h2 className="font-semibold text-gray-700">เข้า / ออกงาน</h2>
        <p className="text-xs text-gray-500">
          หลังใส่ PIN ระบบเริ่มงานให้อัตโนมัติ คิดเวลาปกติตามเวลาทำการที่ตั้งไว้ และส่ง OT ให้ตรวจสอบเมื่อทำงานในช่วงที่อนุญาต
        </p>

        <div>
          <label className="label">พนักงานที่กำลังใช้งาน</label>
          <div className="input bg-gray-50">{activeStaff?.name ?? 'ยังไม่ได้ระบุพนักงาน'}</div>
          <p className="text-xs text-gray-500 mt-1">ระบบเลือกจาก PIN ที่เข้าสู่ระบบ ไม่ต้องเลือกซ้ำ</p>
        </div>

        {!isClockdIn && (
          <div>
            <label className="label">หมายเหตุ (ถ้ามี)</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น กะเช้า" />
          </div>
        )}

        {/* กะค้างข้ามวัน — ลืมกด clock-out */}
        {openLog && isStale && (
          <div className="rounded-lg px-3 py-2.5 text-sm bg-amber-50 border border-amber-200 text-amber-800 space-y-2">
            <p>
              ⚠️ มีกะค้างตั้งแต่{' '}
              <strong>
                {new Date(openLog.clock_in).toLocaleString('th-TH', {
                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
              </strong>{' '}
              ({Math.floor(staleHours)} ชม.ที่แล้ว) — น่าจะลืมกดออกงาน
            </p>
            <button
              className="btn-secondary text-xs"
              disabled={clockIn.isPending}
              onClick={handleForceClockIn}
            >
              ปิดกะค้าง &amp; เข้างานใหม่
            </button>
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
          {activeStaff?.role === 'staff' ? 'บันทึกเวลาของฉันวันนี้' : 'บันทึกเวลาพนักงานวันนี้'} ({new Date().toLocaleDateString('th-TH')})
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
                <td className="p-3 text-gray-400 text-xs">{formatDuration(log.clock_in, log.clock_out, businessHours)}</td>
                {log.note && <td className="p-3 text-gray-400 text-xs">{log.note}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ประวัติรายเดือนของพนักงานที่กำลังใช้งาน */}
      <div className="card overflow-hidden">
        <div className="px-4 py-4 border-b border-gray-100 space-y-3">
          <div>
            <h2 className="font-semibold text-gray-700">ประวัติการทำงานของฉัน</h2>
            <p className="text-xs text-gray-500 mt-1">ดูวันที่เคยเข้างานย้อนหลังได้ทีละเดือน</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-secondary px-3 py-2"
              aria-label="ดูเดือนก่อนหน้า"
              onClick={() => setSelectedMonth((month) => shiftMonth(month, -1))}
            >
              ‹
            </button>
            <input
              className="input flex-1 min-w-0"
              type="month"
              value={selectedMonth}
              max={currentMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              aria-label="เลือกเดือนที่ต้องการดู"
            />
            <button
              type="button"
              className="btn-secondary px-3 py-2"
              aria-label="ดูเดือนถัดไป"
              disabled={selectedMonth >= currentMonth}
              onClick={() => setSelectedMonth((month) => shiftMonth(month, 1))}
            >
              ›
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 p-4 border-b border-gray-100 sm:grid-cols-3">
          <div className="rounded-xl bg-green-50 px-3 py-3">
            <p className="text-xs text-gray-500">วันที่มาทำงาน</p>
            <p className="text-xl font-bold text-green-700">{workedDays} วัน</p>
          </div>
          <div className="rounded-xl bg-blue-50 px-3 py-3">
            <p className="text-xs text-gray-500">จำนวนกะ</p>
            <p className="text-xl font-bold text-blue-700">{myMonthLogs.length} กะ</p>
          </div>
          <div className="rounded-xl bg-purple-50 px-3 py-3 col-span-2 sm:col-span-1">
            <p className="text-xs text-gray-500">เวลางานปกติรวม</p>
            <p className="text-xl font-bold text-purple-700">{totalHours} ชม. {remainingMinutes} นาที</p>
          </div>
        </div>

        {monthError && (
          <p className="p-4 text-sm text-red-600">{explainSupabaseError(monthError, 'โหลดประวัติการทำงานไม่สำเร็จ')}</p>
        )}
        {monthLoading && <p className="p-4 text-gray-400">กำลังโหลดประวัติเดือน{formatMonth(selectedMonth)}…</p>}
        {!monthLoading && !monthError && myMonthLogs.length === 0 && (
          <p className="p-4 text-gray-400">เดือน{formatMonth(selectedMonth)}ยังไม่มีบันทึกเวลา</p>
        )}
        {!monthLoading && !monthError && myMonthLogs.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-white/40 text-left text-xs text-gray-500">
                <tr>
                  <th className="p-3 font-semibold">วันที่</th>
                  <th className="p-3 font-semibold">เข้างาน</th>
                  <th className="p-3 font-semibold">ออกงาน</th>
                  <th className="p-3 font-semibold">เวลางาน</th>
                  <th className="p-3 font-semibold">หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {myMonthLogs.map((log) => (
                  <tr key={log.id} className="border-t border-gray-100">
                    <td className="p-3 font-medium">
                      {new Date(log.clock_in).toLocaleDateString('th-TH', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="p-3 text-gray-600">{formatTime(log.clock_in)}</td>
                    <td className="p-3 text-gray-600">
                      {log.clock_out ? formatTime(log.clock_out) : <span className="text-green-600">ยังทำงานอยู่</span>}
                    </td>
                    <td className="p-3 text-gray-500">{formatDuration(log.clock_in, log.clock_out, businessHours)}</td>
                    <td className="p-3 text-gray-400 text-xs">{log.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
