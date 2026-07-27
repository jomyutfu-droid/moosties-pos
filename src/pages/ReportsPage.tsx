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
import { parseUnsignedNumber, displayNumber } from '@/lib/forms'

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
  const { data: cashSales = 0 } = useCashSalesSince(session?.opened_at ?? null)
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
            <input
              type="text"
              inputMode="decimal"
              className="input"
              value={displayNumber(openingCash)}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setOpeningCash(parseUnsignedNumber(e.target.value))}
            />
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
          <span>{formatBahtSymbol(cashSales)}</span>
        </div>
        <div className="flex justify-between font-bold border-t border-gray-200 pt-1 mt-1">
          <span>= ควรมีในลิ้นชัก</span>
          <span>{formatBahtSymbol(expected)}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[140px]">
          <label className="label">นับเงินสดได้จริง (บาท)</label>
          <input
            type="text"
            inputMode="decimal"
            className="input"
            value={displayNumber(countedCash)}
            onFocus={(e) => e.target.select()}
            onChange={(e) => { setCountedCash(parseUnsignedNumber(e.target.value)); setConfirming(false) }}
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
          <button className="btn-primary" onClick={() => { setError(null); setConfirming(true) }}>
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
