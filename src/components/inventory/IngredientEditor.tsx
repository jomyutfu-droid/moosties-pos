import { useEffect, useState } from 'react'
import { useSaveIngredient } from '@/hooks/useInventory'
import { round2 } from '@/lib/money'
import { parseUnsignedNumber } from '@/lib/forms'
import { explainSupabaseError } from '@/lib/errors'
import { NumberField } from '@/components/NumberField'
import type { Ingredient, IngredientUnitKind } from '@/types'

interface UnitRow {
  _key: string
  name: string
  factor_to_base: number
  kind: IngredientUnitKind
  is_default_purchase: boolean
  is_default_usage: boolean
}

let keyCounter = 0
function newKey() {
  keyCounter += 1
  return `unit-${keyCounter}`
}

function initialUnitRows(ingredient: Ingredient | null): UnitRow[] {
  if (ingredient?.units?.length) {
    return ingredient.units.map((unit) => ({ ...unit, _key: unit.id }))
  }

  const baseUnit = ingredient?.unit || 'กรัม'
  const rows: UnitRow[] = [
    {
      _key: newKey(),
      name: baseUnit,
      factor_to_base: 1,
      kind: 'usage',
      is_default_purchase: false,
      is_default_usage: true,
    },
  ]
  if (baseUnit !== 'แพ็ก') {
    rows.push({
      _key: newKey(),
      name: 'แพ็ก',
      factor_to_base: ingredient?.pack_qty ?? 1,
      kind: 'purchase',
      is_default_purchase: true,
      is_default_usage: false,
    })
  } else {
    rows[0].kind = 'both'
    rows[0].is_default_purchase = true
  }
  return rows
}

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
  const [reorderPoint, setReorderPoint] = useState(ingredient?.reorder_point ?? 0)
  const [unitRows, setUnitRows] = useState<UnitRow[]>(() => initialUnitRows(ingredient))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setName(ingredient?.name ?? '')
    setUnit(ingredient?.unit ?? 'กรัม')
    setCategory(ingredient?.category ?? '')
    setPackPrice(ingredient?.pack_price ?? 0)
    setReorderPoint(ingredient?.reorder_point ?? 0)
    setUnitRows(initialUnitRows(ingredient))
    setError(null)
  }, [ingredient])

  const defaultPurchase = unitRows.find((row) => row.is_default_purchase)
  const packQty = defaultPurchase?.factor_to_base ?? 0
  const costPerUnit = packQty > 0 ? round2(packPrice / packQty) : 0

  function addUnit() {
    setUnitRows((rows) => [
      ...rows,
      {
        _key: newKey(),
        name: '',
        factor_to_base: 1,
        kind: 'usage',
        is_default_purchase: false,
        is_default_usage: false,
      },
    ])
  }

  function removeUnit(row: UnitRow) {
    setUnitRows((rows) => rows.filter((item) => item._key !== row._key))
  }

  function setRow(rowKey: string, patch: Partial<UnitRow>) {
    setUnitRows((rows) => rows.map((row) => (row._key === rowKey ? { ...row, ...patch } : row)))
  }

  function changeBaseUnit(nextUnit: string) {
    const previousUnit = unit
    setUnit(nextUnit)
    setUnitRows((rows) =>
      rows.map((row) =>
        row.name === previousUnit && row.factor_to_base === 1
          ? { ...row, name: nextUnit }
          : row,
      ),
    )
  }

  function changeUnitKind(row: UnitRow, kind: IngredientUnitKind) {
    setRow(row._key, {
      kind,
      is_default_purchase: kind === 'usage' ? false : row.is_default_purchase,
      is_default_usage: kind === 'purchase' ? false : row.is_default_usage,
    })
  }

  function setDefault(row: UnitRow, field: 'is_default_purchase' | 'is_default_usage') {
    setUnitRows((rows) =>
      rows.map((item) => ({
        ...item,
        [field]: item._key === row._key,
      })),
    )
  }

  async function handleSave() {
    setError(null)
    const cleanRows = unitRows.filter((row) => row.name.trim() && row.factor_to_base > 0)
    const names = cleanRows.map((row) => row.name.trim().toLowerCase())
    const hasDuplicate = new Set(names).size !== names.length
    const purchase = cleanRows.find((row) => row.is_default_purchase)
    const usage = cleanRows.find((row) => row.is_default_usage)

    if (!name.trim()) {
      setError('กรอกชื่อวัตถุดิบ')
      return
    }
    if (hasDuplicate) {
      setError('ชื่อหน่วยซ้ำกัน กรุณาแก้ไขก่อนบันทึก')
      return
    }
    if (!purchase || !usage) {
      setError('ต้องกำหนดหน่วยเริ่มต้นสำหรับซื้อเข้าและใช้ในสูตร')
      return
    }

    try {
      await save.mutateAsync({
        id: ingredient?.id,
        name: name.trim(),
        unit: unit.trim() || 'กรัม',
        category: category || null,
        pack_price: packPrice,
        pack_qty: purchase.factor_to_base,
        reorder_point: reorderPoint,
        units: cleanRows.map((row) => ({
          name: row.name.trim(),
          factor_to_base: row.factor_to_base,
          kind: row.kind,
          is_default_purchase: row.is_default_purchase,
          is_default_usage: row.is_default_usage,
        })),
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
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-3xl max-h-[92vh] overflow-y-auto">
        <div className="p-5 border-b border-gray-200">
          <h2 className="text-lg font-bold">{ingredient ? 'แก้ไขวัตถุดิบ' : 'เพิ่มวัตถุดิบ'}</h2>
          <p className="text-xs text-gray-500 mt-1">
            ตั้งค่าหน่วยครั้งเดียว แล้วเลือกหน่วยซื้อเข้าหรือหน่วยใช้ในสูตรได้ภายหลัง
          </p>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">ชื่อวัตถุดิบ</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="label">หน่วยกลางของสต็อก</label>
              <input className="input" value={unit} onChange={(e) => changeBaseUnit(e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">เช่น กรัม, ml หรือ ชิ้น</p>
            </div>
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
                {existingCategories.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label className="label">ราคาซื้อต่อหน่วยซื้อเข้า (บาท)</label>
              <NumberField className="input" value={packPrice} parse={parseUnsignedNumber} onChange={setPackPrice} />
            </div>
            <div>
              <label className="label">จุดสั่งซื้อซ้ำ (หน่วยกลาง)</label>
              <NumberField className="input" value={reorderPoint} parse={parseUnsignedNumber} onChange={setReorderPoint} />
            </div>
          </div>

          <div className="border rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm">หน่วยแปลง</h3>
                <p className="text-xs text-gray-500">ตัวคูณคือ 1 หน่วยนี้เท่ากับกี่หน่วยกลาง</p>
              </div>
              <button className="btn-secondary text-xs" onClick={addUnit}>+ เพิ่มหน่วย</button>
            </div>
            <div className="hidden md:grid grid-cols-[1.4fr_1fr_1fr_1.3fr_1.3fr_45px] gap-2 px-3 py-2 text-xs text-gray-400">
              <span>ชื่อหน่วย</span><span>เท่ากับหน่วยกลาง</span><span>ประเภท</span>
              <span>หน่วยซื้อเริ่มต้น</span><span>หน่วยใช้ในสูตรเริ่มต้น</span><span />
            </div>
            <div className="divide-y">
              {unitRows.map((row) => (
                <div key={row._key} className="grid md:grid-cols-[1.4fr_1fr_1fr_1.3fr_1.3fr_45px] gap-2 items-center p-3">
                  <div>
                    <label className="md:hidden text-xs text-gray-400">ชื่อหน่วย</label>
                    <input className="input" value={row.name} onChange={(e) => setRow(row._key, { name: e.target.value })} placeholder="เช่น กระปุก" />
                  </div>
                  <div>
                    <label className="md:hidden text-xs text-gray-400">เท่ากับหน่วยกลาง</label>
                    <NumberField className="input" value={row.factor_to_base} parse={parseUnsignedNumber} onChange={(n) => setRow(row._key, { factor_to_base: n })} />
                  </div>
                  <div>
                    <label className="md:hidden text-xs text-gray-400">ประเภท</label>
                    <select className="input" value={row.kind} onChange={(e) => changeUnitKind(row, e.target.value as IngredientUnitKind)}>
                      <option value="purchase">ซื้อเข้า</option>
                      <option value="usage">ใช้ในสูตร</option>
                      <option value="both">ทั้งสองแบบ</option>
                    </select>
                  </div>
                  <label className="text-xs flex items-center gap-2">
                    <input type="checkbox" checked={row.is_default_purchase} disabled={row.kind === 'usage'} onChange={() => setDefault(row, 'is_default_purchase')} />
                    ใช้เป็นค่าเริ่มต้น
                  </label>
                  <label className="text-xs flex items-center gap-2">
                    <input type="checkbox" checked={row.is_default_usage} disabled={row.kind === 'purchase'} onChange={() => setDefault(row, 'is_default_usage')} />
                    ใช้เป็นค่าเริ่มต้น
                  </label>
                  <button className="btn-ghost text-red-600 text-xs" onClick={() => removeUnit(row)} disabled={unitRows.length <= 1}>ลบ</button>
                </div>
              ))}
            </div>
          </div>

          <p className="text-sm text-gray-500">
            ต้นทุนต่อหน่วยกลาง ≈ <strong>{costPerUnit}</strong> บาท/{unit || 'หน่วย'}
            {defaultPurchase && <span className="ml-2">(ซื้อ 1 {defaultPurchase.name} = {defaultPurchase.factor_to_base} {unit || 'หน่วย'})</span>}
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="p-5 border-t border-gray-200 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary" disabled={save.isPending} onClick={handleSave}>
            {save.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  )
}
