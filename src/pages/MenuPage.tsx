import { useState } from 'react'
import {
  useCategories,
  useDeleteEmptyCategory,
  useProducts,
  useSaveCategory,
  useToggleProductActive,
  useSaveMenuOrder,
  useSaveCategoryOrder,
} from '@/hooks/useMenu'
import { ManagementDialog } from '@/components/ManagementDialog'
import { MenuReorderHandle } from '@/components/MenuReorderHandle'
import { moveMenuProduct, normaliseMenuOrder, sortMenuProducts, type MenuOrder } from '@/domain/menuOrder'
import { useSettings } from '@/hooks/useSettings'
import { useSessionStore } from '@/store/session'
import { marginPercent, unitProfit } from '@/domain/cogs'
import { formatBahtSymbol } from '@/lib/money'
import { ProductEditor } from '@/components/ProductEditor'
import type { Category, Product } from '@/types'

export default function MenuPage() {
  const { data: categories } = useCategories()
  const { data: products, isLoading } = useProducts()
  const { data: settings, isLoading: settingsLoading } = useSettings()
  const saveOrder = useSaveMenuOrder()
  const saveCategoryOrder = useSaveCategoryOrder()
  const saveCategory = useSaveCategory()
  const deleteCategory = useDeleteEmptyCategory()
  const toggleActive = useToggleProductActive()
  const activeStaff = useSessionStore((s) => s.activeStaff)
  const isOwnerOrManager = activeStaff?.role === 'owner' || activeStaff?.role === 'manager'

  const [editingProductId, setEditingProductId] = useState<string | null | undefined>(undefined)
  const [showCategories, setShowCategories] = useState(false)
  const [draft, setDraft] = useState<MenuOrder | null>(null)
  const [orderError, setOrderError] = useState('')
  const [orderMessage, setOrderMessage] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [categoryError, setCategoryError] = useState('')

  const savedOrder = normaliseMenuOrder(settings?.menu_order)
  const currentOrder = draft ?? savedOrder
  const sortedProducts = sortMenuProducts(products ?? [], currentOrder)
  const visibleProducts = sortedProducts.filter((p) => showInactive || p.is_active)
  const categoryBusy = saveCategory.isPending || deleteCategory.isPending || saveCategoryOrder.isPending

  function startOrder(mode: MenuOrder['mode']) {
    setOrderError(''); setOrderMessage('')
    setDraft({ mode, product_ids: sortMenuProducts(products ?? [], mode === 'manual' ? currentOrder : { mode }).map(p => p.id) })
  }

  function moveProduct(from: string, to: string) {
    if (!draft || saveOrder.isPending) return
    setDraft({ mode: 'manual', product_ids: moveMenuProduct(sortedProducts, from, to).map(p => p.id) })
  }

  async function handleSaveOrder() {
    if (!draft) return
    setOrderError('')
    try {
      await saveOrder.mutateAsync({ ...draft, product_ids: sortedProducts.map(p => p.id) })
      setDraft(null)
      setOrderMessage('บันทึกลำดับเมนูแล้ว')
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : 'บันทึกลำดับไม่สำเร็จ')
    }
  }

  async function moveCategory(id: string, delta: number) {
    const rows = [...(categories ?? [])]
    const index = rows.findIndex(c => c.id === id)
    const target = index + delta
    if (index < 0 || target < 0 || target >= rows.length) return
    ;[rows[index], rows[target]] = [rows[target], rows[index]]
    setCategoryError('')
    try { await saveCategoryOrder.mutateAsync(rows) }
    catch (error) { setCategoryError(error instanceof Error ? error.message : 'เรียงหมวดไม่สำเร็จ') }
  }

  function renderProduct(p: Product, items: Product[], index: number) {
    return <div key={p.id} data-menu-reorder-id={p.id} data-menu-category={p.category_id ?? ''}>
      {draft?.mode === 'manual' ? <div className="card p-4 space-y-3 h-full border-green-200">
        <p className="font-semibold break-words">{index + 1}. {p.name}</p>
        {!p.is_active && <p className="text-xs text-gray-500">ปิดใช้งาน</p>}
        <MenuReorderHandle id={p.id} name={p.name} categoryId={p.category_id} onMove={moveProduct} disabled={saveOrder.isPending} />
        <div className="flex gap-2">
          <button type="button" className="btn-secondary min-h-11 flex-1" aria-label={`เลื่อนขึ้น ${p.name}`} disabled={index === 0 || saveOrder.isPending} onClick={() => moveProduct(p.id, items[index - 1].id)}>↑ ขึ้น</button>
          <button type="button" className="btn-secondary min-h-11 flex-1" aria-label={`เลื่อนลง ${p.name}`} disabled={index === items.length - 1 || saveOrder.isPending} onClick={() => moveProduct(p.id, items[index + 1].id)}>↓ ลง</button>
        </div>
      </div> : <ProductCard product={p} canToggle={isOwnerOrManager && !draft}
        onEdit={() => { if (!draft) setEditingProductId(p.id) }}
        onToggle={() => toggleActive.mutate({ id: p.id, is_active: !p.is_active })} />}
    </div>
  }

  function productsInCategory(categoryId: string | null) {
    return visibleProducts.filter((p) => p.category_id === categoryId)
  }

  async function handleAddCategory() {
    if (!newCategory.trim()) return
    setCategoryError('')
    try {
      await saveCategory.mutateAsync({
        name: newCategory.trim(),
        sort_order: Math.max(0, ...(categories ?? []).map(c => c.sort_order)) + 1,
        is_active: true,
      })
      setNewCategory('')
    } catch (error) {
      setCategoryError(error instanceof Error ? error.message : 'เพิ่มหมวดหมู่ไม่สำเร็จ')
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">เมนู / สูตร (Recipe Card)</h1>
        <div className="flex flex-wrap gap-2 items-center">
          {isOwnerOrManager && (
            <label className="flex items-center gap-1 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded"
                disabled={!!draft}
              />
              แสดงที่ปิดใช้งาน
            </label>
          )}
          <button className="btn-primary" disabled={!!draft} onClick={() => setEditingProductId(null)}>
            + เพิ่มเมนู
          </button>
        </div>
      </div>

      {isOwnerOrManager && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-secondary" disabled={!!draft} onClick={() => setShowCategories(true)}>จัดการหมวดหมู่</button>
          <label className="flex flex-wrap items-center gap-2 text-sm">
            ลำดับเมนู
            <select className="input w-auto" aria-label="รูปแบบลำดับเมนู" value={currentOrder.mode}
              disabled={settingsLoading || isLoading || saveOrder.isPending} onChange={e => startOrder(e.target.value as MenuOrder['mode'])}>
              <option value="name">เรียงตามชื่อ ก–ฮ / A–Z</option>
              <option value="manual">จัดลำดับเอง</option>
            </select>
          </label>
          {!draft && savedOrder.mode === 'manual' && <button type="button" className="btn-secondary" disabled={isLoading || settingsLoading} onClick={() => startOrder('manual')}>จัดลำดับเมนู</button>}
        </div>
      )}
      {draft && <div className="sticky top-0 z-20 rounded-xl border border-green-200 bg-white p-3 shadow-md space-y-2">
        <p className="text-sm">{draft.mode === 'manual' ? 'กดค้างที่ปุ่มลาก แล้วปล่อยบนเมนูปลายทางในหมวดเดียวกัน หรือใช้ปุ่มขึ้น–ลง' : 'จะแสดงเมนูเรียงตามชื่อภายในแต่ละหมวด'}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" disabled={saveOrder.isPending} onClick={() => void handleSaveOrder()}>{saveOrder.isPending ? 'กำลังบันทึก…' : 'บันทึกลำดับ'}</button>
          <button type="button" className="btn-secondary" disabled={saveOrder.isPending} onClick={() => { setDraft(null); setOrderError('') }}>ยกเลิกการจัดลำดับ</button>
        </div>
        {orderError && <p role="alert" className="text-sm text-red-700">{orderError}</p>}
      </div>}
      {orderMessage && <p role="status" className="text-sm text-green-800">{orderMessage}</p>}

      {isOwnerOrManager && showCategories && (
        <ManagementDialog title="จัดการหมวดหมู่" busy={categoryBusy} onClose={() => setShowCategories(false)}>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-gray-500 mt-1">ปิดหมวดเพื่อซ่อนเมนูจากหน้าขาย หรือลบถาวรได้เฉพาะหมวดว่าง</p>
          </div>
          <div className="flex gap-2 items-center">
            <input
              className="input flex-1"
              placeholder="เพิ่มหมวดหมู่ใหม่"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
              disabled={categoryBusy}
            />
            <button className="btn-secondary" onClick={handleAddCategory} disabled={categoryBusy}>
              {saveCategory.isPending ? 'กำลังเพิ่ม…' : '+ หมวด'}
            </button>
          </div>
          {categoryError && <p className="text-sm text-red-600">{categoryError}</p>}
          <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
            {(categories ?? []).map((category, index) => (
              <CategoryRow
                key={category.id}
                category={category}
                productCount={(products ?? []).filter((p) => p.category_id === category.id).length}
                busy={categoryBusy}
                canMoveUp={index > 0}
                canMoveDown={index < (categories?.length ?? 0) - 1}
                onMove={delta => void moveCategory(category.id, delta)}
                onRename={async (name) => {
                  setCategoryError('')
                  try {
                    await saveCategory.mutateAsync({
                      id: category.id,
                      name,
                      sort_order: category.sort_order,
                      is_active: category.is_active,
                    })
                  } catch (error) {
                    setCategoryError(error instanceof Error ? error.message : 'เปลี่ยนชื่อหมวดไม่สำเร็จ')
                  }
                }}
                onToggle={async () => {
                  setCategoryError('')
                  try {
                    await saveCategory.mutateAsync({
                      id: category.id,
                      name: category.name,
                      sort_order: category.sort_order,
                      is_active: !category.is_active,
                    })
                  } catch (error) {
                    setCategoryError(error instanceof Error ? error.message : 'เปลี่ยนสถานะหมวดไม่สำเร็จ')
                  }
                }}
                onDelete={async () => {
                  if (!window.confirm(`ลบหมวด “${category.name}” ถาวรหรือไม่?`)) return
                  setCategoryError('')
                  try {
                    await deleteCategory.mutateAsync(category.id)
                  } catch (error) {
                    setCategoryError(error instanceof Error ? error.message : 'ลบหมวดไม่สำเร็จ')
                  }
                }}
              />
            ))}
          </div>
        </div>
        </ManagementDialog>
      )}

      {isLoading && <p className="text-gray-500">กำลังโหลด…</p>}

      {(categories ?? []).filter((cat) => showInactive || cat.is_active).map((cat) => {
        const items = productsInCategory(cat.id)
        if (items.length === 0) return null
        return (
          <section key={cat.id}>
            <h2 className="font-semibold text-gray-700 mb-2">{cat.name}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map((p, index) => renderProduct(p, items, index))}
            </div>
          </section>
        )
      })}

      {productsInCategory(null).length > 0 && (
        <section>
          <h2 className="font-semibold text-gray-700 mb-2">ไม่มีหมวด</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {productsInCategory(null).map((p, index) => renderProduct(p, productsInCategory(null), index))}
          </div>
        </section>
      )}

      {editingProductId !== undefined && (
        <ProductEditor productId={editingProductId} onClose={() => setEditingProductId(undefined)} />
      )}
    </div>
  )
}

function CategoryRow({
  category,
  productCount,
  busy,
  onRename,
  onToggle,
  onDelete,
  canMoveUp,
  canMoveDown,
  onMove,
}: {
  category: Category
  productCount: number
  busy: boolean
  onRename: (name: string) => Promise<void>
  onToggle: () => Promise<void>
  canMoveUp: boolean
  canMoveDown: boolean
  onMove: (delta: number) => void
  onDelete: () => Promise<void>
}) {
  const [name, setName] = useState(category.name)
  const trimmedName = name.trim()
  const hasNameChange = trimmedName !== category.name

  return (
    <div className={`p-3 flex flex-col sm:flex-row sm:items-center gap-2 ${!category.is_active ? 'bg-gray-50 opacity-70' : ''}`}>
      <input
        className="input flex-1"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && trimmedName && hasNameChange) onRename(trimmedName)
        }}
        disabled={busy}
        aria-label={`ชื่อหมวด ${category.name}`}
      />
      <span className="text-xs text-gray-500 whitespace-nowrap">{productCount} เมนู</span>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary min-h-11" aria-label={`เลื่อนหมวดขึ้น ${category.name}`} disabled={busy || !canMoveUp} onClick={() => onMove(-1)}>↑</button>
        <button type="button" className="btn-secondary min-h-11" aria-label={`เลื่อนหมวดลง ${category.name}`} disabled={busy || !canMoveDown} onClick={() => onMove(1)}>↓</button>
        <button
          className="btn-secondary text-xs"
          onClick={() => onRename(trimmedName)}
          disabled={busy || !trimmedName || !hasNameChange}
        >
          เปลี่ยนชื่อ
        </button>
        <button className={`btn text-xs ${category.is_active ? 'btn-secondary' : 'btn-primary'}`} onClick={onToggle} disabled={busy}>
          {category.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
        </button>
        <button
          className="btn text-xs border border-red-200 text-red-600 hover:bg-red-50"
          onClick={onDelete}
          disabled={busy || productCount > 0}
          title={productCount > 0 ? 'ต้องย้ายเมนูออกจากหมวดนี้ก่อน' : 'ลบหมวดว่างถาวร'}
        >
          ลบ
        </button>
      </div>
    </div>
  )
}

function ProductCard({
  product,
  canToggle,
  onEdit,
  onToggle,
}: {
  product: Product
  canToggle: boolean
  onEdit: () => void
  onToggle: () => void
}) {
  const profit = unitProfit(product.price, product.cost_cached)
  const margin = marginPercent(product.price, product.cost_cached)
  return (
    <div className={`card p-4 relative ${!product.is_active ? 'opacity-50' : ''}`}>
      <button onClick={onEdit} className="w-full text-left hover:opacity-80 transition-opacity">
        <div className="font-semibold">{product.name}</div>
        <div className="text-sm text-gray-500 mt-1">ราคา {formatBahtSymbol(product.price)}</div>
        <div className="text-sm text-gray-500">ต้นทุน {formatBahtSymbol(product.cost_cached)}</div>
        <div className="text-sm mt-1">
          กำไร <span className="font-medium text-brand-700">{formatBahtSymbol(profit)}</span> ({margin}%)
        </div>
      </button>
      {canToggle && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggle() }}
          className={`mt-2 w-full btn text-xs ${product.is_active ? 'btn-secondary' : 'btn-primary'}`}
        >
          {product.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
        </button>
      )}
    </div>
  )
}
