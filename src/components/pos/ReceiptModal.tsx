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

/** สร้าง HTML ใบเสร็จ + สติกเกอร์สำหรับพิมพ์ผ่าน window.open (80mm thermal) */
/** แสดงตัวเลขโดยตัดทศนิยมที่ไม่จำเป็น: 60.00 → 60, 60.50 → 60.50 */
const b = (n: number) => (n % 1 === 0 ? String(Math.round(n)) : n.toFixed(2))

function buildPrintHTML(order: ReceiptInfo): string {
  const dateStr = new Date(order.createdAt).toLocaleString('th-TH')

  // --- ใบเสร็จ: 4 คอลัมน์ (ชื่อ | จำนวน | ราคา | รวม) ---
  const lineRows = (order.lines ?? [])
    .map(
      (l) =>
        `<tr>
          <td class="item-name">${l.product.name}${
            l.selectedOptions.length
              ? '<br><small>' + l.selectedOptions.map((o) => o.name).join(', ') + '</small>'
              : ''
          }</td>
          <td class="r">x${l.qty}</td>
          <td class="r">${b(l.unitPrice)}</td>
          <td class="r">${b(l.unitPrice * l.qty)}</td>
        </tr>`,
    )
    .join('')

  const subtotal = (order.lines ?? []).reduce((s, l) => s + l.unitPrice * l.qty, 0)

  const receiptSection = `
    <div class="receipt">
      <div class="store">MOOSTTIES</div>
      <div class="meta">${dateStr}</div>
      <div class="dash"></div>
      <table>
        <thead><tr><th>รายการ</th><th class="r">จำนวน</th><th class="r">ราคา</th><th class="r">รวม</th></tr></thead>
        <tbody>${lineRows}</tbody>
      </table>
      <div class="dash"></div>
      <table class="totals">
        <tr><td>ยอดรวม</td><td class="r">${b(subtotal)}</td></tr>
        ${order.discount ? `<tr><td>ส่วนลด</td><td class="r">-${b(order.discount ?? 0)}</td></tr>` : ''}
        <tr class="grand"><td>ยอดสุทธิ</td><td class="r">${b(order.total)}</td></tr>
        <tr><td>รับเงิน</td><td class="r">${b(order.paid)}</td></tr>
        ${order.change > 0 ? `<tr><td>เงินทอน</td><td class="r">${b(order.change)}</td></tr>` : ''}
      </table>
      <div class="dash"></div>
      <div class="thank">ขอบคุณที่ใช้บริการ 🙏</div>
    </div>`

  // --- สติกเกอร์: 1 หน้าต่อแก้ว — ตัดกระดาษหลังทุกหน้า ---
  const stickerPages = (order.lines ?? []).flatMap((l) => {
    const recipeItems = (l.product.recipe_items ?? []).filter(
      (ri) => ri.ingredient?.category?.trim() !== 'บรรจุภัณฑ์',
    )
    const optLabel = l.selectedOptions.map((o) => o.name).join(', ')

    // ตัวเลือกที่ปรับปริมาณวัตถุดิบ (เช่น "หวานมาก" = +น้ำเชื่อม) ต้องรวมเข้าสูตร
    // ไม่งั้นพนักงานจะชั่ง/ตวงตามปริมาณสูตรพื้นฐาน ซึ่งไม่ตรงกับที่ตัดสต็อกจริง
    const optDeltaById = new Map<string, number>()
    for (const opt of l.selectedOptions) {
      if (!opt.linked_ingredient_id || !opt.qty_delta) continue
      optDeltaById.set(
        opt.linked_ingredient_id,
        (optDeltaById.get(opt.linked_ingredient_id) ?? 0) + opt.qty_delta,
      )
    }

    const adjusted = recipeItems.map((ri) => {
      const delta = optDeltaById.get(ri.ingredient_id) ?? 0
      if (delta) optDeltaById.delete(ri.ingredient_id) // ใช้แล้ว ไม่ต้องแสดงเป็นแถวแยก
      return { ri, qty: Math.round((ri.qty + delta) * 1000) / 1000, adjusted: delta !== 0 }
    })

    // วัตถุดิบที่มาจากตัวเลือกล้วน ๆ (ไม่มีในสูตรพื้นฐาน)
    const extraRows = Array.from(optDeltaById.entries()).map(([ingId, qty]) => {
      const optName = l.selectedOptions.find((o) => o.linked_ingredient_id === ingId)?.name ?? 'ตัวเลือก'
      return `<tr><td>${optName} <small>(ตัวเลือก)</small></td><td class="r">${qty}</td><td class="r unit">-</td></tr>`
    })

    return Array.from({ length: l.qty }, (_, i) => {
      const rows = [
        ...adjusted.map(
          ({ ri, qty, adjusted: isAdj }) =>
            `<tr>
                  <td>${ri.ingredient.name}${isAdj ? ' <small>(ปรับตามตัวเลือก)</small>' : ''}${ri.note ? `<br><small>${ri.note}</small>` : ''}</td>
                  <td class="r">${qty}</td>
                  <td class="r unit">${ri.ingredient.unit}</td>
                </tr>`,
        ),
        ...extraRows,
      ]
      const ingRows = rows.length
        ? rows.join('')
        : `<tr><td colspan="3" class="muted">ไม่มีสูตรวัตถุดิบ</td></tr>`

      return `
        <div class="sticker">
          <div class="shead">
            <span class="sname">${l.product.name}${l.qty > 1 ? ` (${i + 1}/${l.qty})` : ''}</span>
          </div>
          ${optLabel ? `<div class="sopt">${optLabel}</div>` : ''}
          <div class="dash"></div>
          <table class="ing">
            <thead><tr><th>วัตถุดิบ</th><th class="r">ปริมาณ</th><th class="r">หน่วย</th></tr></thead>
            <tbody>${ingRows}</tbody>
          </table>
        </div>`
    })
  })

  return `<!DOCTYPE html><html lang="th"><head>
    <meta charset="UTF-8"/>
    <title>ใบเสร็จ ${order.orderNo}</title>
    <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap" rel="stylesheet"/>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; color: #000 !important; }
      body { font-family: 'Sarabun', sans-serif; font-size: 14px; font-weight: 600; }

      /* ── ใบเสร็จ ── */
      .receipt { width: 76mm; padding: 4px 2mm 2px; }
      .store   { text-align: center; font-size: 20px; font-weight: 800; margin-bottom: 2px; }
      .meta    { text-align: center; font-size: 12px; font-weight: 600; line-height: 1.4; }
      .dash    { border-top: 1px dashed #000; margin: 5px 0; }
      table    { width: 100%; border-collapse: collapse; }
      th       { text-align: left; font-size: 12px; padding: 2px 0; border-bottom: 1px solid #000; font-weight: 700; }
      td       { padding: 3px 0; vertical-align: top; font-size: 14px; font-weight: 600; }
      small    { font-size: 11px; font-weight: 600; }
      .item-name { padding-right: 3px; }
      .r       { text-align: right; white-space: nowrap; padding-left: 4px; }
      .totals td { font-size: 14px; }
      .totals .r { min-width: 16mm; }
      .grand td  { font-size: 18px; font-weight: 800; padding-top: 3px; }
      .thank   { text-align: center; font-size: 13px; font-weight: 600; padding: 2px 0; }

      /* ── สติกเกอร์ ── */
      .sticker { width: 76mm; padding: 4px 2mm 2px; }
      .shead   { display: flex; justify-content: space-between; align-items: baseline; }
      .sname   { font-size: 18px; font-weight: 800; }
      .sno     { font-size: 12px; font-weight: 700; padding-left: 4px; white-space: nowrap; }
      .sopt    { font-size: 12px; font-weight: 700; margin-top: 2px; }
      .ing th  { font-size: 11px; }
      .ing td  { font-size: 14px; }
      .unit    { font-size: 12px; font-weight: 600; }
      .muted   { font-size: 12px; text-align: center; padding: 4px 0; }

      @page { margin: 0; }
      @media print {
        * { color: #000 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .receipt { page-break-after: always; }
        .sticker  { page-break-after: always; }
      }
    </style>
  </head><body>
    ${receiptSection}
    ${stickerPages.join('')}
    <script>
      // รอ 400ms ให้ font render แล้ว print
      setTimeout(function() { window.print() }, 400)
    </script>
  </body></html>`
}

export function ReceiptModal({ order, onClose }: { order: ReceiptInfo; onClose: () => void }) {
  function handlePrint() {
    const html = buildPrintHTML(order)
    const win = window.open('', '_blank', 'width=420,height=700')
    if (!win) return
    win.document.write(html)
    win.document.close()
    // ปิดจาก parent — reliable กว่าให้ popup ปิดตัวเอง
    setTimeout(() => { try { win.close() } catch { /* ignore */ } }, 2500)
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
