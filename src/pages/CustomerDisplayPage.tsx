/**
 * Feature 7: CustomerDisplayPage — หน้าจอลูกค้า
 * อ่านข้อมูลตะกร้าจาก localStorage (เขียนโดย cart store)
 * ไม่ต้อง auth — เปิดในหน้าต่างใหม่ด้วยปุ่ม 📺 ใน AppLayout
 * รองรับ PromptPay QR เมื่อตั้งค่า promptpay_id ใน Settings
 */
import { useEffect, useState, useMemo } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import generatePayload from 'promptpay-qr'
import { formatBahtSymbol } from '@/lib/money'
import { useSettings } from '@/hooks/useSettings'

const DISPLAY_KEY = 'moosties-display'

interface DisplayLine {
  name: string
  qty: number
  unitPrice: number
  options: string
}

interface DisplayState {
  lines: DisplayLine[]
  discount: number
  subtotal: number
  total: number
  updatedAt: number
}

function readDisplay(): DisplayState | null {
  try {
    const raw = localStorage.getItem(DISPLAY_KEY)
    return raw ? (JSON.parse(raw) as DisplayState) : null
  } catch {
    return null
  }
}

export default function CustomerDisplayPage() {
  const [display, setDisplay] = useState<DisplayState | null>(readDisplay)
  const { data: settings } = useSettings()

  useEffect(() => {
    // รับอัปเดตจากหน้าต่าง POS
    function onStorage(e: StorageEvent) {
      if (e.key === DISPLAY_KEY) {
        setDisplay(e.newValue ? (JSON.parse(e.newValue) as DisplayState) : null)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const isEmpty = !display || display.lines.length === 0
  const promptpayId = settings?.promptpay_id ?? ''

  // สร้าง PromptPay QR payload — recalc เฉพาะเมื่อ id หรือ total เปลี่ยน
  const qrPayload = useMemo(() => {
    if (!promptpayId || !display || display.total <= 0) return null
    try {
      return generatePayload(promptpayId, { amount: display.total })
    } catch {
      return null
    }
  }, [promptpayId, display?.total])

  const storeName = settings?.store_name ?? 'MOOSTTIES'

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <header className="bg-brand-700 px-8 py-5 flex items-center justify-between">
        <span className="text-2xl font-bold tracking-wide">{storeName}</span>
        <span className="text-brand-200 text-sm">ขอบคุณที่ใช้บริการ</span>
      </header>

      {/* Content */}
      <main className="flex-1 px-8 py-6 flex gap-8">
        {isEmpty ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-500 text-xl">ยินดีต้อนรับ 🌿</p>
          </div>
        ) : (
          <>
            {/* Left: ตารางรายการ */}
            <div className="flex-1">
              <table className="w-full text-lg">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-2 text-gray-400 font-medium">รายการ</th>
                    <th className="text-center py-2 text-gray-400 font-medium w-16">จำนวน</th>
                    <th className="text-right py-2 text-gray-400 font-medium w-28">ราคา</th>
                    <th className="text-right py-2 text-gray-400 font-medium w-32">รวม</th>
                  </tr>
                </thead>
                <tbody>
                  {display.lines.map((line, i) => (
                    <tr key={i} className="border-b border-gray-800">
                      <td className="py-3">
                        <span className="font-medium">{line.name}</span>
                        {line.options && (
                          <span className="ml-2 text-sm text-gray-400">{line.options}</span>
                        )}
                      </td>
                      <td className="py-3 text-center text-gray-300">{line.qty}</td>
                      <td className="py-3 text-right text-gray-300">
                        {formatBahtSymbol(line.unitPrice)}
                      </td>
                      <td className="py-3 text-right font-medium">
                        {formatBahtSymbol(line.unitPrice * line.qty)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Right: ยอดรวม + QR PromptPay */}
            <div className="flex flex-col items-end gap-6 min-w-[260px]">
              {/* Totals */}
              <div className="w-full space-y-2">
                {display.discount > 0 && (
                  <div className="flex justify-between text-gray-400 text-lg">
                    <span>ส่วนลด</span>
                    <span>-{formatBahtSymbol(display.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-4xl font-bold text-brand-300 border-t border-gray-700 pt-4">
                  <span>รวม</span>
                  <span>{formatBahtSymbol(display.total)}</span>
                </div>
              </div>

              {/* PromptPay QR */}
              {qrPayload && (
                <div className="bg-white rounded-2xl p-5 text-center shadow-xl">
                  <QRCodeSVG value={qrPayload} size={200} level="M" />
                  <p className="text-gray-700 text-sm font-semibold mt-3">ชำระด้วย PromptPay</p>
                  <p className="text-gray-500 text-xs mt-0.5">{formatBahtSymbol(display.total)}</p>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center text-gray-600 text-xs py-3">
        {new Date().toLocaleString('th-TH')}
      </footer>
    </div>
  )
}
