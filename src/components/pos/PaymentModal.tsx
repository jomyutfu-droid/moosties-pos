import { useMemo, useState } from 'react'
import generatePayload from 'promptpay-qr'
import { QRCodeSVG } from 'qrcode.react'
import { formatBahtSymbol, round2 } from '@/lib/money'
import { useSettings } from '@/hooks/useSettings'
import type { PaymentMethod } from '@/types'

export function PaymentModal({
  total,
  onConfirm,
  onClose,
}: {
  total: number
  onConfirm: (payments: { method: PaymentMethod; amount: number; ref: string | null }[]) => void
  onClose: () => void
}) {
  const { data: settings } = useSettings()
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [cashReceived, setCashReceived] = useState<number>(total)
  const [submitting, setSubmitting] = useState(false)

  const change = round2(cashReceived - total)

  const qrPayload = useMemo(() => {
    if (!settings?.promptpay_id) return null
    try {
      return generatePayload(settings.promptpay_id, { amount: total })
    } catch {
      return null
    }
  }, [settings?.promptpay_id, total])

  async function handleConfirm() {
    setSubmitting(true)
    try {
      if (method === 'cash') {
        onConfirm([{ method: 'cash', amount: total, ref: null }])
      } else {
        onConfirm([{ method: 'promptpay', amount: total, ref: null }])
      }
    } finally {
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
                type="number"
                className="input text-lg"
                value={cashReceived}
                onChange={(e) => setCashReceived(Number(e.target.value))}
              />
              <div className="flex justify-between text-sm">
                <span>เงินทอน</span>
                <span className={change < 0 ? 'text-red-600' : 'text-gray-800'}>{formatBahtSymbol(change)}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[100, 500, 1000].map((v) => (
                  <button key={v} className="btn-secondary" onClick={() => setCashReceived(v)}>
                    {v}
                  </button>
                ))}
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
          <button className="btn-ghost" onClick={onClose}>
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
