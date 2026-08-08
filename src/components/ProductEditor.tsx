import { useEffect, useState } from 'react'
import {
  useCategories,
  useIngredients,
  useProductDetail,
  useSaveProduct,
  useSaveProductOptions,
  useSaveRecipeItems,
  recalcProductCost,
} from '@/hooks/useMenu'
import { refreshReferenceData } from '@/lib/sync'
import { baseCost, marginPercent, unitProfit } from '@/domain/cogs'
import { formatBahtSymbol } from '@/lib/money'
import { parseUnsignedNumber, parseSignedNumber } from '@/lib/forms'
import { explainSupabaseError } from '@/lib/errors'
import { NumberField } from '@/components/NumberField'
import { defaultUsageUnit, fromBaseQty, toBaseQty, unitByName, usageUnitsForIngredient } from '@/domain/units'
import type { ProductOption, RecipeItem } from '@/types'

interface RecipeRow extends Partial<Pick<RecipeItem, 'id'>> {
  ingredient_id: string
  qty: number
  unit_name: string | null
  unit_factor: number
  sort_order: number
  note: string | null
  _key: string
}

interface OptionRow extends Partial<Pick<ProductOption, 'id'>> {
  name: string
  price_delta: number
  linked_ingredient_id: string | null
  qty_delta: number
  sort_order: number
  _key: string
}

let keyCounter = 0
function newKey() {
  keyCounter += 1
  return `new-${keyCounter}`
}

function baseQtyForRow(row: Pick<RecipeRow, 'qty' | 'unit_factor'>): number {
  return toBaseQty(row.qty, row.unit_factor || 1)
}

export function ProductEditor({
  productId,
  onClose,
}: {
  productId: string | null // null = สร้างใหม่
  onClose: () => void
}) {
  const { data: categories } = useCategories()
  const { data: ingredients } = useIngredients()
  const { data: detail } = useProductDetail(productId)
  const saveProduct = useSaveProduct()
  const saveRecipe = useSaveRecipeItems(productId ?? '')
  const saveOptions = useSaveProductOptions(productId ?? '')

  const [name, setName] = useState('')
  const [price, setPrice] = useState(0)
  const [categoryId, setCategoryId] = useState<string>('')
  const [sku, setSku] = useState('')
  const [prepSteps, setPrepSteps] = useState('')
  const [recipeRows, setRecipeRows] = useState<RecipeRow[]>([])
  const [removedRecipeIds, setRemovedRecipeIds] = useState<string[]>([])
  const [optionRows, setOptionRows] = useState<OptionRow[]>([])
  const [removedOptionIds, setRemovedOptionIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (detail) {
      setName(detail.name)
      setPrice(detail.price)
      setCategoryId(detail.category_id ?? '')
      setSku(detail.sku ?? '')
      setPrepSteps(detail.prep_steps ?? '')
      setRecipeRows(
        detail.recipe_items.map((r) => ({
          id: r.id,
          ingredient_id: r.ingredient_id,
          qty: fromBaseQty(r.qty, Number(r.unit_factor) || 1),
          unit_name: r.unit_name ?? r.ingredient?.unit ?? null,
          unit_factor: Number(r.unit_factor) || 1,
          sort_order: r.sort_order,
          note: r.note,
          _key: r.id,
        })),
      )
      setOptionRows(
        detail.options.map((o) => ({
          id: o.id,
          name: o.name,
          price_delta: o.price_delta,
          linked_ingredient_id: o.linked_ingredient_id,
          qty_delta: o.qty_delta,
          sort_order: o.sort_order,
          _key: o.id,
        })),
      )
    } else if (productId === null) {
      setName('')
      setPrice(0)
      setCategoryId(categories?.[0]?.id ?? '')
      setSku('')
      setPrepSteps('')
      setRecipeRows([])
      setOptionRows([])
      setRemovedRecipeIds([])
      setRemovedOptionIds([])
    }
  }, [detail, productId, categories])

  const ingredientsById = new Map((ingredients ?? []).map((i) => [i.id, i]))
  const previewCost = baseCost({
    recipe_items: recipeRows
      .filter((r) => r.ingredient_id)
      .map((r) => ({
        qty: baseQtyForRow(r),
        ingredient: ingredientsById.get(r.ingredient_id) ?? { cost_per_unit: 0 },
      })) as never,
  })
  const profit = unitProfit(price, detail ? previewCost : previewCost)
  const margin = marginPercent(price, previewCost)

  function addRecipeRow() {
    setRecipeRows((rows) => [
      ...rows,
      {
        ingredient_id: '',
        qty: 0,
        unit_name: null,
        unit_factor: 1,
        sort_order: rows.length,
        note: null,
        _key: newKey(),
      },
    ])
  }

  function removeRecipeRow(row: RecipeRow) {
    if (row.id) setRemovedRecipeIds((ids) => [...ids, row.id!])
    setRecipeRows((rows) => rows.filter((r) => r._key !== row._key))
  }

  function addOptionRow() {
    setOptionRows((rows) => [
      ...rows,
      {
        name: '',
        price_delta: 0,
        linked_ingredient_id: null,
        qty_delta: 0,
        sort_order: rows.length,
        _key: newKey(),
      },
    ])
  }

  function removeOptionRow(row: OptionRow) {
    if (row.id) setRemovedOptionIds((ids) => [...ids, row.id!])
    setOptionRows((rows) => rows.filter((r) => r._key !== row._key))
  }

  function changeRecipeIngredient(rowKey: string, ingredientId: string) {
    const ingredient = ingredientsById.get(ingredientId)
    const usageUnit = defaultUsageUnit(ingredient)
    setRecipeRows((rows) =>
      rows.map((row) =>
        row._key === rowKey
          ? {
              ...row,
              ingredient_id: ingredientId,
              unit_name: usageUnit?.name ?? ingredient?.unit ?? null,
              unit_factor: usageUnit?.factor_to_base ?? 1,
            }
          : row,
      ),
    )
  }

  function changeRecipeUnit(row: RecipeRow, unitName: string) {
    const ingredient = ingredientsById.get(row.ingredient_id)
    const unit = unitByName(ingredient, unitName)
    if (!unit) return
    const currentBaseQty = baseQtyForRow(row)
    setRecipeRows((rows) =>
      rows.map((item) =>
        item._key === row._key
          ? {
              ...item,
              qty: fromBaseQty(currentBaseQty, unit.factor_to_base),
              unit_name: unit.name,
              unit_factor: unit.factor_to_base,
            }
          : item,
      ),
    )
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const saved = await saveProduct.mutateAsync({
        id: productId ?? undefined,
        name,
        price,
        category_id: categoryId || null,
        sku: sku || null,
        prep_steps: prepSteps || null,
        // อย่าบังคับ true — ไม่งั้นการแก้ไขเมนูที่ถูกปิดไว้จะเปิดใช้งานกลับมาเงียบ ๆ
        is_active: detail?.is_active ?? true,
        sort_order: detail?.sort_order ?? 0,
      } as never)

      const targetId = productId ?? saved.id

      if (recipeRows.length || removedRecipeIds.length) {
        await saveRecipeForProduct(targetId)
      }
      if (optionRows.length || removedOptionIds.length) {
        await saveOptionsForProduct(targetId)
      }

      // แคชเมนูของหน้าขายอ่านจาก Dexie — ต้องดึงใหม่ ไม่งั้นหน้าขายยังใช้ราคา/สูตรเดิม
      await refreshReferenceData().catch(() => undefined)
      onClose()
    } catch (err) {
      setError(explainSupabaseError(err, 'บันทึกไม่สำเร็จ'))
    } finally {
      setSaving(false)
    }
  }

  // เนื่องจาก hook ผูก productId ไว้ตอนเรนเดอร์ ถ้าเป็นสินค้าใหม่ต้องเรียก mutation แบบ manual ผ่าน id ที่ได้จริง
  async function saveRecipeForProduct(targetId: string) {
    const upserts = recipeRows
      .filter((r) => r.ingredient_id && r.qty > 0)
      .map((r) => ({
        id: r.id,
        ingredient_id: r.ingredient_id,
        qty: baseQtyForRow(r),
        unit_name: r.unit_name,
        unit_factor: r.unit_factor || 1,
        sort_order: r.sort_order,
        note: r.note,
      }))
    if (targetId === productId) {
      await saveRecipe.mutateAsync({ upserts, deleteIds: removedRecipeIds })
    } else {
      // สินค้าใหม่: เขียนตรงด้วย supabase client ผ่าน hook เดิมแต่ productId ต่างไป — ใช้ fetch แทน hook
      const { supabase } = await import('@/lib/supabase')
      if (removedRecipeIds.length) {
        const { error } = await supabase.from('recipe_items').delete().in('id', removedRecipeIds)
        if (error) throw error
      }
      if (upserts.length) {
        const rows = upserts.map((u) => ({
          product_id: targetId,
          ingredient_id: u.ingredient_id,
          qty: u.qty,
          unit_name: u.unit_name,
          unit_factor: u.unit_factor,
          sort_order: u.sort_order,
          note: u.note,
        }))
        const { error } = await supabase.from('recipe_items').insert(rows)
        if (error) throw error
      }
      // เส้นทางนี้ไม่ผ่าน useSaveRecipeItems จึงต้องคำนวณ cost_cached เอง
      // ไม่งั้นเมนูใหม่จะมีต้นทุน = 0 และกำไรในรายงานจะสูงเกินจริง
      await recalcProductCost(targetId)
    }
  }

  async function saveOptionsForProduct(targetId: string) {
    const upserts = optionRows
      .filter((o) => o.name)
      .map((o) => ({
        id: o.id,
        name: o.name,
        price_delta: o.price_delta,
        linked_ingredient_id: o.linked_ingredient_id,
        qty_delta: o.qty_delta,
        sort_order: o.sort_order,
      }))
    if (targetId === productId) {
      await saveOptions.mutateAsync({ upserts, deleteIds: removedOptionIds })
    } else {
      const { supabase } = await import('@/lib/supabase')
      if (removedOptionIds.length) {
        const { error } = await supabase.from('product_options').delete().in('id', removedOptionIds)
        if (error) throw error
      }
      if (upserts.length) {
        const rows = upserts.map((u) => ({
          product_id: targetId,
          name: u.name,
          price_delta: u.price_delta,
          linked_ingredient_id: u.linked_ingredient_id,
          qty_delta: u.qty_delta,
          sort_order: u.sort_order,
        }))
        const { error } = await supabase.from('product_options').insert(rows)
        if (error) throw error
      }
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-gray-200">
          <h2 className="text-lg font-bold">{productId ? 'แก้ไขเมนู' : 'เพิ่มเมนูใหม่'}</h2>
        </div>
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">ชื่อเมนู</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="label">ราคา (บาท)</label>
              <NumberField className="input" value={price} parse={parseUnsignedNumber} onChange={setPrice} />
            </div>
            <div>
              <label className="label">หมวด</label>
              <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">-</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">SKU</label>
              <input className="input" value={sku} onChange={(e) => setSku(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="label">ขั้นตอนการชง (Recipe Card)</label>
              <textarea
                className="input"
                rows={3}
                value={prepSteps}
                onChange={(e) => setPrepSteps(e.target.value)}
              />
            </div>
          </div>

          <div className="card p-3 flex items-center justify-between text-sm">
            <span>ต้นทุน/แก้ว: <strong>{formatBahtSymbol(previewCost)}</strong></span>
            <span>กำไร/แก้ว: <strong>{formatBahtSymbol(profit)}</strong></span>
            <span>มาร์จิ้น: <strong>{margin}%</strong></span>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">สูตร (BOM)</h3>
              <button className="btn-secondary text-sm" onClick={addRecipeRow}>
                + วัตถุดิบ
              </button>
            </div>
            <div className="space-y-2">
              {recipeRows.map((row) => {
                const ing = ingredientsById.get(row.ingredient_id)
                const unitChoices = usageUnitsForIngredient(ing)
                return (
                  <div key={row._key} className="flex gap-2 items-center">
                    <select
                      className="input"
                      style={{ flex: '3 1 0', minWidth: 0 }}
                      value={row.ingredient_id}
                      onChange={(e) => changeRecipeIngredient(row._key, e.target.value)}
                    >
                      <option value="">เลือกวัตถุดิบ</option>
                      {ingredients?.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                    <NumberField
                      className="input"
                      style={{ width: '80px', flexShrink: 0 }}
                      value={row.qty}
                      parse={parseUnsignedNumber}
                      onChange={(n) =>
                        setRecipeRows((rows) =>
                          rows.map((r) => (r._key === row._key ? { ...r, qty: n } : r)),
                        )
                      }
                    />
                    <select
                      className="input text-xs"
                      style={{ width: '92px', flexShrink: 0 }}
                      value={row.unit_name ?? ing?.unit ?? ''}
                      disabled={!ing}
                      onChange={(e) => changeRecipeUnit(row, e.target.value)}
                    >
                      {!ing && <option value="">หน่วย</option>}
                      {unitChoices.map((unit) => (
                        <option key={unit.id} value={unit.name}>
                          {unit.name}
                        </option>
                      ))}
                    </select>
                    <input
                      className="input"
                      style={{ flex: '1 1 0', minWidth: 0 }}
                      placeholder="หมายเหตุ"
                      value={row.note ?? ''}
                      onChange={(e) =>
                        setRecipeRows((rows) =>
                          rows.map((r) => (r._key === row._key ? { ...r, note: e.target.value } : r)),
                        )
                      }
                    />
                    <button className="btn-ghost text-red-600" onClick={() => removeRecipeRow(row)}>
                      ลบ
                    </button>
                  </div>
                )
              })}
              {recipeRows.length === 0 && <p className="text-sm text-gray-400">ยังไม่มีวัตถุดิบในสูตร</p>}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">ตัวเลือกเพิ่มเติม</h3>
              <button className="btn-secondary text-sm" onClick={addOptionRow}>
                + ตัวเลือก
              </button>
            </div>
            <div className="space-y-2">
              {optionRows.map((row) => (
                <div key={row._key} className="flex gap-2 items-center">
                  <input
                    className="input"
                    style={{ flex: '2 1 0', minWidth: 0 }}
                    placeholder="ชื่อตัวเลือก เช่น เพิ่มไข่มุก"
                    value={row.name}
                    onChange={(e) =>
                      setOptionRows((rows) => rows.map((r) => (r._key === row._key ? { ...r, name: e.target.value } : r)))
                    }
                  />
                  <NumberField
                    className="input"
                    style={{ width: '72px', flexShrink: 0 }}
                    placeholder="+ราคา"
                    value={row.price_delta}
                    parse={parseSignedNumber}
                    onChange={(n) =>
                      setOptionRows((rows) =>
                        rows.map((r) => (r._key === row._key ? { ...r, price_delta: n } : r)),
                      )
                    }
                  />
                  <select
                    className="input"
                    style={{ flex: '2 1 0', minWidth: 0 }}
                    value={row.linked_ingredient_id ?? ''}
                    onChange={(e) =>
                      setOptionRows((rows) =>
                        rows.map((r) =>
                          r._key === row._key ? { ...r, linked_ingredient_id: e.target.value || null } : r,
                        ),
                      )
                    }
                  >
                    <option value="">ไม่ผูกวัตถุดิบ</option>
                    {ingredients?.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                  <NumberField
                    className="input"
                    style={{ width: '72px', flexShrink: 0 }}
                    placeholder="+ปริมาณ"
                    value={row.qty_delta}
                    parse={parseSignedNumber}
                    onChange={(n) =>
                      setOptionRows((rows) =>
                        rows.map((r) => (r._key === row._key ? { ...r, qty_delta: n } : r)),
                      )
                    }
                  />
                  <button className="btn-ghost text-red-600" onClick={() => removeOptionRow(row)}>
                    ลบ
                  </button>
                </div>
              ))}
              {optionRows.length === 0 && <p className="text-sm text-gray-400">ยังไม่มีตัวเลือก</p>}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="p-5 border-t border-gray-200 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn-primary" disabled={saving || !name} onClick={handleSave}>
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  )
}
