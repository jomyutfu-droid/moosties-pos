import { expect, it } from 'vitest'
import { sortMenuProducts, moveMenuProduct, normaliseMenuOrder } from './menuOrder'
const rows = [{id:'a',name:'Apple',category_id:'fruit'},{id:'b',name:'Banana',category_id:'fruit'},{id:'c',name:'Cacao',category_id:'other'}]
it('persists manual order and appends new items',()=>{expect(sortMenuProducts(rows,{mode:'manual',product_ids:['b','a']}).map(p=>p.id)).toEqual(['b','a','c'])})
it('moves only within category without mutating original',()=>{expect(moveMenuProduct(rows,'a','b').map(p=>p.id)).toEqual(['b','a','c']);expect(moveMenuProduct(rows,'a','c')).toBe(rows);expect(rows[0].id).toBe('a')})
it('defaults old settings and restores alphabetical mode',()=>{expect(normaliseMenuOrder(null).mode).toBe('name');expect(sortMenuProducts([...rows].reverse(),{mode:'name',product_ids:['b']}).map(p=>p.id)).toEqual(['a','b','c'])})
