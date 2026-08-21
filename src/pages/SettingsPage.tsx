import { useEffect, useState } from 'react'
import { useSaveSettings, useSettings } from '@/hooks/useSettings'
import { parseUnsignedNumber } from '@/lib/forms'
import { explainSupabaseError } from '@/lib/errors'
import { NumberField } from '@/components/NumberField'
import { BUSINESS_DAY_LABELS, validateBusinessHours } from '@/lib/businessHours'
import type { Settings, BusinessDaySetting, SpecialBusinessDate } from '@/types'

export default function SettingsPage() {
  const { data: settings, isLoading } = useSettings()
  const save = useSaveSettings()
  const [form, setForm] = useState<Settings | null>(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    setError(null)
  }

  async function handleSave() {
    if (!form) return
    setError(null)
    const scheduleError = validateBusinessHours(form.business_hours)
    if (scheduleError) {
      setError(scheduleError)
      return
    }
    // ต้องจับ error เอง — mutateAsync ที่ล้มเหลวจะ throw แล้วเงียบไปเฉย ๆ ถ้าไม่ครอบ try/catch
    // ก่อนหน้านี้ไม่มีการจับเลย ปุ่ม "บันทึก" จึงดูเหมือนไม่ทำอะไรตอนบันทึกไม่สำเร็จ (เช่น RLS ปฏิเสธ)
    try {
      await save.mutateAsync(form)
      setSaved(true)
    } catch (err) {
      setError(explainSupabaseError(err, 'บันทึกไม่สำเร็จ'))
    }
  }

  function updateBusinessHours(next: (value: Settings['business_hours']) => Settings['business_hours']) {
    setForm((current) => current ? { ...current, business_hours: next(current.business_hours) } : current)
    setSaved(false)
    setError(null)
  }

  function updateWeeklyDay(day: number, patch: Partial<BusinessDaySetting>) {
    updateBusinessHours((hours) => ({
      ...hours,
      weekly: hours.weekly.map((row) => row.day === day ? { ...row, ...patch } : row),
    }))
  }

  function addSpecialDate() {
    const date = new Date()
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const next: SpecialBusinessDate = {
      date: dateKey,
      label: 'วันหยุดพิเศษ',
      mode: 'closed',
      open_time: '10:00',
      close_time: '19:00',
      allow_ot: true,
    }
    updateBusinessHours((hours) => ({ ...hours, special_dates: [...hours.special_dates, next] }))
  }

  function updateSpecialDate(index: number, patch: Partial<SpecialBusinessDate>) {
    updateBusinessHours((hours) => ({
      ...hours,
      special_dates: hours.special_dates.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row),
    }))
  }

  function removeSpecialDate(index: number) {
    updateBusinessHours((hours) => ({
      ...hours,
      special_dates: hours.special_dates.filter((_, rowIndex) => rowIndex !== index),
    }))
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
          <NumberField
            className="input"
            value={form.vat_percent}
            parse={parseUnsignedNumber}
            onChange={(n) => update('vat_percent', n)}
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
          <NumberField
            className="input"
            value={form.target_margin_percent}
            parse={parseUnsignedNumber}
            onChange={(n) => update('target_margin_percent', n)}
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
          <NumberField
            className="input"
            value={form.staff_discount_limit}
            parse={parseUnsignedNumber}
            onChange={(n) => update('staff_discount_limit', n)}
          />
        </div>
      </section>

      <section className="card p-4 space-y-4">
        <div>
          <h2 className="font-semibold">เวลาทำการและกฎ OT</h2>
          <p className="text-xs text-gray-500 mt-1">
            กำหนดวันเปิดร้านและช่วงเวลางานปกติ ส่วนเวลาหลังปิดร้านหรือวันที่ปิดแต่อนุญาต OT
            การขอ OT ปิดร้านให้พนักงานส่งผ่านแบบฟอร์ม OT ปิดร้าน ส่วนเวลาออกงานใช้เก็บประวัติเท่านั้น
          </p>
        </div>

        <div className="space-y-2">
          {form.business_hours.weekly.map((day) => (
            <div key={day.day} className="rounded-xl border border-gray-100 bg-white/50 p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 w-32 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={day.is_open}
                    onChange={(event) => updateWeeklyDay(day.day, { is_open: event.target.checked })}
                  />
                  {BUSINESS_DAY_LABELS[day.day]}
                </label>
                {day.is_open ? (
                  <div className="flex items-center gap-2 text-sm">
                    <input
                      type="time"
                      className="input w-auto"
                      value={day.open_time}
                      onChange={(event) => updateWeeklyDay(day.day, { open_time: event.target.value })}
                      aria-label={`${BUSINESS_DAY_LABELS[day.day]} เวลาเปิด`}
                    />
                    <span className="text-gray-400">ถึง</span>
                    <input
                      type="time"
                      className="input w-auto"
                      value={day.close_time}
                      onChange={(event) => updateWeeklyDay(day.day, { close_time: event.target.value })}
                      aria-label={`${BUSINESS_DAY_LABELS[day.day]} เวลาปิด`}
                    />
                  </div>
                ) : (
                  <span className="text-sm text-gray-400">ปิดร้าน</span>
                )}
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-600 ml-1">
                <input
                  type="checkbox"
                  checked={day.allow_ot}
                  onChange={(event) => updateWeeklyDay(day.day, { allow_ot: event.target.checked })}
                />
                {day.is_open ? 'อนุญาต OT หลังเวลาปิด' : 'อนุญาตให้พนักงานเข้ามาทำ OT ในวันปิด'}
              </label>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-100 pt-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-medium text-sm">วันหยุดพิเศษ / วันเปิดพิเศษ</h3>
              <p className="text-xs text-gray-500 mt-1">ใช้แทนกฎประจำสัปดาห์เฉพาะวันที่ระบุ</p>
            </div>
            <button type="button" className="btn-secondary text-xs" onClick={addSpecialDate}>เพิ่มวันพิเศษ</button>
          </div>

          {form.business_hours.special_dates.length === 0 && (
            <p className="text-sm text-gray-400 rounded-lg bg-gray-50 px-3 py-3">ยังไม่ได้กำหนดวันพิเศษ</p>
          )}

          {form.business_hours.special_dates.map((special, index) => (
            <div key={`${special.date}-${index}`} className="rounded-xl border border-gray-100 bg-white/50 p-3 space-y-3">
              <div className="flex flex-wrap gap-2 items-end">
                <div className="flex-1 min-w-[140px]">
                  <label className="label">วันที่</label>
                  <input
                    type="date"
                    className="input"
                    value={special.date}
                    onChange={(event) => updateSpecialDate(index, { date: event.target.value })}
                  />
                </div>
                <div className="flex-[2] min-w-[180px]">
                  <label className="label">ชื่อวัน/เหตุผล</label>
                  <input
                    className="input"
                    value={special.label}
                    onChange={(event) => updateSpecialDate(index, { label: event.target.value })}
                    placeholder="เช่น วันหยุดนักขัตฤกษ์"
                  />
                </div>
                <button type="button" className="btn-ghost text-xs text-red-600" onClick={() => removeSpecialDate(index)}>ลบ</button>
              </div>

              <div className="flex flex-wrap gap-3 items-center text-sm">
                <label className="flex items-center gap-2">
                  <span>สถานะร้าน</span>
                  <select
                    className="input w-auto"
                    value={special.mode}
                    onChange={(event) => updateSpecialDate(index, { mode: event.target.value as SpecialBusinessDate['mode'] })}
                  >
                    <option value="closed">ปิดร้าน</option>
                    <option value="open">เปิดร้าน</option>
                  </select>
                </label>
                {special.mode === 'open' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      className="input w-auto"
                      value={special.open_time}
                      onChange={(event) => updateSpecialDate(index, { open_time: event.target.value })}
                    />
                    <span className="text-gray-400">ถึง</span>
                    <input
                      type="time"
                      className="input w-auto"
                      value={special.close_time}
                      onChange={(event) => updateSpecialDate(index, { close_time: event.target.value })}
                    />
                  </div>
                )}
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={special.allow_ot}
                  onChange={(event) => updateSpecialDate(index, { allow_ot: event.target.checked })}
                />
                {special.mode === 'closed' ? 'อนุญาตให้พนักงานเข้ามาทำ OT ในวันนี้' : 'อนุญาต OT หลังเวลาปิด'}
              </label>
            </div>
          ))}
        </div>
      </section>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 whitespace-pre-line">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={save.isPending} onClick={handleSave}>
          {save.isPending ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่า'}
        </button>
        {saved && <span className="text-sm text-green-700">บันทึกแล้ว</span>}
      </div>
    </div>
  )
}
