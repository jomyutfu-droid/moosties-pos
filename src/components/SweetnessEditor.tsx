import type { Ingredient, SweetnessIngredient } from '@/types'

export function SweetnessEditor({ value, onChange, ingredients, baseQuantities }: {
  value: SweetnessIngredient[]
  onChange: (rows: SweetnessIngredient[]) => void
  ingredients: Ingredient[]
  baseQuantities: Map<string, number>
}) {
  const selected = new Set(value.map(r => r.ingredient_id))
  return <section className="space-y-3 rounded-xl border border-green-200 bg-green-50/50 p-3">
    <h3 className="font-semibold">ระดับความหวานของเมนูนี้</h3>
    <p className="text-sm text-gray-600">ระบุปริมาณที่ใช้จริงต่อแก้ว ไม่ใช่ปริมาณที่เพิ่มหรือลด รองรับสารให้ความหวานหลายชนิด</p>
    <p className="text-xs text-gray-600">ปกติใช้สูตร BOM ด้านบน ช่องว่าง = ยังไม่ได้ตั้งค่า (พนักงานจะยังเลือกระดับนั้นไม่ได้) ใส่ 0 เมื่อต้องการไม่ใช้วัตถุดิบนั้น</p>
    {value.map((row, index) => {
      const ing = ingredients.find(i => i.id === row.ingredient_id)
      const normal = baseQuantities.get(row.ingredient_id) ?? 0
      return <div key={row.ingredient_id} className="bg-white border rounded-xl p-3 space-y-2">
        <div className="flex justify-between items-center gap-2"><strong className="text-sm">{ing?.name ?? 'ไม่พบวัตถุดิบ'} ({ing?.unit ?? '-'})</strong><button type="button" className="btn-ghost text-red-600" onClick={() => onChange(value.filter((_, i) => i !== index))}>ลบ</button></div>
        <div className="grid grid-cols-3 gap-2">
          {(['less', 'normal', 'more'] as const).map(level => <label key={level} className="text-xs text-gray-600">{level === 'less' ? 'น้อย' : level === 'normal' ? 'ปกติ (BOM)' : 'มาก'}
            {level === 'normal' ? <div className="input bg-gray-100 mt-1">{normal}</div> : <input type="number" min={level === 'less' ? 0 : normal} max={level === 'less' ? normal : undefined} step="any" inputMode="decimal" className="input mt-1" aria-label={`${ing?.name} หวาน${level === 'less' ? 'น้อย' : 'มาก'}`} placeholder="ยังไม่ตั้ง" value={row[level] ?? ''} onChange={e => onChange(value.map((r, i) => i === index ? { ...r, [level]: e.target.value === '' ? null : Number(e.target.value) } : r))} />}
          </label>)}
        </div>
        {((row.less != null && (row.less < 0 || row.less > normal)) || (row.more != null && row.more < normal)) && <p className="text-xs text-red-700">หวานน้อยต้องไม่เกินปกติ และหวานมากต้องไม่น้อยกว่าปกติ</p>}
      </div>
    })}
    <select className="input" aria-label="เพิ่มสารให้ความหวาน" value="" onChange={e => { if (e.target.value) onChange([...value, { ingredient_id: e.target.value, less: null, more: null }]) }}>
      <option value="">+ เลือกสารให้ความหวาน</option>
      {ingredients.filter(i => i.is_active && !selected.has(i.id) && i.category?.trim() !== 'บรรจุภัณฑ์').map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
    </select>
  </section>
}
