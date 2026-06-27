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
  const [quickMovement, setQuickMovement] = useState(false)

  const active = (ingredients ?? []).filter((i) => i.is_active)
  const lowStock = getLowStockIngredients(active)
  const lowStockIds = new Set(lowStock.map((i) => i.id))

  // จัดกลุ่มตาม category เรียงตัวอักษรภายในกลุ่ม
  const sorted = [...active].sort((a, b) => a.name.localeCompare(b.name, 'th'))
  const groups = sorted.reduce<Record<string, Ingredient[]>>((acc, ing) => {
    const key = ing.category?.trim() || 'ไม่ระบุหมวด'
    if (!acc[key]) acc[key] = []
    acc[key].push(ing)
    return acc
  }, {})
  const groupKeys = Object.keys(groups).sort((a, b) => {
    if (a === 'ไม่ระบุหมวด') return 1
    if (b === 'ไม่ระบุหมวด') return -1
    return a.localeCompare(b, 'th')
  })

  const existingCategories = [...new Set(active.map((i) => i.category).filter(Boolean) as string[])]

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">สต็อกวัตถุดิบ</h1>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setQuickMovement(true)}>
            รับ / ปรับสต็อก
          </button>
          <button className="btn-primary" onClick={() => setEditing(null)}>
            + เพิ่มวัตถุดิบ
          </button>
        </div>
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

      {/* ตารางแบ่งกลุ่ม */}
      <div className="space-y-4">
        {groupKeys.map((group) => (
          <div key={group} className="card overflow-x-auto">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 font-semibold text-sm text-gray-600">
              {group}
              <span className="ml-2 text-xs font-normal text-gray-400">({groups[group].length} รายการ)</span>
            </div>
            <table className="w-full text-sm">
              <thead className="text-gray-400">
                <tr>
                  <th className="text-left p-3">วัตถุดิบ</th>
                  <th className="text-right p-3">คงเหลือ</th>
                  <th className="text-right p-3">จุดสั่งซื้อ</th>
                  <th className="text-right p-3">ต้นทุน/หน่วย</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {groups[group].map((ing) => (
                  <tr
                    key={ing.id}
                    className={`border-t border-gray-100 ${lowStockIds.has(ing.id) ? 'bg-amber-50' : ''}`}
                  >
                    <td className="p-3 font-medium">
                      {ing.name}
                      {lowStockIds.has(ing.id) && (
                        <span className="ml-1 text-xs text-amber-600">⚠️</span>
                      )}
                    </td>
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
              </tbody>
            </table>
          </div>
        ))}
        {active.length === 0 && !isLoading && (
          <div className="card p-8 text-center text-gray-400">ยังไม่มีวัตถุดิบ</div>
        )}
      </div>

      {editing !== undefined && (
        <IngredientEditor
          ingredient={editing}
          existingCategories={existingCategories}
          onClose={() => setEditing(undefined)}
        />
      )}
      {movementTarget && (
        <MovementModal ingredient={movementTarget} onClose={() => setMovementTarget(null)} />
      )}
      {quickMovement && (
        <MovementModal ingredients={active} onClose={() => setQuickMovement(false)} />
      )}
    </div>
  )
}
