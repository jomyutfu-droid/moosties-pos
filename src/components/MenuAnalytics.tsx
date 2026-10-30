import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useSessionStore } from '@/store/session'
import { analyzeMenus, type MenuAnalyticsData, type AnalyzedMenu } from '@/domain/menuAnalytics'
import { channelLabels, type BudgetChannel } from '@/domain/shopBudget'
import { formatBahtSymbol } from '@/lib/money'
const money = (value: number | null) => value == null ? 'ข้อมูลไม่ครบ' : formatBahtSymbol(value)
export function MenuAnalytics({ from, to }: { from: string; to: string }) {
 const token=useSessionStore(s=>s.pinSessionToken)
 const [channel,setChannel]=useState<BudgetChannel|'all'>('all')
 const [tab,setTab]=useState<'top'|'low'|'profit'>('top')
 const [sort,setSort]=useState<'profit'|'margin'>('profit')
 const query=useQuery({ queryKey:['menu-analytics',token,from,to], queryFn:async()=>{
  const {data,error}=await supabase.rpc('shop_menu_analytics',{p_token:token,p_from:from,p_to:to})
  if(error) throw new Error(error.message)
  return data as MenuAnalyticsData
 }, enabled:!!token && !!from && !!to && from<=to, refetchInterval:60000 })
 const result=query.data ? analyzeMenus(query.data,channel,from,to) : null
 const rows=result ? tab==='top' ? result.top : tab==='low' ? result.low : result[sort] : []
 return <section className="card p-4 sm:p-5 space-y-4" aria-label="วิเคราะห์เมนู">
  <div className="flex flex-wrap justify-between gap-3 items-center"><div><h2 className="text-xl font-bold">วิเคราะห์เมนู</h2><p className="text-xs text-gray-500 mt-1">ใช้ช่วงวันที่เดียวกับงบบริหารร้าน</p></div>
   <label className="text-sm">ช่องทางขาย<select aria-label="ช่องทางวิเคราะห์เมนู" className="input mt-1" value={channel} onChange={e=>setChannel(e.target.value as BudgetChannel|'all')}><option value="all">ทั้งหมด</option>{Object.entries(channelLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
  </div>
  {query.isLoading && <p role="status">กำลังวิเคราะห์เมนู…</p>}
  {query.isError && <div role="alert" className="text-red-700">โหลดข้อมูลเมนูไม่สำเร็จ <button className="btn-secondary" onClick={()=>void query.refetch()}>ลองใหม่</button></div>}
  {result && !query.isError && <>
   <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
    <Summary label="จำนวนแก้วที่ขาย" value={`${result.qty.toLocaleString('th-TH')} แก้ว`} note="รวมรายการที่ไม่มีข้อมูลราคา/ต้นทุน" />
    <Summary label="ต้นทุนเฉลี่ยต่อแก้ว" value={money(result.avgCost)} note={`คำนวณจาก ${result.costQty.toLocaleString('th-TH')} / ${result.qty.toLocaleString('th-TH')} แก้วที่มีต้นทุน`} />
    <Summary label="กำไรขั้นต้นเฉลี่ยต่อแก้ว" value={money(result.avgProfit)} note={`คำนวณจาก ${result.completeQty.toLocaleString('th-TH')} / ${result.qty.toLocaleString('th-TH')} แก้วที่ข้อมูลครบ`} />
   </div>
   <div className="flex flex-wrap gap-2" role="group" aria-label="อันดับเมนู">{([['top','ขายดี Top 5'],['low','ขายน้อย 5 อันดับ'],['profit','กำไรขั้นต้นต่ำ 5 อันดับ']] as const).map(([key,label])=><button key={key} aria-pressed={tab===key} className={tab===key?'btn-primary':'btn-secondary'} onClick={()=>setTab(key)}>{label}</button>)}</div>
   {tab==='profit' && <div className="space-y-2"><label className="text-sm">เรียงตาม<select aria-label="เรียงอันดับกำไร" className="input mt-1 max-w-sm" value={sort} onChange={e=>setSort(e.target.value as 'profit'|'margin')}><option value="profit">กำไรบาทต่อแก้วต่ำสุด</option><option value="margin">กำไรขั้นต้น % ต่ำสุด</option></select></label><p className="text-xs text-gray-500">จัดอันดับเฉพาะเมนูที่ข้อมูลครบทุกแก้วในช่องทางที่เลือก · ไม่นำ {result.excluded} เมนูที่ข้อมูลไม่ครบมาจัดอันดับ · อันดับ % ไม่นับเมนูยอดขายสุทธิเป็นศูนย์</p></div>}
   {!rows.length && <p className="text-sm text-gray-500 py-3">{tab==='profit' ? 'ยังไม่มีเมนูที่ข้อมูลครบสำหรับจัดอันดับ ลองเลือกหน้าร้านหรือ Grab' : 'ยังไม่มีรายการขายในช่องทางและช่วงวันที่นี้'}</p>}
   <div className="space-y-3">{rows.map((row,index)=><MenuRow key={row.key} row={row} rank={index+1} showProfit={tab==='profit'} />)}</div>
   {tab==='low' && <details className="rounded-xl border p-3"><summary className="cursor-pointer font-semibold">ยังขายไม่ได้ {result.zero.length} เมนู</summary><p className="text-xs text-gray-500 mt-2">เฉพาะเมนูและหมวดที่เปิดใช้งานปัจจุบัน สถานะเปิดขายในอดีตอาจต่างกัน และยังไม่ทราบว่าเปิดขายบนแต่ละแพลตฟอร์มครบหรือไม่</p><ul className="mt-3 max-h-64 overflow-auto space-y-2">{result.zero.map(p=><li key={p.id} className="text-sm">{p.name} {p.isNew && <span className="text-amber-700">· เพิ่มเมนูในช่วงนี้</span>}</li>)}</ul></details>}
   <div className="text-xs text-gray-500 space-y-1 border-t pt-3"><p>ต้นทุนใช้ข้อมูลที่บันทึกตอนขาย รวมท็อปปิ้งและบรรจุภัณฑ์ที่อยู่ในสูตร ยอดขายกระจายส่วนลดท้ายบิลตามสัดส่วนมูลค่าแต่ละรายการ กำไรขั้นต้นยังไม่หักค่าธรรมเนียมและค่าใช้จ่ายร้าน</p><p>LINE MAN ที่บันทึกเพื่อตัดสต๊อกมีเฉพาะจำนวนแก้ว ยอดแพลตฟอร์ม/ต้นทุนรวมรายวันที่กรอกในงบไม่ได้กระจายกลับมายังเมนู ยอดส่วนนี้จึงอาจไม่เท่ากับงบด้านบน</p></div>
  </>}
 </section>
}
function Summary({label,value,note}:{label:string;value:string;note:string}) {return <div className="rounded-xl bg-green-50 p-3"><p className="text-sm text-green-900">{label}</p><p className="text-xl font-bold mt-2">{value}</p><p className="text-xs text-gray-500 mt-1">{note}</p></div>}
function MenuRow({row,rank,showProfit}:{row:AnalyzedMenu;rank:number;showProfit:boolean}) {
 return <article className="border rounded-xl p-3 sm:p-4"><div className="flex justify-between gap-3"><div className="font-semibold">{rank}. {row.name} {row.isNew && <span className="text-xs font-normal text-amber-700">เพิ่มเมนูในช่วงนี้</span>}</div><strong className="whitespace-nowrap">{row.qty.toLocaleString('th-TH')} แก้ว</strong></div>
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs sm:text-sm mt-3">
   <div><p className="text-gray-500">{showProfit?'ขายเฉลี่ย/แก้ว':'ยอดขายสุทธิ'}</p><p>{money(row.revenue_qty===row.qty ? showProfit?row.avgPrice:row.revenue : null)}</p></div>
   <div><p className="text-gray-500">ต้นทุนเฉลี่ย/แก้ว</p><p>{money(row.avgCost)}</p>{row.cost_qty!==row.qty && <span className="text-xs text-amber-700">มีต้นทุน {row.cost_qty}/{row.qty} แก้ว</span>}</div>
   {showProfit && <><div><p className="text-gray-500">กำไรขั้นต้น/แก้ว</p><strong className={row.avgProfit!=null && row.avgProfit<0?'text-red-700':'text-green-800'}>{money(row.avgProfit)}</strong></div><div><p className="text-gray-500">กำไรขั้นต้น %</p><p>{row.margin==null?'คำนวณไม่ได้':`${row.margin.toFixed(2)}%`}</p></div></>}
  </div>
 </article>
}
