import { openPrintWindow, THERMAL_BASE_CSS, escapeHtml } from '@/lib/html'
import { useSettings } from '@/hooks/useSettings'
import type { PrintedRecipeRow } from '@/types'

export interface LineManReceiptItem {
  name_snapshot: string
  qty: number
  options_text: string
  recipe: PrintedRecipeRow[]
}
export interface LineManReceiptInfo {
  source: 'line_man'
  orderNo: string
  lineManOrderId: string
  createdAt: string
  totalCups: number
  items: LineManReceiptItem[]
}

// eslint-disable-next-line react-refresh/only-export-components
export function buildLineManPrintHTML(order: LineManReceiptInfo, header: string, footer: string): string {
  const esc = escapeHtml
  const date = new Date(order.createdAt).toLocaleString('th-TH', {timeZone:'Asia/Bangkok'})
  const summary = order.items.map(item => `<tr><td>${esc(item.name_snapshot)}${item.options_text ? `<br><small>${esc(item.options_text)}</small>` : ''}</td><td class="r">×${item.qty}</td></tr>`).join('')
  const stickers = order.items.flatMap(item => Array.from({length:item.qty},(_,i)=>{
    const rows = item.recipe.map(r=>`<tr><td>${esc(r.name)}${r.adjusted?' <small>(ปรับสูตร)</small>':''}${r.note?`<br><small>${esc(r.note)}</small>`:''}</td><td class="r">${r.qty}</td><td class="r">${esc(r.unit)}</td></tr>`).join('')
    return `<section class="sticker"><div class="badge">LINE MAN · ใบชง</div><div class="ref">${esc(order.lineManOrderId)}</div><div class="product">${esc(item.name_snapshot)}${item.qty>1?` (${i+1}/${item.qty})`:''}</div>${item.options_text?`<div class="option">${esc(item.options_text)}</div>`:''}<div class="dash"></div><table><thead><tr><th>วัตถุดิบ</th><th class="r">ปริมาณ</th><th class="r">หน่วย</th></tr></thead><tbody>${rows||'<tr><td colspan="3">ไม่มีสูตรวัตถุดิบ</td></tr>'}</tbody></table></section>`
  })).join('')
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>LINE MAN ${esc(order.lineManOrderId)}</title><link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap" rel="stylesheet"><style>${THERMAL_BASE_CSS}.receipt,.sticker{width:76mm;padding:4px 2mm}.store,.badge{text-align:center;font-weight:800}.store{font-size:20px}.badge{border:2px solid #000;padding:5px;margin:5px 0;font-size:18px;letter-spacing:1px}.ref{text-align:center;font-size:22px;font-weight:800;overflow-wrap:anywhere;margin:5px 0}.meta{text-align:center;font-size:12px}.product{font-size:17px;font-weight:800}.option{font-size:12px;font-weight:700}.total{font-size:16px;font-weight:800}.thank{text-align:center}.dash{border-top:1px dashed #000;margin:5px 0}@media print{.receipt,.sticker{page-break-after:always}}</style></head><body><section class="receipt"><div class="store">${esc(header)}</div><div class="badge">LINE MAN · ใบออเดอร์</div><div class="meta">เลขคำสั่งซื้อ</div><div class="ref">${esc(order.lineManOrderId)}</div><div class="meta">บิล ${esc(order.orderNo)} · ${esc(date)}</div><div class="dash"></div><table><thead><tr><th>รายการ</th><th class="r">จำนวน</th></tr></thead><tbody>${summary}</tbody></table><div class="dash"></div><div class="total">รวม ${order.totalCups} แก้ว</div><p class="meta">ใบงานเตรียมเครื่องดื่มและตัดสต็อก · ไม่มีข้อมูลราคา</p><div class="dash"></div><div class="thank">${esc(footer)}</div></section>${stickers}<script>setTimeout(function(){window.print()},400)</script></body></html>`
}

export function LineManReceiptModal({order,onClose}:{order:LineManReceiptInfo;onClose:()=>void}) {
  const {data:settings}=useSettings()
  function print(){
    openPrintWindow(buildLineManPrintHTML(order,
      settings?.receipt_header?.trim()||settings?.store_name?.trim()||'MOOSTIES',
      settings?.receipt_footer?.trim()||'Fresh • Healthy • Daily'),420,700)
  }
  return <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="lm-receipt-title" className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
      <div className="text-4xl mb-2">✅</div><h2 id="lm-receipt-title" className="text-lg font-bold">บันทึกออเดอร์ LINE MAN แล้ว</h2>
      <p className="text-xs text-gray-500 mt-1">ตัดสต็อกแล้ว · ไม่บันทึกราคา/ยอดขาย</p>
      <p className="text-lg font-bold text-green-900 break-all mt-3">{order.lineManOrderId}</p>
      <p className="text-sm text-gray-600">{order.totalCups} แก้ว · บิล {order.orderNo}</p>
      <p className="text-xs text-gray-400">{new Date(order.createdAt).toLocaleString('th-TH')}</p>
      <div className="flex gap-2 mt-5"><button className="btn-secondary flex-1" onClick={print}>พิมพ์ใบออเดอร์ + ใบชง</button><button className="btn-primary flex-1" onClick={onClose}>ปิด</button></div>
    </section>
  </div>
}
