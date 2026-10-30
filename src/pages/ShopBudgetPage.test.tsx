import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ data: { sales: [{ day: '2026-10-30', source: 'store', bills: 1, sales: 100, cogs: 40, missing_cost_bills: 0 }], line_man_days: [], entries: [] }, isError: false, error: new Error('โหลดไม่สำเร็จ'), mutateAsync: vi.fn() }))
vi.mock('@/hooks/useShopBudget', () => ({ useShopBudget: () => ({ data: state.data, isError: state.isError, error: state.error, isLoading: false, isFetching: false, refetch: vi.fn(), receipt: vi.fn(), mutation: { mutateAsync: state.mutateAsync, isPending: false } }) }))
vi.mock('@/components/MenuAnalytics', () => ({ MenuAnalytics: () => null }))
import ShopBudgetPage from './ShopBudgetPage'
let tree: ReactTestRenderer
function open() { act(() => { tree = create(<ShopBudgetPage />) }) }
afterEach(() => { act(() => tree?.unmount()); state.isError = false; vi.clearAllMocks() })
describe('shop budget page', () => {
 it('shows the requested title and marks profit as preliminary', () => {
  open()
  expect(tree.root.findByType('h1').children.join('')).toBe('งบบริหารร้าน')
  const text = JSON.stringify(tree.toJSON())
  expect(text).toContain('กำไรเบื้องต้น')
  expect(text).toContain('฿60.00')
  expect(text).toContain('ยังไม่มีค่าใช้จ่าย')
 })
 it('opens an expense draft without writing anything and allows cancellation', () => {
  open()
  const button = tree.root.findAllByType('button').find(b => b.children.includes('＋ บันทึกค่าใช้จ่าย'))!
  act(() => button.props.onClick())
  expect(tree.root.findByProps({ role: 'dialog' })).toBeTruthy()
  expect(state.mutateAsync).not.toHaveBeenCalled()
  act(() => tree.root.findAllByType('button').find(b => b.children.includes('ยกเลิก'))!.props.onClick())
  expect(tree.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
 })
 it('hides monetary totals when loading fails instead of presenting zero profit', () => {
  state.isError = true; open()
  expect(tree.root.findByProps({ role: 'alert' })).toBeTruthy()
  expect(JSON.stringify(tree.toJSON())).not.toContain('฿60.00')
 })
})
