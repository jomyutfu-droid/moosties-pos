import { useState } from 'react'
import { cartSubtotal, useCartStore } from '@/store/cart'
import { floorBaht, formatBahtSymbol } from '@/lib/money'
import { useSettings } from '@/hooks/useSettings'
import { useSessionStore } from '@/store/session'
import { parseUnsignedNumber } from '@/lib/forms'
import { escapeHtml, openPrintWindow, THERMAL_BASE_CSS } from '@/lib/html'
import { NumberField } from '@/components/NumberField'
import { fromBaseQty } from '@/domain/units'
import type { CartLine } from '@/types'

/**
 * คำนวณปริมาณวัตถุดิบจริงหลังรวมผลของตัวเลือก (เช่น "หวานน้อย" ลดน้ำเชื่อม)
 * ใช้ร่วมกันทั้งตารางพรีวิวบนหน้าจอ และ HTML ที่พิมพ์ออกมา
 * เดิมพรีวิวบนหน้าจอใช้ line.product.recipe_items ตรง ๆ โดยไม่ปรับตามตัวเลือกเลย
 * ทำให้ผู้ใช้เปิดดู "สูตร" แล้วเห็นปริมาณน้ำเชื่อมไม่ลดตามที่ตั้งค่าไว้ (แม้ใบพิมพ์จริงจะถูกต้อง)
 */
function computeAdjustedRecipe(line: CartLine) {
  const recipeItems = line.product.recipe_items.filter(
    (r) => r.ingredient?.category?.trim() !== 'บรรจุภัณฑ์',
  )
  const optDeltaById = new Map<string, number>()
  for (const opt of line.selectedOptions) {
    if (!opt.linked_ingredient_id || !opt.qty_delta) continue
    optDeltaById.set(
      opt.linked_ingredient_id,
      (optDeltaById.get(opt.linked_ingredient_id) ?? 0) + opt.qty_delta,
    )
  }

  const adjusted = recipeItems.map((r) => {
    const delta = optDeltaById.get(r.ingredient_id) ?? 0
    if (delta) optDeltaById.delete(r.ingredient_id)
    return {
      r,
      qty: fromBaseQty(r.qty + delta, Number(r.unit_factor) || 1),
      isAdjusted: delta !== 0,
    }
  })

  const extra = Array.from(optDeltaById.entries()).map(([ingId, qty]) => ({
    name: line.selectedOptions.find((o) => o.linked_ingredient_id === ingId)?.name ?? 'ตัวเลือก',
    qty,
  }))

  return { adjusted, extra }
}

function RecipeModal({ line, onClose }: { line: CartLine; onClose: () => void }) {
  const { adjusted, extra } = computeAdjustedRecipe(line)

  const handlePrint = () => {
    // ใช้ตรรกะเดียวกับสติกเกอร์และตารางพรีวิว: ตัดบรรจุภัณฑ์ออก และรวมปริมาณที่ตัวเลือกปรับเข้าไปด้วย
    // ไม่งั้นการ์ดสูตรจะบอกปริมาณไม่ตรงกับสติกเกอร์และกับที่ตัดสต็อกจริง
    const rows = adjusted.map(
      ({ r, qty, isAdjusted }) => `<tr>
          <td>${escapeHtml(r.ingredient.name)}${isAdjusted ? ' <small>(ปรับตามตัวเลือก)</small>' : ''}${
            r.note ? `<br><small>${escapeHtml(r.note)}</small>` : ''
          }</td>
          <td class="r">${qty}</td>
          <td class="r">${escapeHtml(r.unit_name ?? r.ingredient.unit)}</td>
        </tr>`,
    )

    // วัตถุดิบที่มาจากตัวเลือกล้วน ๆ
    for (const { name, qty } of extra) {
      rows.push(
        `<tr><td>${escapeHtml(name)} <small>(ตัวเลือก)</small></td><td class="r">${qty}</td><td class="r">-</td></tr>`,
      )
    }

    const optLabel = line.selectedOptions.map((o) => o.name).join(', ')
    openPrintWindow(
      `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"/>
      <title>สูตร</title>
      <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap" rel="stylesheet"/>
      <style>
        ${THERMAL_BASE_CSS}
        .wrap { width: 76mm; padding: 4px 2mm 2px; }
        .name { font-size: 18px; font-weight: 800; }
        .opts { font-size: 12px; font-weight: 700; margin-top: 2px; }
      </style></head><body>
      <div class="wrap">
        <div class="name">${escapeHtml(line.product.name)}</div>
        ${optLabel ? `<div class="opts">${escapeHtml(optLabel)}</div>` : ''}
        <div class="dash"></div>
        <table>
          <thead><tr><th>วัตถุดิบ</th><th class="r">ปริมาณ</th><th class="r">หน่วย</th></tr></thead>
          <tbody>${rows.join('') || '<tr><td colspan="3">ไม่มีสูตรวัตถุดิบ</td></tr>'}</tbody>
        </table>
      </div>
      <script>setTimeout(function(){ window.print() }, 400)</script>
      </body></html>`,
      420,
      600,
    )
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
          {adjusted.length === 0 && extra.length === 0 ? (
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
                {adjusted.map(({ r, qty, isAdjusted }) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid rgba(0,0,0,.06)' }}>
                    <td className="py-1.5 pr-2">
                      <div style={{ color: '#123524' }}>
                        {r.ingredient.name}
                        {isAdjusted && (
                          <span className="text-xs ml-1" style={{ color: '#16a34a' }}>(ปรับตามตัวเลือก)</span>
                        )}
                      </div>
                      {r.note && <div className="text-xs" style={{ color: '#5c7466' }}>{r.note}</div>}
                    </td>
                    <td className="text-right py-1.5 tabular-nums" style={{ color: '#5c7466' }}>{qty}</td>
                    <td className="text-right py-1.5 pl-2 text-xs" style={{ color: '#5c7466' }}>{r.unit_name ?? r.ingredient.unit}</td>
                  </tr>
                ))}
                {extra.map(({ name, qty }, i) => (
                  <tr key={`extra-${i}`} style={{ borderBottom: '1px solid rgba(0,0,0,.06)' }}>
                    <td className="py-1.5 pr-2">
                      <div style={{ color: '#123524' }}>
                        {name}
                        <span className="text-xs ml-1" style={{ color: '#5c7466' }}>(ตัวเลือก)</span>
                      </div>
                    </td>
                    <td className="text-right py-1.5 tabular-nums" style={{ color: '#5c7466' }}>{qty}</td>
                    <td className="text-right py-1.5 pl-2 text-xs" style={{ color: '#5c7466' }}>-</td>
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

export function CartPanel({
  onCheckout,
  onGrabCheckout,
}: {
  onCheckout: () => void
  onGrabCheckout: () => void
}) {
  const lines = useCartStore((s) => s.lines)
  const discount = useCartStore((s) => s.discount)
  const discountMode = useCartStore((s) => s.discountMode)
  const discountValue = useCartStore((s) => s.discountValue)
  const setDiscountMode = useCartStore((s) => s.setDiscountMode)
  const setDiscountValue = useCartStore((s) => s.setDiscountValue)
  const incrementLine = useCartStore((s) => s.incrementLine)
  const removeLine = useCartStore((s) => s.removeLine)
  const clear = useCartStore((s) => s.clear)

  const subtotal = cartSubtotal(lines)
  const total = floorBaht(Math.max(0, subtotal - discount))
  const [recipeLine, setRecipeLine] = useState<CartLine | null>(null)

  // สิทธิ์ส่วนลด: พนักงานทั่วไปจำกัดตาม staff_discount_limit, เจ้าของ/ผู้จัดการไม่จำกัด
  const { data: settings } = useSettings()
  const role = useSessionStore((s) => s.activeStaff?.role)
  const isManagerUp = role === 'owner' || role === 'manager'
  const discountCap = isManagerUp ? subtotal : Math.min(settings?.staff_discount_limit ?? 0, subtotal)
  const discountBlocked = !isManagerUp && discountCap <= 0
  const maxDiscountValue = discountMode === 'percent' && subtotal > 0 ? (discountCap / subtotal) * 100 : discountCap

  return (
    <aside
      className="flex h-[min(46vh,520px)] min-h-0 w-full flex-none flex-col overflow-hidden md:h-full md:w-80"
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
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
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
      <div className="flex-none space-y-3 p-4" style={{ borderTop: '1px solid rgba(255,255,255,.6)' }}>
        <div className="flex justify-between text-sm" style={{ color: '#5c7466' }}>
          <span>ยอดรวม</span>
          <span>{formatBahtSymbol(subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm items-center gap-2">
          <span style={{ color: '#5c7466' }}>
            ส่วนลด
            {!isManagerUp && discountCap > 0 && (
              <span className="ml-1 text-xs" style={{ color: '#8a8f8b' }}>
                (สูงสุด {discountCap})
              </span>
            )}
          </span>
          <div className="flex items-center gap-1">
            <select
              className="input w-[76px] px-2"
              value={discountMode}
              disabled={discountBlocked}
              onChange={(e) => setDiscountMode(e.target.value as 'amount' | 'percent')}
              aria-label="ประเภทส่วนลด"
            >
              <option value="amount">บาท</option>
              <option value="percent">%</option>
            </select>
            <NumberField
            className="input w-20 text-right"
            value={discountValue}
            parse={parseUnsignedNumber}
            disabled={discountBlocked}
            title={discountBlocked ? 'พนักงานไม่มีสิทธิ์ให้ส่วนลด — ตั้งค่าได้ที่หน้าตั้งค่า' : undefined}
            onChange={(n) => setDiscountValue(Math.min(n, maxDiscountValue))}
            />
          </div>
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
        <button
          className="w-full h-12 rounded-[16px] bg-orange-500 text-sm font-extrabold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={lines.length === 0}
          onClick={onGrabCheckout}
        >
          🛵 คิดเงิน Grab
          <span className="ml-1 text-xs font-semibold opacity-90">· พิมพ์ + ตัดสต็อก</span>
        </button>
      </div>
    </aside>
  )
}
