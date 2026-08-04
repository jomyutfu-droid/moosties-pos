import { supabase } from '@/lib/supabase'
import { db, type OutboxOrder } from '@/lib/db'
import { errorMessage } from '@/lib/errors'
import type { Category, Ingredient, Product, ProductOption, RecipeItem } from '@/types'

/**
 * Sync แบบออฟไลน์-ก่อน (สเปกหัวข้อ 4, 6.7):
 * - refreshReferenceData(): โหลดข้อมูลอ้างอิง (เมนู/สูตร/วัตถุดิบ/ตัวเลือก) ลง IndexedDB
 * - syncOutbox(): ส่งออเดอร์ที่ค้างใน outbox ขึ้น Supabase โดยใช้ client_uuid กันส่งซ้ำ
 */

export async function refreshReferenceData(): Promise<void> {
  const [categories, ingredients, products, options, recipeItems] = await Promise.all([
    supabase.from('categories').select('*').order('sort_order'),
    supabase.from('ingredients').select('*'),
    supabase.from('products').select('*').order('sort_order'),
    supabase.from('product_options').select('*'),
    supabase.from('recipe_items').select('*'),
  ])

  const errors = [categories, ingredients, products, options, recipeItems]
    .map((r) => r.error)
    .filter(Boolean)
  if (errors.length) {
    throw new Error(errors.map((e) => e?.message).join('; '))
  }

  await db.transaction(
    'rw',
    [db.categories, db.ingredients, db.products, db.product_options, db.recipe_items],
    async () => {
      await db.categories.clear()
      await db.ingredients.clear()
      await db.products.clear()
      await db.product_options.clear()
      await db.recipe_items.clear()

      if (categories.data) await db.categories.bulkPut(categories.data as Category[])
      if (ingredients.data) await db.ingredients.bulkPut(ingredients.data as Ingredient[])
      if (products.data) await db.products.bulkPut(products.data as Product[])
      if (options.data) await db.product_options.bulkPut(options.data as ProductOption[])
      if (recipeItems.data) await db.recipe_items.bulkPut(recipeItems.data as RecipeItem[])
    },
  )
}

/** ส่งออเดอร์ 1 รายการขึ้น Supabase ผ่าน RPC `submit_order` (idempotent ด้วย client_uuid) */
async function pushOrder(order: OutboxOrder): Promise<void> {
  const { error } = await supabase.rpc('submit_order', {
    p_client_uuid: order.client_uuid,
    p_branch_id: order.branch_id,
    p_user_id: order.user_id,
    p_channel: order.channel,
    p_subtotal: order.subtotal,
    p_discount: order.discount,
    p_total: order.total,
    p_cogs_total: order.cogs_total,
    p_note: order.note,
    p_items: order.items,
    p_payments: order.payments,
    p_stock_movements: order.stock_movements,
  })
  if (error) throw error

  // RPC อาจทำงานหลังกลับมาออนไลน์หลายชั่วโมง/วัน จึงต้องคืนเวลาขายจริงจาก outbox
  // ใช้ client_uuid ซึ่งเป็น idempotency key เพื่อให้ retry ได้อย่างปลอดภัย
  const { error: timestampError } = await supabase
    .from('orders')
    .update({ created_at: order.created_at })
    .eq('client_uuid', order.client_uuid)
    .select('id')
    .single()
  if (timestampError) throw timestampError
}

export interface SyncResult {
  synced: number
  failed: number
}

/** กัน syncOutbox ทำงานซ้อนกัน (auto-sync ทุก 30 วิ + เรียกหลังปิดการขาย) */
let syncInFlight: Promise<SyncResult> | null = null

/** ส่งออเดอร์ที่ค้างอยู่ใน outbox ทั้งหมด (เรียกตอนกลับมาออนไลน์ / เป็นระยะ) */
export async function syncOutbox(): Promise<SyncResult> {
  // ถ้ากำลัง sync อยู่ ให้รอรอบเดิมแทนที่จะยิงซ้ำ
  if (syncInFlight) return syncInFlight
  syncInFlight = runSync().finally(() => {
    syncInFlight = null
  })
  return syncInFlight
}

async function runSync(): Promise<SyncResult> {
  // กู้ออเดอร์ที่ค้างสถานะ 'syncing' (แอปปิด/รีเฟรชกลางคัน) กลับเป็น pending
  // ไม่งั้นออเดอร์เหล่านี้จะไม่ถูกหยิบมาส่งอีกเลย — RPC เป็น idempotent จึงส่งซ้ำได้ปลอดภัย
  const stale = await db.outbox_orders.where('status').equals('syncing').toArray()
  for (const order of stale) {
    await db.outbox_orders.update(order.client_uuid, { status: 'pending' })
  }

  const pending = await db.outbox_orders.where('status').anyOf(['pending', 'error']).toArray()
  let synced = 0
  let failed = 0

  for (const order of pending) {
    await db.outbox_orders.update(order.client_uuid, { status: 'syncing' })
    try {
      await pushOrder(order)
      await db.outbox_orders.update(order.client_uuid, {
        status: 'synced',
        synced_at: new Date().toISOString(),
        error: null,
      })
      synced += 1
    } catch (err) {
      await db.outbox_orders.update(order.client_uuid, {
        status: 'error',
        error: errorMessage(err, 'ส่งออเดอร์ไม่สำเร็จ'),
      })
      failed += 1
    }
  }

  return { synced, failed }
}

let syncTimer: ReturnType<typeof setInterval> | null = null

/** เริ่ม sync อัตโนมัติเมื่อออนไลน์ และทุก ๆ intervalMs */
export function startAutoSync(intervalMs = 30_000): () => void {
  const run = () => {
    if (navigator.onLine) {
      syncOutbox().catch(() => undefined)
    }
  }
  window.addEventListener('online', run)
  syncTimer = setInterval(run, intervalMs)
  run()

  return () => {
    window.removeEventListener('online', run)
    if (syncTimer) clearInterval(syncTimer)
  }
}
