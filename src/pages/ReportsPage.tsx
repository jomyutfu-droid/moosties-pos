import { useState } from 'react'
import { useTodaySummary, useSalesByDateRange } from '@/hooks/useReports'
import {
  useCloseSession,
  useOpenCashSession,
  useOpenSession,
  useCashSalesSince,
} from '@/hooks/useCashSession'
import { formatBahtSymbol, round2 } from '@/lib/money'
import { explainSupabaseError } from '@/lib/errors'
import { useSessionStore } from '@/store/session'
import { parseUnsignedNumber } from '@/lib/forms'
import { NumberField } from '@/components/NumberField'
import { getBillableMinutes, useTimeLogsByRange, usePendingOvertimeRequests, useReviewOvertime, useApprovedOvertimeByRange } from '@/hooks/useTimeLogs'

/** วันที่ "วันนี้" ตามเวลาเครื่อง — toISOString() ให้วันที่ UTC ซึ่งก่อน 07:00 น. ไทยจะเป็นเมื่อวาน */
function todayStr() {
  const d = new Date()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export default function ReportsPage() {
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
              <button className="btn-primary text-xs" disabled={review.isPending} onClick={() => review.mutate({ id: request.id, status: 'approved', reviewerId: activeStaff.id })}>อนุมัติ OT</button>
              <button className="btn-secondary text-xs" disabled={review.isPending} onClick={() => review.mutate({ id: request.id, status: 'rejected', reviewerId: activeStaff.id })}>ไม่อนุมัติ</button>
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
    const minutes = getBillableMinutes(log.clock_in, log.clock_out)
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
  const { data: session, isLoading } = useOpenCashSession()
  const {
    data: cashSales = 0,
    isError: cashSalesError,
    isLoading: cashSalesLoading,
  } = useCashSalesSince(session?.opened_at ?? null)
  const openSession = useOpenSession()
  const closeSession = useCloseSession()
  const activeStaff = useSessionStore((s) => s.activeStaff)

  const [openingCash, setOpeningCash] = useState(0)
  const [countedCash, setCountedCash] = useState(0)
  const [note, setNote] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // เก็บผลสรุปไว้แสดงต่อหลังปิดกะ — ถ้าไม่แยกออกมา ผลจะหายทันทีที่ session กลายเป็น null
  const [result, setResult] = useState<{ expected: number; variance: number; counted: number } | null>(null)

  const expected = session ? round2(session.opening_cash + cashSales) : 0
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

  async function handleClose() {
    if (!session) return
    setError(null)
    try {
      const r = await closeSession.mutateAsync({ session, countedCash, note: note || null })
      setResult({ ...r, counted: countedCash })
      setConfirming(false)
      setCountedCash(0)
      setNote('')
    } catch (err) {
      setError(explainSupabaseError(err, 'ปิดกะไม่สำเร็จ'))
      setConfirming(false)
    }
  }

  if (isLoading) return null

  // สรุปผลหลังปิดกะ — แสดงค้างไว้จนกดรับทราบ
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
        <div className="flex justify-between">
          <span>ยอดที่ควรมี</span>
          <span>{formatBahtSymbol(result.expected)}</span>
        </div>
        <div className="flex justify-between">
          <span>นับได้จริง</span>
          <span>{formatBahtSymbol(result.counted)}</span>
        </div>
      </div>
      <button className="btn-secondary text-xs mt-3" onClick={() => setResult(null)}>
        รับทราบ
      </button>
    </div>
  )

  const errorLine = error && (
    <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 mb-3">{error}</p>
  )

  if (!session) {
    return (
      <section className="card p-4">
        <h2 className="font-semibold mb-3">เปิดกะ</h2>
        {resultCard}
        {errorLine}
        <p className="text-sm text-gray-500 mb-3">
          นับเงินทอนย่อยที่ใส่ลิ้นชักตอนเปิดร้าน แล้วกรอกยอดที่นี่ — ใช้ตรวจเงินขาด/เกินตอนปิดร้าน
        </p>
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
    )
  }

  return (
    <section className="card p-4">
      <h2 className="font-semibold mb-3">ปิดกะ</h2>
      {resultCard}
      {errorLine}

      {/* ยอดที่ควรมีในลิ้นชัก — คำนวณสด ให้เห็นก่อนนับเงิน */}
      <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 mb-3 text-sm space-y-1">
        <p className="text-gray-500 text-xs mb-1">
          เปิดกะเมื่อ {new Date(session.opened_at).toLocaleString('th-TH')}
        </p>
        <div className="flex justify-between">
          <span>เงินทอนตั้งต้น</span>
          <span>{formatBahtSymbol(session.opening_cash)}</span>
        </div>
        <div className="flex justify-between">
          <span>+ ขายเงินสดตั้งแต่เปิดกะ</span>
          <span>{cashSalesLoading ? 'กำลังโหลด…' : formatBahtSymbol(cashSales)}</span>
        </div>
        <div className="flex justify-between font-bold border-t border-gray-200 pt-1 mt-1">
          <span>= ควรมีในลิ้นชัก</span>
          <span>{formatBahtSymbol(expected)}</span>
        </div>
      </div>

      {/* ถ้าดึงยอดขายเงินสดไม่ได้ ตัวเลข "ควรมี" ข้างบนจะต่ำกว่าความจริง — ห้ามปิดกะด้วยเลขที่ผิด */}
      {cashSalesError && (
        <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 mb-3">
          ⚠️ คำนวณยอดขายเงินสดไม่สำเร็จ — ตัวเลข "ควรมีในลิ้นชัก" ด้านบนอาจไม่ถูกต้อง กรุณาลองใหม่ก่อนปิดกะ
        </p>
      )}

      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[140px]">
          <label className="label">นับเงินสดได้จริง (บาท)</label>
          <NumberField
            className="input"
            value={countedCash}
            parse={parseUnsignedNumber}
            onChange={(n) => { setCountedCash(n); setConfirming(false) }}
          />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="label">หมายเหตุ</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>

      {/* พรีวิวผลต่างระหว่างพิมพ์ */}
      {countedCash > 0 && (
        <p
          className={`mt-3 text-sm font-medium ${
            variancePreview === 0
              ? 'text-green-700'
              : Math.abs(variancePreview) <= 20
              ? 'text-amber-700'
              : 'text-red-700'
          }`}
        >
          {variancePreview === 0
            ? 'เงินตรงพอดี ✓'
            : variancePreview > 0
            ? `เงินเกิน ${formatBahtSymbol(variancePreview)}`
            : `เงินขาด ${formatBahtSymbol(Math.abs(variancePreview))}`}
        </p>
      )}

      <div className="flex gap-2 mt-3">
        {confirming ? (
          <>
            <button className="btn-primary flex-1" disabled={closeSession.isPending} onClick={handleClose}>
              {closeSession.isPending ? 'กำลังปิดกะ…' : 'ยืนยันปิดกะ'}
            </button>
            <button className="btn-secondary" onClick={() => setConfirming(false)}>
              ยกเลิก
            </button>
          </>
        ) : (
          <button
            className="btn-primary"
            disabled={cashSalesError}
            title={cashSalesError ? 'คำนวณยอดขายไม่สำเร็จ — รอลองใหม่ก่อนปิดกะ' : undefined}
            onClick={() => { setError(null); setConfirming(true) }}
          >
            ปิดกะ
          </button>
        )}
      </div>
      {confirming && (
        <p className="text-xs text-gray-500 mt-2">ปิดกะแล้วแก้ไขยอดไม่ได้ — ตรวจยอดที่นับอีกครั้งก่อนยืนยัน</p>
      )}
    </section>
  )
}
