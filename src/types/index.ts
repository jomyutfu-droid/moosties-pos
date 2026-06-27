// ชนิดข้อมูลตรงกับตารางใน supabase/migrations/0001_init.sql (v1)
// ดู MOOSTTIES_POS_System_Spec.md หัวข้อ 5

export type UUID = string

export type Role = 'owner' | 'staff' | 'manager'

export interface Branch {
  id: UUID
  name: string
  address: string | null
  phone: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AppUser {
  id: UUID
  branch_id: UUID | null
  name: string
  email: string | null
  role: Role
  pin_hash: string | null
  hourly_wage: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Category {
  id: UUID
  name: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Ingredient {
  id: UUID
  name: string
  unit: string
  pack_price: number
  pack_qty: number
  cost_per_unit: number
  stock_qty: number
  reorder_point: number
  expiry_alert_days: number | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Product {
  id: UUID
  category_id: UUID | null
  name: string
  price: number
  cost_cached: number
  image_url: string | null
  prep_steps: string | null
  prep_image_url: string | null
  sku: string | null
  auto_86_enabled: boolean
  is_available: boolean
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface ProductOption {
  id: UUID
  product_id: UUID
  name: string
  price_delta: number
  linked_ingredient_id: UUID | null
  qty_delta: number
  sort_order: number
  created_at: string
  updated_at: string
}

export interface RecipeItem {
  id: UUID
  product_id: UUID
  ingredient_id: UUID
  qty: number
  sort_order: number
  note: string | null
  created_at: string
  updated_at: string
}

export type OrderStatus = 'open' | 'paid' | 'void'
export type OrderChannel = 'dine_in' | 'takeaway' | 'self_order' | 'preorder' | 'delivery'

export interface Order {
  id: UUID
  order_no: string | null
  client_uuid: string
  branch_id: UUID | null
  user_id: UUID | null
  customer_id: UUID | null
  status: OrderStatus
  channel: OrderChannel
  prep_status: 'preparing' | 'ready' | 'served' | null
  pickup_time: string | null
  subtotal: number
  discount: number
  total: number
  cogs_total: number
  promotion_id: UUID | null
  note: string | null
  created_at: string
  closed_at: string | null
  updated_at: string
}

export interface SelectedOption {
  option_id: UUID
  name: string
  price_delta: number
  qty_delta: number
  linked_ingredient_id: UUID | null
}

export interface OrderItem {
  id: UUID
  order_id: UUID
  product_id: UUID | null
  name_snapshot: string
  unit_price: number
  qty: number
  options_json: SelectedOption[] | null
  line_total: number
  cogs_snapshot: number
  created_at: string
}

export type PaymentMethod = 'cash' | 'promptpay' | 'stored_value' | 'card' | 'other'

export interface Payment {
  id: UUID
  order_id: UUID
  method: PaymentMethod
  amount: number
  ref: string | null
  created_at: string
}

export type StockMovementType = 'sale' | 'receive' | 'adjust' | 'waste'

export interface StockMovement {
  id: UUID
  ingredient_id: UUID
  type: StockMovementType
  qty_delta: number
  ref_order_id: UUID | null
  user_id: UUID | null
  note: string | null
  created_at: string
}

export interface CashSession {
  id: UUID
  branch_id: UUID | null
  user_id: UUID | null
  opened_at: string
  opening_cash: number
  closed_at: string | null
  counted_cash: number | null
  expected_cash: number | null
  variance: number | null
  note: string | null
}

export interface Settings {
  store_name: string
  promptpay_id: string
  receipt_header: string
  receipt_footer: string
  currency: 'THB'
  vat_percent: number
  low_stock_alert_on: boolean
  staff_discount_limit: number
  target_margin_percent: number
  recipe_card_mode: 'before_add' | 'icon_only'
}

export interface AuditLog {
  id: UUID
  user_id: UUID | null
  action: string
  entity: string | null
  entity_id: UUID | null
  detail_json: Record<string, unknown> | null
  created_at: string
}

// ---- ชนิดข้อมูลฝั่ง UI / รวมเพื่อใช้ในตะกร้า ----

export interface ProductWithRecipe extends Product {
  category?: Category | null
  recipe_items: (RecipeItem & { ingredient: Ingredient })[]
  options: ProductOption[]
}

export interface CartLine {
  uid: string // client-side unique id ของรายการในตะกร้า
  product: ProductWithRecipe
  qty: number
  selectedOptions: SelectedOption[]
  unitPrice: number // price + sum(option.price_delta)
  unitCogs: number // cost_cached + sum(option.qty_delta * ingredient.cost_per_unit)
}
