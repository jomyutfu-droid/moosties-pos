import { useState } from 'react'
import { useRecordStockMovement } from '@/hooks/useInventory'
import { useSessionStore } from '@/store/session'
import { formatStockQty } from '@/lib/money'
import type { Ingredient, StockMovementType } from '@/types'

export function MovementModal({ ingredient, onClose }: { ingredient: Ingredient; onClose: () => void }) {
  const record = useRecordStockMovement()
  const activeStaff = useSessionStore((s) => s.activeStaff)
  const [type, setType] = useState<StockMovementType>('receive')
  const [qty, setQty] = useState<number>(0)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setError(null)
    if (qty <= 0) {
      setError('กรอกจำนวนมากกว่า 0')
      return
    }
    const delta = type === 'receive' ? qty : -qty
    try {
      await record.mutateAsync({
        ingredient_id: ingredient.id,
        type,
        qty_delta: delta,
        user_id: activeStaff?.id ?? null,
        note: note || null,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm">
        <div className="p-5 border-b border-gray-200">
          <h2 className="text-lg font-bold">{ingredient.name}</h2>
          <p className="text-sm text-gray-500">คงเหลือ {formatStockQty(ingredient.stock_qty, ingredient.unit)}</p>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <button
              className={`btn text-sm ${type === 'receive' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setType('receive')}
            >
              รับเข้า
            </button>
            <button
              className={`btn text-sm ${type === 'adjust' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setType('adjust')}
            >
              ปรับยอด (ลด)
            </button>
            <button
              className={`btn text-sm ${type === 'waste' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setType('waste')}
            >
              ของเสีย
            </button>
          </div>
          <div>
            <label className="label">จำนวน ({ingredient.unit})</label>
            <input type="number" className="input" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
            <p className="text-xs text-gray-400 mt-1">
              {type === 'receive' ? 'จะเพิ่มเข้าสต็อก' : 'จะตัดออกจากสต็อก'}
            </p>
          </div>
          <div>
            <label className="label">หมายเหตุ</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="p-5 border-t border-gray-200 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn-primary" disabled={record.isPending} onClick={handleSave}>
            {record.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  )
}
