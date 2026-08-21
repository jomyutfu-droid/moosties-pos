import { useState } from 'react'
import { useTodaySummary, useSalesByDateRange } from '@/hooks/useReports'
import { useBillHistory, useVoidBill, type BillHistory } from '@/hooks/useBillManagement'
import {
  useAddCashMovement,
  useCashMovements,
  useCashSessionSummaries,
  useCloseSession,
  useOpenCashSession,
  useOpenSession,
} from '@/hooks/useCashSession'
import type { CashCloseResult, CashMovementType } from '@/hooks/useCashSession'
import { formatBahtSymbol, round2 } from '@/lib/money'
import { explainSupabaseError } from '@/lib/errors'
import { useSessionStore } from '@/store/session'
import { useCurrentAppUser } from '@/hooks/useAuth'
import { parseUnsignedNumber } from '@/lib/forms'
import { NumberField } from '@/components/NumberField'
import { getBillableMinutes, useTimeLogsByRange, usePendingOvertimeRequests, useReviewOvertime, useApprovedOvertimeByRange } from '@/hooks/useTimeLogs'
import { useSettings } from '@/hooks/useSettings'
import { useUsers } from '@/hooks/useUsers'
import { useMarkStaffRewardsPaid, usePendingStaffRewards, useRecordGrabReward, useReviewStaffReward, useStaffRewards } from '@/hooks/useStaffRewards'

/** วันที่ "วันนี้" ตามเวลาเครื่อง — toISOString() ให้วันที่ UTC ซึ่งก่อน 07:00 น. ไทยจะเป็นเมื่อวาน */
function todayStr() {
  const d = new Date()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export default function ReportsPage() {
  const role = useSessionStore((s) => s.activeStaff?.role)

  // พนักงานต้องเห็นเฉพาะเงินสดกะของตัวเอง ไม่เปิดยอดขายรวม ค่าแรง หรือ OT ของคนอื่น
  if (role === 'staff') {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">เงินสดกะ / ปิดกะ</h1>
          <p className="text-sm text-gray-500 mt-1">ตรวจเงินของกะที่คุณรับผิดชอบ และดูยอดขาด/เกินของตัวเอง</p>
        </div>
        <CashSessionPanel />
      </div>
    )
  }

  return <ManagementReportsPage />
}

function ManagementReportsPage() {
  const { data: today, isLoading } = useTodaySummary()
  const [from, setFrom] = useState(todayStr())
  const [to, setTo] = useState(todayStr())
  const { data: rangeSummary } = useSalesByDateRange(from, to)

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold text-gray-800">รายงาน / ปิดยอด</h1>

      <section className="card p-4">
        <h2 className="font-semibold mb-3">สรุปยอดวันนี้</h2>
        {isLoading && <p className="text-gray-500">กำลังโหลด…</p>}
        {today && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <Stat label="จำนวนบิล" value={today.orderCount.toString()} />
            <Stat label="ยอดขาย" value={formatBahtSymbol(today.total)} />
            <Stat label="ต้นทุน" value={formatBahtSymbol(today.cogsTotal)} />
            <Stat label="กำไร" value={formatBahtSymbol(today.profit)} highlight />
          </div>
        )}
        {today && (
          <div className="mt-4 grid sm:grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium text-gray-600 mb-1">แยกตามวิธีชำระเงิน</h3>
              <ul className="text-sm space-y-0.5">
                <li className="flex justify-between"><span>เงินสด</span><span>{formatBahtSymbol(today.paymentBreakdown.cash)}</span></li>
                <li className="flex justify-between"><span>PromptPay</span><span>{formatBahtSymbol(today.paymentBreakdown.promptpay)}</span></li>
                <li className="flex justify-between"><span>Grab</span><span>{formatBahtSymbol(today.grabTotal)}</span></li>
                <li className="flex justify-between"><span>อื่น ๆ</span><span>{formatBahtSymbol(today.paymentBreakdown.stored_value + today.paymentBreakdown.card + today.paymentBreakdown.other)}</span></li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-600 mb-1">สินค้าขายดี</h3>
              <ul className="text-sm space-y-0.5">
                {today.topProducts.slice(0, 5).map((p) => (
                  <li key={p.name} className="flex justify-between">
                    <span>{p.name}</span>
                    <span>{p.qty} แก้ว</span>
                  </li>
                ))}
                {today.topProducts.length === 0 && <li className="text-gray-400">ยังไม่มีข้อมูล</li>}
              </ul>
            </div>
          </div>
        )}
      </section>

      <StaffTimeReport />

      <OvertimeApprovalPanel />

      <CashSessionPanel />

      <StaffRewardsPanel />

      <section className="card p-4">
        <h2 className="font-semibold mb-3">ยอดขายตามช่วงวันที่</h2>
        <div className="flex flex-wrap gap-3 items-end mb-3">
          <div>
            <label className="label">จากวันที่</label>
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">ถึงวันที่</label>
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        {rangeSummary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <Stat label="จำนวนบิล" value={rangeSummary.orderCount.toString()} />
            <Stat label="ยอดขาย" value={formatBahtSymbol(rangeSummary.total)} />
            <Stat label="ต้นทุน" value={formatBahtSymbol(rangeSummary.cogsTotal)} />
            <Stat label="กำไร" value={formatBahtSymbol(rangeSummary.profit)} highlight />
          </div>
        )}
      </section>

      <BillHistoryPanel />
    </div>
  )
}

function BillHistoryPanel() {
  const role = useSessionStore((s) => s.activeStaff?.role)
  const { data: bills = [], isLoading, isError } = useBillHistory(50)
  const voidBill = useVoidBill()
  const [error, setError] = useState<string | null>(null)

  if (role !== 'owner') return null

  async function handleVoid(bill: BillHistory) {
    const reason = window.prompt(
      'ยกเลิกบิล ' + (bill.order_no ?? bill.id.slice(0, 8)) + '\nกรุณาระบุเหตุผล',
      'ทดสอบระบบ',
    )
    if (reason === null) return
    const normalizedReason = reason.trim()
    if (!normalizedReason) {
      setError('กรุณาระบุเหตุผลก่อนยกเลิกบิล')
      return
    }
    if (!window.confirm(
      'ยืนยันยกเลิกบิล ' + (bill.order_no ?? bill.id.slice(0, 8)) + ' ยอด ' + formatBahtSymbol(bill.total) + ' ?\nระบบจะคืนสต๊อกและไม่นับบิลนี้ในยอดขาย/เงินสด',
    )) return

    setError(null)
    try {
      await voidBill.mutateAsync({ orderId: bill.id, reason: normalizedReason })
    } catch (err) {
      setError(explainSupabaseError(err, 'ยกเลิกบิลไม่สำเร็จ'))
    }
  }

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="font-semibold">ยกเลิกบิล (เจ้าของร้าน)</h2>
          <p className="text-xs text-gray-500 mt-1">บิลจะไม่ถูกลบ แต่จะไม่นับยอดขาย/เงินสด และคืนสต๊อกให้โดยอัตโนมัติ</p>
        </div>
        <span className="text-xs rounded-full bg-amber-100 text-amber-800 px-2 py-1">Owner เท่านั้น</span>
      </div>
      {error && <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 mb-3">{error}</p>}
      {isLoading && <p className="text-sm text-gray-500">กำลังโหลดบิล…</p>}
      {isError && <p className="text-sm text-red-600">โหลดประวัติบิลไม่สำเร็จ กรุณาลองใหม่</p>}
      {!isLoading && !isError && bills.length === 0 && <p className="text-sm text-gray-400">ยังไม่มีบิล</p>}
      <div className="space-y-2">
        {bills.map((bill) => (
          <div
            key={bill.id}
            className={'rounded-lg border p-3 text-sm ' + (bill.status === 'void' ? 'border-gray-200 bg-gray-50 opacity-75' : 'border-amber-200 bg-amber-50/40')}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{bill.order_no ?? bill.id.slice(0, 8)}</span>
              <span className={bill.status === 'void' ? 'text-gray-500' : 'text-green-700'}>
                {bill.status === 'void' ? 'ยกเลิกแล้ว' : 'บิลปกติ'}
              </span>
            </div>
            <div className="text-xs text-gray-600 mt-1">
              {new Date(bill.created_at).toLocaleString('th-TH')} · {bill.channel === 'delivery' ? 'Grab/Delivery' : 'หน้าร้าน'} · {formatBahtSymbol(bill.total)}
            </div>
            {bill.status === 'paid' && (
              <button
                className="btn-secondary text-xs mt-2 border-red-200 text-red-700"
                disabled={voidBill.isPending}
                onClick={() => handleVoid(bill)}
              >
                {voidBill.isPending ? 'กำลังยกเลิก…' : 'ยกเลิกบิล'}
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function OvertimeApprovalPanel() {
  const activeStaff = useSessionStore((s) => s.activeStaff)
  const { data: authUser } = useCurrentAppUser()
  const { data: requests = [], isLoading, isError } = usePendingOvertimeRequests()
  const review = useReviewOvertime()
  if (activeStaff?.role !== 'owner' && activeStaff?.role !== 'manager') return null

  return (
    <section className="card p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            คำขอทำงานล่วงเวลา
            {requests.length > 0 && <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs">OT รออนุมัติ {requests.length}</span>}
          </h2>
          <p className="text-xs text-gray-500 mt-1">ค่า OT คิดตามนาทีจากค่าแรงรายชั่วโมง และยังไม่รวมในเงินเดือนจนกว่าจะอนุมัติ</p>
        </div>
      </div>
      {isLoading && <p className="text-sm text-gray-500">กำลังโหลด…</p>}
      {isError && <p className="text-sm text-red-600">โหลดคำขอ OT ไม่สำเร็จ กรุณาลองใหม่</p>}
      {!isLoading && !isError && requests.length === 0 && <p className="text-sm text-gray-400">ไม่มี OT รออนุมัติ</p>}
      <div className="space-y-2">
        {requests.map((request) => (
          <div key={request.id} className="rounded-lg border border-red-100 bg-red-50/50 p-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <strong>{request.user_name}</strong>
              <span className="font-semibold text-red-700">OT รออนุมัติ</span>
            </div>
            <div className="text-gray-600 mt-1">
              {new Date(request.ot_start).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              {' – '}
              {new Date(request.ot_end).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
              {' · '}{request.minutes} นาที · {formatBahtSymbol(request.amount)}
            </div>
            <div className="flex gap-2 mt-2">
              <button className="btn-primary text-xs" disabled={review.isPending || !authUser} onClick={() => authUser && review.mutate({ id: request.id, status: 'approved', reviewerId: authUser.id })}>อนุมัติ OT</button>
              <button className="btn-secondary text-xs" disabled={review.isPending || !authUser} onClick={() => authUser && review.mutate({ id: request.id, status: 'rejected', reviewerId: authUser.id })}>ไม่อนุมัติ</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function localDateString(date: Date) {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

function StaffTimeReport() {
  const now = new Date()
  const [period, setPeriod] = useState<'week' | 'month' | 'custom'>('month')
  const [from, setFrom] = useState(() => localDateString(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [to, setTo] = useState(() => localDateString(now))
  const { data: logs = [], isLoading, isError } = useTimeLogsByRange(from, to)
  const { data: approvedOt = [] } = useApprovedOvertimeByRange(from, to)
  const { data: settings } = useSettings()
  const businessHours = settings?.business_hours

  function choosePeriod(next: 'week' | 'month') {
    const today = new Date()
    const start = next === 'week'
      ? new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6)
      : new Date(today.getFullYear(), today.getMonth(), 1)
    setPeriod(next)
    setFrom(localDateString(start))
    setTo(localDateString(today))
  }

  const summary = new Map<string, { name: string; wage: number; minutes: number; shifts: number; otMinutes: number; otPay: number }>()
  for (const log of logs) {
    const minutes = getBillableMinutes(log.clock_in, log.clock_out, businessHours)
    const row = summary.get(log.user_id) ?? { name: log.user_name, wage: log.hourly_wage, minutes: 0, shifts: 0, otMinutes: 0, otPay: 0 }
    row.minutes += minutes
    row.shifts += 1
    summary.set(log.user_id, row)
  }
  for (const ot of approvedOt) {
    const row = summary.get(ot.user_id) ?? { name: ot.user_name, wage: ot.hourly_wage, minutes: 0, shifts: 0, otMinutes: 0, otPay: 0 }
    row.otMinutes += ot.minutes
    row.otPay += ot.amount
    summary.set(ot.user_id, row)
  }
  const rows = Array.from(summary.values())
  const totalMinutes = rows.reduce((sum, row) => sum + row.minutes, 0)
  const totalPay = rows.reduce((sum, row) => sum + (row.minutes / 60) * row.wage + row.otPay, 0)

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="font-semibold">รายงานเวลาเข้างานและค่าแรง</h2>
          <p className="text-xs text-gray-500 mt-1">คำนวณจากเวลาเข้า–ออกงาน × ค่าแรงรายชั่วโมงของพนักงาน</p>
        </div>
        <div className="flex gap-2">
          <button className={`btn text-sm ${period === 'week' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => choosePeriod('week')}>7 วันล่าสุด</button>
          <button className={`btn text-sm ${period === 'month' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => choosePeriod('month')}>เดือนนี้</button>
          <button className={`btn text-sm ${period === 'custom' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPeriod('custom')}>กำหนดเอง</button>
        </div>
      </div>
      {period === 'custom' && (
        <div className="flex flex-wrap gap-3 items-end mb-3">
          <div><label className="label">จากวันที่</label><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label className="label">ถึงวันที่</label><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center mb-4">
        <Stat label="จำนวนกะ" value={logs.length.toString()} />
        <Stat label="ชั่วโมงรวม" value={`${Math.floor(totalMinutes / 60)} ชม. ${totalMinutes % 60} นาที`} />
        <Stat label="พนักงาน" value={rows.length.toString()} />
        <Stat label="ค่าแรงรวม + OT อนุมัติ" value={formatBahtSymbol(totalPay)} highlight />
      </div>
      {isLoading && <p className="text-sm text-gray-500">กำลังโหลดข้อมูลเวลา…</p>}
      {isError && <p className="text-sm text-red-600">โหลดรายงานเวลาไม่สำเร็จ กรุณาลองใหม่</p>}
      {!isLoading && !isError && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left border-b border-gray-200"><th className="py-2">พนักงาน</th><th className="py-2 text-right">จำนวนกะ</th><th className="py-2 text-right">เวลาปกติ</th><th className="py-2 text-right">OT อนุมัติ</th><th className="py-2 text-right">ค่าแรงรวม</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name} className="border-b border-gray-100"><td className="py-2">{row.name}</td><td className="py-2 text-right">{row.shifts}</td><td className="py-2 text-right">{Math.floor(row.minutes / 60)} ชม. {row.minutes % 60} นาที</td><td className="py-2 text-right">{row.otMinutes ? `${row.otMinutes} นาที · ${formatBahtSymbol(row.otPay)}` : '-'}</td><td className="py-2 text-right font-semibold">{formatBahtSymbol((row.minutes / 60) * row.wage + row.otPay)}</td></tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-gray-400">ยังไม่มีข้อมูลการเข้างานในช่วงนี้</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="card p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-bold ${highlight ? 'text-brand-700' : 'text-gray-800'}`}>{value}</div>
    </div>
  )
}

function getWeeklyRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = start.getDay()
  start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day))
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return { from: formatLocalDate(start), to: formatLocalDate(end) }
}

function formatLocalDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return date.getFullYear() + '-' + month + '-' + day
}

function localDateKey(iso: string) {
  const date = new Date(iso)
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')
}

function CashSessionPanel() {
  const { data: session, isLoading, error: sessionError } = useOpenCashSession()
  const { data: history = [] } = useCashSessionSummaries(50)
  const { data: movements = [] } = useCashMovements(session?.id ?? null)
  const openSession = useOpenSession()
  const addMovement = useAddCashMovement()
  const closeSession = useCloseSession()
  const activeStaff = useSessionStore((s) => s.activeStaff)

  const [openingCash, setOpeningCash] = useState(0)
  const [countedCash, setCountedCash] = useState(0)
  const [cupsSold, setCupsSold] = useState(0)
  const [closeNote, setCloseNote] = useState('')
  const [movementType, setMovementType] = useState<CashMovementType>('cash_out')
  const [movementAmount, setMovementAmount] = useState(0)
  const [movementNote, setMovementNote] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<(CashCloseResult & { counted: number }) | null>(null)

  const expected = session?.expected_cash ?? 0
  const variancePreview = round2(countedCash - expected)

  async function handleOpen() {
    setError(null)
    if (!activeStaff) {
      setError('ยังไม่ได้เลือกพนักงาน — กด "สลับพนักงาน" แล้วใส่ PIN ก่อนเปิดกะ')
      return
    }
    try {
      await openSession.mutateAsync(openingCash)
      setResult(null)
      setOpeningCash(0)
    } catch (err) {
      setError(explainSupabaseError(err, 'เปิดกะไม่สำเร็จ'))
    }
  }

  async function handleMovement() {
    if (!session) return
    setError(null)
    if (movementAmount <= 0) {
      setError('กรุณาระบุจำนวนเงิน')
      return
    }
    if (movementType === 'cash_out' && !movementNote.trim()) {
      setError('กรุณาระบุเหตุผลการเบิกจ่าย')
      return
    }
    try {
      await addMovement.mutateAsync({
        sessionId: session.id,
        type: movementType,
        amount: movementAmount,
        note: movementNote.trim() || null,
      })
      setMovementAmount(0)
      setMovementNote('')
    } catch (err) {
      setError(explainSupabaseError(err, 'บันทึกรายการเงินสดไม่สำเร็จ'))
    }
  }

  async function handleClose() {
    if (!session) return
    setError(null)
    try {
      const closed = await closeSession.mutateAsync({ session, countedCash, cupsSold, note: closeNote.trim() || null })
      setResult({ ...closed, counted: countedCash })
      setConfirming(false)
      setCountedCash(0)
      setCupsSold(0)
      setCloseNote('')
    } catch (err) {
      setError(explainSupabaseError(err, 'ปิดกะไม่สำเร็จ'))
      setConfirming(false)
    }
  }

  if (isLoading) return <section className="card p-4 text-sm text-gray-500">กำลังโหลดกะเงินสด…</section>

  const resultCard = result && (
    <div
      className={`rounded-xl p-4 mb-4 border ${
        result.variance === 0
          ? 'bg-green-50 border-green-200'
          : Math.abs(result.variance) <= 20
          ? 'bg-amber-50 border-amber-200'
          : 'bg-red-50 border-red-200'
      }`}
    >
      <p className="font-semibold mb-2">
        {result.variance === 0
          ? '✅ ปิดกะแล้ว — เงินตรงพอดี'
          : result.variance > 0
          ? `⚠️ ปิดกะแล้ว — เงินเกิน ${formatBahtSymbol(result.variance)}`
          : `⚠️ ปิดกะแล้ว — เงินขาด ${formatBahtSymbol(Math.abs(result.variance))}`}
      </p>
      <div className="text-sm space-y-0.5">
        <div className="flex justify-between"><span>ยอดที่ควรมี</span><span>{formatBahtSymbol(result.expected_cash)}</span></div>
        <div className="flex justify-between"><span>นับได้จริง</span><span>{formatBahtSymbol(result.counted)}</span></div>
        <div className="flex justify-between text-gray-600"><span>ขายเงินสด / เงินเข้า / เบิกจ่าย</span><span>{formatBahtSymbol(result.cash_sales)} / {formatBahtSymbol(result.cash_in)} / {formatBahtSymbol(result.cash_out)}</span></div>
      </div>
      <button className="btn-secondary text-xs mt-3" onClick={() => setResult(null)}>รับทราบ</button>
    </div>
  )

  const errorLine = (error || sessionError) && (
    <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 mb-3">
      {error ?? explainSupabaseError(sessionError, 'โหลดกะเงินสดไม่สำเร็จ')}
    </p>
  )

  const historyCard = (
    <section className="card p-4">
      <h2 className="font-semibold mb-3">ประวัติปิดกะและยอดขาด/เกิน</h2>
      {history.filter((item) => item.closed_at).length === 0 ? (
        <p className="text-sm text-gray-400">ยังไม่มีประวัติปิดกะ</p>
      ) : (
        <div className="space-y-2">
          {history.filter((item) => item.closed_at).slice(0, 10).map((item) => (
            <div key={item.id} className="rounded-lg border border-gray-200 p-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">{item.user_name}</span>
                <span className={item.variance === 0 ? 'text-green-700' : item.variance && item.variance < 0 ? 'text-red-700' : 'text-amber-700'}>
                  {item.variance === 0 ? 'ตรงพอดี' : item.variance && item.variance < 0 ? `ขาด ${formatBahtSymbol(Math.abs(item.variance))}` : `เกิน ${formatBahtSymbol(item.variance ?? 0)}`}
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                ปิด {new Date(item.closed_at as string).toLocaleString('th-TH')} · ควรมี {formatBahtSymbol(item.expected_cash ?? 0)} · นับได้ {formatBahtSymbol(item.counted_cash ?? 0)}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )

  if (!session) {
    return (
      <>
        <section className="card p-4">
          <h2 className="font-semibold mb-3">เปิดกะเงินสดของฉัน</h2>
          {resultCard}
          {errorLine}
          <p className="text-sm text-gray-500 mb-3">นับเงินทอนตั้งต้นที่อยู่ในลิ้นชัก แล้วกรอกยอดก่อนเริ่มรับเงินลูกค้า</p>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="label">เงินทอนตั้งต้น (บาท)</label>
              <NumberField className="input" value={openingCash} parse={parseUnsignedNumber} onChange={setOpeningCash} />
            </div>
            <button className="btn-primary" disabled={openSession.isPending} onClick={handleOpen}>
              {openSession.isPending ? 'กำลังเปิด…' : 'เปิดกะ'}
            </button>
          </div>
        </section>
        {historyCard}
      </>
    )
  }

  return (
    <>
      <section className="card p-4">
        <h2 className="font-semibold mb-3">กะเงินสดของฉัน</h2>
        {resultCard}
        {errorLine}

        <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 mb-4 text-sm space-y-1">
          <p className="text-gray-500 text-xs mb-1">เปิดกะเมื่อ {new Date(session.opened_at).toLocaleString('th-TH')}</p>
          <div className="flex justify-between"><span>เงินทอนตั้งต้น</span><span>{formatBahtSymbol(session.opening_cash)}</span></div>
          <div className="flex justify-between"><span>+ ขายเงินสด</span><span>{formatBahtSymbol(session.cash_sales)}</span></div>
          <div className="flex justify-between"><span>+ เงินเข้า / รับเงิน</span><span>{formatBahtSymbol(session.cash_in)}</span></div>
          <div className="flex justify-between"><span>- เบิกจ่ายเงินสด</span><span>{formatBahtSymbol(session.cash_out)}</span></div>
          <div className="flex justify-between font-bold border-t border-gray-200 pt-1 mt-1"><span>= ยอดที่ควรมี</span><span>{formatBahtSymbol(expected)}</span></div>
        </div>

        <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 mb-4">
          <h3 className="font-semibold text-sm mb-2">รับเงิน / เบิกจ่ายเงินสด</h3>
          <div className="flex gap-2 mb-3">
            <button className={`btn text-sm flex-1 ${movementType === 'cash_in' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setMovementType('cash_in')}>รับเงิน / เงินเข้า</button>
            <button className={`btn text-sm flex-1 ${movementType === 'cash_out' ? 'bg-red-600 text-white' : 'btn-secondary'}`} onClick={() => setMovementType('cash_out')}>เบิกจ่าย / เงินออก</button>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[140px]"><label className="label">จำนวนเงิน (บาท)</label><NumberField className="input" value={movementAmount} parse={parseUnsignedNumber} onChange={setMovementAmount} /></div>
            <div className="flex-[2] min-w-[180px]"><label className="label">เหตุผล / รายละเอียด {movementType === 'cash_out' && <span className="text-red-600">*</span>}</label><input className="input" value={movementNote} onChange={(e) => setMovementNote(e.target.value)} placeholder={movementType === 'cash_out' ? 'เช่น ซื้อหลอด/น้ำแข็ง' : 'เช่น เติมเงินทอน'} /></div>
            <button className="btn-primary" disabled={addMovement.isPending} onClick={handleMovement}>{addMovement.isPending ? 'กำลังบันทึก…' : 'บันทึกรายการ'}</button>
          </div>
          {movements.length > 0 && (
            <div className="mt-3 border-t border-blue-100 pt-2 space-y-1 text-xs">
              <p className="font-medium text-gray-600">รายการระหว่างกะ</p>
              {movements.slice(0, 8).map((movement) => (
                <div key={movement.id} className="flex justify-between gap-2">
                  <span className="truncate">{movement.type === 'cash_in' ? 'เงินเข้า' : 'เบิกจ่าย'} · {movement.note || '-'}</span>
                  <span className={movement.type === 'cash_in' ? 'text-green-700' : 'text-red-700'}>{movement.type === 'cash_in' ? '+' : '-'}{formatBahtSymbol(movement.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <h3 className="font-semibold mb-2">รวมเงินตอนปิดกะ</h3>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[140px]"><label className="label">นับเงินสดได้จริง (บาท)</label><NumberField className="input" value={countedCash} parse={parseUnsignedNumber} onChange={(n) => { setCountedCash(n); setConfirming(false) }} /></div>
          <div className="flex-1 min-w-[140px]"><label className="label">จำนวนแก้วที่ขายวันนี้</label><NumberField className="input" value={cupsSold} parse={parseUnsignedNumber} onChange={(n) => { setCupsSold(n); setConfirming(false) }} /><p className="text-[11px] text-gray-500 mt-1">เกิน 25 แก้ว ระบบส่งโบนัส 50 บาทให้เจ้าของร้านอนุมัติ</p></div>
          <div className="flex-1 min-w-[140px]"><label className="label">หมายเหตุปิดกะ</label><input className="input" value={closeNote} onChange={(e) => setCloseNote(e.target.value)} /></div>
        </div>
        {countedCash > 0 && (
          <p className={`mt-3 text-sm font-medium ${variancePreview === 0 ? 'text-green-700' : Math.abs(variancePreview) <= 20 ? 'text-amber-700' : 'text-red-700'}`}>
            {variancePreview === 0 ? 'เงินตรงพอดี ✓' : variancePreview > 0 ? `เงินเกิน ${formatBahtSymbol(variancePreview)}` : `เงินขาด ${formatBahtSymbol(Math.abs(variancePreview))}`}
          </p>
        )}
        <div className="flex gap-2 mt-3">
          {confirming ? (
            <>
              <button className="btn-primary flex-1" disabled={closeSession.isPending} onClick={handleClose}>{closeSession.isPending ? 'กำลังปิดกะ…' : 'ยืนยันปิดกะ'}</button>
              <button className="btn-secondary" onClick={() => setConfirming(false)}>ยกเลิก</button>
            </>
          ) : (
            <button className="btn-primary" onClick={() => { setError(null); setConfirming(true) }}>ปิดกะ</button>
          )}
        </div>
        {confirming && <p className="text-xs text-gray-500 mt-2">ปิดกะแล้วแก้ไขยอดไม่ได้ — ตรวจยอดเงินสดอีกครั้งก่อนยืนยัน</p>}
      </section>
      {historyCard}
    </>
  )
}


function StaffRewardsPanel() {
  const DAILY_WAGE = 350
  const isOwner = useSessionStore((s) => s.activeStaff?.role === 'owner')
  const ownerId = useSessionStore((s) => s.activeStaff?.id)
  const weekly = getWeeklyRange()
  const { data: users = [] } = useUsers(isOwner)
  const { data: weeklyLogs = [], isLoading: workDaysLoading, error: workDaysError } = useTimeLogsByRange(weekly.from, weekly.to, isOwner)
  const { data: weeklyRewards = [], isLoading: weeklyLoading, error: weeklyError } = useStaffRewards(weekly.from, weekly.to, null, isOwner)
  const { data: pendingRewards = [], isLoading: pendingLoading } = usePendingStaffRewards(isOwner)
  const recordGrab = useRecordGrabReward()
  const reviewReward = useReviewStaffReward()
  const markPaid = useMarkStaffRewardsPaid()
  const [grabDate, setGrabDate] = useState(todayStr())
  const [grabUserId, setGrabUserId] = useState('')
  const [grabQuantity, setGrabQuantity] = useState(1)
  const [message, setMessage] = useState<string | null>(null)

  if (!isOwner) return null

  type PayrollSummary = {
    userId: string
    name: string
    workDates: Set<string>
    workDays: number
    dailyWage: number
    grab: number
    salesVolume: number
    closingOt: number
    bonusTotal: number
    total: number
    pendingBonus: number
  }

  const summaries = new Map<string, PayrollSummary>()

  function getSummary(userId: string, name: string) {
    const current = summaries.get(userId) ?? {
      userId,
      name,
      workDates: new Set<string>(),
      workDays: 0,
      dailyWage: 0,
      grab: 0,
      salesVolume: 0,
      closingOt: 0,
      bonusTotal: 0,
      total: 0,
      pendingBonus: 0,
    }
    if (!current.name || current.name === current.userId) current.name = name
    summaries.set(userId, current)
    return current
  }

  for (const log of weeklyLogs) {
    const user = users.find((item) => item.id === log.user_id)
    if (log.user_id === ownerId || user?.role === 'owner') continue
    const current = getSummary(log.user_id, log.user_name)
    current.workDates.add(localDateKey(log.clock_in))
  }

  for (const reward of weeklyRewards) {
    if (reward.status !== 'approved' && reward.status !== 'paid') continue
    const user = users.find((item) => item.id === reward.user_id)
    if (reward.user_id === ownerId || user?.role === 'owner') continue
    const current = getSummary(reward.user_id, reward.user_name)
    if (reward.reward_type === 'grab_review') current.grab += reward.amount
    if (reward.reward_type === 'sales_volume') current.salesVolume += reward.amount
    if (reward.reward_type === 'closing_ot') current.closingOt += reward.amount
    if (reward.status === 'approved') current.pendingBonus += reward.amount
  }

  for (const current of summaries.values()) {
    current.workDays = current.workDates.size
    current.dailyWage = current.workDays * DAILY_WAGE
    current.bonusTotal = current.grab + current.salesVolume + current.closingOt
    current.total = current.dailyWage + current.bonusTotal
  }

  const summaryRows = Array.from(summaries.values()).sort((a, b) => a.name.localeCompare(b.name, 'th'))
  const grandTotal = summaryRows.reduce((sum, row) => sum + row.total, 0)
  const totalDailyWage = summaryRows.reduce((sum, row) => sum + row.dailyWage, 0)
  const totalGrab = summaryRows.reduce((sum, row) => sum + row.grab, 0)
  const totalSalesVolume = summaryRows.reduce((sum, row) => sum + row.salesVolume, 0)
  const totalClosingOt = summaryRows.reduce((sum, row) => sum + row.closingOt, 0)

  async function handleRecordGrab() {
    if (!grabUserId || grabQuantity < 1) { setMessage('กรุณาเลือกพนักงานและใส่จำนวนคอมเมนต์ที่ถูกต้อง'); return }
    setMessage(null)
    try {
      await recordGrab.mutateAsync({ userId: grabUserId, rewardDate: grabDate, quantity: Math.floor(grabQuantity) })
      setMessage('บันทึกโบนัสคอมเมนต์ Grab แล้ว')
      setGrabQuantity(1)
    } catch (err) { setMessage(explainSupabaseError(err, 'บันทึกโบนัส Grab ไม่สำเร็จ')) }
  }

  async function handleReview(id: string, status: 'approved' | 'rejected') {
    setMessage(null)
    try { await reviewReward.mutateAsync({ id, status }) }
    catch (err) { setMessage(explainSupabaseError(err, 'อนุมัติโบนัส/โอทีไม่สำเร็จ')) }
  }

  async function handleMarkPaid(userId?: string) {
    setMessage(null)
    try {
      const result = await markPaid.mutateAsync({ from: weekly.from, to: weekly.to, userId: userId ?? null })
      setMessage('บันทึกจ่ายโบนัส/OT แล้ว ' + result.updatedCount + ' รายการ รวม ' + formatBahtSymbol(result.totalAmount))
    } catch (err) { setMessage(explainSupabaseError(err, 'บันทึกการจ่ายโบนัส/โอทีไม่สำเร็จ')) }
  }

  function rewardLabel(reward: { reward_type: string; quantity: number; details_json: Record<string, unknown> }) {
    if (reward.reward_type === 'grab_review') return 'Grab คอมเมนต์ชื่นชม ' + String(reward.details_json.comment_count ?? reward.quantity) + ' ครั้ง'
    if (reward.reward_type === 'sales_volume') return 'โบนัสยอดขาย ' + String(reward.details_json.cups_sold ?? reward.quantity) + ' แก้ว'
    const orderAt = reward.details_json.order_at ? new Date(String(reward.details_json.order_at)).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-'
    const leftAt = reward.details_json.left_at ? new Date(String(reward.details_json.left_at)).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-'
    return 'OT ปิดร้าน ' + orderAt + '–' + leftAt
  }

  return (
    <section className="card p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">สรุปเงินจ่ายพนักงานวันอาทิตย์</h2>
          <p className="text-xs text-gray-500 mt-1">สัปดาห์นี้ {weekly.from} ถึง {weekly.to} · ค่าแรงวันละ {formatBahtSymbol(DAILY_WAGE)} · นับจากวันที่มีบันทึกเข้างาน</p>
        </div>
        <span className="text-xs rounded-full bg-purple-100 text-purple-800 px-2 py-1">Owner เท่านั้น</span>
      </div>

      <div className="rounded-xl border border-purple-100 bg-purple-50/50 p-3 space-y-3">
        <div>
          <h3 className="font-semibold text-sm">บันทึกคอมเมนต์ชื่นชม GrabFood</h3>
          <p className="text-xs text-gray-500 mt-1">เจ้าของร้านเป็นผู้บันทึกโดยตรง คิดครั้งละ 50 บาท</p>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="min-w-[150px] flex-1"><label className="label">พนักงาน</label><select className="input" value={grabUserId} onChange={(e) => setGrabUserId(e.target.value)}><option value="">เลือกพนักงาน</option>{users.filter((user) => user.role !== 'owner' && user.is_active).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></div>
          <div><label className="label">วันที่</label><input type="date" className="input" value={grabDate} onChange={(e) => setGrabDate(e.target.value)} /></div>
          <div className="w-32"><label className="label">จำนวนครั้ง</label><NumberField className="input" value={grabQuantity} parse={parseUnsignedNumber} onChange={setGrabQuantity} /></div>
          <button className="btn-primary" disabled={recordGrab.isPending} onClick={handleRecordGrab}>{recordGrab.isPending ? 'กำลังบันทึก…' : 'บันทึก Grab'}</button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div><h3 className="font-semibold text-sm">รายการรออนุมัติ</h3><p className="text-xs text-gray-500">โบนัสยอดขายและ OT ปิดร้านที่พนักงานส่งมา</p></div>
          {pendingRewards.length > 0 && <span className="text-xs rounded-full bg-red-100 text-red-700 px-2 py-1">{pendingRewards.length} รายการ</span>}
        </div>
        {pendingLoading && <p className="text-sm text-gray-400">กำลังโหลด…</p>}
        {!pendingLoading && pendingRewards.length === 0 && <p className="text-sm text-gray-400">ไม่มีรายการรออนุมัติ</p>}
        <div className="space-y-2">
          {pendingRewards.map((reward) => (
            <div key={reward.id} className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{reward.user_name} · {reward.reward_date}</span><span className="text-amber-800">{formatBahtSymbol(reward.amount)}</span></div>
              <p className="text-xs text-gray-600 mt-1">{rewardLabel(reward)}</p>
              <div className="flex gap-2 mt-2"><button className="btn-primary text-xs" disabled={reviewReward.isPending} onClick={() => handleReview(reward.id, 'approved')}>อนุมัติ</button><button className="btn-secondary text-xs text-red-700 border-red-200" disabled={reviewReward.isPending} onClick={() => handleReview(reward.id, 'rejected')}>ไม่อนุมัติ</button></div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div>
            <h3 className="font-semibold text-sm">ยอดที่ต้องจ่ายรายคน</h3>
            <p className="text-xs text-gray-500">ค่าแรงพื้นฐานรวมกับโบนัสและ OT ที่อนุมัติแล้ว</p>
          </div>
          <button className="btn-secondary text-xs" disabled={markPaid.isPending} onClick={() => handleMarkPaid()}>บันทึกจ่ายโบนัส/OT ทั้งหมด</button>
        </div>
        {(workDaysLoading || weeklyLoading) && <p className="text-sm text-gray-400">กำลังคำนวณยอด…</p>}
        {workDaysError && <p className="text-sm text-red-600">{explainSupabaseError(workDaysError, 'โหลดวันทำงานไม่สำเร็จ')}</p>}
        {weeklyError && <p className="text-sm text-red-600">{explainSupabaseError(weeklyError, 'โหลดสรุปโบนัสไม่สำเร็จ')}</p>}
        {!workDaysLoading && !weeklyLoading && summaryRows.length === 0 && <p className="text-sm text-gray-400">สัปดาห์นี้ยังไม่มีวันทำงาน โบนัส หรือ OT</p>}
        {summaryRows.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="p-3 font-semibold">พนักงาน</th>
                  <th className="p-3 font-semibold text-right">ค่าแรงรายวัน</th>
                  <th className="p-3 font-semibold text-right">Grab</th>
                  <th className="p-3 font-semibold text-right">โบนัสเกิน 25 แก้ว</th>
                  <th className="p-3 font-semibold text-right">OT ปิดร้าน</th>
                  <th className="p-3 font-semibold text-right">รวมต้องจ่าย</th>
                  <th className="p-3 font-semibold">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {summaryRows.map((summary) => (
                  <tr key={summary.userId} className="border-t border-gray-100">
                    <td className="p-3 font-medium">{summary.name}</td>
                    <td className="p-3 text-right"><div>{summary.workDays} วัน × {DAILY_WAGE}</div><div className="font-semibold">{formatBahtSymbol(summary.dailyWage)}</div></td>
                    <td className="p-3 text-right">{formatBahtSymbol(summary.grab)}</td>
                    <td className="p-3 text-right">{formatBahtSymbol(summary.salesVolume)}</td>
                    <td className="p-3 text-right">{formatBahtSymbol(summary.closingOt)}</td>
                    <td className="p-3 text-right font-bold text-brand-700">{formatBahtSymbol(summary.total)}</td>
                    <td className="p-3"><div className="whitespace-nowrap">{summary.pendingBonus > 0 ? 'โบนัส/OT รอจ่าย' : 'พร้อมจ่าย'}</div>{summary.pendingBonus > 0 && <button className="btn-secondary text-xs py-1 mt-1" disabled={markPaid.isPending} onClick={() => handleMarkPaid(summary.userId)}>บันทึกจ่าย</button>}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-green-50 font-semibold">
                <tr className="border-t border-green-200">
                  <td className="p-3">รวมทั้งหมด</td>
                  <td className="p-3 text-right">{formatBahtSymbol(totalDailyWage)}</td>
                  <td className="p-3 text-right">{formatBahtSymbol(totalGrab)}</td>
                  <td className="p-3 text-right">{formatBahtSymbol(totalSalesVolume)}</td>
                  <td className="p-3 text-right">{formatBahtSymbol(totalClosingOt)}</td>
                  <td className="p-3 text-right text-brand-700">{formatBahtSymbol(grandTotal)}</td>
                  <td className="p-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {message && <p className="text-sm rounded-lg bg-blue-50 text-blue-700 px-3 py-2">{message}</p>}
    </section>
  )
}

