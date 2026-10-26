import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/production',()=>({productionAction:vi.fn()}))
vi.mock('@/lib/dailyTea',()=>({bangkokDate:()=> '2026-10-26'}))
vi.mock('@/components/SearchSelect',()=>({SearchSelect:({options}:{options:{value:string;label:string}[]})=><select>{options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select>}))
import { PrepWasteForm } from './PrepWaste'
import type { ProductionData } from '@/domain/production'
const data={ingredients:[
  {id:'raw',name:'วัตถุดิบทั่วไป',is_active:true,unit:'กรัม'},
  {id:'auto',name:'โปรตีนสูตรผสม',is_active:true,unit:'กรัม',auto_prep:true},
  {id:'manual',name:'ซอสที่ผลิต',is_active:true,unit:'กรัม'},
  {id:'inactive-recipe',name:'ผลผลิตสูตรปิด',is_active:true,unit:'กรัม'},
  {id:'inactive-output',name:'ผลผลิตปิด',is_active:false,unit:'กรัม'},
],recipes:[
  {id:'r1',output_id:'auto',is_active:true,deduction_mode:'sale'},
  {id:'r2',output_id:'manual',is_active:true,deduction_mode:'produce'},
  {id:'r3',output_id:'inactive-recipe',is_active:false},
  {id:'r4',output_id:'inactive-output',is_active:true},
  {id:'r5',output_id:'auto',is_active:true},
],history:[],can_manage:true} as unknown as ProductionData
function render(value:ProductionData){return renderToStaticMarkup(<PrepWasteForm data={value} token="test" onSaved={()=>{}} />)}
describe('production waste choices',()=>{
  it('lists only active recipe outputs for both deduction modes and excludes raw materials',()=>{
    const html=render(data)
    expect(html).toContain('โปรตีนสูตรผสม')
    expect(html).toContain('ซอสที่ผลิต')
    expect(html).not.toContain('วัตถุดิบทั่วไป')
    expect(html).not.toContain('ผลผลิตสูตรปิด')
    expect(html).not.toContain('ผลผลิตปิด')
    expect((html.match(/<option\b/g)??[])).toHaveLength(2)
  })
  it('shows an empty state without falling back to every ingredient',()=>{
    const html=render({...data,recipes:[]})
    expect(html).toContain('ยังไม่มีผลผลิตจากสูตรผลิตที่เปิดใช้งาน')
    expect(html).not.toContain('วัตถุดิบทั่วไป')
    expect(html).not.toContain('<option')
  })
})
