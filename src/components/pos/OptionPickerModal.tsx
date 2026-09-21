import { useState } from 'react'
import { formatBahtSymbol } from '@/lib/money'
import { adjustedRecipe } from '@/domain/recipe'
import { legacySweetnessLevel, optionLabel, sweetnessError, sweetnessLabels, sweetnessOptions } from '@/domain/sweetness'
import type { Ingredient, ProductWithRecipe, SelectedOption, SweetnessLevel } from '@/types'

export function OptionPickerModal({ product, ingredientsById, onConfirm, onClose }: {
  product: ProductWithRecipe
  ingredientsById: Map<string, Ingredient>
  onConfirm: (options: SelectedOption[]) => void
  onClose: () => void
}) {
  const [sweetness, setSweetness] = useState<SweetnessLevel>('normal')
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const toppings = product.options.filter(o => !legacySweetnessLevel(o.name) && o.name.trim() !== 'ไม่เพิ่ม')
  const error = sweetnessError(product, sweetness, ingredientsById)
  const chosen: SelectedOption[] = toppings.filter(o => (quantities[o.id] ?? 0) > 0).map(o => {
    const qty = quantities[o.id]
    const ing = o.linked_ingredient_id ? ingredientsById.get(o.linked_ingredient_id) : undefined
    return { option_id: o.id, name: qty > 1 ? `${o.name} ×${qty}` : o.name, price_delta: o.price_delta * qty, qty_delta: o.qty_delta * qty, linked_ingredient_id: o.linked_ingredient_id, ingredient_name: ing?.name, ingredient_unit: ing?.unit, ingredient_category: ing?.category }
  })
  const options = error ? chosen : [...sweetnessOptions(product, sweetness, ingredientsById), ...chosen]
  const recipe = error ? [] : adjustedRecipe({ product, selectedOptions: options })
  const total = Number(product.price) + options.reduce((sum, o) => sum + o.price_delta, 0)
  const invalidRecipe = recipe.some(r => r.qty < 0 || !Number.isFinite(r.qty))
  function setQuantity(id: string, qty: number) { setQuantities(prev => ({ ...prev, [id]: Math.max(0, Math.min(99, qty)) })) }
  function confirm() {
    if (error || invalidRecipe) return
    options[0] = { ...options[0], recipe_snapshot: recipe }
    onConfirm(options)
  }
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-3 z-50">
      <div role="dialog" aria-modal="true" aria-labelledby="options-title" className="bg-white rounded-2xl shadow-lg w-full max-w-md max-h-[90dvh] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex justify-between gap-3">
          <div><h2 id="options-title" className="text-lg font-bold">{product.name}</h2><p className="text-sm text-gray-500">ปรับสูตรสำหรับ 1 แก้ว</p></div>
          <button type="button" aria-label="ปิดตัวเลือก" className="btn-ghost self-start" onClick={onClose}>✕</button>
        </div>
        <div className="p-4 space-y-5 overflow-y-auto min-h-0">
          <section>
            <h3 className="font-semibold mb-2">1. ระดับความหวาน <span className="text-xs font-normal text-gray-500">เลือก 1 ระดับ</span></h3>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="ระดับความหวาน">
              {(['less', 'normal', 'more'] as const).map(level => <button key={level} type="button" aria-pressed={sweetness === level} onClick={() => setSweetness(level)} className={`min-h-12 rounded-xl border font-semibold ${sweetness === level ? 'bg-green-800 border-green-800 text-white' : 'bg-white border-gray-300 text-gray-800'}`}>{sweetnessLabels[level].replace('หวาน', '')}</button>)}
            </div>
            {error && <p role="alert" className="mt-2 text-sm text-amber-800 bg-amber-50 rounded-lg p-3">{error}</p>}
            {!error && <p className="text-xs text-gray-500 mt-2">สูตรด้านล่างปรับตามความหวานที่เลือกแล้ว</p>}
          </section>
          <section>
            <h3 className="font-semibold mb-2">2. ท็อปปิ้ง <span className="text-xs font-normal text-gray-500">เลือกได้หลายชนิด</span></h3>
            <div className="space-y-2">{toppings.map(opt => {
              const qty = quantities[opt.id] ?? 0
              const repeatable = opt.qty_delta >= 0 && opt.price_delta >= 0
              return <div key={opt.id} className={`rounded-xl border p-3 flex items-center gap-2 ${qty ? 'border-green-600 bg-green-50' : 'border-gray-200'}`}>
                <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"><input type="checkbox" className="w-5 h-5 accent-green-800" checked={qty > 0} onChange={() => setQuantity(opt.id, qty ? 0 : 1)} /><span className="min-w-0 break-words">{opt.name}<span className="block text-xs text-gray-500">{formatBahtSymbol(opt.price_delta)} / ส่วน</span></span></label>
                {repeatable && <div className="flex items-center gap-1 shrink-0"><button type="button" className="btn-secondary min-w-11 min-h-11 p-0" disabled={!qty} aria-label={`ลดจำนวน ${opt.name}`} onClick={() => setQuantity(opt.id, qty - 1)}>−</button><span className="w-6 text-center tabular-nums">{qty}</span><button type="button" className="btn-secondary min-w-11 min-h-11 p-0" disabled={qty >= 99} aria-label={`เพิ่มจำนวน ${opt.name}`} onClick={() => setQuantity(opt.id, qty + 1)}>+</button></div>}
              </div>
            })}</div>
            <p className="text-xs text-gray-500 mt-2">ไม่เลือก = ไม่เพิ่มท็อปปิ้ง</p>
          </section>
          <section><h3 className="font-semibold mb-2">3. สรุปและสูตรที่จะพิมพ์</h3><p className="text-sm text-green-800 mb-2">{sweetnessLabels[sweetness]}{chosen.length ? ` · ${optionLabel(chosen)}` : ' · ไม่เพิ่มท็อปปิ้ง'}</p>
            {!error && <div className="rounded-xl bg-gray-50 p-3 space-y-2">{recipe.map(r => <div key={r.ingredient_id} className="flex justify-between gap-3 text-sm"><span className={r.adjusted ? 'font-semibold text-green-800' : ''}>{r.name}</span><span className="shrink-0 tabular-nums">{r.qty} {r.unit}</span></div>)}{!recipe.length && <p className="text-sm text-gray-500">ยังไม่มีสูตรวัตถุดิบ</p>}</div>}
            {invalidRecipe && <p role="alert" className="text-sm text-red-700 mt-2">ปริมาณวัตถุดิบไม่ถูกต้อง กรุณาตรวจสูตรและตัวเลือก</p>}
            {product.prep_steps && <p className="text-sm text-gray-500 mt-3 whitespace-pre-line">{product.prep_steps}</p>}
          </section>
        </div>
        <div className="p-4 border-t border-gray-200 bg-white flex gap-2 shrink-0"><button type="button" className="btn-ghost" onClick={onClose}>ยกเลิก</button><button type="button" className="btn-primary flex-1 min-h-12" disabled={!!error || invalidRecipe} onClick={confirm}>เพิ่มลงบิล · {formatBahtSymbol(total)}</button></div>
      </div>
    </div>
  )
}
