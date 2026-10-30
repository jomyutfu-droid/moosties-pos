import { describe, expect, it } from 'vitest'
import { summarizeBudget, budgetPeriod, budgetToday, type BudgetData, type BudgetEntry } from './shopBudget'
const sale = { day: '2026-10-30', source: 'grab' as const, bills: 2, sales: 200, cogs: 80, missing_cost_bills: 0 }
const entry: BudgetEntry = { id: 'p', kind: 'platform', category: 'grab', entry_date: sale.day, amount: 250, fees: 75, cogs: null, note: '' }
const data = (values: Partial<BudgetData> = {}): BudgetData => ({ sales: [], line_man_days: [], entries: [], ...values })
describe('management profit and loss', () => {
 it('replaces Grab revenue, retains POS cost and subtracts fees exactly once', () => {
  expect(summarizeBudget(data({ sales: [sale], entries: [entry] }))).toMatchObject({ sales: 250, cogs: 80, fees: 75, profit: 95, warnings: [] })
 })
 it('uses explicit cost instead of adding it to POS cost', () => {
  expect(summarizeBudget(data({ sales: [sale], entries: [{ ...entry, cogs: 100 }] })).profit).toBe(75)
 })
 it('shows a loss after wages and rent without counting platform revenue twice', () => {
  const expenses: BudgetEntry[] = [{ ...entry, id: 'w', kind: 'expense', category: 'wages', amount: 100, fees: 0 }, { ...entry, id: 'r', kind: 'expense', category: 'rent', amount: 50, fees: 0 }]
  expect(summarizeBudget(data({ sales: [sale], entries: [entry, ...expenses] }))).toMatchObject({ totalExpenses: 225, profit: -55 })
 })
 it('flags LINE MAN operational orders with missing sales and cost', () => {
  const result = summarizeBudget(data({ line_man_days: [{ day: sale.day, bills: 3 }] }))
  expect(result.sales).toBe(0)
  expect(result.warnings).toHaveLength(2)
 })
 it('flags missing LINE MAN costs even after its revenue has been entered', () => {
  expect(summarizeBudget(data({ entries: [{ ...entry, category: 'line_man' }] })).warnings).toHaveLength(1)
 })
 it('accepts confirmed LINE MAN costs and revenue without a POS financial order', () => {
  expect(summarizeBudget(data({ line_man_days: [{ day: sale.day, bills: 3 }], entries: [{ ...entry, category: 'line_man', cogs: 90 }] }))).toMatchObject({ sales: 250, cogs: 90, profit: 85, warnings: [] })
 })
 it('does not replace another day or channel', () => {
  const result = summarizeBudget(data({ sales: [sale, { ...sale, day: '2026-10-29' }, { ...sale, source: 'store' }], entries: [entry] }))
  expect(result.sales).toBe(650)
  expect(result.cogs).toBe(240)
 })
 it('warns about zero POS costs and unverified platform fees', () => {
  expect(summarizeBudget(data({ sales: [{ ...sale, cogs: 0, missing_cost_bills: 2 }] })).warnings).toHaveLength(2)
 })
 it('uses Bangkok dates around UTC midnight and Monday weeks', () => {
  expect(budgetToday(new Date('2026-10-30T18:00:00Z'))).toBe('2026-10-31')
  expect(budgetPeriod('week', new Date('2026-10-30T18:00:00Z'))).toEqual({ from: '2026-10-26', to: '2026-10-31' })
  expect(budgetPeriod('month', new Date('2026-10-31T18:00:00Z'))).toEqual({ from: '2026-11-01', to: '2026-11-01' })
 })
})
