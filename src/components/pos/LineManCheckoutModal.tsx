import { useRef, useState } from 'react'
import { lineManLines, lineManTotals, normalizeLineManRef } from '@/domain/lineMan'
import { optionLabel } from '@/domain/sweetness'
import { prepareLineManSale, submitLineManSale } from '@/lib/lineMan'
import { formatBahtSymbol } from '@/lib/money'
import { useSessionStore } from '@/store/session'
import { useSettings } from '@/hooks/useSettings'
import type { CartLine } from '@/types'
import type { ReceiptInfo } from './ReceiptModal'

export function LineManCheckoutModal({ lines, note, onSuccess, onClose }: {
  lines: CartLine[]; note: string
  onSuccess: (receipt: ReceiptInfo) => void
  onClose: () => void
}) {
  const [reference, setReference] = useState('')
  const [discount, setDiscount] = useState('0')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [attempted, setAttempted] = useState(false)
  const lock = useRef(false)
  // Retain the exact same payload/UUID when a network reply is lost.
  const submitted = useRef<ReturnType<typeof prepareLineManSale> | null>(null)
  const { activeStaff, pinSessionToken } = useSessionStore()
  const { data: settings } = useSettings()
  let priced: CartLine[] = []
  let priceError = ''
  let total = 0
  let subtotal = 0
  try {
    priced = lineManLines(lines)
    const amounts = lineManTotals(priced, Number(discount))
    total = amounts.total
    subtotal = amounts.subtotal
  } catch (e) { priceError = (e as Error).message }
  const manager = activeStaff?.role === 'owner' || activeStaff?.role === 'manager'
  const cap = manager ? subtotal : Math.min(settings?.staff_discount_limit ?? 0, subtotal)
  const overCap = Number(discount) > cap
  let validRef = true
  try { normalizeLineManRef(reference) } catch { validRef = false }

  async function confirm() {
    if (lock.current || priceError || overCap || !validRef) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      if (!submitted.current) submitted.current = prepareLineManSale(priced, reference, Number(discount), note)
      setAttempted(true)
      const receipt = await submitLineManSale(submitted.current, pinSessionToken)
      onSuccess(receipt)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ยังยืนยันไม่ได้ กรุณาตรวจประวัติ LINE MAN ก่อนทำรายการใหม่')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  return <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3">
    <section role="dialog" aria-modal="true" aria-labelledby="lm-title" className="w-full max-w-lg max-h-[94dvh] bg-white rounded-2xl overflow-hidden flex flex-col shadow-xl">
      <header className="p-5 bg-green-900 text-white flex justify-between gap-4">
        <div><p className="text-xs tracking-widest text-green-200">DELIVERY CHECKOUT</p><h2 id="lm-title" className="text-xl font-bold mt-1">คิดเงิน LINE MAN</h2><p className="text-xs mt-1 text-green-100">บันทึกยอดขายใน POS · ไม่เรียกเก็บเงินลูกค้าซ้ำ</p></div>
        <button aria-label="ปิด LINE MAN" className="self-start p-2" disabled={busy} onClick={onClose}>✕</button>
      </header>
      <div className="p-5 space-y-4 overflow-y-auto min-h-0">
        <label className="block font-semibold">เลขคำสั่งซื้อ LINE MAN <span className="text-red-600">*</span>
          <input autoFocus autoComplete="off" spellCheck={false} className="input mt-2 font-mono text-lg" placeholder="กรอกเลขคำสั่งซื้อแบบเต็มทุกครั้ง" maxLength={80} value={reference} disabled={attempted} onChange={e => setReference(e.target.value)} />
          <span className="block text-xs font-normal text-gray-500 mt-1">ใช้เลขเต็ม ไม่ใช้เฉพาะเลขท้าย เพื่อป้องกันบิลซ้ำ</span>
        </label>
        {priceError ? <p role="alert" className="p-3 rounded-xl bg-amber-50 text-amber-900 text-sm">{priceError}</p> : <div className="rounded-xl border divide-y">
          {priced.map(line => <div key={line.uid} className="p-3 flex justify-between gap-3 text-sm"><div><p className="font-semibold">{line.qty} × {line.product.name}</p><p className="text-gray-500 text-xs mt-1">{optionLabel(line.selectedOptions)}</p><p className="text-green-800 text-xs mt-1">ราคา LINE MAN {formatBahtSymbol(line.unitPrice)} / แก้ว</p></div><span className="font-bold whitespace-nowrap">{formatBahtSymbol(line.unitPrice * line.qty)}</span></div>)}
        </div>}
        <label className="block text-sm font-semibold">ส่วนลดที่ร้านรับผิดชอบ (บาท)
          <input type="number" min="0" max={cap} step="0.01" className="input mt-1" value={discount} disabled={attempted || cap <= 0} onChange={e => setDiscount(e.target.value)} />
          <span className="block text-xs text-gray-500 font-normal mt-1">ไม่รวมค่าส่ง ส่วนลดแพลตฟอร์ม หรือค่าคอมมิชชัน · สิทธิ์ส่วนลดสูงสุด {formatBahtSymbol(cap)}</span>
        </label>
        {overCap && <p role="alert" className="text-red-700 text-sm">ส่วนลดเกินสิทธิ์ที่กำหนด</p>}
        <div className="bg-green-50 rounded-xl p-4 flex items-center justify-between"><span className="font-semibold">ยอดขาย LINE MAN</span><strong className="text-2xl text-green-900">{formatBahtSymbol(total)}</strong></div>
        <p className="text-xs text-gray-500">ตรวจให้ตรงยอดสินค้าและท็อปปิ้งหลังหักส่วนลดร้านในคำสั่งซื้อ · ยืนยันได้เมื่อออนไลน์เท่านั้น</p>
        {error && <div role="alert" className="p-3 bg-red-50 text-red-800 rounded-xl text-sm">{error}<p className="mt-1">หากการเชื่อมต่อขัดข้อง กดตรวจสอบ/ลองอีกครั้งด้วยรายการเดิม หรือเปิดประวัติก่อนเริ่มบิลใหม่</p></div>}
      </div>
      <footer className="p-4 border-t flex gap-2 shrink-0"><button className="btn-secondary" disabled={busy} onClick={onClose}>ปิด</button><button className="btn-primary flex-1 min-h-12" disabled={busy || !!priceError || overCap || !validRef} onClick={confirm}>{busy ? 'กำลังยืนยัน…' : attempted ? 'ตรวจสอบ / ลองอีกครั้ง' : 'ยืนยันขาย LINE MAN'}</button></footer>
    </section>
  </div>
}
