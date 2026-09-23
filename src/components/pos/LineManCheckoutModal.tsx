import { useRef, useState } from 'react'
import { optionLabel } from '@/domain/sweetness'
import { prepareLineManOrder, submitLineManOrder } from '@/lib/lineMan'
import { useSessionStore } from '@/store/session'
import type { LineManReceiptInfo } from './LineManReceiptModal'
import type { CartLine } from '@/types'

export function LineManCheckoutModal({ lines, note, onSuccess, onClose }: {
  lines: CartLine[]; note: string
  onSuccess: (receipt: LineManReceiptInfo) => void
  onClose: () => void
}) {
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [attempted, setAttempted] = useState(false)
  const lock = useRef(false)
  // A retry after an uncertain network response must reuse the same UUID.
  const submitted = useRef<ReturnType<typeof prepareLineManOrder> | null>(null)
  const { pinSessionToken } = useSessionStore()
  const cups = lines.reduce((sum, line) => sum + line.qty, 0)
  const referenceValid = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(reference.trim())

  async function confirm() {
    if (lock.current || !referenceValid) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      if (!submitted.current) submitted.current = prepareLineManOrder(lines, reference, note)
      setAttempted(true)
      onSuccess(await submitLineManOrder(submitted.current, pinSessionToken))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'บันทึกไม่ได้ ตรวจประวัติ LINE MAN ก่อนเริ่มรายการใหม่')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  return <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3">
    <section role="dialog" aria-modal="true" aria-labelledby="lm-title" className="w-full max-w-lg max-h-[94dvh] bg-white rounded-2xl overflow-hidden flex flex-col shadow-xl">
      <header className="p-5 bg-green-900 text-white flex justify-between gap-4">
        <div><p className="text-xs tracking-widest text-green-200">ORDER & INVENTORY</p><h2 id="lm-title" className="text-xl font-bold mt-1">บันทึกออเดอร์ LINE MAN</h2><p className="text-xs mt-1 text-green-100">บันทึกใบงานและตัดสต็อก · ไม่มีราคา/ยอดขาย</p></div>
        <button aria-label="ปิด LINE MAN" className="self-start p-2" disabled={busy} onClick={onClose}>✕</button>
      </header>
      <div className="p-5 space-y-4 overflow-y-auto min-h-0">
        <label className="block font-semibold">เลขคำสั่งซื้อ LINE MAN <span className="text-red-600">*</span>
          <input autoFocus autoComplete="off" spellCheck={false} className="input mt-2 font-mono text-lg" placeholder="กรอกเลขคำสั่งซื้อแบบเต็มทุกครั้ง" maxLength={80} value={reference} disabled={attempted} onChange={e => setReference(e.target.value)} />
          <span className="block text-xs font-normal text-gray-500 mt-1">ใช้เลขเต็ม ไม่ใช้เฉพาะเลขท้าย เพื่อป้องกันบิลซ้ำ</span>
        </label>
        <div className="rounded-xl border divide-y">
          {lines.map(line => <div key={line.uid} className="p-3 flex justify-between gap-3 text-sm"><div><p className="font-semibold">{line.qty} × {line.product.name}</p><p className="text-gray-500 text-xs mt-1">{optionLabel(line.selectedOptions) || 'ไม่เพิ่มท็อปปิ้ง'}</p></div><span className="font-bold whitespace-nowrap">{line.qty} แก้ว</span></div>)}
        </div>
        <div className="bg-green-50 rounded-xl p-4 flex items-center justify-between"><span className="font-semibold">จำนวนแก้วที่บันทึก/ตัดสต็อก</span><strong className="text-2xl text-green-900">{cups} แก้ว</strong></div>
        <p className="text-xs text-gray-500">ยอดเงินและราคาไม่ถูกบันทึกใน POS · ดูยอดเงินจริงจาก LINE MAN · ยืนยันได้เมื่อออนไลน์เท่านั้น</p>
        {error && <div role="alert" className="p-3 bg-red-50 text-red-800 rounded-xl text-sm">{error}<p className="mt-1">หากการเชื่อมต่อขัดข้อง ลองซ้ำด้วยรายการเดิม หรือเปิดประวัติก่อนเริ่มบิลใหม่</p></div>}
      </div>
      <footer className="p-4 border-t flex gap-2 shrink-0"><button className="btn-secondary" disabled={busy} onClick={onClose}>ปิด</button><button className="btn-primary flex-1 min-h-12" disabled={busy || !referenceValid || lines.length === 0} onClick={confirm}>{busy ? 'กำลังบันทึก…' : attempted ? 'ตรวจสอบ / ลองอีกครั้ง' : 'บันทึกออเดอร์และตัดสต็อก'}</button></footer>
    </section>
  </div>
}
