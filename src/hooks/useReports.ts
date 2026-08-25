import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { round2 } from '@/lib/money'
import type { OrderItem, PaymentMethod } from '@/types'

export interface SalesSummary {
  orderCount: number
  subtotal: number
  discount: number
  total: number
  cogsTotal: number
  profit: number
  paymentBreakdown: Record<PaymentMethod, number>
  grabTotal: number
  topProducts: { name: string; qty: number; total: number }[]
}

export interface DailySalesSummary extends SalesSummary {
  date: string
}

function startOfDayISO(date: Date): string {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function endOfDayISO(date: Date): string {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}

async function fetchSalesSummary(fromISO: string, toISO: string): Promise<SalesSummary> {
  const ordersRes = await supabase
    .from('orders')
    .select('id, subtotal, discount, total, cogs_total')
    .eq('status', 'paid')
    .gte('created_at', fromISO)
    .lte('created_at', toISO)
  if (ordersRes.error) throw ordersRes.error
  const orders = ordersRes.data ?? []
  const orderIds = orders.map((o) => o.id)

  let items: OrderItem[] = []
  let paymentsData: { method: PaymentMethod; amount: number; ref: string | null }[] = []
  if (orderIds.length) {
    const [itemsRes, paymentsRes] = await Promise.all([
      supabase.from('order_items').select('*').in('order_id', orderIds),
      supabase.from('payments').select('method, amount, ref').in('order_id', orderIds),
    ])
    if (itemsRes.error) throw itemsRes.error
    if (paymentsRes.error) throw paymentsRes.error
    items = (itemsRes.data ?? []) as OrderItem[]
    paymentsData = (paymentsRes.data ?? []) as { method: PaymentMethod; amount: number; ref: string | null }[]
  }

  const subtotal = round2(orders.reduce((s, o) => s + (o.subtotal as number), 0))
  const discount = round2(orders.reduce((s, o) => s + (o.discount as number), 0))
  const total = round2(orders.reduce((s, o) => s + (o.total as number), 0))
  const cogsTotal = round2(orders.reduce((s, o) => s + (o.cogs_total as number), 0))

  const paymentBreakdown: Record<PaymentMethod, number> = {
    cash: 0,
    promptpay: 0,
    stored_value: 0,
    card: 0,
    other: 0,
  }
  let grabTotal = 0
  for (const p of paymentsData) {
    if (p.method === 'other' && p.ref?.trim().toLowerCase() === 'grab') {
      grabTotal = round2(grabTotal + p.amount)
    } else {
      paymentBreakdown[p.method] = round2((paymentBreakdown[p.method] ?? 0) + p.amount)
    }
  }

  const productMap = new Map<string, { qty: number; total: number }>()
  for (const item of items) {
    const existing = productMap.get(item.name_snapshot) ?? { qty: 0, total: 0 }
    existing.qty += item.qty
    existing.total = round2(existing.total + item.line_total)
    productMap.set(item.name_snapshot, existing)
  }
  const topProducts = Array.from(productMap.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10)

  return {
    orderCount: orders.length,
    subtotal,
    discount,
    total,
    cogsTotal,
    profit: round2(total - cogsTotal),
    paymentBreakdown,
    grabTotal,
    topProducts,
  }
}

export function useTodaySummary() {
  const today = new Date()
  return useQuery({
    queryKey: ['sales-summary', 'today', today.toDateString()],
    queryFn: () => fetchSalesSummary(startOfDayISO(today), endOfDayISO(today)),
    refetchInterval: 60_000,
  })
}

export function useSalesByDateRange(from: string, to: string) {
  return useQuery({
    queryKey: ['sales-summary', 'range', from, to],
    queryFn: () => fetchSalesSummary(startOfDayISO(new Date(from)), endOfDayISO(new Date(to))),
    enabled: !!from && !!to,
  })
}

function localDateKey(iso: string) {
  const date = new Date(iso)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function emptyDailySummary(date: string): DailySalesSummary {
  return {
    date,
    orderCount: 0,
    subtotal: 0,
    discount: 0,
    total: 0,
    cogsTotal: 0,
    profit: 0,
    paymentBreakdown: { cash: 0, promptpay: 0, stored_value: 0, card: 0, other: 0 },
    grabTotal: 0,
    topProducts: [],
  }
}

/** สรุปยอดแต่ละวันจากบิลที่ชำระเงินจริง ใช้เวลา local ของเครื่อง POS */
async function fetchDailySalesSummary(fromISO: string, toISO: string): Promise<DailySalesSummary[]> {
  const ordersRes = await supabase
    .from('orders')
    .select('id, created_at, subtotal, discount, total, cogs_total')
    .eq('status', 'paid')
    .gte('created_at', fromISO)
    .lte('created_at', toISO)
  if (ordersRes.error) throw ordersRes.error
  const orders = ordersRes.data ?? []
  const orderIds = orders.map((order) => order.id)
  if (!orderIds.length) return []

  const [itemsRes, paymentsRes] = await Promise.all([
    supabase.from('order_items').select('order_id, name_snapshot, qty, line_total').in('order_id', orderIds),
    supabase.from('payments').select('order_id, method, amount, ref').in('order_id', orderIds),
  ])
  if (itemsRes.error) throw itemsRes.error
  if (paymentsRes.error) throw paymentsRes.error

  const itemsByOrder = new Map<string, { name_snapshot: string; qty: number; line_total: number }[]>()
  for (const item of itemsRes.data ?? []) {
    const list = itemsByOrder.get(item.order_id) ?? []
    list.push(item)
    itemsByOrder.set(item.order_id, list)
  }
  const paymentsByOrder = new Map<string, { method: PaymentMethod; amount: number; ref: string | null }[]>()
  for (const payment of paymentsRes.data ?? []) {
    const list = paymentsByOrder.get(payment.order_id) ?? []
    list.push(payment as { method: PaymentMethod; amount: number; ref: string | null })
    paymentsByOrder.set(payment.order_id, list)
  }

  const summaries = new Map<string, DailySalesSummary>()
  for (const order of orders) {
    const date = localDateKey(order.created_at)
    const summary = summaries.get(date) ?? emptyDailySummary(date)
    summary.orderCount += 1
    summary.subtotal = round2(summary.subtotal + Number(order.subtotal ?? 0))
    summary.discount = round2(summary.discount + Number(order.discount ?? 0))
    summary.total = round2(summary.total + Number(order.total ?? 0))
    summary.cogsTotal = round2(summary.cogsTotal + Number(order.cogs_total ?? 0))

    for (const payment of paymentsByOrder.get(order.id) ?? []) {
      if (payment.method === 'other' && payment.ref?.trim().toLowerCase() === 'grab') {
        summary.grabTotal = round2(summary.grabTotal + Number(payment.amount ?? 0))
      } else {
        summary.paymentBreakdown[payment.method] = round2((summary.paymentBreakdown[payment.method] ?? 0) + Number(payment.amount ?? 0))
      }
    }

    const productMap = new Map<string, { name: string; qty: number; total: number }>()
    for (const item of itemsByOrder.get(order.id) ?? []) {
      const current = productMap.get(item.name_snapshot) ?? { name: item.name_snapshot, qty: 0, total: 0 }
      current.qty += Number(item.qty ?? 0)
      current.total = round2(current.total + Number(item.line_total ?? 0))
      productMap.set(item.name_snapshot, current)
    }
    const existingProducts = new Map(summary.topProducts.map((item) => [item.name, item]))
    for (const item of productMap.values()) {
      const current = existingProducts.get(item.name) ?? { name: item.name, qty: 0, total: 0 }
      current.qty += item.qty
      current.total = round2(current.total + item.total)
      existingProducts.set(item.name, current)
    }
    summary.topProducts = Array.from(existingProducts.values()).sort((a, b) => b.qty - a.qty).slice(0, 10)
    summary.profit = round2(summary.total - summary.cogsTotal)
    summaries.set(date, summary)
  }

  return Array.from(summaries.values()).sort((a, b) => b.date.localeCompare(a.date))
}

export function useDailySalesByDateRange(from: string, to: string) {
  return useQuery({
    queryKey: ['sales-summary', 'daily', from, to],
    queryFn: () => fetchDailySalesSummary(startOfDayISO(new Date(from)), endOfDayISO(new Date(to))),
    enabled: !!from && !!to,
  })
}
