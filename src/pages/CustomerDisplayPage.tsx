/**
 * Feature 7: CustomerDisplayPage — หน้าจอลูกค้า
 * อ่านข้อมูลตะกร้าจาก localStorage (เขียนโดย cart store)
 * ไม่ต้อง auth — เปิดในหน้าต่างใหม่ด้วยปุ่ม 📺 ใน AppLayout
 */
import { useEffect, useState } from 'react'
import { formatBahtSymbol } from '@/lib/money'

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

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <header className="bg-brand-700 px-8 py-5 flex items-center justify-between">
        <span className="text-2xl font-bold tracking-wide">MOOSTTIES</span>
        <span className="text-brand-200 text-sm">ขอบคุณที่ใช้บริการ</span>
      </header>

      {/* Content */}
      <main className="flex-1 px-8 py-6 flex flex-col gap-4">
        {isEmpty ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-500 text-xl">ยินดีต้อนรับ 🌿</p>
          </div>
        ) : (
          <>
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
                      {line.options && <span className="ml-2 text-sm text-gray-400">{line.options}</span>}
                    </td>
                    <td className="py-3 text-center text-gray-300">{line.qty}</td>
                    <td className="py-3 text-right text-gray-300">{formatBahtSymbol(line.unitPrice)}</td>
                    <td className="py-3 text-right font-medium">{formatBahtSymbol(line.unitPrice * line.qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div className="ml-auto w-64 space-y-2 mt-2">
              {display.discount > 0 && (
                <div className="flex justify-between text-gray-400">
                  <span>ส่วนลด</span>
                  <span>-{formatBahtSymbol(display.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-3xl font-bold text-brand-300 border-t border-gray-700 pt-3">
                <span>รวม</span>
                <span>{formatBahtSymbol(display.total)}</span>
              </div>
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
