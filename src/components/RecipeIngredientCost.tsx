import { formatBahtSymbol, formatStockQty } from '@/lib/money'
import { toBaseQty } from '@/domain/units'

export function RecipeIngredientCost({ qty, factor, unit, costPerBaseUnit }: {
  qty: number
  factor: number
  unit: string
  costPerBaseUnit: number | null | undefined
}) {
  const hasCost = costPerBaseUnit != null && Number.isFinite(costPerBaseUnit) && costPerBaseUnit > 0
  if (!hasCost) {
    return <p className="col-span-full rounded-lg bg-amber-50 p-3 text-sm text-amber-900">ยังไม่ระบุต้นทุน — กรุณาตรวจราคาทุนในหน้าวัตถุดิบ (ปัจจุบันไม่มีราคาหรือเป็น 0 บาท)</p>
  }
  const unitCost = costPerBaseUnit * factor
  const total = toBaseQty(qty, factor) * costPerBaseUnit
  const unitCostText = new Intl.NumberFormat('th-TH', { maximumSignificantDigits: 8 }).format(unitCost)
  return (
    <div className="col-span-full rounded-lg bg-green-50 p-3 text-sm text-green-900" aria-live="polite">
      <p>ต้นทุนรายการนี้/แก้ว: <strong>{formatBahtSymbol(total)}</strong></p>
      <p className="mt-1 break-words">{unitCostText} บาท/{unit} × {formatStockQty(qty, unit)}</p>
    </div>
  )
}
