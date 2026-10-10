import type { TeaData } from '@/lib/dailyTea'
import { bangkokDate, teaPreview } from '@/lib/dailyTea'

export function DailyTeaClose({ data, loading, error, enabled, brewed, onEnabled, onBrewed, refresh }: {
  data?: TeaData; loading: boolean; error: Error | null; enabled: boolean; brewed: string
  onEnabled: (value: boolean) => void; onBrewed: (value: string) => void; refresh: () => void
}) {
  const preview = teaPreview(Number(brewed), Number(data?.used_ml ?? 0))
  const total = data?.total?.id ? data.total : null
  return <section className="my-4 rounded-xl border border-green-200 bg-green-50 p-4 space-y-3">
    <h3 className="font-semibold">ชามะลิ · สรุปเมื่อปิดร้าน</h3>
    <p className="text-sm text-gray-600">ขายตามปกติได้ทั้งวัน ไม่ต้องกดผลิตชาในแต่ละบิล</p>
    {loading && <p>กำลังโหลดยอดใช้ชา…</p>}
    {error && <p role="alert" className="text-red-700">{error.message} <button className="underline" onClick={refresh}>ลองใหม่</button></p>}
    {data && <>
      <p className="text-sm">วันที่ {data.date} · ใช้จากบิลขาย {data.used_ml} มล. <button className="underline ml-2" onClick={refresh}>รีเฟรชยอด</button></p>
      {total ? <p className="text-sm text-green-900">สรุปแล้ว: ชง {total.brewed_ml} มล. · ทิ้ง {total.waste_ml} มล. ตรวจ / แก้ไขยอดได้ที่หน้าผลิตวัตถุดิบ{Number(total.used_ml) !== Number(data.used_ml) && <span className="block text-amber-800">ยอดขายเปลี่ยนหลังสรุป กรุณาตรวจและยืนยันยอดอีกครั้ง</span>}</p> : <>
        <p className="text-sm font-medium">วันนี้ยังไม่ได้สรุปชา</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={e => onEnabled(e.target.checked)} />ปิดร้านแล้ว สรุปชาและทิ้งของเหลือพร้อมปิดกะ</label>
        <p className="text-xs text-gray-600">ถ้าเพียงสลับกะและร้านยังเปิด ให้เว้นช่องนี้</p>
        {enabled && <>
          <label htmlFor="daily-tea-volume" className="label">ยอดชามะลิที่ชงรวมวันนี้ (มล.)</label>
          <input id="daily-tea-volume" className="input" type="number" inputMode="decimal" min={0} max={1000000} step="0.001" value={brewed} onChange={e => onBrewed(e.target.value)} placeholder="เช่น 600" />
          <div className="flex flex-wrap gap-2">{[600,1200,1800].map(n => <button key={n} className="btn-secondary text-sm" onClick={() => onBrewed(String(n))}>{n} มล.</button>)}</div>
          {brewed !== '' && <p className="text-sm">ชง {brewed} · ใช้ {data.used_ml} · ทิ้ง {preview.waste} มล. · ผงชา {Number(preview.spoons.toFixed(3))} ช้อนโต๊ะ</p>}
          {brewed !== '' && !preview.valid && <p role="alert" className="text-red-700 text-sm">ยอดชงต้องไม่น้อยกว่ายอดใช้</p>}
          {data.grams_per_spoon === null && <p className="text-xs text-amber-800">บันทึกจำนวนช้อนไว้ก่อน รอตัดสต็อกผงชาเมื่อตั้งค่ากรัมต่อช้อนในหน้าผลิตวัตถุดิบ</p>}
          {bangkokDate(data.started_at) === data.date && <p className="text-xs text-amber-800">วันเริ่มใช้งาน: ยอดใช้รวมเฉพาะบิลที่ใช้สูตรชาชงแล้วหลังอัปเดต กรุณาตรวจยอดชงก่อนยืนยัน</p>}
        </>}
      </>}
    </>}
  </section>
}
