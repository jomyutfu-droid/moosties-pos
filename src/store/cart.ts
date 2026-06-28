import { create } from 'zustand'
import { unitCost, unitPrice } from '@/domain/cogs'
import type { CartLine, Ingredient, ProductWithRecipe, SelectedOption } from '@/types'

interface CartState {
  lines: CartLine[]
  discount: number
  note: string
  addLine: (product: ProductWithRecipe, options: SelectedOption[], ingredientsById: Map<string, Ingredient>) => void
  incrementLine: (uid: string, delta: number) => void
  removeLine: (uid: string) => void
  setDiscount: (value: number) => void
  setNote: (value: string) => void
  clear: () => void
}

let uidCounter = 0
function nextUid() {
  uidCounter += 1
  return `line-${Date.now()}-${uidCounter}`
}

export const useCartStore = create<CartState>((set) => ({
  lines: [],
  discount: 0,
  note: '',
  addLine: (product, options, ingredientsById) =>
    set((state) => {
      const price = unitPrice(product, options)
      const cost = unitCost(product, options, ingredientsById)
      // รวมรายการที่สินค้า+ตัวเลือกเหมือนกันเข้าด้วยกัน
      const optionsKey = JSON.stringify(options.map((o) => o.option_id).sort())
      const existing = state.lines.find(
        (l) => l.product.id === product.id && JSON.stringify(l.selectedOptions.map((o) => o.option_id).sort()) === optionsKey,
      )
      if (existing) {
        return {
          lines: state.lines.map((l) => (l.uid === existing.uid ? { ...l, qty: l.qty + 1 } : l)),
        }
      }
      const line: CartLine = {
        uid: nextUid(),
        product,
        qty: 1,
        selectedOptions: options,
        unitPrice: price,
        unitCogs: cost,
      }
      return { lines: [...state.lines, line] }
    }),
  incrementLine: (uid, delta) =>
    set((state) => ({
      lines: state.lines
        .map((l) => (l.uid === uid ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0),
    })),
  removeLine: (uid) => set((state) => ({ lines: state.lines.filter((l) => l.uid !== uid) })),
  setDiscount: (value) => set({ discount: value }),
  setNote: (value) => set({ note: value }),
  clear: () => set({ lines: [], discount: 0, note: '' }),
}))

export function cartSubtotal(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0)
}

export function cartCogsTotal(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.unitCogs * l.qty, 0)
}

/** Feature 7: sync สถานะตะกร้าไปยัง localStorage เพื่อให้หน้าจอลูกค้าอ่านได้ */
const DISPLAY_KEY = 'moosties-display'

useCartStore.subscribe((state) => {
  try {
    const payload = {
      lines: state.lines.map((l) => ({
        name: l.product.name,
        qty: l.qty,
        unitPrice: l.unitPrice,
        options: l.selectedOptions.map((o) => o.name).join(', '),
      })),
      discount: state.discount,
      subtotal: cartSubtotal(state.lines),
      total: Math.max(0, cartSubtotal(state.lines) - state.discount),
      updatedAt: Date.now(),
    }
    localStorage.setItem(DISPLAY_KEY, JSON.stringify(payload))
  } catch {
    // ไม่ทำให้แอปพัง ถ้า localStorage เต็ม/ไม่พร้อม
  }
})
