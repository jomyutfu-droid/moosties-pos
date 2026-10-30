import { round2 } from '@/lib/money'
export type BudgetChannel = 'store' | 'grab' | 'line_man'
export const channelLabels = { store: 'หน้าร้าน', grab: 'Grab', line_man: 'LINE MAN' }
export const expenseLabels = { wages: 'ค่าแรงและโบนัส', rent: 'ค่าเช่า', utilities: 'ค่าน้ำ / ค่าไฟ', waste: 'ต้นทุนของเสีย', other: 'ค่าใช้จ่ายอื่น' }
export type ExpenseCategory = keyof typeof expenseLabels
export interface BudgetEntry {
 id: string; entry_date: string; kind: 'expense' | 'platform'; category: ExpenseCategory | 'grab' | 'line_man';
 amount: number; fees: number; cogs: number | null; note: string; updated_at?: string; has_receipt?: boolean; receipt?: string | null
}
export interface BudgetData {
 sales: { day: string; source: BudgetChannel; bills: number; sales: number; cogs: number; missing_cost_bills: number }[]
 line_man_days: { day: string; bills: number }[]
 entries: BudgetEntry[]
}
export function budgetToday(now = new Date()) {
 return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
export function budgetPeriod(period: 'today' | 'week' | 'month', now = new Date()) {
 const to = budgetToday(now)
 const d = new Date(`${to}T00:00:00Z`)
 if (period === 'month') d.setUTCDate(1)
 if (period === 'week') d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7)
 return { from: d.toISOString().slice(0, 10), to }
}
export function summarizeBudget(data: BudgetData) {
 const days = new Map<string, { day: string; source: BudgetChannel; sales: number; cogs: number; fees: number; missing: boolean; verified: boolean; bills: number }>()
 for (const s of data.sales) days.set(`${s.day}:${s.source}`, { ...s, sales: Number(s.sales), cogs: Number(s.cogs), fees: 0, missing: Number(s.missing_cost_bills) > 0, verified: s.source === 'store', bills: Number(s.bills) })
 for (const l of data.line_man_days) {
  const key = `${l.day}:line_man`
  const existing = days.get(key)
  days.set(key, { day: l.day, source: 'line_man', sales: existing?.sales ?? 0, cogs: existing?.cogs ?? 0, fees: 0, missing: true, verified: false, bills: Number(l.bills) + (existing?.bills ?? 0) })
 }
 for (const entry of data.entries.filter(e => e.kind === 'platform')) {
  const source = entry.category as 'grab' | 'line_man'
  const key = `${entry.entry_date}:${source}`
  const existing = days.get(key)
  // A statement replaces the whole channel/day revenue, never adds it again.
  days.set(key, { day: entry.entry_date, source, sales: Number(entry.amount), fees: Number(entry.fees),
   cogs: entry.cogs == null ? existing?.cogs ?? 0 : Number(entry.cogs),
   missing: entry.cogs == null && (source === 'line_man' || !existing || existing.missing), verified: true, bills: existing?.bills ?? 0 })
 }
 const channels = (Object.keys(channelLabels) as BudgetChannel[]).map(source => {
  const rows = [...days.values()].filter(d => d.source === source)
  return { source, sales: round2(rows.reduce((s, d) => s + d.sales, 0)), cogs: round2(rows.reduce((s, d) => s + d.cogs, 0)), fees: round2(rows.reduce((s, d) => s + d.fees, 0)) }
 })
 const expenses = (Object.keys(expenseLabels) as ExpenseCategory[]).map(category => ({ category, amount: round2(data.entries.filter(e => e.kind === 'expense' && e.category === category).reduce((s, e) => s + Number(e.amount), 0)) }))
 const sales = round2(channels.reduce((s, c) => s + c.sales, 0))
 const cogs = round2(channels.reduce((s, c) => s + c.cogs, 0))
 const fees = round2(channels.reduce((s, c) => s + c.fees, 0))
 const operating = round2(expenses.reduce((s, e) => s + e.amount, 0))
 const warnings = [...days.values()].flatMap(d => [
  ...(!d.verified ? [`${d.day} · ${channelLabels[d.source]} ยังไม่บันทึกยอดขายและค่าธรรมเนียมจากแพลตฟอร์ม`] : []),
  ...(d.missing ? [`${d.day} · ${channelLabels[d.source]} ยังมีต้นทุนไม่ครบหรือไม่ได้ยืนยันต้นทุน`] : []),
 ])
 return { channels, expenses, sales, cogs, fees, operating, totalExpenses: round2(fees + operating), gross: round2(sales - cogs), profit: round2(sales - cogs - fees - operating), warnings }
}
