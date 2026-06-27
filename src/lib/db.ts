import Dexie, { type Table } from 'dexie'
import type {
  Category,
  Ingredient,
  Product,
  ProductOption,
  RecipeItem,
  Settings,
  SelectedOption,
  OrderChannel,
} from '@/types'
import type { StockMovementDraft } from '@/domain/stock'

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

export class MoosttiesDB extends Dexie {
  categories!: Table<Category, string>
  ingredients!: Table<Ingredient, string>
  products!: Table<Product, string>
  product_options!: Table<ProductOption, string>
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
  }
}

export const db = new MoosttiesDB()

/** จำนวนออเดอร์ที่ยังรอ sync */
export async function pendingOutboxCount(): Promise<number> {
  return db.outbox_orders.where('status').anyOf(['pending', 'error']).count()
}
