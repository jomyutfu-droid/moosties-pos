/**
 * ตัวช่วยสร้าง HTML สำหรับหน้าต่างพิมพ์ (เครื่องพิมพ์ความร้อน 80mm)
 *
 * ใบเสร็จ/สติกเกอร์/การ์ดสูตร ถูกสร้างเป็นสตริง HTML แล้วเขียนลงหน้าต่างใหม่
 * ข้อความที่มาจากฐานข้อมูล (ชื่อเมนู, ชื่อวัตถุดิบ, หมายเหตุ, ชื่อร้าน) เจ้าของร้านพิมพ์เอง
 * ถ้ามีอักขระ < > & ปนมาจะทำให้ HTML ที่พิมพ์ออกมาเพี้ยน จึงต้อง escape ก่อนเสมอ
 */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** CSS พื้นฐานของงานพิมพ์ 80mm — ดำล้วน, ไม่มี header/footer ของเบราว์เซอร์, ตัดกระดาษท้ายหน้า */
export const THERMAL_BASE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; color: #000 !important; }
  body { font-family: 'Sarabun', sans-serif; font-size: 14px; font-weight: 600; }
  .dash { border-top: 1px dashed #000; margin: 5px 0; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 12px; padding: 2px 0; border-bottom: 1px solid #000; font-weight: 700; }
  td { padding: 3px 0; vertical-align: top; font-size: 14px; font-weight: 600; }
  small { font-size: 11px; font-weight: 600; }
  .r { text-align: right; white-space: nowrap; padding-left: 4px; }
  @page { margin: 0; }
  @media print {
    * { color: #000 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`

/**
 * เปิดหน้าต่างพิมพ์แล้วสั่งพิมพ์ พร้อมปิดหน้าต่างให้อัตโนมัติ
 * ปิดจากหน้าต่างแม่ เพราะ Chrome บล็อก window.close() ที่เรียกจากตัว popup เอง
 */
export function writePrintWindow(win: Window | null, html: string): void {
  if (!win) return
  win.document.write(html)
  win.document.close()
  setTimeout(() => {
    try {
      win.close()
    } catch {
      /* ปิดไม่ได้ก็ไม่เป็นไร */
    }
  }, 2500)
}

export function openPrintWindow(html: string, width = 420, height = 700): void {
  const win = window.open('', '_blank', `width=${width},height=${height}`)
  writePrintWindow(win, html)
}
