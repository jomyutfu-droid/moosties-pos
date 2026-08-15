import { useState } from 'react'
import { formatBahtSymbol } from '@/lib/money'
import type { ProductWithRecipe, SelectedOption } from '@/types'

export function OptionPickerModal({
  product,
  onConfirm,
  onClose,
}: {
  product: ProductWithRecipe
  onConfirm: (options: SelectedOption[]) => void
  onClose: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [quantities, setQuantities] = useState<Record<string, number>>({})

  function isRepeatable(option: ProductWithRecipe['options'][number]) {
    // ตัวเลือกที่เพิ่มวัตถุดิบ/ราคา เช่น topping หรือ extra shot สามารถกดซ้ำได้
    // ตัวเลือกเชิงปรับสูตร เช่น หวานน้อย (qty_delta ติดลบ) ยังคงเป็น checkbox ปกติ
    return option.qty_delta > 0 || option.price_delta > 0
  }

  function toggle(optionId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(optionId)) next.delete(optionId)
      else next.add(optionId)
      return next
    })
  }

  function setQuantity(optionId: string, nextQty: number) {
    const qty = Math.max(0, Math.min(9, nextQty))
    setQuantities((prev) => ({ ...prev, [optionId]: qty }))
    setSelected((prev) => {
      const next = new Set(prev)
      if (qty > 0) next.add(optionId)
      else next.delete(optionId)
      return next
    })
  }

  function handleConfirm() {
    const options: SelectedOption[] = product.options
      .filter((o) => selected.has(o.id))
      .map((o) => {
        const qty = isRepeatable(o) ? Math.max(1, quantities[o.id] ?? 1) : 1
        return {
          option_id: o.id,
          name: qty > 1 ? `${o.name} ×${qty}` : o.name,
          price_delta: o.price_delta * qty,
          qty_delta: o.qty_delta * qty,
          linked_ingredient_id: o.linked_ingredient_id,
        }
      })
    onConfirm(options)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md max-h-[85vh] overflow-y-auto">
        <div className="p-5 border-b border-gray-200">
          <h2 className="text-lg font-bold">{product.name}</h2>
          {product.prep_steps && (
            <p className="text-sm text-gray-500 mt-1 whitespace-pre-line">{product.prep_steps}</p>
          )}
        </div>
        <div className="p-5 space-y-2">
          {product.options.length === 0 && <p className="text-sm text-gray-400">ไม่มีตัวเลือกเพิ่มเติม</p>}
          {product.options.map((opt) => {
            const repeatable = isRepeatable(opt)
            const qty = selected.has(opt.id) ? Math.max(1, quantities[opt.id] ?? 1) : 0
            return (
              <div
                key={opt.id}
                className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-200 hover:bg-gray-50"
              >
                <label className="flex min-w-0 flex-1 items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={selected.has(opt.id)} onChange={() => toggle(opt.id)} />
                  <span className="truncate">{opt.name}</span>
                </label>

                {repeatable ? (
                  <div className="flex items-center gap-2 flex-none">
                    <button
                      type="button"
                      className="btn-secondary w-8 h-8 p-0 text-base"
                      aria-label={`ลดจำนวน ${opt.name}`}
                      onClick={() => setQuantity(opt.id, qty - 1)}
                      disabled={qty <= 0}
                    >
                      −
                    </button>
                    <span className="w-5 text-center text-sm font-semibold tabular-nums">{qty}</span>
                    <button
                      type="button"
                      className="btn-secondary w-8 h-8 p-0 text-base"
                      aria-label={`เพิ่มจำนวน ${opt.name}`}
                      onClick={() => setQuantity(opt.id, qty + 1)}
                    >
                      +
                    </button>
                    {opt.price_delta !== 0 && (
                      <span className="w-16 text-right text-sm text-gray-500">
                        {opt.price_delta * qty > 0 ? '+' : ''}
                        {formatBahtSymbol(opt.price_delta * qty)}
                      </span>
                    )}
                  </div>
                ) : (
                  opt.price_delta !== 0 && (
                    <span className="text-sm text-gray-500 flex-none">
                      {opt.price_delta > 0 ? '+' : ''}
                      {formatBahtSymbol(opt.price_delta)}
                    </span>
                  )
                )}
              </div>
            )
          })}
        </div>
        <div className="p-5 border-t border-gray-200 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn-primary" onClick={handleConfirm}>
            เพิ่มลงตะกร้า
          </button>
        </div>
      </div>
    </div>
  )
}
