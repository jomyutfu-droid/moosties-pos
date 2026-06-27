import { useState } from 'react'
import { useCategories, useProducts, useSaveCategory } from '@/hooks/useMenu'
import { marginPercent, unitProfit } from '@/domain/cogs'
import { formatBahtSymbol } from '@/lib/money'
import { ProductEditor } from '@/components/ProductEditor'

export default function MenuPage() {
  const { data: categories } = useCategories()
  const { data: products, isLoading } = useProducts()
  const saveCategory = useSaveCategory()
  const [editingProductId, setEditingProductId] = useState<string | null | undefined>(undefined)
  const [newCategory, setNewCategory] = useState('')

  const activeProducts = (products ?? []).filter((p) => p.is_active)

  function productsInCategory(categoryId: string | null) {
    return activeProducts.filter((p) => p.category_id === categoryId)
  }

  async function handleAddCategory() {
    if (!newCategory.trim()) return
    await saveCategory.mutateAsync({
      name: newCategory.trim(),
      sort_order: (categories?.length ?? 0) + 1,
      is_active: true,
    })
    setNewCategory('')
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">เมนู / สูตร (Recipe Card)</h1>
        <button className="btn-primary" onClick={() => setEditingProductId(null)}>
          + เพิ่มเมนู
        </button>
      </div>

      <div className="card p-3 flex gap-2 items-center">
        <input
          className="input flex-1"
          placeholder="เพิ่มหมวดหมู่ใหม่"
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
        />
        <button className="btn-secondary" onClick={handleAddCategory}>
          + หมวด
        </button>
      </div>

      {isLoading && <p className="text-gray-500">กำลังโหลด…</p>}

      {(categories ?? []).map((cat) => {
        const items = productsInCategory(cat.id)
        if (items.length === 0) return null
        return (
          <section key={cat.id}>
            <h2 className="font-semibold text-gray-700 mb-2">{cat.name}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map((p) => (
                <ProductCard key={p.id} product={p} onEdit={() => setEditingProductId(p.id)} />
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
              <ProductCard key={p.id} product={p} onEdit={() => setEditingProductId(p.id)} />
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

function ProductCard({
  product,
  onEdit,
}: {
  product: { id: string; name: string; price: number; cost_cached: number; sku: string | null }
  onEdit: () => void
}) {
  const profit = unitProfit(product.price, product.cost_cached)
  const margin = marginPercent(product.price, product.cost_cached)
  return (
    <button onClick={onEdit} className="card p-4 text-left hover:border-brand-500 hover:shadow">
      <div className="font-semibold">{product.name}</div>
      <div className="text-sm text-gray-500 mt-1">ราคา {formatBahtSymbol(product.price)}</div>
      <div className="text-sm text-gray-500">ต้นทุน {formatBahtSymbol(product.cost_cached)}</div>
      <div className="text-sm mt-1">
        กำไร <span className="font-medium text-brand-700">{formatBahtSymbol(profit)}</span> ({margin}%)
      </div>
    </button>
  )
}
