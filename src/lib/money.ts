// ตัวช่วยจัดการเงิน/จำนวน ตามสเปกหัวข้อ 9
// เงิน: ทศนิยม 2 ตำแหน่ง, สต็อก: ทศนิยม 3 ตำแหน่ง

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function round3(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000
}

export function formatBaht(value: number): string {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(round2(value))
}

export function formatBahtSymbol(value: number): string {
  return `฿${formatBaht(value)}`
}

export function formatStockQty(value: number, unit?: string): string {
  const text = new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(round3(value))
  return unit ? `${text} ${unit}` : text
}

/** คำนวณ % กำไรขั้นต้น จากราคาขายและต้นทุน */
export function marginPercent(price: number, cost: number): number {
  if (price <= 0) return 0
  return round2(((price - cost) / price) * 100)
}

/** กำไรต่อหน่วย (บาท) */
export function profitPerUnit(price: number, cost: number): number {
  return round2(price - cost)
}
