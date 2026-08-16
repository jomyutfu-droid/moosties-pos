/**
 * Feature 8: TimePage — บันทึกเวลาพนักงาน (Check-in / Check-out)
 * แสดงรายการ time_logs ของวันนี้ พร้อมปุ่ม Clock-in / Clock-out ตามพนักงานที่ active
 */
import { Fragment, useMemo, useState } from 'react'
import { useSessionStore } from '@/store/session'
import {
  useTodayTimeLogs,
  useMyTimeLogsByMonth,
  useTimeLogsByRange,
  useApprovedOvertimeByRange,
  usePendingOvertimeRequests,
  useActiveTimeLogs,
  useClockIn,
  useClockOut,
  getBillableMinutes,
} from '@/hooks/useTimeLogs'
import type { TimeLogReport } from '@/hooks/useTimeLogs'
import { useUsers } from '@/hooks/useUsers'
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

function getMonthRange(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  const lastDay = new Date(year, monthNumber, 0).getDate()
  return {
    from: `${month}-01`,
    to: `${month}-${String(lastDay).padStart(2, '0')}`,
  }
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  return `${hours} ชม. ${remaining} นาที`
}

function isSameMonth(iso: string, month: string) {
  const date = new Date(iso)
  return getMonthInput(date) === month
}

type EmployeeSummary = {
  userId: string
  name: string
  workedDays: number
  shifts: number
  regularMinutes: number
  otMinutes: number
  pendingOtMinutes: number
  logs: TimeLogReport[]
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
  const isManagementView = activeStaff?.role === 'owner' || activeStaff?.role === 'manager'
  const { data: myMonthLogs = [], isLoading: monthLoading, error: monthError } = useMyTimeLogsByMonth(selectedMonth)
  const { data: users = [], isLoading: usersLoading, error: usersError } = useUsers(isManagementView)
  const { from: selectedMonthFrom, to: selectedMonthTo } = getMonthRange(selectedMonth)
  const {
    data: managementLogs = [],
    isLoading: managementMonthLoading,
    error: managementMonthError,
  } = useTimeLogsByRange(selectedMonthFrom, selectedMonthTo, isManagementView)
  const { data: approvedOvertime = [] } = useApprovedOvertimeByRange(
    selectedMonthFrom,
    selectedMonthTo,
    isManagementView,
  )
  const { data: pendingOvertime = [] } = usePendingOvertimeRequests(isManagementView)

  const employeeLogs = useMemo(() => {
    const employeeIds = new Set(users.filter((user) => user.role !== 'owner').map((user) => user.id))
    return managementLogs.filter((log) => employeeIds.has(log.user_id))
  }, [managementLogs, users])

  const employeeSummaries = useMemo<EmployeeSummary[]>(() => {
    const approvedByUser = new Map<string, number>()
    for (const request of approvedOvertime) {
      approvedByUser.set(request.user_id, (approvedByUser.get(request.user_id) ?? 0) + request.minutes)
    }

    const pendingByUser = new Map<string, number>()
    for (const request of pendingOvertime) {
      if (isSameMonth(request.ot_start, selectedMonth)) {
        pendingByUser.set(request.user_id, (pendingByUser.get(request.user_id) ?? 0) + request.minutes)
      }
    }

    const grouped = new Map<string, EmployeeSummary>()
    for (const log of employeeLogs) {
      const current = grouped.get(log.user_id) ?? {
        userId: log.user_id,
        name: log.user_name,
        workedDays: 0,
        shifts: 0,
        regularMinutes: 0,
        otMinutes: approvedByUser.get(log.user_id) ?? 0,
        pendingOtMinutes: pendingByUser.get(log.user_id) ?? 0,
        logs: [],
      }
      current.logs.push(log)
      current.shifts += 1
      current.regularMinutes += getBillableMinutes(log.clock_in, log.clock_out, businessHours)
      current.workedDays = new Set(current.logs.map((item) => getLocalDateKey(item.clock_in))).size
      grouped.set(log.user_id, current)
    }

    return Array.from(grouped.values()).sort((a, b) => a.name.localeCompare(b.name, 'th'))
  }, [approvedOvertime, businessHours, employeeLogs, pendingOvertime, selectedMonth])

  const [selectedEmployeeId, setSelectedEmployeeId] = useState('all')
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null)
  const filteredEmployeeSummaries = selectedEmployeeId === 'all'
    ? employeeSummaries
    : employeeSummaries.filter((summary) => summary.userId === selectedEmployeeId)
  const employeeRegularMinutes = filteredEmployeeSummaries.reduce((sum, summary) => sum + summary.regularMinutes, 0)
  const employeePendingOtMinutes = filteredEmployeeSummaries.reduce((sum, summary) => sum + summary.pendingOtMinutes, 0)
  const employeeShiftCount = filteredEmployeeSummaries.reduce((sum, summary) => sum + summary.shifts, 0)

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

{isManagementView && (

      <div className="card overflow-hidden">
        <div className="px-4 py-4 border-b border-gray-100 space-y-3">
          <div>
            <h2 className="font-semibold text-gray-700">ประวัติการทำงานพนักงาน</h2>
            <p className="text-xs text-gray-500 mt-1">สรุปเป็นรายคนและไม่รวมเวลาการทำงานของเจ้าของร้าน</p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 flex-1">
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
            <select
              className="input sm:max-w-[220px]"
              value={selectedEmployeeId}
              onChange={(event) => {
                setSelectedEmployeeId(event.target.value)
                setExpandedEmployeeId(null)
              }}
              aria-label="กรองตามพนักงาน"
            >
              <option value="all">พนักงานทั้งหมด</option>
              {employeeSummaries.map((summary) => (
                <option key={summary.userId} value={summary.userId}>{summary.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 p-4 border-b border-gray-100 sm:grid-cols-4">
          <div className="rounded-xl bg-green-50 px-3 py-3">
            <p className="text-xs text-gray-500">พนักงานที่มาทำงาน</p>
            <p className="text-xl font-bold text-green-700">{filteredEmployeeSummaries.length} คน</p>
          </div>
          <div className="rounded-xl bg-blue-50 px-3 py-3">
            <p className="text-xs text-gray-500">จำนวนกะ</p>
            <p className="text-xl font-bold text-blue-700">{employeeShiftCount} กะ</p>
          </div>
          <div className="rounded-xl bg-purple-50 px-3 py-3">
            <p className="text-xs text-gray-500">เวลาปกติรวม</p>
            <p className="text-xl font-bold text-purple-700">{formatMinutes(employeeRegularMinutes)}</p>
          </div>
          <div className="rounded-xl bg-amber-50 px-3 py-3">
            <p className="text-xs text-gray-500">OT รอตรวจ</p>
            <p className="text-xl font-bold text-amber-700">{formatMinutes(employeePendingOtMinutes)}</p>
          </div>
        </div>

        {usersError && (
          <p className="p-4 text-sm text-red-600">{explainSupabaseError(usersError, 'โหลดรายชื่อพนักงานไม่สำเร็จ')}</p>
        )}
        {managementMonthError && (
          <p className="p-4 text-sm text-red-600">{explainSupabaseError(managementMonthError, 'โหลดประวัติการทำงานไม่สำเร็จ')}</p>
        )}
        {(usersLoading || managementMonthLoading) && (
          <p className="p-4 text-gray-400">กำลังโหลดประวัติเดือน{formatMonth(selectedMonth)}…</p>
        )}
        {!usersLoading && !managementMonthLoading && !usersError && !managementMonthError && employeeSummaries.length === 0 && (
          <p className="p-4 text-gray-400">เดือน{formatMonth(selectedMonth)}ยังไม่มีบันทึกเวลาพนักงาน</p>
        )}
        {!usersLoading && !managementMonthLoading && !usersError && !managementMonthError && employeeSummaries.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-white/40 text-left text-xs text-gray-500">
                <tr>
                  <th className="p-3 font-semibold">พนักงาน</th>
                  <th className="p-3 font-semibold">วันที่มาทำงาน</th>
                  <th className="p-3 font-semibold">จำนวนกะ</th>
                  <th className="p-3 font-semibold">ชั่วโมงปกติ</th>
                  <th className="p-3 font-semibold">OT</th>
                  <th className="p-3 font-semibold">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployeeSummaries.map((summary) => (
                  <Fragment key={summary.userId}>
                    <tr
                      className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                      onClick={() => setExpandedEmployeeId((id) => id === summary.userId ? null : summary.userId)}
                    >
                      <td className="p-3 font-medium">
                        <button
                          type="button"
                          className="text-left hover:text-green-700"
                          onClick={(event) => {
                            event.stopPropagation()
                            setExpandedEmployeeId((id) => id === summary.userId ? null : summary.userId)
                          }}
                          aria-expanded={expandedEmployeeId === summary.userId}
                        >
                          <span className="mr-1 text-gray-400">{expandedEmployeeId === summary.userId ? '⌄' : '›'}</span>
                          {summary.name}
                        </button>
                      </td>
                      <td className="p-3 text-gray-600">{summary.workedDays} วัน</td>
                      <td className="p-3 text-gray-600">{summary.shifts} กะ</td>
                      <td className="p-3 text-gray-600">{formatMinutes(summary.regularMinutes)}</td>
                      <td className="p-3 text-gray-600">
                        {formatMinutes(summary.otMinutes + summary.pendingOtMinutes)}
                        {summary.pendingOtMinutes > 0 && <span className="block text-xs text-amber-600">รอตรวจ {formatMinutes(summary.pendingOtMinutes)}</span>}
                      </td>
                      <td className="p-3">
                        {summary.pendingOtMinutes > 0 ? (
                          <span className="inline-flex rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-700">มี OT รอตรวจ</span>
                        ) : summary.otMinutes > 0 ? (
                          <span className="inline-flex rounded-full bg-green-100 px-2 py-1 text-xs text-green-700">OT อนุมัติแล้ว</span>
                        ) : (
                          <span className="inline-flex rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">ปกติ</span>
                        )}
                      </td>
                    </tr>
                    {expandedEmployeeId === summary.userId && (
                      <tr className="border-t border-gray-100 bg-gray-50">
                        <td colSpan={6} className="p-3">
                          <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
                            <table className="w-full min-w-[560px] text-xs">
                              <thead className="text-left text-gray-500">
                                <tr>
                                  <th className="p-3 font-semibold">วันที่</th>
                                  <th className="p-3 font-semibold">เข้างาน</th>
                                  <th className="p-3 font-semibold">ออกงาน</th>
                                  <th className="p-3 font-semibold">เวลาปกติ</th>
                                  <th className="p-3 font-semibold">หมายเหตุ</th>
                                </tr>
                              </thead>
                              <tbody>
                                {summary.logs.map((log) => (
                                  <tr key={log.id} className="border-t border-gray-100">
                                    <td className="p-3 font-medium">{new Date(log.clock_in).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                                    <td className="p-3 text-gray-600">{formatTime(log.clock_in)}</td>
                                    <td className="p-3 text-gray-600">{log.clock_out ? formatTime(log.clock_out) : <span className="text-green-600">ยังทำงานอยู่</span>}</td>
                                    <td className="p-3 text-gray-500">{formatDuration(log.clock_in, log.clock_out, businessHours)}</td>
                                    <td className="p-3 text-gray-400">{log.note || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

)}
{!isManagementView && (
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

)}
    </div>
  )
}
