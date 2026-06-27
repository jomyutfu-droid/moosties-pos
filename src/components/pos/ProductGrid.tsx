import { useState } from 'react'
import { formatBahtSymbol } from '@/lib/money'
import type { Category, ProductWithRecipe } from '@/types'

export function ProductGrid({
  categories,
  products,
  onSelect,
}: {
  categories: Category[]
  products: ProductWithRecipe[]
  onSelect: (product: ProductWithRecipe) => void
}) {
  const [activeCategory, setActiveCategory] = useState<string | 'all'>('all')

  const visible =
    activeCategory === 'all' ? products : products.filter((p) => p.category_id === activeCategory)

  return (
    <div className="flex-1 min-w-0 p-4 flex flex-col">
      <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
        <button
          className={`btn ${activeCategory === 'all' ? 'btn-primary' : 'btn-secondary'} whitespace-nowrap`}
          onClick={() => setActiveCategory('all')}
        >
          ทั้งหมด
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            className={`btn ${activeCategory === c.id ? 'btn-primary' : 'btn-secondary'} whitespace-nowrap`}
            onClick={() => setActiveCategory(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 overflow-y-auto">
        {visible.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p)}
            disabled={!p.is_available}
            className="card p-4 text-left hover:border-brand-500 hover:shadow disabled:opacity-40"
          >
            <div className="font-semibold text-lg">{p.name}</div>
            <div className="text-brand-700 font-medium mt-1">{formatBahtSymbol(p.price)}</div>
            {!p.is_available && <div className="text-xs text-red-500 mt-1">สินค้าหมด</div>}
          </button>
        ))}
        {visible.length === 0 && <p className="text-gray-400 col-span-full text-center py-8">ไม่มีเมนูในหมวดนี้</p>}
      </div>
    </div>
  )
}
