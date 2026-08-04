import { useState } from 'react'
import {
  useCategories,
  useDeleteEmptyCategory,
  useProducts,
  useSaveCategory,
  useToggleProductActive,
} from '@/hooks/useMenu'
import { useSessionStore } from '@/store/session'
import { marginPercent, unitProfit } from '@/domain/cogs'
import { formatBahtSymbol } from '@/lib/money'
import { ProductEditor } from '@/components/ProductEditor'
import type { Category, Product } from '@/types'

export default function MenuPage() {
  const { data: categories } = useCategories()
  const { data: products, isLoading } = useProducts()
  const saveCategory = useSaveCategory()
  const deleteCategory = useDeleteEmptyCategory()
  const toggleActive = useToggleProductActive()
  const activeStaff = useSessionStore((s) => s.activeStaff)
  const isOwnerOrManager = activeStaff?.role === 'owner' || activeStaff?.role === 'manager'

  const [editingProductId, setEditingProductId] = useState<string | null | undefined>(undefined)
  const [newCategory, setNewCategory] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [categoryError, setCategoryError] = useState('')

  const visibleProducts = (products ?? []).filter((p) => showInactive || p.is_active)

  function productsInCategory(categoryId: string | null) {
    return visibleProducts.filter((p) => p.category_id === categoryId)
  }

  async function handleAddCategory() {
    if (!newCategory.trim()) return
    setCategoryError('')
    try {
      await saveCategory.mutateAsync({
        name: newCategory.trim(),
        sort_order: (categories?.length ?? 0) + 1,
        is_active: true,
      })
      setNewCategory('')
    } catch (error) {
      setCategoryError(error instanceof Error ? error.message : 'เพิ่มหมวดหมู่ไม่สำเร็จ')
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">เมนู / สูตร (Recipe Card)</h1>
        <div className="flex gap-2 items-center">
          {isOwnerOrManager && (
            <label className="flex items-center gap-1 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded"
              />
              แสดงที่ปิดใช้งาน
            </label>
          )}
          <button className="btn-primary" onClick={() => setEditingProductId(null)}>
            + เพิ่มเมนู
          </button>
        </div>
      </div>

      {isOwnerOrManager && (
        <div className="card p-4 space-y-3">
          <div>
            <h2 className="font-semibold text-gray-800">จัดการหมวดหมู่</h2>
            <p className="text-xs text-gray-500 mt-1">ปิดหมวดเพื่อซ่อนเมนูจากหน้าขาย หรือลบถาวรได้เฉพาะหมวดว่าง</p>
          </div>
          <div className="flex gap-2 items-center">
            <input
              className="input flex-1"
              placeholder="เพิ่มหมวดหมู่ใหม่"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
              disabled={saveCategory.isPending}
            />
            <button className="btn-secondary" onClick={handleAddCategory} disabled={saveCategory.isPending}>
              {saveCategory.isPending ? 'กำลังเพิ่ม…' : '+ หมวด'}
            </button>
          </div>
          {categoryError && <p className="text-sm text-red-600">{categoryError}</p>}
          <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
            {(categories ?? []).map((category) => (
              <CategoryRow
                key={category.id}
                category={category}
                productCount={(products ?? []).filter((p) => p.category_id === category.id).length}
                busy={saveCategory.isPending || deleteCategory.isPending}
                onRename={async (name) => {
                  setCategoryError('')
                  try {
                    await saveCategory.mutateAsync({ ...category, name })
                  } catch (error) {
                    setCategoryError(error instanceof Error ? error.message : 'เปลี่ยนชื่อหมวดไม่สำเร็จ')
                  }
                }}
                onToggle={async () => {
                  setCategoryError('')
                  try {
                    await saveCategory.mutateAsync({ ...category, is_active: !category.is_active })
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
      )}

      {isLoading && <p className="text-gray-500">กำลังโหลด…</p>}

      {(categories ?? []).filter((cat) => showInactive || cat.is_active).map((cat) => {
        const items = productsInCategory(cat.id)
        if (items.length === 0) return null
        return (
          <section key={cat.id}>
            <h2 className="font-semibold text-gray-700 mb-2">{cat.name}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  canToggle={isOwnerOrManager}
                  onEdit={() => setEditingProductId(p.id)}
                  onToggle={() => toggleActive.mutate({ id: p.id, is_active: !p.is_active })}
                />
              ))}
            </div>
          </section>
        )
      })}

      {productsInCategory(null).length > 0 && (
        <section>
          <h2 className="font-semibold text-gray-700 mb-2">ไม่มีหมวด</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {productsInCategory(null).map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                canToggle={isOwnerOrManager}
                onEdit={() => setEditingProductId(p.id)}
                onToggle={() => toggleActive.mutate({ id: p.id, is_active: !p.is_active })}
              />
            ))}
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
}: {
  category: Category
  productCount: number
  busy: boolean
  onRename: (name: string) => Promise<void>
  onToggle: () => Promise<void>
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
      <div className="flex gap-2">
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
