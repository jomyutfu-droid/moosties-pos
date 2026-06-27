import { useEffect, useState } from 'react'
import { useSaveSettings, useSettings } from '@/hooks/useSettings'
import type { Settings } from '@/types'

export default function SettingsPage() {
  const { data: settings, isLoading } = useSettings()
  const save = useSaveSettings()
  const [form, setForm] = useState<Settings | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (settings && !form) setForm(settings)
  }, [settings, form])

  if (isLoading || !form) {
    return (
      <div className="p-6">
        <p className="text-gray-500">กำลังโหลด…</p>
      </div>
    )
  }

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f))
    setSaved(false)
  }

  async function handleSave() {
    if (!form) return
    await save.mutateAsync(form)
    setSaved(true)
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold text-gray-800">ตั้งค่าระบบ</h1>

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold">ข้อมูลร้าน</h2>
        <div>
          <label className="label">ชื่อร้าน</label>
          <input className="input" value={form.store_name} onChange={(e) => update('store_name', e.target.value)} />
        </div>
        <div>
          <label className="label">PromptPay ID (เบอร์โทร/เลขบัตรประชาชน)</label>
          <input
            className="input"
            value={form.promptpay_id}
            onChange={(e) => update('promptpay_id', e.target.value)}
            placeholder="0812345678"
          />
        </div>
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold">ใบเสร็จ</h2>
        <div>
          <label className="label">หัวใบเสร็จ</label>
          <input
            className="input"
            value={form.receipt_header}
            onChange={(e) => update('receipt_header', e.target.value)}
          />
        </div>
        <div>
          <label className="label">ท้ายใบเสร็จ</label>
          <input
            className="input"
            value={form.receipt_footer}
            onChange={(e) => update('receipt_footer', e.target.value)}
          />
        </div>
        <div>
          <label className="label">VAT (%)</label>
          <input
            type="number"
            className="input"
            value={form.vat_percent}
            onChange={(e) => update('vat_percent', Number(e.target.value))}
          />
        </div>
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold">สต็อก / สูตร</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.low_stock_alert_on}
            onChange={(e) => update('low_stock_alert_on', e.target.checked)}
          />
          แจ้งเตือนเมื่อวัตถุดิบเหลือน้อย
        </label>
        <div>
          <label className="label">เป้าหมายกำไรขั้นต้น (%)</label>
          <input
            type="number"
            className="input"
            value={form.target_margin_percent}
            onChange={(e) => update('target_margin_percent', Number(e.target.value))}
          />
        </div>
        <div>
          <label className="label">แสดงสูตร/วิธีทำตอนไหน</label>
          <select
            className="input"
            value={form.recipe_card_mode}
            onChange={(e) => update('recipe_card_mode', e.target.value as Settings['recipe_card_mode'])}
          >
            <option value="before_add">ก่อนเพิ่มลงตะกร้า (แสดงสูตร/วิธีทำเต็ม)</option>
            <option value="icon_only">แสดงเฉพาะไอคอน/สรุปย่อ</option>
          </select>
        </div>
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold">สิทธิ์พนักงาน</h2>
        <div>
          <label className="label">ส่วนลดสูงสุดที่พนักงานให้ได้เอง (บาท)</label>
          <input
            type="number"
            className="input"
            value={form.staff_discount_limit}
            onChange={(e) => update('staff_discount_limit', Number(e.target.value))}
          />
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={save.isPending} onClick={handleSave}>
          {save.isPending ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่า'}
        </button>
        {saved && <span className="text-sm text-green-700">บันทึกแล้ว</span>}
      </div>
    </div>
  )
}
