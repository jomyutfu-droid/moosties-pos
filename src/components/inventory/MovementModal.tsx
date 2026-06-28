import { useRef, useState } from 'react'
import { useRecordStockMovement } from '@/hooks/useInventory'
import { useSessionStore } from '@/store/session'
import { formatStockQty } from '@/lib/money'
import type { Ingredient, StockMovementType } from '@/types'

interface Props {
  ingredient?: Ingredient
  ingredients?: Ingredient[]
  onClose: () => void
}

export function MovementModal({ ingredient: preSelected, ingredients = [], onClose }: Props) {
  const record = useRecordStockMovement()
  const activeStaff = useSessionStore((s) => s.activeStaff)

  // smart-search state (ใช้เฉพาะโหมดไม่มี preSelected)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Ingredient | null>(null)
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const [type, setType] = useState<StockMovementType>('receive')
  const [qty, setQty] = useState<number>(0)
  const [pricePerUnit, setPricePerUnit] = useState<number>(0) // Feature 5: WAC
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const ingredient = preSelected ?? selected

  const filtered = query.trim()
    ? ingredients.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()))
    : ingredients

  function pickIngredient(ing: Ingredient) {
    setSelected(ing)
    setQuery(ing.name)
    setOpen(false)
    setQty(0)
    inputRef.current?.blur()
  }

  async function handleSave() {
    setError(null)
    if (!ingredient) { setError('เลือกวัตถุดิบก่อน'); return }
    if (qty <= 0) { setError('กรอกจำนวนมากกว่า 0'); return }
    const delta = type === 'receive' ? qty : -qty
    try {
      await record.mutateAsync({
        ingredient_id: ingredient.id,
        type,
        qty_delta: delta,
        user_id: activeStaff?.id ?? null,
        note: note || null,
        price_per_unit: type === 'receive' && pricePerUnit > 0 ? pricePerUnit : undefined,
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
          {preSelected ? (
            <>
              <h2 className="text-lg font-bold">{preSelected.name}</h2>
              <p className="text-sm text-gray-500">คงเหลือ {formatStockQty(preSelected.stock_qty, preSelected.unit)}</p>
            </>
          ) : (
            <h2 className="text-lg font-bold">รับ / ปรับสต็อก</h2>
          )}
        </div>

        <div className="p-5 space-y-3">
          {/* Smart search — แสดงเฉพาะโหมดไม่มี preSelected */}
          {!preSelected && (
            <div className="relative">
              <label className="label">ค้นหาวัตถุดิบ</label>
              <input
                ref={inputRef}
                className="input"
                placeholder="พิมชื่อเพื่อค้นหา…"
                value={query}
                autoComplete="off"
                onChange={(e) => { setQuery(e.target.value); setSelected(null); setOpen(true) }}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
              />
              {open && filtered.length > 0 && (
                <ul className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                  {filtered.map((i) => (
                    <li
                      key={i.id}
                      className="px-3 py-2 cursor-pointer hover:bg-blue-50 flex justify-between items-center text-sm"
                      onMouseDown={() => pickIngredient(i)}
                    >
                      <span className="font-medium">{i.name}</span>
                      <span className="text-gray-400 text-xs ml-2">{formatStockQty(i.stock_qty, i.unit)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {selected && (
                <p className="text-xs text-gray-500 mt-1">
                  คงเหลือ {formatStockQty(selected.stock_qty, selected.unit)}
                </p>
              )}
            </div>
          )}

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
            <label className="label">จำนวน{ingredient ? ` (${ingredient.unit})` : ''}</label>
            <input type="number" className="input" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
            <p className="text-xs text-gray-400 mt-1">
              {type === 'receive' ? 'จะเพิ่มเข้าสต็อก' : 'จะตัดออกจากสต็อก'}
            </p>
          </div>

          {/* Feature 5: ราคาซื้อเพื่อคำนวณ WAC */}
          {type === 'receive' && (
            <div>
              <label className="label">
                ราคาซื้อต่อหน่วย (฿)
                <span className="ml-1 text-xs font-normal text-gray-400">ใช้คำนวณต้นทุนถัวเฉลี่ย</span>
              </label>
              <input
                type="number"
                className="input"
                value={pricePerUnit || ''}
                placeholder={ingredient ? `ปัจจุบัน ${ingredient.cost_per_unit.toFixed(2)}` : '0.00'}
                onChange={(e) => setPricePerUnit(Number(e.target.value))}
              />
            </div>
          )}
          <div>
            <label className="label">หมายเหตุ</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="p-5 border-t border-gray-200 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary" disabled={record.isPending} onClick={handleSave}>
            {record.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  )
}
