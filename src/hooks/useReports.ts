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
  topProducts: { name: string; qty: number; total: number }[]
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
  let paymentsData: { method: PaymentMethod; amount: number }[] = []
  if (orderIds.length) {
    const [itemsRes, paymentsRes] = await Promise.all([
      supabase.from('order_items').select('*').in('order_id', orderIds),
      supabase.from('payments').select('method, amount').in('order_id', orderIds),
    ])
    if (itemsRes.error) throw itemsRes.error
    if (paymentsRes.error) throw paymentsRes.error
    items = (itemsRes.data ?? []) as OrderItem[]
    paymentsData = (paymentsRes.data ?? []) as { method: PaymentMethod; amount: number }[]
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
  for (const p of paymentsData) {
    paymentBreakdown[p.method] = round2((paymentBreakdown[p.method] ?? 0) + p.amount)
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
