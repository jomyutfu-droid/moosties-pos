import { cartSubtotal, useCartStore } from '@/store/cart'
import { formatBahtSymbol } from '@/lib/money'

export function CartPanel({ onCheckout }: { onCheckout: () => void }) {
  const lines = useCartStore((s) => s.lines)
  const discount = useCartStore((s) => s.discount)
  const setDiscount = useCartStore((s) => s.setDiscount)
  const incrementLine = useCartStore((s) => s.incrementLine)
  const removeLine = useCartStore((s) => s.removeLine)
  const clear = useCartStore((s) => s.clear)

  const subtotal = cartSubtotal(lines)
  const total = Math.max(0, subtotal - discount)

  return (
    <aside className="w-full md:w-80 border-t md:border-t-0 md:border-l border-gray-200 bg-white flex flex-col">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h2 className="font-bold">ตะกร้า</h2>
        {lines.length > 0 && (
          <button className="text-sm text-red-600" onClick={clear}>
            ล้างตะกร้า
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {lines.length === 0 && <p className="text-gray-400 text-sm text-center py-8">ยังไม่มีรายการ</p>}
        {lines.map((line) => (
          <div key={line.uid} className="border border-gray-200 rounded-xl p-3">
            <div className="flex justify-between">
              <div>
                <div className="font-medium">{line.product.name}</div>
                {line.selectedOptions.length > 0 && (
                  <div className="text-xs text-gray-500">
                    {line.selectedOptions.map((o) => o.name).join(', ')}
                  </div>
                )}
              </div>
              <div className="text-right font-medium">{formatBahtSymbol(line.unitPrice * line.qty)}</div>
            </div>
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2">
                <button className="btn-secondary w-8 h-8 p-0" onClick={() => incrementLine(line.uid, -1)}>
                  -
                </button>
                <span className="w-6 text-center">{line.qty}</span>
                <button className="btn-secondary w-8 h-8 p-0" onClick={() => incrementLine(line.uid, 1)}>
                  +
                </button>
              </div>
              <button className="text-xs text-red-600" onClick={() => removeLine(line.uid)}>
                ลบ
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="p-4 border-t border-gray-200 space-y-2">
        <div className="flex justify-between text-sm">
          <span>ยอดรวม</span>
          <span>{formatBahtSymbol(subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm items-center">
          <span>ส่วนลด</span>
          <input
            type="number"
            className="input w-24 text-right"
            value={discount}
            min={0}
            onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
          />
        </div>
        <div className="flex justify-between font-bold text-lg">
          <span>สุทธิ</span>
          <span>{formatBahtSymbol(total)}</span>
        </div>
        <button className="btn-primary w-full" disabled={lines.length === 0} onClick={onCheckout}>
          ชำระเงิน
        </button>
      </div>
    </aside>
  )
}
