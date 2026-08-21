/**
 * Feature 6: QueuePage — Dashboard คิวออเดอร์ (poll ทุก 5 วินาที)
 * แสดงออเดอร์ที่ status='paid' และ prep_status != 'served' ย้อนหลัง 4 ชั่วโมง
 */
import { useQueueOrders, useUpdatePrepStatus } from '@/hooks/useOrders'
import type { QueueOrder } from '@/hooks/useOrders'

const STATUS_CONFIG: Record<
  string,
  { label: string; next: QueueOrder['prep_status']; borderClass: string; ageLabelColor: string }
> = {
  preparing: {
    label: '🔥 กำลังทำ',
    next: 'ready',
    borderClass: 'queue-border-amber',
    ageLabelColor: '#c07f0a',
  },
  ready: {
    label: '✅ พร้อมเสิร์ฟ',
    next: 'served',
    borderClass: 'queue-border-green',
    ageLabelColor: '#16a34a',
  },
  served: {
    label: '🏁 เสิร์ฟแล้ว',
    next: null,
    borderClass: 'queue-border-gray',
    ageLabelColor: '#8a8f8b',
  },
}

export default function QueuePage() {
  const { data: orders, isLoading, error } = useQueueOrders()
  const updateStatus = useUpdatePrepStatus()

  if (isLoading) return <div className="p-6" style={{ color: '#5c7466' }}>กำลังโหลด…</div>
  if (error) return <div className="p-6 text-red-500">โหลดไม่สำเร็จ</div>

  if (!orders?.length) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-extrabold mb-4" style={{ color: '#123524' }}>คิวออเดอร์</h1>
        <div className="card p-10 text-center text-sm" style={{ color: '#5c7466' }}>
          ไม่มีออเดอร์ที่รอดำเนินการ
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold" style={{ color: '#123524' }}>คิวออเดอร์</h1>
        <div
          className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold"
          style={{
            background: 'rgba(255,255,255,.62)',
            backdropFilter: 'blur(14px)',
            border: '1px solid rgba(255,255,255,.82)',
            color: '#5c7466',
          }}
        >
          <span className="w-2 h-2 rounded-full bg-brand-600 moo-pulse" />
          รีเฟรชอัตโนมัติทุก 5 วินาที
        </div>
      </div>

      {/* 3-column grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {(['preparing', 'ready', 'served'] as const).map((status) => {
          const cfg = STATUS_CONFIG[status]
          const statusOrders = orders.filter((o) => (o.prep_status ?? 'preparing') === status)
          return (
            <div key={status} className="flex flex-col gap-3">
              {/* Column header */}
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full flex-none ${
                    status === 'preparing'
                      ? 'bg-amber-400'
                      : status === 'ready'
                      ? 'bg-brand-600'
                      : 'bg-gray-400'
                  }`}
                />
                <span className="font-bold text-sm" style={{ color: '#123524' }}>
                  {cfg.label} · {statusOrders.length}
                </span>
              </div>

              {/* Order cards */}
              {statusOrders.map((order) => {
                const age = Math.floor(
                  (Date.now() - new Date(order.created_at).getTime()) / 60_000,
                )
                return (
                  <div
                    key={order.id}
                    className={`card p-4 space-y-3 ${cfg.borderClass} ${
                      status === 'served' ? 'opacity-60' : ''
                    }`}
                  >
                    {/* Order no + age */}
                    <div className="flex items-baseline justify-between">
                      <span className="font-extrabold text-2xl" style={{ color: '#123524' }}>
                        {order.order_no ?? order.id.slice(0, 8)}
                      </span>
                      <span className="text-xs font-semibold" style={{ color: cfg.ageLabelColor }}>
                        {status === 'ready' ? 'พร้อมแล้ว' : `${age} นาทีที่แล้ว`}
                      </span>
                    </div>

                    {/* Items */}
                    <div className="text-sm leading-relaxed" style={{ color: '#5c7466' }}>
                      {order.items
                        .map(
                          (item) =>
                            `${item.name_snapshot} x${item.qty}${
                              item.options_json?.length
                                ? ` (${item.options_json.map((o) => o.name).join(', ')})`
                                : ''
                            }`,
                        )
                        .join(' · ')}
                    </div>

                    {/* Note */}
                    {order.note && (
                      <div
                        className="text-xs px-3 py-1.5 rounded-[10px]"
                        style={{
                          background: 'rgba(245,158,11,.14)',
                          border: '1px solid rgba(245,158,11,.3)',
                          color: '#a8720a',
                        }}
                      >
                        📝 {order.note}
                      </div>
                    )}

                    {/* Action button */}
                    {cfg.next && (
                      <button
                        className={`w-full h-12 rounded-[14px] font-bold text-sm ${
                          cfg.next === 'ready' ? 'btn-primary' : 'btn-secondary'
                        }`}
                        disabled={updateStatus.isPending}
                        onClick={() =>
                          updateStatus.mutate({ orderId: order.id, status: cfg.next })
                        }
                      >
                        {cfg.next === 'ready' ? 'พร้อมเสิร์ฟแล้ว →' : 'เสิร์ฟแล้ว ✓'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
