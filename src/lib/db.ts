import Dexie, { type Table } from 'dexie'
import type {
  Category,
  Ingredient,
  Product,
  ProductOption,
  StoreTopping,
  RecipeItem,
  Settings,
  SelectedOption,
  OrderChannel,
} from '@/types'
import type { StockMovementDraft } from '@/domain/stock'
import { migrateCachedToppings } from '@/domain/toppings'

/**
 * แคชข้อมูลอ้างอิง (reference data) ไว้ใน IndexedDB เพื่อให้ POS ใช้งานได้แบบออฟไลน์
 * และ outbox สำหรับคิวออเดอร์ที่ยังไม่ sync ขึ้น Supabase (ดูสเปกหัวข้อ 4, 6.7)
 */

export interface OutboxOrderItemInput {
  product_id: string | null
  name_snapshot: string
  unit_price: number
  qty: number
  options_json: SelectedOption[] | null
  line_total: number
  cogs_snapshot: number
}

export interface OutboxPaymentInput {
  method: 'cash' | 'promptpay' | 'stored_value' | 'card' | 'other'
  amount: number
  ref: string | null
}

export interface OutboxOrder {
  client_uuid: string // primary key, ใช้ idempotency ตอน sync
  branch_id: string | null
  user_id: string | null
  channel: OrderChannel
  subtotal: number
  discount: number
  total: number
  cogs_total: number
  note: string | null
  items: OutboxOrderItemInput[]
  payments: OutboxPaymentInput[]
  stock_movements: StockMovementDraft[]
  status: 'pending' | 'syncing' | 'synced' | 'error'
  error: string | null
  created_at: string
  synced_at: string | null
}

export interface CachedSettings extends Settings {
  id: 'singleton'
}

export class MoostiesDB extends Dexie {
  categories!: Table<Category, string>
  ingredients!: Table<Ingredient, string>
  products!: Table<Product, string>
  product_options!: Table<ProductOption, string>
  store_toppings!: Table<StoreTopping, string>
  recipe_items!: Table<RecipeItem, string>
  settings!: Table<CachedSettings, string>
  outbox_orders!: Table<OutboxOrder, string>

  constructor() {
    super('moosties-pos')
    this.version(1).stores({
      categories: 'id, sort_order, is_active',
      ingredients: 'id, name, is_active',
      products: 'id, category_id, is_active, is_available, sort_order',
      product_options: 'id, product_id',
      recipe_items: 'id, product_id, ingredient_id',
      settings: 'id',
      outbox_orders: 'client_uuid, status, created_at',
    })
    this.version(2).stores({ store_toppings: 'id, sort_order' }).upgrade(async tx => {
      const legacy = await tx.table<ProductOption, string>('product_options').toArray()
      await tx.table<StoreTopping, string>('store_toppings').bulkPut(migrateCachedToppings(legacy))
    })
  }
}

export const db = new MoostiesDB()

/** จำนวนออเดอร์ที่ยังรอ sync (รวม 'syncing' ที่อาจค้างจากรอบก่อน) */
export async function pendingOutboxCount(): Promise<number> {
  return db.outbox_orders.where('status').anyOf(['pending', 'error', 'syncing']).count()
}
