/**
 * ตัวช่วยสำหรับ input ตัวเลขที่ควบคุมด้วย React (controlled)
 *
 * ปัญหา: <input type="number"> ที่ควบคุมด้วย state จะโชว์ "0 นำหน้า" ค้างบนจอ
 * ระหว่างพิมพ์ (เช่น พิมพ์ "60" แล้วเห็น "060") โดยเฉพาะบนแท็บเล็ต/เบราว์เซอร์ kiosk —
 * เป็นปัญหาที่รู้จักกันดีของ React กับ input ชนิด number (ตัวอักษรที่พิมพ์ไปอยู่ใน DOM
 * ก่อนที่ React จะ re-render ทับ) พบและยืนยันแก้ได้จริงกับช่อง "รับเงินมา"
 *
 * ทางแก้: ใช้ type="text" + inputMode="decimal"/"numeric" แทน, กรองเฉพาะอักขระตัวเลข
 * (และจุดทศนิยม/เครื่องหมายลบถ้าจำเป็น) เอง แล้วแสดงค่า 0 เป็นช่องว่างแทนเลข 0 ตัวเดียว
 * เพื่อไม่ให้มีเลข "0" ให้พิมพ์ต่อท้ายโดยไม่ได้ตั้งใจ
 */

/** แปลงข้อความเป็นจำนวนไม่ติดลบ อนุญาตทศนิยม 1 จุด — ใช้กับราคา/ปริมาณ/% ทั่วไป */
export function parseUnsignedNumber(raw: string): number {
  const cleaned = raw.replace(/[^0-9.]/g, '')
  if (cleaned === '' || cleaned === '.') return 0
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

/** แปลงข้อความเป็นจำนวนที่ติดลบได้ อนุญาตทศนิยม 1 จุด — ใช้กับ price_delta/qty_delta */
export function parseSignedNumber(raw: string): number {
  const cleaned = raw.replace(/[^0-9.-]/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return 0
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

/** ค่าที่จะแสดงในช่อง input — โชว์ว่างแทน "0" กันเลข 0 ค้างให้พิมพ์ต่อท้ายผิด ๆ */
export function displayNumber(n: number): string {
  return n === 0 ? '' : String(n)
}
