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

  function toggle(optionId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(optionId)) next.delete(optionId)
      else next.add(optionId)
      return next
    })
  }

  function handleConfirm() {
    const options: SelectedOption[] = product.options
      .filter((o) => selected.has(o.id))
      .map((o) => ({
        option_id: o.id,
        name: o.name,
        price_delta: o.price_delta,
        qty_delta: o.qty_delta,
        linked_ingredient_id: o.linked_ingredient_id,
      }))
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
          {product.options.map((opt) => (
            <label
              key={opt.id}
              className="flex items-center justify-between gap-2 p-3 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50"
            >
              <span className="flex items-center gap-2">
                <input type="checkbox" checked={selected.has(opt.id)} onChange={() => toggle(opt.id)} />
                {opt.name}
              </span>
              {opt.price_delta !== 0 && (
                <span className="text-sm text-gray-500">
                  {opt.price_delta > 0 ? '+' : ''}
                  {formatBahtSymbol(opt.price_delta)}
                </span>
              )}
            </label>
          ))}
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
