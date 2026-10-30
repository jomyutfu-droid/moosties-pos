import { describe,it,expect } from 'vitest'
import { analyzeMenus, type MenuAnalyticsData, type MenuAnalyticsRow } from './menuAnalytics'
const row=(key:string,qty=1,source:MenuAnalyticsRow['source']='store'):MenuAnalyticsRow=>({key,product_id:key,name:key,source,qty,revenue:qty*60,cost:qty*20,revenue_qty:qty,cost_qty:qty,complete_qty:qty,profit:qty*40})
const data=(rows:MenuAnalyticsRow[]):MenuAnalyticsData=>({rows,catalog:[...new Set(rows.map(r=>r.key))].map(id=>({id,name:id,active:true,created:'2026-01-01'}))})
const run=(d:MenuAnalyticsData,c:'all'|'store'|'grab'|'line_man'='all')=>analyzeMenus(d,c,'2026-10-01','2026-10-31')
describe('menu analysis',()=>{
 it('sorts top and low by cups, not revenue, limited to five',()=>{
  const result=run(data(Array.from({length:7},(_,i)=>row(String(i),i+1))))
  expect(result.top.map(r=>r.qty)).toEqual([7,6,5,4,3]);expect(result.low.map(r=>r.qty)).toEqual([1,2,3,4,5])
 })
 it('weights average cost by known cups and excludes operational LM from profit',()=>{
  const result=run(data([row('a',2),{...row('b',8),cost:320,profit:160},{...row('a',10,'line_man'),cost:0,revenue:0,profit:0,revenue_qty:0,cost_qty:0,complete_qty:0}]))
  expect(result.qty).toBe(20);expect(result.costQty).toBe(10);expect(result.avgCost).toBe(36);expect(result.avgProfit).toBe(24)
  expect(result.profit.map(r=>r.key)).toEqual(['b'])
 })
 it('filters channels before combining the same product',()=>{
  const d=data([row('a',2),row('a',5,'grab')]);expect(run(d).top[0].qty).toBe(7);expect(run(d,'store').top[0].qty).toBe(2)
 })
 it('ranks losses first and distinguishes percentage from baht ranking',()=>{
  const result=run(data([{...row('a'),revenue:100,cost:80,profit:20},{...row('b'),revenue:20,cost:5,profit:15},{...row('c'),revenue:10,cost:20,profit:-10}]))
  expect(result.profit.map(r=>r.key)).toEqual(['c','b','a']);expect(result.margin.map(r=>r.key)).toEqual(['c','a','b'])
 })
 it('keeps only active products in low/zero, excludes future products, flags new',()=>{
  const d=data([row('a')]);d.catalog[0].active=false;d.catalog.push({id:'new',name:'ใหม่',active:true,created:'2026-10-20'},{id:'future',name:'อนาคต',active:true,created:'2026-11-01'})
  expect(run(d).low).toHaveLength(0);expect(run(d).zero.map(r=>[r.id,r.isNew])).toEqual([['new',true]])
 })
 it('zero revenue has a baht profit but no percentage',()=>{
  const result=run(data([{...row('a'),revenue:0,profit:-20}]))
  expect(result.profit[0].avgProfit).toBe(-20);expect(result.margin).toHaveLength(0)
 })
 it('does not infer missing costs as free ingredients',()=>{
  const result=run(data([{...row('a'),cost:0,cost_qty:0,complete_qty:0,profit:0}]))
  expect(result.avgCost).toBeNull();expect(result.avgProfit).toBeNull();expect(result.profit).toHaveLength(0)
 })
})
