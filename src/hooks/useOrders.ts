/**
 * useOrders — ดึงออเดอร์ + update prep_status สำหรับ Queue Dashboard (Feature 6)
 * ใช้ refetchInterval แทน Supabase Realtime (polling ทุก 5 วินาที)
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface OrderItem {
  id: string
  product_id: string | null
  name_snapshot: string
  qty: number
  unit_price: number
  line_total: number
  options_json: { name: string }[] | null
}

export interface QueueOrder {
  id: string
  order_no: string | null
  client_uuid: string
  status: string
  prep_status: 'preparing' | 'ready' | 'served' | null
  total: number
  note: string | null
  created_at: string
  items: OrderItem[]
}

/** ออเดอร์ที่ยังไม่ serve — poll ทุก 5 วินาที */
export function useQueueOrders() {
  return useQuery({
    queryKey: ['queue-orders'],
    queryFn: async (): Promise<QueueOrder[]> => {
      const since = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString() // 4 ชั่วโมงย้อนหลัง
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_no, client_uuid, status, prep_status, total, note, created_at, order_items(*)')
        .eq('status', 'paid')
        .neq('prep_status', 'served')
        .gt('created_at', since)
        .order('created_at', { ascending: true })
      if (error) throw error

      return (data ?? []).map((o: any) => ({
        id: o.id,
        order_no: o.order_no,
        client_uuid: o.client_uuid,
        status: o.status,
        prep_status: o.prep_status,
        total: o.total,
        note: o.note,
        created_at: o.created_at,
        items: (o.order_items ?? []) as OrderItem[],
      }))
    },
    refetchInterval: 5000, // poll ทุก 5 วินาที
    staleTime: 0,
  })
}

/** อัปเดต prep_status */
export function useUpdatePrepStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: QueueOrder['prep_status'] }) => {
      const { error } = await supabase
        .from('orders')
        .update({ prep_status: status })
        .eq('id', orderId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['queue-orders'] }),
  })
}
