import { useRef, useState } from 'react'
import { SearchSelect } from '@/components/SearchSelect'
import { productionAction } from '@/lib/production'
import { bangkokDate } from '@/lib/dailyTea'
import { autoPrepUsage } from '@/domain/autoPrep'
import { formatBahtSymbol, formatStockQty } from '@/lib/money'
import type { ProductionData, PrepWaste } from '@/domain/production'

export function PrepWasteForm({ data, token, onSaved }: { data: ProductionData; token: string | null; onSaved: () => void }) {
  const [selected, setSelected] = useState('')
  const [qty, setQty] = useState('')
  const [date, setDate] = useState(bangkokDate())
  const [reason, setReason] = useState('เหลือใช้ / หมดอายุ')
  const [review, setReview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const attempt = useRef<object | null>(null)
  const lock = useRef(false)
  const ingredient = data.ingredients.find(i => i.id === selected)
  const recipe = data.recipes.find(r => r.output_id === selected && r.deduction_mode === 'sale')
  const amount = Number(qty)
  const rows = (recipe ? autoPrepUsage(recipe, amount) : [{ ingredient_id: selected, qty: amount }])
    .map(row => ({ ...row, ingredient: data.ingredients.find(i => i.id === row.ingredient_id) }))
  const valid = !!ingredient && amount > 0 && amount <= 1_000_000 && amount === Math.round(amount * 1000) / 1000 &&
    !!date && date <= bangkokDate() && !!reason.trim() && (!recipe || recipe.is_active)
  const total = rows.reduce((sum, row) => sum + row.qty * (row.ingredient?.cost_per_unit ?? 0), 0)
  async function save() {
    if (lock.current || !ingredient) return
    lock.current = true; setBusy(true); setError('')
    attempt.current ??= { id: crypto.randomUUID(), ingredient_id: ingredient.id, unit: ingredient.unit,
      qty: amount, business_date: date, reason: reason.trim() }
    try {
      await productionAction(token, 'waste', attempt.current)
      attempt.current = null; setReview(false); setQty(''); onSaved()
    } catch (e) { setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ') }
    finally { lock.current = false; setBusy(false) }
  }
  return <section className="bg-white rounded-2xl border p-5 space-y-4">
    <h2 className="font-bold text-lg">บันทึกทิ้งสินค้า</h2>
    <p className="text-sm text-gray-600">เลือกของที่ทิ้งและชั่งจำนวนจริง บันทึกในวันที่ทิ้ง ระบบคำนวณวัตถุดิบและต้นทุนให้</p>
    <fieldset disabled={busy || review} className="space-y-4">
      <SearchSelect label="สินค้าที่ทิ้ง" value={selected} onChange={setSelected} emptyLabel="เลือกสินค้า เช่น ชามะลิชงแล้ว / โปรตีนผสม"
        options={data.ingredients.filter(i => i.is_active).map(i => ({ value: i.id, label: `${i.name} (${i.unit})${i.auto_prep ? ' · ตัดต้นทางอัตโนมัติ' : ''}` }))} />
      <label className="block text-sm">จำนวนที่ทิ้ง ({ingredient?.unit ?? 'เลือกสินค้าก่อน'})<input className="input mt-1" type="number" inputMode="decimal" min="0.001" max="1000000" step="0.001" value={qty} onChange={e => setQty(e.target.value)} /></label>
      <label className="block text-sm">วันที่ทิ้ง<input className="input mt-1" type="date" max={bangkokDate()} value={date} onChange={e => setDate(e.target.value)} /></label>
      <label className="block text-sm">เหตุผล<input className="input mt-1" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label>
    </fieldset>
    {ingredient && amount > 0 && <div className="rounded-xl bg-amber-50 p-4 space-y-2">
      <p className="font-semibold">{recipe ? 'ระบบจะตัดวัตถุดิบต้นทาง' : 'ระบบจะตัดสินค้าในสต๊อก'}</p>
      {rows.map(row => <p key={row.ingredient_id} className="text-sm flex justify-between gap-3"><span>{row.ingredient?.name}</span><strong>−{formatStockQty(row.qty, row.ingredient?.unit ?? '')}</strong></p>)}
      <p className="text-sm font-semibold">ต้นทุนของเสียประมาณ {formatBahtSymbol(total)}</p>
    </div>}
    {error && <p role="alert" className="text-red-800">{error}</p>}
    {review ? <div className="space-y-3 border-t pt-4">
      <p className="font-semibold">ยืนยันทิ้ง {ingredient?.name} {formatStockQty(amount, ingredient?.unit ?? '')} วันที่ {date}</p>
      <p className="text-xs text-gray-600">หากเน็ตขัดข้อง กดลองซ้ำได้โดยไม่ตัดซ้ำ หากเปลี่ยนรายการ ให้ตรวจประวัติก่อน</p>
      <div className="flex gap-2"><button className="btn-secondary" disabled={busy} onClick={() => { setReview(false); attempt.current = null }}>กลับ / ตรวจประวัติ</button>
        <button className="btn-primary flex-1 min-h-12" disabled={busy || !valid} onClick={() => void save()}>{busy ? 'กำลังบันทึก…' : 'ยืนยันทิ้งและตัดสต๊อก'}</button></div>
    </div> : <button className="btn-primary w-full min-h-12" disabled={!valid || !navigator.onLine} onClick={() => { setReview(true); setError('') }}>ตรวจรายการทิ้ง</button>}
  </section>
}

export function PrepWasteHistory({ rows, canManage, token, onSaved }: { rows: PrepWaste[]; canManage: boolean; token: string | null; onSaved: () => void }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  async function cancel(id: string) {
    if (lock.current || !reason.trim()) return
    lock.current = true; setBusy(true); setError('')
    try { await productionAction(token, 'cancel_waste', { id, reason }); setSelected(null); setReason(''); onSaved() }
    catch (e) { setError(e instanceof Error ? e.message : 'ยกเลิกไม่สำเร็จ') }
    finally { lock.current = false; setBusy(false) }
  }
  return <div className="space-y-3"><h2 className="font-bold text-lg">ประวัติทิ้งสินค้า</h2>
    {!rows.length && <p className="text-sm text-gray-500">ยังไม่มีรายการทิ้งในหน้านี้</p>}
    {rows.slice(0,20).map(row => <article key={row.id} className="bg-white border rounded-2xl p-4 space-y-2">
      <p className="font-semibold">{row.ingredient_name} · {formatStockQty(row.qty, row.unit)}</p>
      <p className="text-sm">วันที่ทิ้ง {row.business_date} · {row.user_name} · {formatBahtSymbol(row.total_cost)}</p>
      <p className="text-xs text-gray-500">บันทึก {new Date(row.created_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</p>
      <p className="text-sm">{row.reason}</p>
      <details><summary className="text-sm cursor-pointer">รายละเอียดวัตถุดิบที่ตัด</summary>{row.items.filter(i => i.qty_delta !== 0).map(i => <p key={i.ingredient_id} className="text-sm mt-1">{i.name} −{formatStockQty(-i.qty_delta, i.unit)}</p>)}</details>
      {row.status === 'cancelled' ? <p className="text-red-700 text-sm">ยกเลิกแล้ว: {row.cancel_reason}</p> : canManage && (selected === row.id ? <div className="space-y-2">
        <label className="block text-sm">เหตุผลยกเลิก<input className="input mt-1" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label>
        <button className="btn-secondary text-red-700" disabled={busy || !reason.trim()} onClick={() => void cancel(row.id)}>ยืนยันยกเลิกและคืนสต๊อก</button>
        <button className="btn-secondary ml-2" disabled={busy} onClick={() => setSelected(null)}>กลับ</button>
      </div> : <button className="text-sm underline" disabled={busy} onClick={() => { setSelected(row.id); setReason(''); setError('') }}>ยกเลิกรายการทิ้ง</button>)}
    </article>)}
    {error && <p role="alert" className="text-red-800">{error}</p>}
  </div>
}
