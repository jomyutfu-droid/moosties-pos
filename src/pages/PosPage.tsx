import { useState } from 'react'
import { usePosCatalog } from '@/hooks/usePosCatalog'
import { ProductGrid } from '@/components/pos/ProductGrid'
import { CartPanel } from '@/components/pos/CartPanel'
import { OptionPickerModal } from '@/components/pos/OptionPickerModal'
import { PaymentModal } from '@/components/pos/PaymentModal'
import { ReceiptModal } from '@/components/pos/ReceiptModal'
import { cartCogsTotal, cartSubtotal, useCartStore } from '@/store/cart'
import { stockMovementsForOrder } from '@/domain/stock'
import { db, type OutboxOrder, type OutboxOrderItemInput, type OutboxPaymentInput } from '@/lib/db'
import { syncOutbox } from '@/lib/sync'
import { useSessionStore } from '@/store/session'
import { round2 } from '@/lib/money'
import type { PaymentMethod, ProductWithRecipe, SelectedOption } from '@/types'

function makeOrderNo(isoDate: string): string {
  const date = new Date(isoDate)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getHours())}${pad(date.getMinutes())}`
}

export default function PosPage() {
  const { categories, products, ingredientsById, loading } = usePosCatalog()
  const lines = useCartStore((s) => s.lines)
  const discount = useCartStore((s) => s.discount)
  const note = useCartStore((s) => s.note)
  const addLine = useCartStore((s) => s.addLine)
  const clear = useCartStore((s) => s.clear)
  const activeStaff = useSessionStore((s) => s.activeStaff)

  const [pickerProduct, setPickerProduct] = useState<ProductWithRecipe | null>(null)
  const [showPayment, setShowPayment] = useState(false)
  const [receiptOrder, setReceiptOrder] = useState<{
    orderNo: string
    total: number
    paid: number
    change: number
    createdAt: string
    lines: typeof lines
    discount: number
  } | null>(null)

  function handleSelectProduct(product: ProductWithRecipe) {
    if (product.options.length > 0) {
      setPickerProduct(product)
    } else {
      addLine(product, [], ingredientsById)
    }
  }

  function handleConfirmOptions(options: SelectedOption[]) {
    if (pickerProduct) {
      addLine(pickerProduct, options, ingredientsById)
    }
    setPickerProduct(null)
  }

  async function handleConfirmPayment(
    payments: { method: PaymentMethod; amount: number; ref: string | null }[],
    meta: { cashReceived: number },
  ) {
    if (lines.length === 0) return // กันบันทึกออเดอร์ว่าง
    const subtotal = cartSubtotal(lines)
    const cogsTotal = cartCogsTotal(lines)
    // ส่วนลดต้องไม่เกินยอดรวม มิฉะนั้น discount ที่บันทึกจะไม่ตรงกับ total
    const effectiveDiscount = round2(Math.min(Math.max(0, discount), subtotal))
    const total = round2(subtotal - effectiveDiscount)
    const clientUuid = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    const orderNo = makeOrderNo(createdAt)

    const items: OutboxOrderItemInput[] = lines.map((l) => ({
      product_id: l.product.id,
      name_snapshot: l.product.name,
      unit_price: l.unitPrice,
      qty: l.qty,
      options_json: l.selectedOptions.length ? l.selectedOptions : null,
      line_total: round2(l.unitPrice * l.qty),
      cogs_snapshot: l.unitCogs,
    }))

    const stockMovements = stockMovementsForOrder(
      lines.map((l) => ({ product: l.product, qty: l.qty, selectedOptions: l.selectedOptions })),
      'sale',
      -1,
    )

    const outboxOrder: OutboxOrder = {
      client_uuid: clientUuid,
      branch_id: activeStaff?.branch_id ?? null,
      user_id: activeStaff?.id ?? null,
      channel: 'dine_in',
      subtotal: round2(subtotal),
      discount: effectiveDiscount,
      total,
      cogs_total: round2(cogsTotal),
      note: note || null,
      items,
      payments: payments as OutboxPaymentInput[],
      stock_movements: stockMovements,
      status: 'pending',
      error: null,
      created_at: createdAt,
      synced_at: null,
    }

    await db.outbox_orders.put(outboxOrder)

    // อัปเดตสต็อกในแคชทันทีเพื่อให้หน้าสต็อก/POS เห็นยอดล่าสุดแบบออฟไลน์
    for (const mov of stockMovements) {
      const ing = await db.ingredients.get(mov.ingredient_id)
      if (ing) {
        await db.ingredients.put({ ...ing, stock_qty: round2(ing.stock_qty + mov.qty_delta) })
      }
    }

    // เงินสด: ใช้ยอดเงินที่รับมาจริงเพื่อคำนวณเงินทอน
    // ช่องทางอื่น (PromptPay): รับเท่ายอดสุทธิ ไม่มีเงินทอน
    const isCash = payments.some((p) => p.method === 'cash')
    const received = isCash ? round2(Math.max(meta.cashReceived, total)) : total

    // Feature 2: ส่ง lines และ discount ไปให้ ReceiptModal เพื่อพิมพ์ใบเสร็จ + สติกเกอร์
    setReceiptOrder({
      orderNo,
      total,
      paid: received,
      change: round2(received - total),
      createdAt: outboxOrder.created_at,
      lines: [...lines], // snapshot ก่อน clear
      discount: effectiveDiscount,
    })

    clear()
    setShowPayment(false)
    syncOutbox().catch(() => undefined)
  }

  if (loading) {
    return <div className="p-6 text-gray-500">กำลังโหลดเมนู…</div>
  }

  if (products.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold text-gray-800">หน้าขาย (POS)</h1>
        <p className="text-gray-500 mt-2">
          ยังไม่มีเมนูในแคช — ตรวจสอบการเชื่อมต่อ Supabase หรือเพิ่มเมนูที่หน้า “เมนู/สูตร” แล้วลองรีเฟรช
        </p>
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden md:flex-row">
      <ProductGrid categories={categories} products={products} onSelect={handleSelectProduct} />
      <CartPanel onCheckout={() => setShowPayment(true)} />

      {pickerProduct && (
        <OptionPickerModal
          product={pickerProduct}
          onConfirm={handleConfirmOptions}
          onClose={() => setPickerProduct(null)}
        />
      )}

      {showPayment && (
        <PaymentModal
          total={Math.max(0, round2(cartSubtotal(lines) - discount))}
          onConfirm={handleConfirmPayment}
          onClose={() => setShowPayment(false)}
        />
      )}

      {receiptOrder && <ReceiptModal order={receiptOrder} onClose={() => setReceiptOrder(null)} />}
    </div>
  )
}
