import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { normalizeLineManRef } from '@/domain/lineMan'
import { useSessionStore } from '@/store/session'
import type { LineManReceiptInfo } from './LineManReceiptModal'

export function LineManHistoryModal({ onClose, onReceipt }: { onClose: () => void; onReceipt: (receipt: LineManReceiptInfo) => void }) {
  const token = useSessionStore(s => s.pinSessionToken)
  const [input, setInput] = useState('')
  const [reference, setReference] = useState('')
  const [validation, setValidation] = useState('')
  const { data, isFetching, error } = useQuery({
    queryKey: ['line-man-history', reference],
    queryFn: async () => {
      const result = await supabase.rpc('list_line_man_orders', {p_token:token,p_reference:reference || null})
      if (result.error) throw result.error
      return result.data as {id:string;external_order_ref:string;order_no:string;status:string;created_at:string;receipt_snapshot:LineManReceiptInfo}[]
    },
    staleTime: 0,
  })
  return <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3">
    <section role="dialog" aria-modal="true" aria-labelledby="lm-history-title" className="bg-white rounded-2xl w-full max-w-lg max-h-[90dvh] flex flex-col">
      <header className="p-4 border-b flex justify-between items-center"><h2 id="lm-history-title" className="font-bold text-lg">ประวัติออเดอร์ LINE MAN</h2><button className="btn-ghost" onClick={onClose}>ปิด</button></header>
      <form className="p-4 flex gap-2" onSubmit={e => { e.preventDefault(); try { setReference(input.trim() ? normalizeLineManRef(input) : ''); setValidation('') } catch (e) { setValidation((e as Error).message) } }}>
        <input aria-label="ค้นหาเลขคำสั่งซื้อ LINE MAN" className="input min-w-0" value={input} onChange={e => setInput(e.target.value)} placeholder="เลขคำสั่งซื้อแบบเต็ม" /><button className="btn-secondary">ค้นหา</button>
      </form>
      <p className="px-4 text-xs text-gray-500">50 ออเดอร์ล่าสุดของสาขา · พิมพ์ซ้ำไม่ตัดสต็อก</p>
      <div className="p-4 space-y-2 overflow-y-auto min-h-0">
        {(error || validation) && <p role="alert" className="text-red-700">{validation || 'โหลดประวัติไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วค้นหาอีกครั้ง'}</p>}
        {isFetching && <p>กำลังโหลด…</p>}
        {!isFetching && !error && data?.length === 0 && <p className="text-gray-500">ไม่พบคำสั่งซื้อ</p>}
        {data?.map(order => <div key={order.id} className="border rounded-xl p-3 flex gap-2 items-center justify-between"><div className="min-w-0"><p className="font-bold break-all">{order.external_order_ref}</p><p className="text-xs text-gray-500">{new Date(order.created_at).toLocaleString('th-TH')} · {order.order_no}</p><p className="text-sm">{order.receipt_snapshot.totalCups} แก้ว · บันทึกออเดอร์แล้ว</p></div><button className="btn-secondary shrink-0 text-sm" onClick={() => onReceipt(order.receipt_snapshot)}>พิมพ์ใบงาน</button></div>)}
      </div>
    </section>
  </div>
}
