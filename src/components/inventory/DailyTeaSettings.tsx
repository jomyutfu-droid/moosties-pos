import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useDailyTea } from '@/hooks/useDailyTea'
import { useSessionStore } from '@/store/session'
import { dailyTeaAction, teaPreview, type TeaTotal } from '@/lib/dailyTea'
import { refreshProductionStock } from '@/lib/production'

export function DailyTeaSettings() {
  const query = useDailyTea()
  const token = useSessionStore(s => s.pinSessionToken)
  const qc = useQueryClient()
  const [grams, setGrams] = useState('')
  const [editing, setEditing] = useState<TeaTotal | null>(null)
  const [volume, setVolume] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  async function save(action: 'settings' | 'revise') {
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    try {
      if (action === 'settings' && (!grams || !Number.isFinite(Number(grams)) || Number(grams) <= 0 || Number(grams) > 100)) throw new Error('ระบุน้ำหนักจริง 0.001–100 กรัมต่อช้อนโต๊ะ')
      if (action === 'revise' && (!editing || !volume || !teaPreview(Number(volume), Number(editing.current_used_ml)).valid)) throw new Error('ยอดชงต้องไม่น้อยกว่ายอดใช้')
      await dailyTeaAction(token, action, action === 'settings' ? {grams_per_spoon: Number(grams)} : {
        date: editing!.business_date, brewed_ml: Number(volume), used_ml: Number(editing!.current_used_ml), revision: editing!.revision,
      })
      setMessage(action === 'settings' ? 'ตั้งค่าแล้ว และตัดยอดผงชาที่รอชั่งครบแล้ว' : 'แก้ไขยอดชงและของเสียแล้ว')
      setEditing(null); setGrams('')
      await qc.invalidateQueries({queryKey: ['daily-tea']})
      void qc.invalidateQueries({queryKey: ['ingredients-full']})
      refreshProductionStock()
    } catch (e) { setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ') }
    finally { setBusy(false) }
  }
  const data = query.data
  return <section className="bg-white rounded-2xl border p-4 space-y-3">
    <h2 className="font-bold text-lg">ชามะลิรายวัน</h2>
    <p className="text-sm text-gray-600">ผงชา 1 ช้อนโต๊ะ + น้ำ 200 มล. → ชาชงแล้ว 200 มล. สรุปยอดชงและทิ้งของเหลือพร้อมปิดกะในหน้ารายงาน</p>
    {query.isLoading && <p>กำลังโหลด…</p>}
    {query.error && <p role="alert" className="text-red-700">{query.error.message} <button onClick={() => void query.refetch()} className="underline">ลองใหม่</button></p>}
    {data && <>
      <p className="text-sm">น้ำหนักผงชาต่อช้อนโต๊ะ: {data.grams_per_spoon ?? 'ยังไม่ได้ชั่ง'}{data.grams_per_spoon !== null ? ' กรัม' : ' · เก็บจำนวนช้อนไว้รอตัดผงชา'}</p>
      {data.can_manage && <div className="space-y-2">
        <label htmlFor="tea-spoon-grams" className="label">น้ำหนักจริงของผงชา 1 ช้อนโต๊ะ (กรัม)</label>
        <div className="flex flex-wrap gap-2"><input id="tea-spoon-grams" className="input flex-1 min-w-36" type="number" inputMode="decimal" step="0.001" min="0.001" max="100" value={grams} onChange={e => setGrams(e.target.value)} placeholder="กรอกเมื่อชั่งแล้ว" /><button className="btn-secondary" disabled={busy || !grams} onClick={() => void save('settings')}>บันทึกน้ำหนักและตัดยอดรอชั่ง</button></div>
        <p className="text-xs text-gray-500">ใช้กับการชงครั้งถัดไปและยอดที่ยังรอชั่ง ยอดผงชาที่ตัดแล้วจะไม่ถูกตัดซ้ำ</p>
      </div>}
      {data.history.length === 0 ? <p className="text-sm text-gray-500">ยังไม่มีสรุปชารายวัน</p> : <div className="space-y-2">{data.history.map(row => <div key={row.id} className="rounded-xl bg-green-50 p-3 text-sm">
        <p className="font-medium">{row.business_date} · ชง {row.brewed_ml} · ใช้ {row.used_ml} · ทิ้ง {row.waste_ml} มล.</p>
        <p>ผงชา {Number(Number(row.spoons).toFixed(3))} ช้อนโต๊ะ · {row.powder_grams === null ? 'รอตั้งค่าน้ำหนักเพื่อตัดสต็อก' : `ตัดแล้ว ${row.powder_grams} กรัม`}</p>
        {Number(row.current_used_ml) !== Number(row.used_ml) && <p className="text-amber-800">ยอดขายเปลี่ยนหลังสรุป: ปัจจุบันใช้ {row.current_used_ml} มล. กรุณาตรวจและยืนยันยอดใหม่</p>}
        {data.can_manage && <button className="underline mt-1" disabled={busy} onClick={() => {setEditing(row); setVolume(String(row.brewed_ml)); setError('')}}>ตรวจ / แก้ไขยอด</button>}
      </div>)}</div>}
      {editing && <div className="p-3 border rounded-xl space-y-2">
        <label htmlFor="tea-revise-volume" className="label">ยอดชงที่ถูกต้อง วันที่ {editing.business_date} (มล.)</label>
        <input id="tea-revise-volume" className="input" type="number" inputMode="decimal" value={volume} onChange={e => setVolume(e.target.value)} min={editing.current_used_ml} step="0.001" />
        <p className="text-sm">ใช้ {editing.current_used_ml} · ทิ้ง {teaPreview(Number(volume), Number(editing.current_used_ml)).waste} มล.</p>
        <div className="flex gap-2"><button className="btn-primary" disabled={busy} onClick={() => void save('revise')}>ยืนยันแก้ไข</button><button className="btn-secondary" disabled={busy} onClick={() => setEditing(null)}>ยกเลิก</button></div>
      </div>}
    </>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {message && <p role="status" className="text-green-800">{message}</p>}
  </section>
}
