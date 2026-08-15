import { useMemo, useRef, useState } from 'react'
import generatePayload from 'promptpay-qr'
import { QRCodeSVG } from 'qrcode.react'
import { floorBaht, formatBahtSymbol } from '@/lib/money'
import { useSettings } from '@/hooks/useSettings'
import type { PaymentMethod } from '@/types'

export function PaymentModal({
  total,
  onConfirm,
  onClose,
}: {
  total: number
  onConfirm: (
    payments: { method: PaymentMethod; amount: number; ref: string | null }[],
    meta: { cashReceived: number },
  ) => Promise<void> | void
  onClose: () => void
}) {
  const { data: settings } = useSettings()
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [cashReceived, setCashReceived] = useState<number>(0)
  const [submitting, setSubmitting] = useState(false)
  const submitLockRef = useRef(false)

  const change = cashReceived >= total ? floorBaht(cashReceived - total) : cashReceived - total

  const qrPayload = useMemo(() => {
    if (!settings?.promptpay_id) return null
    try {
      return generatePayload(settings.promptpay_id, { amount: total })
    } catch {
      return null
    }
  }, [settings?.promptpay_id, total])

  async function handleConfirm() {
    // useState อัปเดตหลัง render ถัดไป จึงใช้ ref ล็อกทันทีเพื่อกัน double-click
    if (submitLockRef.current) return
    submitLockRef.current = true
    setSubmitting(true)
    try {
      // amount = ยอดที่ต้องชำระเสมอ (ไม่ใช่เงินที่รับมา) เพื่อให้ยอดขายในรายงานถูกต้อง
      // cashReceived ส่งแยกไว้สำหรับคำนวณเงินทอนบนใบเสร็จ
      if (method === 'cash') {
        await onConfirm([{ method: 'cash', amount: total, ref: null }], { cashReceived })
      } else {
        await onConfirm([{ method: 'promptpay', amount: total, ref: null }], { cashReceived: total })
      }
    } finally {
      submitLockRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm">
        <div className="p-5 border-b border-gray-200">
          <h2 className="text-lg font-bold">ชำระเงิน</h2>
          <p className="text-2xl font-bold text-brand-700 mt-1">{formatBahtSymbol(total)}</p>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              className={`btn ${method === 'cash' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setMethod('cash')}
            >
              เงินสด
            </button>
            <button
              className={`btn ${method === 'promptpay' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setMethod('promptpay')}
            >
              PromptPay
            </button>
          </div>

          {method === 'cash' && (
            <div className="space-y-2">
              <label className="label">รับเงินมา (บาท)</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                className="input text-lg"
                value={cashReceived === 0 ? '' : cashReceived}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  const digits = e.target.value.replace(/[^0-9]/g, '')
                  setCashReceived(digits === '' ? 0 : parseInt(digits, 10))
                }}
              />
              <div className="grid grid-cols-4 gap-2">
                {[1, 5, 10, 20, 50, 100, 500, 1000].map((v) => (
                  <button key={v} type="button" className="btn-secondary min-h-12 text-sm" onClick={() => setCashReceived((current) => current + v)}>
                    {v >= 20 ? `฿${v}` : v}
                  </button>
                ))}
              </div>
              <button type="button" className="btn-ghost w-full text-sm" onClick={() => setCashReceived(total)}>
                เงินพอดี {formatBahtSymbol(total)}
              </button>
              <div className="mt-3 rounded-2xl border-2 border-brand-200 bg-brand-50 px-4 py-3 text-center">
                <div className="text-sm font-semibold text-brand-700">เงินทอน</div>
                <div className={`mt-1 text-4xl font-extrabold tabular-nums ${change < 0 ? 'text-red-600' : 'text-brand-800'}`}>
                  {formatBahtSymbol(change)}
                </div>
              </div>
            </div>
          )}

          {method === 'promptpay' && (
            <div className="flex flex-col items-center gap-2">
              {qrPayload ? (
                <QRCodeSVG value={qrPayload} size={200} />
              ) : (
                <p className="text-sm text-amber-600 text-center">
                  ยังไม่ได้ตั้งค่า PromptPay ID — ไปที่หน้าตั้งค่าเพื่อกรอกหมายเลข
                </p>
              )}
              <p className="text-sm text-gray-500">ให้ลูกค้าสแกนเพื่อชำระ {formatBahtSymbol(total)}</p>
            </div>
          )}
        </div>
        <div className="p-5 border-t border-gray-200 flex justify-end gap-2">
          <button className="btn-ghost" disabled={submitting} onClick={onClose}>
            ยกเลิก
          </button>
          <button
            className="btn-primary"
            disabled={submitting || (method === 'cash' && change < 0)}
            onClick={handleConfirm}
          >
            {submitting ? 'กำลังบันทึก…' : 'ยืนยันรับเงิน'}
          </button>
        </div>
      </div>
    </div>
  )
}

