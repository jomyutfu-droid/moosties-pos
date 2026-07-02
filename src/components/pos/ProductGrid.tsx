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
    <div className="flex-1 min-w-0 p-4 flex flex-col gap-3">
      {/* Category tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          className={`btn whitespace-nowrap ${activeCategory === 'all' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveCategory('all')}
        >
          ทั้งหมด
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            className={`btn whitespace-nowrap ${activeCategory === c.id ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveCategory(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Search bar */}
      <div
        className="flex items-center px-4 h-11 text-sm"
        style={{
          background: 'rgba(255,255,255,.55)',
          backdropFilter: 'blur(14px)',
          border: '1px solid rgba(255,255,255,.82)',
          borderRadius: '14px',
          color: '#5c7466',
        }}
      >
        ค้นหาเมนู…
      </div>

      {/* Product grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 overflow-y-auto">
        {visible.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p)}
            disabled={!p.is_available}
            className="card p-4 text-left disabled:opacity-40 transition-shadow hover:shadow-lg"
            style={{ cursor: p.is_available ? 'pointer' : 'not-allowed' }}
          >
            <div className="font-bold text-base" style={{ color: '#123524' }}>{p.name}</div>
            <div className="text-sm mt-1 font-bold" style={{ color: '#16a34a' }}>
              {formatBahtSymbol(p.price)}
            </div>
            {!p.is_available && (
              <div className="text-xs text-red-500 mt-1">สินค้าหมด</div>
            )}
          </button>
        ))}
        {visible.length === 0 && (
          <p className="col-span-full text-center py-10 text-sm" style={{ color: '#5c7466' }}>
            ไม่มีเมนูในหมวดนี้
          </p>
        )}
      </div>
    </div>
  )
}
