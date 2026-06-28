/**
 * Feature 2: ReceiptModal — ใบเสร็จ + สติกเกอร์ต่อแก้ว
 * - ใบเสร็จ: รายการสินค้า, ส่วนลด, ยอดรวม, ยอดรับ, เงินทอน
 * - สติกเกอร์ (ต่อถ้วย): ชื่อสินค้า + ตัวเลือก + วัตถุดิบ (ไม่รวม category "บรรจุภัณฑ์")
 */
import { formatBahtSymbol } from '@/lib/money'
import type { CartLine } from '@/types'

interface ReceiptInfo {
  orderNo: string
  total: number
  paid: number
  change: number
  createdAt: string
  lines?: CartLine[]
  discount?: number
}

/** สร้าง HTML ใบเสร็จ + สติกเกอร์สำหรับพิมพ์ผ่าน window.open */
function buildPrintHTML(order: ReceiptInfo): string {
  const dateStr = new Date(order.createdAt).toLocaleString('th-TH')

  // --- ใบเสร็จ ---
  const lineRows = (order.lines ?? [])
    .map(
      (l) =>
        `<tr>
          <td>${l.product.name}${l.selectedOptions.length ? '<br><small>' + l.selectedOptions.map((o) => o.name).join(', ') + '</small>' : ''}</td>
          <td style="text-align:right">${l.qty}</td>
          <td style="text-align:right">${l.unitPrice.toFixed(2)}</td>
          <td style="text-align:right">${(l.unitPrice * l.qty).toFixed(2)}</td>
        </tr>`,
    )
    .join('')

  const subtotal = (order.lines ?? []).reduce((s, l) => s + l.unitPrice * l.qty, 0)

  const receiptSection = `
    <div class="receipt">
      <h2>MOOSTTIES</h2>
      <p class="sub">${dateStr}</p>
      <p class="sub">เลขบิล: ${order.orderNo}</p>
      <hr/>
      <table>
        <thead><tr><th>รายการ</th><th>จำนวน</th><th>ราคา</th><th>รวม</th></tr></thead>
        <tbody>${lineRows}</tbody>
      </table>
      <hr/>
      <table class="totals">
        <tr><td>ยอดรวม</td><td>${subtotal.toFixed(2)}</td></tr>
        ${order.discount ? `<tr><td>ส่วนลด</td><td>-${(order.discount ?? 0).toFixed(2)}</td></tr>` : ''}
        <tr class="bold"><td>ยอดสุทธิ</td><td>${order.total.toFixed(2)}</td></tr>
        <tr><td>รับเงิน</td><td>${order.paid.toFixed(2)}</td></tr>
        ${order.change > 0 ? `<tr><td>เงินทอน</td><td>${order.change.toFixed(2)}</td></tr>` : ''}
      </table>
      <hr/>
      <p class="sub center">ขอบคุณที่ใช้บริการ</p>
    </div>`

  // --- สติกเกอร์ต่อถ้วย ---
  const stickers = (order.lines ?? [])
    .flatMap((l) => {
      // กรองวัตถุดิบ — ไม่รวม category บรรจุภัณฑ์
      const recipeItems = (l.product.recipe_items ?? []).filter(
        (ri) => ri.ingredient?.category?.trim() !== 'บรรจุภัณฑ์',
      )
      // ตัวเลือกที่เลือก
      const optLabel = l.selectedOptions.map((o) => o.name).join(', ')
      // สร้าง 1 สติกเกอร์ต่อ qty
      return Array.from({ length: l.qty }, (_, i) => {
        const ingredientList = recipeItems.length
          ? recipeItems.map((ri) => `<span>${ri.ingredient.name} ${ri.qty} ${ri.ingredient.unit}</span>`).join(' · ')
          : '<span class="muted">ไม่มีสูตรวัตถุดิบ</span>'
        return `
          <div class="sticker">
            <div class="sticker-name">${l.product.name}${l.qty > 1 ? ` (${i + 1}/${l.qty})` : ''}</div>
            ${optLabel ? `<div class="sticker-opt">${optLabel}</div>` : ''}
            <div class="sticker-ing">${ingredientList}</div>
          </div>`
      })
    })
    .join('')

  return `<!DOCTYPE html><html lang="th"><head>
    <meta charset="UTF-8"/>
    <title>ใบเสร็จ ${order.orderNo}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Sarabun', sans-serif; font-size: 12px; color: #111; }
      .receipt { width: 72mm; margin: 0 auto; padding: 8px 4px; }
      .receipt h2 { text-align: center; font-size: 16px; margin-bottom: 4px; }
      .receipt .sub { text-align: center; color: #555; margin-bottom: 2px; }
      .receipt .center { text-align: center; }
      .receipt table { width: 100%; border-collapse: collapse; margin: 4px 0; }
      .receipt table th { text-align: left; padding: 2px; border-bottom: 1px solid #ccc; }
      .receipt table td { padding: 2px; vertical-align: top; }
      .receipt table small { color: #777; }
      .receipt .totals td:last-child { text-align: right; }
      .receipt .bold td { font-weight: 700; }
      hr { border: none; border-top: 1px dashed #aaa; margin: 6px 0; }
      /* สติกเกอร์ */
      .stickers { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px; }
      .sticker { border: 1px solid #ddd; border-radius: 6px; padding: 6px 8px; width: 72mm; break-inside: avoid; }
      .sticker-name { font-weight: 700; font-size: 14px; }
      .sticker-opt { color: #555; font-size: 11px; margin-top: 2px; }
      .sticker-ing { font-size: 11px; color: #333; margin-top: 4px; line-height: 1.6; }
      .muted { color: #aaa; }
      @media print {
        .no-print { display: none !important; }
        .page-break { page-break-after: always; }
      }
    </style>
  </head><body>
    ${receiptSection}
    ${stickers ? `<div class="page-break"></div><div class="stickers">${stickers}</div>` : ''}
    <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }</script>
  </body></html>`
}

export function ReceiptModal({ order, onClose }: { order: ReceiptInfo; onClose: () => void }) {
  function handlePrint() {
    const html = buildPrintHTML(order)
    const win = window.open('', '_blank', 'width=420,height=700')
    if (!win) return
    win.document.write(html)
    win.document.close()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm text-center p-6">
        <div className="text-4xl mb-2">✅</div>
        <h2 className="text-lg font-bold">รับชำระเงินสำเร็จ</h2>
        <p className="text-sm text-gray-500 mt-1">เลขบิล {order.orderNo}</p>
        <p className="text-xs text-gray-400">{new Date(order.createdAt).toLocaleString('th-TH')}</p>

        <div className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <span>ยอดสุทธิ</span>
            <span className="font-medium">{formatBahtSymbol(order.total)}</span>
          </div>
          <div className="flex justify-between">
            <span>รับเงิน</span>
            <span>{formatBahtSymbol(order.paid)}</span>
          </div>
          {order.change > 0 && (
            <div className="flex justify-between">
              <span>เงินทอน</span>
              <span>{formatBahtSymbol(order.change)}</span>
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-5">
          <button className="btn-secondary flex-1" onClick={handlePrint}>
            พิมพ์ใบเสร็จ + สติกเกอร์
          </button>
          <button className="btn-primary flex-1" onClick={onClose}>
            ปิด
          </button>
        </div>
      </div>
    </div>
  )
}
