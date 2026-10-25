const menuNameCollator = new Intl.Collator('th', { sensitivity: 'base', numeric: true })

/** Use the same alphabetical order for the online menu and offline POS catalog. */
export function compareMenuNames(a: { id: string; name: string }, b: { id: string; name: string }): number {
  return menuNameCollator.compare(a.name.trim(), b.name.trim()) || a.id.localeCompare(b.id)
}

export interface MenuOrder {
  mode: 'name' | 'manual'
  product_ids: string[]
}

export function normaliseMenuOrder(value: unknown): MenuOrder {
  if (!value || typeof value !== 'object') return { mode: 'name', product_ids: [] }
  const order = value as Partial<MenuOrder>
  return {
    mode: order.mode === 'manual' ? 'manual' : 'name',
    product_ids: Array.isArray(order.product_ids)
      ? [...new Set(order.product_ids.filter((id): id is string => typeof id === 'string'))] : [],
  }
}

export function sortMenuProducts<T extends { id: string; name: string }>(products: T[], value: unknown): T[] {
  const order = normaliseMenuOrder(value)
  const positions = new Map(order.product_ids.map((id, index) => [id, index]))
  return [...products].sort((a, b) => order.mode === 'manual'
    ? (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity) || compareMenuNames(a, b)
    : compareMenuNames(a, b))
}

/** Move within the same category only; preserve hidden products and all other categories. */
export function moveMenuProduct<T extends { id: string; category_id: string | null }>(products: T[], fromId: string, toId: string): T[] {
  const from = products.findIndex(p => p.id === fromId)
  const to = products.findIndex(p => p.id === toId)
  if (from < 0 || to < 0 || from === to || products[from].category_id !== products[to].category_id) return products
  const result = [...products]
  const [item] = result.splice(from, 1)
  result.splice(to, 0, item)
  return result
}
