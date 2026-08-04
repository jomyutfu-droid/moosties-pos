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
  const [search, setSearch] = useState('')

  const query = search.trim().toLocaleLowerCase('th-TH')
  const visible = products.filter((product) => {
    const matchesCategory = activeCategory === 'all' || product.category_id === activeCategory
    const matchesSearch =
      query === '' ||
      product.name.toLocaleLowerCase('th-TH').includes(query) ||
      product.sku?.toLocaleLowerCase('th-TH').includes(query)
    return matchesCategory && Boolean(matchesSearch)
  })
  const categoryById = new Map(categories.map((category) => [category.id, category]))
  const groupedProducts: { category: Category | null; products: ProductWithRecipe[] }[] = []
  if (activeCategory === 'all') {
    groupedProducts.push(
      ...categories
        .map((category) => ({ category, products: visible.filter((product) => product.category_id === category.id) }))
        .filter((group) => group.products.length > 0),
    )
    const uncategorized = visible.filter((product) => !product.category_id || !categoryById.has(product.category_id))
    if (uncategorized.length > 0) groupedProducts.push({ category: null, products: uncategorized })
  } else {
    groupedProducts.push({ category: categoryById.get(activeCategory) ?? null, products: visible })
  }

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
      <input
        aria-label="ค้นหาเมนู"
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="ค้นหาเมนู…"
        className="flex items-center px-4 h-11 text-sm"
        style={{
          background: 'rgba(255,255,255,.55)',
          backdropFilter: 'blur(14px)',
          border: '1px solid rgba(255,255,255,.82)',
          borderRadius: '14px',
          color: '#5c7466',
        }}
      />

      {/* Product grid */}
      <div className="overflow-y-auto space-y-5">
        {groupedProducts.map((group) => (
          <section key={group.category?.id ?? 'uncategorized'}>
            {activeCategory === 'all' && (
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-sm font-extrabold whitespace-nowrap" style={{ color: '#123524' }}>
                  {group.category?.name ?? 'อื่น ๆ'}
                </h2>
                <div className="h-px flex-1" style={{ background: 'rgba(18,53,36,.18)' }} />
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {group.products.map((p) => (
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
                  {!p.is_available && <div className="text-xs text-red-500 mt-1">สินค้าหมด</div>}
                </button>
              ))}
            </div>
          </section>
        ))}
        {visible.length === 0 && (
          <p className="text-center py-10 text-sm" style={{ color: '#5c7466' }}>
            {query ? 'ไม่พบเมนูที่ค้นหา' : 'ไม่มีเมนูในหมวดนี้'}
          </p>
        )}
      </div>
    </div>
  )
}

