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
  const [active, setActive] = useState(recipe?.is_active ?? true)
  const [items, setItems] = useState(() => recipe?.items.map(i => ({ ingredient_id: i.ingredient_id, input_qty: String(i.input_qty), input_unit: i.input_unit })) ?? [{ingredient_id:'', input_qty:'', input_unit:''}])
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const output = ingredients.find(i => i.id === outputId)
  const patchRow = (idx: number, patch: Partial<typeof items[number]>) => setItems(items.map((x,i) => i===idx ? {...x,...patch} : x))
  async function save() {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      await productionAction(token, 'save_recipe', {id, revision:recipe?.revision ?? 0, name, output_id:outputId,
        expected_qty:Number(expected), instructions, is_active:active,
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
          <label className="block text-sm font-semibold">ชื่อสูตร<input required maxLength={120} className="input mt-1" placeholder="เช่น ครีมชีสสูตรร้าน" value={name} onChange={e=>setName(e.target.value)}/></label>
          <div className="rounded-xl bg-green-50 p-4 space-y-3">
            <label className="block text-sm font-semibold">ผลิตเป็นวัตถุดิบอะไร (D)<select required className="input mt-1" value={outputId} onChange={e=>setOutputId(e.target.value)}><option value="">เลือกผลผลิต</option>{ingredients.filter(i=>i.is_active || i.id===outputId).map(i=><option key={i.id} value={i.id}>{i.name} ({i.unit}){!i.is_active?' · ปิดใช้งาน':''}</option>)}</select></label>
            <button type="button" className="text-sm text-green-800 underline" onClick={()=>setAdding(true)}>+ เพิ่มวัตถุดิบใหม่ในสต็อก</button>
            <label className="block text-sm font-semibold">คาดว่าจะได้ต่อ 1 รอบ ({output?.unit ?? 'หน่วยผลผลิต'})<input required type="number" min="0.001" max="1000000" step="0.001" className="input mt-1" value={expected} onChange={e=>setExpected(e.target.value)} /></label>
          </div>
          <div><h3 className="font-bold mb-3">ใช้ส่วนผสมอะไรบ้าง (A + B + C)</h3><div className="space-y-3">{items.map((row,idx)=>{
            const ing=ingredients.find(i=>i.id===row.ingredient_id)
            const units=[{name:ing?.unit ?? '',factor_to_base:1},...(ing?.units ?? []).filter(u=>u.name!==ing?.unit)]
            const factor=units.find(u=>u.name===row.input_unit)?.factor_to_base ?? 1
            return <div key={idx} className="border rounded-xl p-3 space-y-2">
              <div className="flex gap-2"><select required aria-label={`ส่วนผสม ${idx+1}`} className="input flex-1 min-w-0" value={row.ingredient_id} onChange={e=>{const i=ingredients.find(i=>i.id===e.target.value);patchRow(idx,{ingredient_id:e.target.value,input_unit:i?.unit ?? ''})}}><option value="">เลือกส่วนผสม {idx+1}</option>{ingredients.filter(i=>i.id!==outputId && (i.is_active || i.id===row.ingredient_id) && (!items.some((x,j)=>j!==idx && x.ingredient_id===i.id))).map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select><button type="button" aria-label={`ลบส่วนผสม ${idx+1}`} className="text-red-700 px-2" onClick={()=>setItems(items.filter((_,i)=>i!==idx))}>ลบ</button></div>
              <div className="flex gap-2"><input required aria-label={`จำนวนส่วนผสม ${idx+1}`} type="number" min="0.001" max="1000000" step="0.001" placeholder="จำนวนต่อ 1 รอบ" className="input min-w-0 flex-1" value={row.input_qty} onChange={e=>patchRow(idx,{input_qty:e.target.value})}/><select required aria-label={`หน่วยส่วนผสม ${idx+1}`} className="input w-28" value={row.input_unit} onChange={e=>patchRow(idx,{input_unit:e.target.value})}>{units.map(u=><option key={u.name} value={u.name}>{u.name || 'หน่วย'}</option>)}</select></div>
              {ing && <p className="text-xs text-gray-500">ตัดสต็อก {formatStockQty(round3(Number(row.input_qty)*factor),ing.unit)} / รอบ</p>}
            </div>
          })}</div><button type="button" disabled={items.length>=50} className="btn-secondary mt-3" onClick={()=>setItems([...items,{ingredient_id:'',input_qty:'',input_unit:''}])}>+ เพิ่มส่วนผสม</button></div>
          <label className="block text-sm font-semibold">วิธีทำ<textarea className="input mt-1" rows={3} maxLength={4000} value={instructions} onChange={e=>setInstructions(e.target.value)} placeholder="ขั้นตอนการผสม / เคี่ยว / พักให้เย็น"/></label>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/>เปิดใช้งานสูตร</label>
        </fieldset>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}
        <button disabled={busy || !items.length} className="btn-primary w-full min-h-12">{busy?'กำลังบันทึก…':'บันทึกสูตร'}</button>
      </form>
    </section>
    {adding && <IngredientEditor ingredient={null} onClose={()=>{setAdding(false);reload()}}/>}
  </div>
}
