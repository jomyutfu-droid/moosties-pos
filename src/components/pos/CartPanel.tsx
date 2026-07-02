import { useState } from 'react'
import { cartSubtotal, useCartStore } from '@/store/cart'
import { formatBahtSymbol } from '@/lib/money'
import type { CartLine } from '@/types'

function RecipeModal({ line, onClose }: { line: CartLine; onClose: () => void }) {
  const handlePrint = () => {
    const win = window.open('', '_blank', 'width=420,height=600')
    if (!win) return
    const rows = line.product.recipe_items
      .map(
        (r) => `<tr>
          <td>${r.ingredient.name}${r.note ? `<br/><span style="color:#999;font-size:11px">${r.note}</span>` : ''}</td>
          <td style="text-align:right">${r.qty}</td>
          <td style="text-align:right;padding-left:8px;color:#555">${r.ingredient.unit}</td>
        </tr>`,
      )
      .join('')
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <title>สูตร ${line.product.name}</title>
      <style>
        body{font-family:'Sarabun',sans-serif;padding:20px;font-size:14px}
        h2{margin:0 0 4px}
        .opts{color:#777;font-size:12px;margin-bottom:12px}
        table{width:100%;border-collapse:collapse}
        th{text-align:left;border-bottom:2px solid #333;padding:4px 0}
        td{padding:5px 0;border-bottom:1px solid #eee;vertical-align:top}
      </style></head><body>
      <h2>${line.product.name}</h2>
      ${line.selectedOptions.length > 0 ? `<div class="opts">${line.selectedOptions.map((o) => o.name).join(', ')}</div>` : ''}
      <table><thead><tr><th>วัตถุดิบ</th><th style="text-align:right">ปริมาณ</th><th style="text-align:right;padding-left:8px">หน่วย</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <script>window.onload=function(){window.print();}</script>
      </body></html>`)
    win.document.close()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="rounded-2xl p-5 w-80 max-h-[80vh] flex flex-col shadow-xl"
        style={{
          background: 'rgba(255,255,255,.88)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,.9)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-3">
          <div>
            <h3 className="font-bold text-base" style={{ color: '#123524' }}>{line.product.name}</h3>
            {line.selectedOptions.length > 0 && (
              <p className="text-xs mt-0.5" style={{ color: '#5c7466' }}>
                {line.selectedOptions.map((o) => o.name).join(', ')}
              </p>
            )}
          </div>
          <button className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-3" onClick={onClose}>✕</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {line.product.recipe_items.length === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: '#5c7466' }}>ไม่มีสูตรวัตถุดิบ</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '2px solid rgba(0,0,0,.1)' }}>
                  <th className="text-left py-1.5 font-semibold" style={{ color: '#123524' }}>วัตถุดิบ</th>
                  <th className="text-right py-1.5 font-semibold" style={{ color: '#123524' }}>ปริมาณ</th>
                  <th className="text-right py-1.5 font-semibold pl-2" style={{ color: '#123524' }}>หน่วย</th>
                </tr>
              </thead>
              <tbody>
                {line.product.recipe_items.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid rgba(0,0,0,.06)' }}>
                    <td className="py-1.5 pr-2">
                      <div style={{ color: '#123524' }}>{r.ingredient.name}</div>
                      {r.note && <div className="text-xs" style={{ color: '#5c7466' }}>{r.note}</div>}
                    </td>
                    <td className="text-right py-1.5 tabular-nums" style={{ color: '#5c7466' }}>{r.qty}</td>
                    <td className="text-right py-1.5 pl-2 text-xs" style={{ color: '#5c7466' }}>{r.ingredient.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <button className="btn-primary w-full mt-4" onClick={handlePrint}>🖨 พิมพ์สูตร</button>
      </div>
    </div>
  )
}

export function CartPanel({ onCheckout }: { onCheckout: () => void }) {
  const lines = useCartStore((s) => s.lines)
  const discount = useCartStore((s) => s.discount)
  const setDiscount = useCartStore((s) => s.setDiscount)
  const incrementLine = useCartStore((s) => s.incrementLine)
  const removeLine = useCartStore((s) => s.removeLine)
  const clear = useCartStore((s) => s.clear)

  const subtotal = cartSubtotal(lines)
  const total = Math.max(0, subtotal - discount)
  const [recipeLine, setRecipeLine] = useState<CartLine | null>(null)

  return (
    <aside
      className="w-full md:w-80 flex-none flex flex-col"
      style={{
        background: 'rgba(255,255,255,.52)',
        backdropFilter: 'blur(22px) saturate(180%)',
        WebkitBackdropFilter: 'blur(22px) saturate(180%)',
        borderLeft: '1px solid rgba(255,255,255,.72)',
      }}
    >
      {recipeLine && <RecipeModal line={recipeLine} onClose={() => setRecipeLine(null)} />}

      {/* Header */}
      <div
        className="px-4 py-4 flex items-center justify-between"
        style={{ borderBottom: '1px solid rgba(255,255,255,.6)' }}
      >
        <h2 className="font-extrabold text-[15px]" style={{ color: '#123524' }}>ออเดอร์ปัจจุบัน</h2>
        {lines.length > 0 && (
          <button className="text-xs text-red-500 hover:text-red-700" onClick={clear}>ล้างตะกร้า</button>
        )}
      </div>

      {/* Cart lines */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {lines.length === 0 && (
          <p className="text-sm text-center py-10" style={{ color: '#5c7466' }}>ยังไม่มีรายการ</p>
        )}
        {lines.map((line) => (
          <div
            key={line.uid}
            className="rounded-2xl p-3"
            style={{
              background: 'rgba(255,255,255,.58)',
              border: '1px solid rgba(255,255,255,.82)',
            }}
          >
            <div className="flex justify-between">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm truncate" style={{ color: '#123524' }}>
                  {line.product.name}
                </div>
                {line.selectedOptions.length > 0 && (
                  <div className="text-xs mt-0.5" style={{ color: '#5c7466' }}>
                    {line.selectedOptions.map((o) => o.name).join(', ')}
                  </div>
                )}
              </div>
              <div className="font-bold text-sm ml-2 flex-none" style={{ color: '#16a34a' }}>
                {formatBahtSymbol(line.unitPrice * line.qty)}
              </div>
            </div>
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2">
                <button className="btn-secondary w-8 h-8 p-0 text-base" onClick={() => incrementLine(line.uid, -1)}>-</button>
                <span className="w-6 text-center text-sm font-semibold" style={{ color: '#123524' }}>{line.qty}</span>
                <button className="btn-secondary w-8 h-8 p-0 text-base" onClick={() => incrementLine(line.uid, 1)}>+</button>
              </div>
              <div className="flex items-center gap-3">
                <button className="text-xs text-blue-600 hover:text-blue-800" onClick={() => setRecipeLine(line)}>
                  🖨 สูตร
                </button>
                <button className="text-xs text-red-500 hover:text-red-700" onClick={() => removeLine(line.uid)}>ลบ</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="p-4 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,.6)' }}>
        <div className="flex justify-between text-sm" style={{ color: '#5c7466' }}>
          <span>ยอดรวม</span>
          <span>{formatBahtSymbol(subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm items-center">
          <span style={{ color: '#5c7466' }}>ส่วนลด</span>
          <input
            type="number"
            className="input w-24 text-right"
            value={discount}
            min={0}
            onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
          />
        </div>
        <div className="flex justify-between font-extrabold text-lg">
          <span style={{ color: '#5c7466' }}>ยอดสุทธิ</span>
          <span style={{ color: '#123524' }}>{formatBahtSymbol(total)}</span>
        </div>
        <button
          className="btn-primary w-full h-16 text-base rounded-[20px]"
          disabled={lines.length === 0}
          onClick={onCheckout}
        >
          ชำระเงิน {lines.length > 0 ? formatBahtSymbol(total) : ''}
        </button>
      </div>
    </aside>
  )
}
