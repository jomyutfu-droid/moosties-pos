export type DeductionMode = 'produce' | 'sale'

export function DeductionModePicker({ value, onChange }: { value: DeductionMode; onChange: (value: DeductionMode) => void }) {
  return <fieldset className="rounded-2xl border border-green-200 p-4 space-y-3">
    <legend className="px-2 text-base font-bold text-green-950">เลือกวิธีตัดวัตถุดิบ</legend>
    <div className="grid gap-3 sm:grid-cols-2">
      {([
        ['produce', 'ตัดวัตถุดิบเมื่อผลิต', 'กดผลิตเพื่อตัดส่วนผสมและรับผลผลิตเข้าสต๊อก ขายแล้วตัดจากผลผลิตที่เตรียมไว้'],
        ['sale', 'ตัดวัตถุดิบเมื่อขาย', 'ขายหรือบันทึกทิ้งแล้วตัดส่วนผสมต้นทางตามสูตรอัตโนมัติ ไม่ต้องกดผลิต'],
      ] as const).map(([mode, title, description]) => <label key={mode} className={`cursor-pointer rounded-xl border-2 p-4 min-h-28 focus-within:ring-2 focus-within:ring-green-700 ${value === mode ? 'border-green-700 bg-green-50' : 'border-gray-200 bg-white'}`}>
        <span className="flex items-center gap-2 font-semibold"><input type="radio" name="deduction-mode" value={mode} checked={value === mode} onChange={() => onChange(mode)} />{title}</span>
        <span className="block mt-2 text-sm text-gray-600">{description}</span>
      </label>)}
    </div>
    <p className="text-xs text-gray-500">เลือกแยกได้แต่ละสูตร การเปลี่ยนวิธีจะมีผลเมื่อกดบันทึกสูตร</p>
  </fieldset>
}
