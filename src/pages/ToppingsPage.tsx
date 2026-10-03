import { useRef, useState } from 'react'
import { NumberField } from '@/components/NumberField'
import { useIngredients } from '@/hooks/useMenu'
import { useSaveTopping, useStoreToppings, type ToppingInput } from '@/hooks/useToppings'
import { parseUnsignedNumber } from '@/lib/forms'
import { explainSupabaseError } from '@/lib/errors'
import { formatBahtSymbol } from '@/lib/money'
import type { StoreTopping } from '@/types'

function ToppingEditor({ topping, onClose }: { topping: StoreTopping | null; onClose: () => void }) {
  const { data: ingredients = [], isLoading, error: ingredientError } = useIngredients()
  const save = useSaveTopping()
  const inFlight = useRef(false)
  const [form, setForm] = useState<ToppingInput>(() => topping ? { ...topping } : {
    id: crypto.randomUUID(), name: '', price_delta: 0, linked_ingredient_id: null,
    qty_delta: 0, sort_order: 0, is_active: true, is_available: true, revision: 0,
  })
  const [error, setError] = useState<string | null>(null)
  const ingredient = ingredients.find(i => i.id === form.linked_ingredient_id)
  function change<K extends keyof ToppingInput>(key: K, value: ToppingInput[K]) {
    setForm(old => ({ ...old, [key]: value }))
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (inFlight.current) return
    inFlight.current = true
    setError(null)
    try {
      await save.mutateAsync(form)
      onClose()
    } catch (err) {
      setError(explainSupabaseError(err, 'บันทึกท็อปปิ้งไม่สำเร็จ'))
    } finally { inFlight.current = false }
  }
  return <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-3 z-50">
    <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="topping-editor-title" className="bg-white rounded-2xl shadow-lg w-full max-w-lg max-h-[90dvh] overflow-y-auto">
      <div className="p-4 border-b"><h2 id="topping-editor-title" className="text-lg font-bold">{topping ? 'แก้ไขท็อปปิ้ง' : 'เพิ่มท็อปปิ้ง'}</h2><p className="text-sm text-gray-500">ใช้ร่วมกันทุกเมนูเก่าและใหม่</p></div>
      <fieldset disabled={save.isPending} className="p-4 space-y-4">
        <label className="block"><span className="label">ชื่อท็อปปิ้ง</span><input autoFocus required maxLength={100} className="input" value={form.name} onChange={e => change('name', e.target.value)} /></label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block"><span className="label">ราคาเพิ่ม / ส่วน (บาท)</span><NumberField className="input" value={form.price_delta} parse={parseUnsignedNumber} onChange={n => change('price_delta', n)} /></label>
          <label className="block"><span className="label">ลำดับแสดง</span><NumberField className="input" value={form.sort_order} parse={parseUnsignedNumber} onChange={n => change('sort_order', n)} /></label>
        </div>
        <label className="block"><span className="label">วัตถุดิบที่ตัดสต๊อก</span><select className="input" value={form.linked_ingredient_id ?? ''} onChange={e => setForm(old => ({ ...old, linked_ingredient_id: e.target.value || null, qty_delta: 0 }))}>
          <option value="">ไม่ตัดสต๊อก</option>{ingredients.filter(i => i.is_active || i.id === form.linked_ingredient_id).map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit}){!i.is_active ? ' — ปิดใช้งาน' : ''}</option>)}
        </select></label>
        {form.linked_ingredient_id && <label className="block"><span className="label">ปริมาณต่อ 1 ส่วน ({ingredient?.unit ?? 'หน่วยฐาน'})</span><NumberField className="input" value={form.qty_delta} parse={parseUnsignedNumber} onChange={n => change('qty_delta', n)} /><span className="block mt-1 text-xs text-gray-500">เลือก 2 ส่วน จะตัด {form.qty_delta * 2} {ingredient?.unit}</span></label>}
        <div className="space-y-3"><label className="flex gap-2 items-center"><input type="checkbox" checked={form.is_active} onChange={e => change('is_active', e.target.checked)} />เปิดใช้งานทุกเมนู</label><label className="flex gap-2 items-center"><input type="checkbox" checked={!form.is_available} onChange={e => change('is_available', !e.target.checked)} />หมดชั่วคราว</label></div>
        <p className="text-xs text-gray-500">ปิดใช้งาน = ซ่อนจากทุกเมนู · หมดชั่วคราว = แสดงแต่เลือกเพิ่มไม่ได้</p>
        {(error || ingredientError) && <p role="alert" className="text-sm text-red-700">{error ?? explainSupabaseError(ingredientError, 'โหลดวัตถุดิบไม่สำเร็จ')}</p>}
      </fieldset>
      <div className="p-4 border-t flex gap-2 justify-end"><button type="button" className="btn-ghost" disabled={save.isPending} onClick={onClose}>ยกเลิก</button><button className="btn-primary" disabled={save.isPending || isLoading || !!ingredientError || !form.name.trim()}>{save.isPending ? 'กำลังบันทึก…' : 'บันทึกทุกเมนู'}</button></div>
    </form>
  </div>
}

export default function ToppingsPage() {
  const { data: toppings = [], isLoading, error, refetch } = useStoreToppings()
  const { data: ingredients = [] } = useIngredients()
  const [editor, setEditor] = useState<{ topping: StoreTopping | null } | null>(null)
  const ingredientsById = new Map(ingredients.map(i => [i.id, i]))
  return <div className="h-full overflow-y-auto p-4 md:p-6 space-y-4">
    <div className="flex justify-between items-start gap-3"><div><h1 className="text-xl font-bold">ท็อปปิ้งกลางของร้าน</h1><p className="text-sm text-gray-500 mt-1">ตั้งครั้งเดียว ทุกเมนูมีให้เลือกอัตโนมัติ</p></div><button className="btn-primary shrink-0" disabled={isLoading || !!error} onClick={() => setEditor({ topping: null })}>+ เพิ่มท็อปปิ้ง</button></div>
    <p className="rounded-xl bg-green-50 text-green-900 p-3 text-sm">พนักงานเลือกเพิ่มได้หลายชนิดและหลายส่วนตอนขาย ไม่เลือก = ไม่เพิ่ม · ความหวานตั้งแยกในสูตรเมนู</p>
    {isLoading && <p>กำลังโหลดท็อปปิ้ง…</p>}
    {error && <div role="alert" className="text-red-700"><p>{explainSupabaseError(error, 'โหลดท็อปปิ้งไม่สำเร็จ')}</p><button className="btn-secondary mt-2" onClick={() => void refetch()}>ลองใหม่</button></div>}
    {!isLoading && !error && !toppings.length && <p className="text-gray-500">ยังไม่มีท็อปปิ้ง เพิ่มรายการแรกเพื่อใช้กับทุกเมนู</p>}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">{toppings.map(t => {
      const ingredient = t.linked_ingredient_id ? ingredientsById.get(t.linked_ingredient_id) : null
      return <article key={t.id} className="card p-4 flex items-start gap-3"><div className="flex-1 min-w-0"><h2 className="font-semibold break-words">{t.name}</h2><p className="text-sm mt-1">{formatBahtSymbol(t.price_delta)} / ส่วน</p><p className="text-sm text-gray-500 break-words">{ingredient ? `${ingredient.name} ${t.qty_delta} ${ingredient.unit} / ส่วน` : 'ไม่ตัดสต๊อก'}</p><p className={`text-xs mt-2 ${!t.is_active || !t.is_available ? 'text-amber-800' : 'text-green-800'}`}>{!t.is_active ? 'ปิดใช้งาน' : !t.is_available ? 'หมดชั่วคราว' : 'เปิดขายทุกเมนู'} · ลำดับ {t.sort_order}</p>{ingredient && !ingredient.is_active && <p className="text-xs text-red-700 mt-1">วัตถุดิบปิดใช้งาน เลือกเพิ่มไม่ได้</p>}</div><button className="btn-secondary shrink-0" onClick={() => setEditor({ topping: t })}>แก้ไข</button></article>
    })}</div>
    {editor && <ToppingEditor key={editor.topping?.id ?? 'new'} topping={editor.topping} onClose={() => setEditor(null)} />}
  </div>
}
