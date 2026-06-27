import { useState } from 'react'
import { useIngredientsFull } from '@/hooks/useInventory'
import { getLowStockIngredients } from '@/domain/stock'
import { formatBahtSymbol, formatStockQty } from '@/lib/money'
import { IngredientEditor } from '@/components/inventory/IngredientEditor'
import { MovementModal } from '@/components/inventory/MovementModal'
import type { Ingredient } from '@/types'

export default function InventoryPage() {
  const { data: ingredients, isLoading } = useIngredientsFull()
  const [editing, setEditing] = useState<Ingredient | null | undefined>(undefined)
  const [movementTarget, setMovementTarget] = useState<Ingredient | null>(null)

  const active = (ingredients ?? []).filter((i) => i.is_active)
  const lowStock = getLowStockIngredients(active)
  const lowStockIds = new Set(lowStock.map((i) => i.id))

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">สต็อกวัตถุดิบ</h1>
        <button className="btn-primary" onClick={() => setEditing(null)}>
          + เพิ่มวัตถุดิบ
        </button>
      </div>

      {lowStock.length > 0 && (
        <div className="card p-4 border-amber-300 bg-amber-50">
          <p className="font-semibold text-amber-800">วัตถุดิบใกล้หมด ({lowStock.length})</p>
          <ul className="mt-1 text-sm text-amber-700 space-y-0.5">
            {lowStock.map((i) => (
              <li key={i.id}>
                {i.name}: เหลือ {formatStockQty(i.stock_qty, i.unit)} (จุดสั่งซื้อ {formatStockQty(i.reorder_point)})
              </li>
            ))}
          </ul>
        </div>
      )}

      {isLoading && <p className="text-gray-500">กำลังโหลด…</p>}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left p-3">วัตถุดิบ</th>
              <th className="text-right p-3">คงเหลือ</th>
              <th className="text-right p-3">จุดสั่งซื้อ</th>
              <th className="text-right p-3">ต้นทุน/หน่วย</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {active.map((ing) => (
              <tr key={ing.id} className={`border-t border-gray-100 ${lowStockIds.has(ing.id) ? 'bg-amber-50' : ''}`}>
                <td className="p-3 font-medium">{ing.name}</td>
                <td className="p-3 text-right">{formatStockQty(ing.stock_qty, ing.unit)}</td>
                <td className="p-3 text-right text-gray-500">{formatStockQty(ing.reorder_point, ing.unit)}</td>
                <td className="p-3 text-right text-gray-500">{formatBahtSymbol(ing.cost_per_unit)}</td>
                <td className="p-3 text-right space-x-2 whitespace-nowrap">
                  <button className="btn-secondary text-xs" onClick={() => setMovementTarget(ing)}>
                    รับ/ปรับ
                  </button>
                  <button className="btn-ghost text-xs" onClick={() => setEditing(ing)}>
                    แก้ไข
                  </button>
                </td>
              </tr>
            ))}
            {active.length === 0 && !isLoading && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-gray-400">
                  ยังไม่มีวัตถุดิบ
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing !== undefined && <IngredientEditor ingredient={editing} onClose={() => setEditing(undefined)} />}
      {movementTarget && <MovementModal ingredient={movementTarget} onClose={() => setMovementTarget(null)} />}
    </div>
  )
}
