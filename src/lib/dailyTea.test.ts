import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({supabase: {rpc: vi.fn()}}))
vi.mock('@/lib/db', () => ({pendingOutboxCount: vi.fn()}))
import { bangkokDate, teaPreview } from './dailyTea'
import { getLowStockIngredients } from '@/domain/stock'
describe('daily tea', () => {
  it('does not treat deferred tea consumption as a low stock alert', () => {
    const row = {id: 'tea', name: 'tea', unit: 'ml', stock_qty: -100, reorder_point: 0, is_active: true, daily_prep: true}
    expect(getLowStockIngredients([row])).toEqual([])
    expect(getLowStockIngredients([{...row, daily_prep: false}])).toHaveLength(1)
  })
  it('assigns closing dates using Bangkok time across UTC midnight', () => {
    expect(bangkokDate('2026-10-04T18:00:00Z')).toBe('2026-10-05')
    expect(bangkokDate('2026-10-04T00:30:00Z')).toBe('2026-10-04')
  })
  it('counts a full batch as powder consumption, including discarded tea', () => {
    expect(teaPreview(600, 100)).toEqual({valid: true, waste: 500, spoons: 3})
    expect(teaPreview(1200, 1100)).toEqual({valid: true, waste: 100, spoons: 6})
  })
  it('rejects insufficient and invalid brewed volume', () => {
    for (const n of [0, -1, 99, NaN, Infinity, 1000001]) expect(teaPreview(n,100).valid).toBe(false)
    expect(teaPreview(0,0).valid).toBe(true)
  })
})
