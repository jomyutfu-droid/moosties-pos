import { formatBahtSymbol } from '@/lib/money'

interface ReceiptInfo {
  orderNo: string
  total: number
  paid: number
  change: number
  createdAt: string
}

export function ReceiptModal({ order, onClose }: { order: ReceiptInfo; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm text-center p-6">
        <div className="text-4xl mb-2">✅</div>
        <h2 className="text-lg font-bold">รับชำระเงินสำเร็จ</h2>
        <p className="text-sm text-gray-500 mt-1">เลขบิล {order.orderNo}</p>
        <p className="text-xs text-gray-400">{new Date(order.createdAt).toLocaleString('th-TH')}</p>

        <div className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <span>ยอดสุทธิ</span>
            <span className="font-medium">{formatBahtSymbol(order.total)}</span>
          </div>
          <div className="flex justify-between">
            <span>รับเงิน</span>
            <span>{formatBahtSymbol(order.paid)}</span>
          </div>
          {order.change > 0 && (
            <div className="flex justify-between">
              <span>เงินทอน</span>
              <span>{formatBahtSymbol(order.change)}</span>
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-5">
          <button className="btn-secondary flex-1" onClick={() => window.print()}>
            พิมพ์ใบเสร็จ
          </button>
          <button className="btn-primary flex-1" onClick={onClose}>
            ปิด
          </button>
        </div>
      </div>
    </div>
  )
}
