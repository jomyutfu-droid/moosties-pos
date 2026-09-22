import { describe, expect, it, vi } from 'vitest'
import { lineManLines, lineManTotals, normalizeLineManRef } from './lineMan'
import { stockMovementsForOrder } from './stock'
import { buildPrintHTML, type ReceiptInfo } from '@/components/pos/ReceiptModal'
import type { CartLine } from '@/types'

vi.mock('@/hooks/useSettings', () => ({ useSettings: () => ({ data: {} }) }))
const lines = (): CartLine[] => [{ uid: 'line', qty: 2, unitPrice: 70, unitCogs: 12, product: {
  id: 'drink', name: 'ชา', price: 50, line_man_price: 75.5,
  recipe_items: [{ingredient_id:'syrup',qty:20,ingredient:{name:'น้ำเชื่อม',unit:'ml',category:'วัตถุดิบ'}}],
  options: [{id:'jelly',name:'เจลลี่',price_delta:10,line_man_price:15}],
}, selectedOptions: [
  { option_id:'sweetness:less',name:'หวานน้อย',price_delta:0,qty_delta:0,linked_ingredient_id:null },
  { option_id:'sweetness:less:syrup',name:'ปรับสูตร',price_delta:0,qty_delta:-10,linked_ingredient_id:'syrup',hidden_label:true },
  { option_id:'jelly',name:'เจลลี่ ×2',quantity:2,price_delta:20,qty_delta:40,linked_ingredient_id:'jelly',ingredient_name:'เจลลี่',ingredient_unit:'g' },
] } as CartLine]

describe('LINE MAN pricing and receipt isolation', () => {
  it('reprices menu and topping count without mutating store prices, recipes, COGS or stock', () => {
    const cart = lines()
    const before = structuredClone(cart)
    const priced = lineManLines(cart)
    expect(priced[0].unitPrice).toBe(105.5)
    expect(priced[0].selectedOptions[2].price_delta).toBe(30)
    expect(priced[0].unitCogs).toBe(12)
    expect(stockMovementsForOrder(priced)).toEqual(stockMovementsForOrder(cart))
    expect(cart).toEqual(before)
    expect(lineManTotals(priced, 10.25)).toEqual({ subtotal:211, discount:10.25, total:200.75 })
  })
  it('blocks missing menu and selected topping prices, but allows explicit zero', () => {
    const cart = lines(); cart[0].product.line_man_price = null
    expect(() => lineManLines(cart)).toThrow('ชา')
    cart[0].product.line_man_price = 0
    cart[0].product.options[0].line_man_price = null
    expect(() => lineManLines(cart)).toThrow('เจลลี่')
    cart[0].product.options[0].line_man_price = 0
    expect(lineManLines(cart)[0].unitPrice).toBe(0)
  })
  it('supports old topping quantity snapshots and blocks unavailable options', () => {
    const cart = lines(); delete cart[0].selectedOptions[2].quantity
    expect(lineManLines(cart)[0].unitPrice).toBe(105.5)
    cart[0].product.options = []
    expect(() => lineManLines(cart)).toThrow('ไม่พบตัวเลือก')
  })
  it.each([-1, 1000, NaN, 0.001])('rejects invalid merchant discount %s', discount => {
    expect(() => lineManTotals(lineManLines(lines()), discount)).toThrow('ส่วนลด')
  })
  it('requires a full nonblank reference and normalizes without losing leading zeros', () => {
    expect(normalizeLineManRef('  000ab-123  ')).toBe('000AB-123')
    for (const ref of ['', ' ', 'a b', '<script>', 'x'.repeat(81)]) expect(() => normalizeLineManRef(ref)).toThrow()
  })
  it('prints delivery reference on receipt and every recipe sheet, with immutable snapshots and escaped text', () => {
    const priced = lineManLines(lines())
    const receipt: ReceiptInfo = {source:'line_man',lineManOrderId:'000AB-123',orderNo:'<unsafe>',lines:priced,total:200.75,paid:200.75,change:0,discount:10.25,createdAt:'2026-09-22T00:00:00Z'}
    const stored = JSON.parse(JSON.stringify(receipt)) as ReceiptInfo
    priced[0].unitPrice = 999
    const html = buildPrintHTML(stored,{header:'MOOSTIES <TEST>',footer:'ขอบคุณ'})
    expect(html.match(/000AB-123/g)).toHaveLength(3)
    expect(html.match(/class="sticker"/g)).toHaveLength(2)
    expect(html).toContain('200.75')
    expect(html).toContain('105.50')
    expect(html).toContain('หวานน้อย, เจลลี่ ×2')
    expect(html).toContain('&lt;unsafe&gt;')
    expect(html).not.toContain('<unsafe>')
    expect(html).toContain('ส่วนลดร้านค้า')
    const storeHtml = buildPrintHTML({...stored,source:undefined,lineManOrderId:undefined},{header:'MOOSTIES',footer:''})
    expect(storeHtml).not.toContain('LINE MAN</div>')
    expect(storeHtml).toContain('<td>รับเงิน</td>')
  })
})
