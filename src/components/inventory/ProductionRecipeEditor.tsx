import { canonicalProductionUnit } from '@/domain/productionUnits'
import { DeductionModePicker, type DeductionMode } from './DeductionModePicker'
import { autoPrepUsage } from '@/domain/autoPrep'
import { SearchSelect } from '@/components/SearchSelect'
import { useRef, useState } from 'react'
import { IngredientEditor } from './IngredientEditor'
import { productionAction } from '@/lib/production'
import { formatStockQty, round3 } from '@/lib/money'
import type { ProductionRecipe } from '@/domain/production'
import type { Ingredient } from '@/types'

export function ProductionRecipeEditor({ recipe, ingredients, token, onClose, onSaved, reload }: {
  recipe: ProductionRecipe | null; ingredients: Ingredient[]; token: string | null
  onClose: () => void; onSaved: () => void; reload: () => void
}) {
  const [id] = useState(() => recipe?.id ?? crypto.randomUUID())
  const [name, setName] = useState(recipe?.name ?? '')
  const [outputId, setOutputId] = useState(recipe?.output_id ?? '')
  const [expected, setExpected] = useState(String(recipe?.expected_qty ?? ''))
  const [instructions, setInstructions] = useState(recipe?.instructions ?? '')
  const [mode, setMode] = useState<DeductionMode>(recipe ? recipe.deduction_mode ?? 'produce' : 'sale')
  const [opening, setOpening] = useState('')
  const [active, setActive] = useState(recipe?.is_active ?? true)
  const [items, setItems] = useState(() => recipe?.items.map(i => ({ ingredient_id: i.ingredient_id, input_qty: String(i.input_qty), input_unit: canonicalProductionUnit(ingredients.find(ingredient=>ingredient.id===i.ingredient_id), i.input_unit, i.factor) })) ?? [{ingredient_id:'', input_qty:'', input_unit:''}])
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const output = ingredients.find(i => i.id === outputId)
  const modeChanged = !!recipe && mode !== (recipe.deduction_mode ?? 'produce')
  const transferQty = mode === 'sale' ? Number(output?.stock_qty ?? 0) : Number(opening)
  const transferRows = modeChanged && recipe ? autoPrepUsage(recipe, Math.max(0, transferQty)) : []
  const patchRow = (idx: number, patch: Partial<typeof items[number]>) => setItems(items.map((x,i) => i===idx ? {...x,...patch} : x))
  async function save() {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      await productionAction(token, 'save_recipe', {id, revision:recipe?.revision ?? 0, name, output_id:outputId,
        expected_qty:Number(expected), instructions, is_active:active, deduction_mode:mode,
        ...(modeChanged ? {mode_stock_qty:output?.stock_qty, opening_qty:mode === 'produce' ? Number(opening) : undefined} : {}),
        items:items.map(i => ({...i,input_qty:Number(i.input_qty)}))})
      onSaved()
    } catch(e) { setError(e instanceof Error ? e.message : 'บันทึกสูตรไม่ได้') }
    finally {lock.current=false; setBusy(false)}
  }
  return <div className="fixed inset-0 z-40 bg-black/45 flex items-center justify-center p-3">
    <section role="dialog" aria-modal="true" aria-labelledby="recipe-title" className="bg-white rounded-2xl w-full max-w-2xl max-h-[94dvh] flex flex-col overflow-hidden">
      <header className="p-5 border-b flex justify-between"><h2 id="recipe-title" className="text-xl font-bold">{recipe ? 'แก้ไขสูตรผลิต' : 'เพิ่มสูตรผลิต'}</h2><button disabled={busy} onClick={onClose}>ปิด</button></header>
      <form className="overflow-y-auto p-5 space-y-5" onSubmit={e => {e.preventDefault(); void save()}}>
        <fieldset disabled={busy} className="space-y-5">
          <DeductionModePicker value={mode} onChange={setMode} />
          {modeChanged && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
            <p className="font-semibold text-sm">เปลี่ยนวิธีตัดสต๊อกของสูตรนี้</p>
            {mode === 'sale' ? <p className="text-sm">ระบบจะย้ายผลผลิตคงเหลือ {formatStockQty(output?.stock_qty ?? 0, recipe!.output_unit)} กลับเป็นยอดวัตถุดิบต้นทางตามสูตรเดิม เพื่อไม่ให้ตัดซ้ำเมื่อขาย</p> : <label className="block text-sm font-semibold">จำนวนที่ผสมไว้คงเหลือจริง ({recipe!.output_unit})
              <input required className="input mt-1" type="number" inputMode="decimal" min="0" max="1000000" step="0.001" value={opening} onChange={e=>setOpening(e.target.value)} placeholder="ใส่ 0 หากไม่มีของที่ผสมไว้" />
              <span className="block mt-1 text-xs font-normal text-gray-600">ระบบจะตัดต้นทางตามสูตรเดิมเพียงครั้งเดียวและรับจำนวนนี้เข้าสต๊อกผลผลิต จากนั้นค่อยกดผลิตเฉพาะรอบใหม่</span>
            </label>}
            {transferQty > 0 && <div className="space-y-1 text-sm">{transferRows.map(row=><p key={row.ingredient_id}>{ingredients.find(i=>i.id===row.ingredient_id)?.name}: {mode==='sale'?'+':'−'}{formatStockQty(row.qty,ingredients.find(i=>i.id===row.ingredient_id)?.unit ?? '')}</p>)}</div>}
            <p className="text-xs text-gray-600">ระบบจะตรวจยอดล่าสุดก่อนย้ายสต๊อก หากแก้ส่วนผสมด้วยให้บันทึกส่วนผสมก่อน แล้วค่อยเปลี่ยนวิธีตัดแยกอีกครั้ง</p>
          </div>}
          <label className="block text-sm font-semibold">ชื่อสูตร<input required maxLength={120} className="input mt-1" placeholder="เช่น ครีมชีสสูตรร้าน" value={name} onChange={e=>setName(e.target.value)}/></label>
          <div className="rounded-xl bg-green-50 p-4 space-y-3">
            <div className="text-sm font-semibold">ผลิตเป็นวัตถุดิบอะไร (D)<SearchSelect required className="mt-1" label="ผลิตเป็นวัตถุดิบอะไร (D)" placeholder="เลือกผลผลิต"
              value={outputId} onChange={setOutputId}
              options={ingredients.filter(i=>i.is_active || i.id===outputId).map(i=>({value:i.id,label:`${i.name} (${i.unit})${!i.is_active?' · ปิดใช้งาน':''}`}))} /></div>
            <button type="button" className="text-sm text-green-800 underline" onClick={()=>setAdding(true)}>+ เพิ่มวัตถุดิบใหม่ในสต็อก</button>
            <label className="block text-sm font-semibold">คาดว่าจะได้ต่อ 1 รอบ ({output?.unit ?? 'หน่วยผลผลิต'})<input required type="number" inputMode="decimal" min="0.001" max="1000000" step="0.001" className="input mt-1" value={expected} onChange={e=>setExpected(e.target.value)} /></label>
          </div>
          <div><h3 className="font-bold mb-3">ใช้ส่วนผสมอะไรบ้าง (A + B + C)</h3><div className="space-y-3">{items.map((row,idx)=>{
            const ing=ingredients.find(i=>i.id===row.ingredient_id)
            const units=[{name:ing?.unit ?? '',factor_to_base:1},...(ing?.units ?? []).filter(u=>u.name!==ing?.unit)]
            const factor=units.find(u=>u.name===row.input_unit)?.factor_to_base ?? 1
            return <div key={idx} className="border rounded-xl p-3 space-y-2">
              <div className="flex gap-2"><SearchSelect required label={`ส่วนผสม ${idx+1}`} placeholder={`เลือกส่วนผสม ${idx+1}`} className="flex-1 min-w-0" value={row.ingredient_id}
                onChange={id=>{const i=ingredients.find(i=>i.id===id);patchRow(idx,{ingredient_id:id,input_unit:i?.unit ?? ''})}}
                options={ingredients.filter(i=>i.id!==outputId && (i.is_active || i.id===row.ingredient_id) && (!items.some((x,j)=>j!==idx && x.ingredient_id===i.id))).map(i=>({value:i.id,label:`${i.name} (${i.unit})${!i.is_active?' · ปิดใช้งาน':''}`}))} /><button type="button" aria-label={`ลบส่วนผสม ${idx+1}`} className="text-red-700 px-2" onClick={()=>setItems(items.filter((_,i)=>i!==idx))}>ลบ</button></div>
              {ing && <p className="text-sm break-words">{ing.name}</p>}
              <div className="quantity-unit-row production-quantity">
                <label className="text-sm">จำนวนต่อ 1 รอบ<input required aria-label={`จำนวนส่วนผสม ${idx+1}`} type="number" inputMode="decimal" min="0.001" max="1000000" step="0.001" placeholder="เช่น 1250.500" className="input mt-1" value={row.input_qty} onChange={e=>patchRow(idx,{input_qty:e.target.value})}/></label>
                <label className="text-sm">หน่วย<select required disabled={!ing} aria-label={`หน่วยส่วนผสม ${idx+1}`} className="input mt-1" value={row.input_unit} onChange={e=>patchRow(idx,{input_unit:e.target.value})}>{!units.some(u=>u.name===row.input_unit) && row.input_unit && <option value={row.input_unit} disabled>หน่วยเดิม {row.input_unit} · กรุณาเลือกหน่วยที่ถูกต้อง</option>}{units.map(u=><option key={u.name} value={u.name}>{u.name || 'หน่วย'}</option>)}</select></label>
              </div>
              {ing && <p className="text-xs text-gray-500">ตัดสต็อก {formatStockQty(round3(Number(row.input_qty)*factor),ing.unit)} / รอบ</p>}
            </div>
          })}</div><button type="button" disabled={items.length>=50} className="btn-secondary mt-3" onClick={()=>setItems([...items,{ingredient_id:'',input_qty:'',input_unit:''}])}>+ เพิ่มส่วนผสม</button></div>
          <label className="block text-sm font-semibold">วิธีทำ<textarea className="input mt-1" rows={3} maxLength={4000} value={instructions} onChange={e=>setInstructions(e.target.value)} placeholder="ขั้นตอนการผสม / เคี่ยว / พักให้เย็น"/></label>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/>เปิดใช้งานสูตร</label>
        </fieldset>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}
        <button disabled={busy || !items.length || (modeChanged && mode === 'produce' && opening === '')} className="btn-primary w-full min-h-12">{busy?'กำลังบันทึก…':modeChanged?'บันทึกสูตรและเปลี่ยนวิธีตัด':'บันทึกสูตร'}</button>
      </form>
    </section>
    {adding && <IngredientEditor ingredient={null} onClose={()=>{setAdding(false);reload()}}/>}
  </div>
}
