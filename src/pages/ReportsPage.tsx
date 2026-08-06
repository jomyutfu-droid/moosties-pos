import { useState } from 'react'
import { useTodaySummary, useSalesByDateRange } from '@/hooks/useReports'
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
    </div>
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
      const closed = await closeSession.mutateAsync({ session, countedCash, note: closeNote.trim() || null })
      setResult({ ...closed, counted: countedCash })
      setConfirming(false)
      setCountedCash(0)
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
