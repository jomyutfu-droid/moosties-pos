import type { BudgetChannel } from './shopBudget'
export interface MenuAnalyticsRow {
 key: string; product_id: string | null; name: string; source: BudgetChannel; qty: number;
 revenue: number; cost: number; revenue_qty: number; cost_qty: number; complete_qty: number; profit: number
}
export interface MenuAnalyticsData {
 rows: MenuAnalyticsRow[]
 catalog: { id: string; name: string; active: boolean; created: string }[]
}
export function analyzeMenus(data: MenuAnalyticsData, channel: BudgetChannel | 'all', from: string, to: string) {
 const catalog = new Map(data.catalog.map(p => [p.id,p]))
 const map = new Map<string, MenuAnalyticsRow>()
 for (const row of data.rows.filter(r => channel === 'all' || r.source === channel)) {
  const current = map.get(row.key) ?? { ...row, name: catalog.get(row.product_id ?? '')?.name ?? row.name, qty: 0, revenue: 0, cost: 0, revenue_qty: 0, cost_qty: 0, complete_qty: 0, profit: 0 }
  for (const key of ['qty','revenue','cost','revenue_qty','cost_qty','complete_qty','profit'] as const) current[key] += Number(row[key])
  map.set(row.key,current)
 }
 const rows = [...map.values()].map(r => ({ ...r, active: catalog.get(r.product_id ?? '')?.active ?? false,
  isNew: (catalog.get(r.product_id ?? '')?.created ?? '') >= from,
  avgCost: r.cost_qty > 0 ? r.cost / r.cost_qty : null,
  avgPrice: r.revenue_qty > 0 ? r.revenue / r.revenue_qty : null,
  avgProfit: r.complete_qty > 0 ? r.profit / r.complete_qty : null,
  margin: r.complete_qty === r.qty && r.revenue > 0 ? r.profit / r.revenue * 100 : null,
  complete: r.qty > 0 && r.complete_qty === r.qty,
 }))
 const tie = (a: { name: string; key: string }, b: { name: string; key: string }) => a.name.localeCompare(b.name,'th') || a.key.localeCompare(b.key)
 const top = [...rows].sort((a,b) => b.qty-a.qty || tie(a,b)).slice(0,5)
 const low = rows.filter(r => r.active && r.qty>0).sort((a,b) => a.qty-b.qty || tie(a,b)).slice(0,5)
 const profit = rows.filter(r => r.complete).sort((a,b) => a.avgProfit!-b.avgProfit! || tie(a,b)).slice(0,5)
 const margin = rows.filter(r => r.complete && r.margin!=null).sort((a,b) => a.margin!-b.margin! || tie(a,b)).slice(0,5)
 const zero = data.catalog.filter(p => p.active && p.created<=to && !map.has(p.id)).map(p => ({ ...p, isNew: p.created>=from }))
 const qty=rows.reduce((s,r)=>s+r.qty,0),costQty=rows.reduce((s,r)=>s+r.cost_qty,0),completeQty=rows.reduce((s,r)=>s+r.complete_qty,0)
 return { top,low,profit,margin,zero,qty,costQty,completeQty,
  avgCost:costQty ? rows.reduce((s,r)=>s+r.cost,0)/costQty : null,
  avgProfit:completeQty ? rows.reduce((s,r)=>s+r.profit,0)/completeQty : null,
  excluded: rows.filter(r=>!r.complete).length }
}
export type AnalyzedMenu = ReturnType<typeof analyzeMenus>['top'][number]
