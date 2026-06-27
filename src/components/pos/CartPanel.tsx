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
        body{font-family:sans-serif;padding:20px;font-size:14px}
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
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl p-5 w-80 max-h-[80vh] flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-3">
          <div>
            <h3 className="font-bold text-base">{line.product.name}</h3>
            {line.selectedOptions.length > 0 && (
              <p className="text-xs text-gray-500 mt-0.5">
                {line.selectedOptions.map((o) => o.name).join(', ')}
              </p>
            )}
          </div>
          <button className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-3" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {line.product.recipe_items.length === 0 ? (
            <p className="text-gray-400 text-sm py-6 text-center">ไม่มีสูตรวัตถุดิบ</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-300">
                  <th className="text-left py-1.5 font-semibold">วัตถุดิบ</th>
                  <th className="text-right py-1.5 font-semibold">ปริมาณ</th>
                  <th className="text-right py-1.5 font-semibold pl-2">หน่วย</th>
                </tr>
              </thead>
              <tbody>
                {line.product.recipe_items.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100">
                    <td className="py-1.5 pr-2">
                      <div>{r.ingredient.name}</div>
                      {r.note && <div className="text-xs text-gray-400">{r.note}</div>}
                    </td>
                    <td className="text-right py-1.5 tabular-nums">{r.qty}</td>
                    <td className="text-right py-1.5 pl-2 text-gray-500">{r.ingredient.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <button className="btn-primary w-full mt-4" onClick={handlePrint}>
          🖨 พิมพ์สูตร
        </button>
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
    <aside className="w-full md:w-80 border-t md:border-t-0 md:border-l border-gray-200 bg-white flex flex-col">
      {recipeLine && <RecipeModal line={recipeLine} onClose={() => setRecipeLine(null)} />}
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
              <div className="flex items-center gap-3">
                <button
                  className="text-xs text-blue-600"
                  onClick={() => setRecipeLine(line)}
                >
                  🖨 สูตร
                </button>
                <button className="text-xs text-red-600" onClick={() => removeLine(line.uid)}>
                  ลบ
                </button>
              </div>
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
