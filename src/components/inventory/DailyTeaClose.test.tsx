import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({supabase: {rpc: vi.fn()}}))
vi.mock('@/lib/db', () => ({pendingOutboxCount: vi.fn()}))
import { DailyTeaClose } from './DailyTeaClose'
import { normalizeTeaData, type TeaData, type TeaTotal } from '@/lib/dailyTea'

const base: TeaData = {date: '2026-10-06', used_ml: 100, grams_per_spoon: 5, started_at: '2026-10-04T00:00:00Z', can_manage: true, total: null, history: []}
const saved: TeaTotal = {id: 'saved', business_date: base.date, brewed_ml: 600, used_ml: 100, waste_ml: 500, spoons: 3, powder_grams: 15, revision: 1, current_used_ml: 100}
function render(data: TeaData, enabled = false) {
  return renderToStaticMarkup(<DailyTeaClose data={data} loading={false} error={null} enabled={enabled} brewed="600" onEnabled={() => {}} onBrewed={() => {}} refresh={() => {}} />)
}
describe('daily tea closing status', () => {
  it('shows the closing checkbox for an unsummarized day', () => {
    const html = render(base)
    expect(html).toContain('วันนี้ยังไม่ได้สรุปชา')
    expect(html).toContain('type="checkbox"')
    expect(html).not.toContain('สรุปแล้ว:')
  })
  it('normalizes the old null-field response for both display and close submission', () => {
    const legacy = {...base, total: {id: null, brewed_ml: null, waste_ml: null} as unknown as TeaTotal}
    expect(normalizeTeaData(legacy).total).toBeNull()
    expect(render(legacy, true)).toContain('id="daily-tea-volume"')
    expect(render(legacy)).not.toContain('สรุปแล้ว:')
  })
  it('renders a 600 ml batch and 500 ml waste when closing is selected', () => {
    const html = render(normalizeTeaData(base), true)
    expect(html).toContain('id="daily-tea-volume"')
    expect(html).toContain('ชง 600 · ใช้ 100 · ทิ้ง 500 มล. · ผงชา 3 ช้อนโต๊ะ')
  })
  it('keeps real summaries and directs staff to correction without duplicate closing', () => {
    const data = {...base, total: saved, used_ml: 200}
    expect(normalizeTeaData(data).total).toBe(saved)
    const html = render(data, true)
    expect(html).toContain('สรุปแล้ว: ชง 600 มล. · ทิ้ง 500 มล.')
    expect(html).toContain('กรุณาตรวจและยืนยันยอดอีกครั้ง')
    expect(html).not.toContain('เจ้าของ')
    expect(html).not.toContain('id="daily-tea-volume"')
  })
})
