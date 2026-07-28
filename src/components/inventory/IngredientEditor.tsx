import { useState } from 'react'
import { useSaveIngredient } from '@/hooks/useInventory'
import { round2 } from '@/lib/money'
import { parseUnsignedNumber } from '@/lib/forms'
import { explainSupabaseError } from '@/lib/errors'
import { NumberField } from '@/components/NumberField'
import type { Ingredient } from '@/types'

export function IngredientEditor({
  ingredient,
  existingCategories = [],
  onClose,
}: {
  ingredient: Ingredient | null // null = เพิ่มใหม่
  existingCategories?: string[]
  onClose: () => void
}) {
  const save = useSaveIngredient()
  const [name, setName] = useState(ingredient?.name ?? '')
  const [unit, setUnit] = useState(ingredient?.unit ?? 'กรัม')
  const [category, setCategory] = useState(ingredient?.category ?? '')
  const [packPrice, setPackPrice] = useState(ingredient?.pack_price ?? 0)
  const [packQty, setPackQty] = useState(ingredient?.pack_qty ?? 1)
  const [reorderPoint, setReorderPoint] = useState(ingredient?.reorder_point ?? 0)
  const [error, setError] = useState<string | null>(null)

  const costPerUnit = packQty > 0 ? round2(packPrice / packQty) : 0

  async function handleSave() {
    setError(null)
    try {
      await save.mutateAsync({
        id: ingredient?.id,
        name,
        unit,
        category: category || null,
        pack_price: packPrice,
        pack_qty: packQty,
        reorder_point: reorderPoint,
        // คงสถานะเดิมไว้ — แก้ไขวัตถุดิบที่ปิดใช้งานไม่ควรเปิดกลับมาเอง
        is_active: ingredient?.is_active ?? true,
      })
      onClose()
    } catch (err) {
      setError(explainSupabaseError(err, 'บันทึกไม่สำเร็จ'))
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md">
        <div className="p-5 border-b border-gray-200">
          <h2 className="text-lg font-bold">{ingredient ? 'แก้ไขวัตถุดิบ' : 'เพิ่มวัตถุดิบ'}</h2>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="label">ชื่อวัตถุดิบ</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">หมวดหมู่</label>
              <input
                className="input"
                list="category-list"
                placeholder="เช่น นม, น้ำตาล, แป้ง"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
              <datalist id="category-list">
                {existingCategories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="label">หน่วย</label>
              <input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} />
            </div>
            <div>
              <label className="label">จุดสั่งซื้อซ้ำ</label>
              <NumberField className="input" value={reorderPoint} parse={parseUnsignedNumber} onChange={setReorderPoint} />
            </div>
            <div>
              <label className="label">ราคาต่อแพ็ก (บาท)</label>
              <NumberField className="input" value={packPrice} parse={parseUnsignedNumber} onChange={setPackPrice} />
            </div>
            <div>
              <label className="label">ปริมาณต่อแพ็ก</label>
              <NumberField className="input" value={packQty} parse={parseUnsignedNumber} onChange={setPackQty} />
            </div>
          </div>
          <p className="text-sm text-gray-500">
            ต้นทุนต่อหน่วย ≈ <strong>{costPerUnit}</strong> บาท/{unit || 'หน่วย'}
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="p-5 border-t border-gray-200 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn-primary" disabled={save.isPending || !name} onClick={handleSave}>
            {save.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  )
}
