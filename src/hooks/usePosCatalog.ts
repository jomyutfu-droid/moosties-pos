import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { optionsForProduct } from '@/domain/toppings'
import type { Category, Ingredient, ProductWithRecipe } from '@/types'

/**
 * โหลดเมนู/สูตร/ตัวเลือก/วัตถุดิบจากแคช IndexedDB (Dexie) — ใช้กับหน้าขายเพื่อให้ทำงานได้แบบออฟไลน์
 * ข้อมูลจะถูกเติมโดย refreshReferenceData() (เรียกตอนแอปเริ่มทำงานและเป็นระยะตอนออนไลน์)
 */
export function usePosCatalog(): {
  categories: Category[]
  products: ProductWithRecipe[]
  ingredients: Ingredient[]
  ingredientsById: Map<string, Ingredient>
  loading: boolean
} {
  const result = useLiveQuery(async () => {
    const [categories, products, options, recipeItems, ingredients, toppings] = await Promise.all([
      db.categories.toArray(),
      db.products.toArray(),
      db.product_options.toArray(),
      db.recipe_items.toArray(),
      db.ingredients.toArray(),
      db.store_toppings.toArray(),
    ])

    const ingredientsById = new Map(ingredients.map((i) => [i.id, i]))
    const recipeByProduct = new Map<string, typeof recipeItems>()
    for (const r of recipeItems) {
      const list = recipeByProduct.get(r.product_id) ?? []
      list.push(r)
      recipeByProduct.set(r.product_id, list)
    }

    const activeCategoryIds = new Set(categories.filter((c) => c.is_active).map((c) => c.id))
    const productsWithRecipe: ProductWithRecipe[] = products
      .filter((p) => p.is_active && (p.category_id === null || activeCategoryIds.has(p.category_id)))
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((p) => ({
        ...p,
        recipe_items: (recipeByProduct.get(p.id) ?? [])
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((r) => ({ ...r, ingredient: ingredientsById.get(r.ingredient_id)! }))
          .filter((r) => r.ingredient),
        options: optionsForProduct(p.id, options, toppings),
      }))

    const sortedCategories = categories
      .filter((c) => c.is_active)
      .sort((a, b) => a.sort_order - b.sort_order)

    return { categories: sortedCategories, products: productsWithRecipe, ingredients, ingredientsById }
  }, [])

  return {
    categories: result?.categories ?? [],
    products: result?.products ?? [],
    ingredients: result?.ingredients ?? [],
    ingredientsById: result?.ingredientsById ?? new Map(),
    loading: result === undefined,
  }
}
