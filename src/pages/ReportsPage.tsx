import { useState } from 'react'
import { useTodaySummary, useSalesByDateRange } from '@/hooks/useReports'
import { useCloseSession, useOpenCashSession, useOpenSession } from '@/hooks/useCashSession'
import { formatBahtSymbol } from '@/lib/money'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
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
  const openSession = useOpenSession()
  const closeSession = useCloseSession()
  const [openingCash, setOpeningCash] = useState(0)
  const [countedCash, setCountedCash] = useState(0)
  const [note, setNote] = useState('')
  const [result, setResult] = useState<{ expected: number; variance: number } | null>(null)

  if (isLoading) return null

  if (!session) {
    return (
      <section className="card p-4">
        <h2 className="font-semibold mb-3">เปิดกะ</h2>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="label">เงินทอนตั้งต้น (บาท)</label>
            <input type="number" className="input" value={openingCash} onChange={(e) => setOpeningCash(Number(e.target.value))} />
          </div>
          <button className="btn-primary" disabled={openSession.isPending} onClick={() => openSession.mutate(openingCash)}>
            เปิดกะ
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="card p-4">
      <h2 className="font-semibold mb-3">ปิดกะ</h2>
      <p className="text-sm text-gray-500 mb-2">
        เปิดกะเมื่อ {new Date(session.opened_at).toLocaleString('th-TH')} — เงินทอนตั้งต้น{' '}
        {formatBahtSymbol(session.opening_cash)}
      </p>
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="label">นับเงินสดได้ (บาท)</label>
          <input type="number" className="input" value={countedCash} onChange={(e) => setCountedCash(Number(e.target.value))} />
        </div>
        <div className="flex-1">
          <label className="label">หมายเหตุ</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button
          className="btn-primary"
          disabled={closeSession.isPending}
          onClick={async () => {
            const r = await closeSession.mutateAsync({ session, countedCash, note: note || null })
            setResult(r)
          }}
        >
          ปิดกะ
        </button>
      </div>
      {result && (
        <p className={`mt-3 text-sm ${result.variance === 0 ? 'text-green-700' : 'text-amber-700'}`}>
          ยอดคาดหวัง {formatBahtSymbol(result.expected)} — ผลต่าง {formatBahtSymbol(result.variance)}
        </p>
      )}
    </section>
  )
}
