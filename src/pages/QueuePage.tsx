/**
 * Feature 6: QueuePage — Dashboard คิวออเดอร์ (poll ทุก 5 วินาที)
 * แสดงออเดอร์ที่ status='paid' และ prep_status != 'served' ย้อนหลัง 4 ชั่วโมง
 */
import { useQueueOrders, useUpdatePrepStatus } from '@/hooks/useOrders'
import type { QueueOrder } from '@/hooks/useOrders'

const STATUS_LABELS: Record<string, { label: string; next: QueueOrder['prep_status']; color: string }> = {
  preparing: { label: '🔥 กำลังทำ', next: 'ready', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  ready:     { label: '✅ พร้อมเสิร์ฟ', next: 'served', color: 'bg-green-100 text-green-800 border-green-300' },
  served:    { label: '🏁 เสิร์ฟแล้ว', next: null, color: 'bg-gray-100 text-gray-500 border-gray-200' },
}

export default function QueuePage() {
  const { data: orders, isLoading, error } = useQueueOrders()
  const updateStatus = useUpdatePrepStatus()

  if (isLoading) return <div className="p-6 text-gray-500">กำลังโหลด…</div>
  if (error) return <div className="p-6 text-red-500">โหลดไม่สำเร็จ</div>

  if (!orders?.length) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold text-gray-800 mb-4">คิวออเดอร์</h1>
        <div className="card p-8 text-center text-gray-400">ไม่มีออเดอร์ที่รอดำเนินการ</div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">คิวออเดอร์</h1>
        <span className="text-sm text-gray-400">รีเฟรชอัตโนมัติทุก 5 วินาที</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {orders.map((order) => {
          const statusInfo = STATUS_LABELS[order.prep_status ?? 'preparing'] ?? STATUS_LABELS['preparing']
          const age = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60_000)

          return (
            <div key={order.id} className={`card border-2 ${statusInfo.color} p-4 space-y-3`}>
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <span className="font-bold text-lg">{order.order_no ?? order.id.slice(0, 8)}</span>
                  <p className="text-xs text-gray-500 mt-0.5">{age} นาทีที่แล้ว</p>
                </div>
                <span className="text-sm font-medium px-2 py-0.5 rounded-full border">{statusInfo.label}</span>
              </div>

              {/* Items */}
              <ul className="space-y-1">
                {order.items.map((item) => (
                  <li key={item.id} className="text-sm">
                    <span className="font-medium">{item.qty}x {item.name_snapshot}</span>
                    {item.options_json?.length ? (
                      <span className="text-gray-500 ml-1 text-xs">
                        ({item.options_json.map((o) => o.name).join(', ')})
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>

              {order.note && (
                <p className="text-sm bg-yellow-50 border border-yellow-200 rounded-lg px-2 py-1 text-yellow-800">
                  📝 {order.note}
                </p>
              )}

              {/* Action */}
              {statusInfo.next && (
                <button
                  className="btn-primary w-full text-sm"
                  disabled={updateStatus.isPending}
                  onClick={() => updateStatus.mutate({ orderId: order.id, status: statusInfo.next })}
                >
                  {statusInfo.next === 'ready' ? 'พร้อมเสิร์ฟแล้ว →' : 'เสิร์ฟแล้ว ✓'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
