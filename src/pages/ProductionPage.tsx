import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSessionStore } from '@/store/session'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { productionAction, refreshProductionStock } from '@/lib/production'
import { productionPreview, type ProductionBatch, type ProductionData, type ProductionRecipe } from '@/domain/production'
import { ProductionRecipeEditor } from '@/components/inventory/ProductionRecipeEditor'
import { formatBahtSymbol, formatStockQty, round3 } from '@/lib/money'

export default function ProductionPage() {
  const token=useSessionStore(s=>s.pinSessionToken)
  const online=useOnlineStatus()
  const qc=useQueryClient()
  const [tab,setTab]=useState<'produce'|'recipes'|'history'>('produce')
  const [page,setPage]=useState(0)
  const {data,isLoading,error:loadError,refetch,isFetching}=useQuery({queryKey:['production',token,page],queryFn:()=>productionAction<ProductionData>(token,'load',{page}),enabled:!!token && online,staleTime:0})
  const [editing,setEditing]=useState<ProductionRecipe|null|undefined>()
  const [selected,setSelected]=useState('')
  const [rounds,setRounds]=useState('1')
  const [actual,setActual]=useState('')
  const [note,setNote]=useState('')
  const [review,setReview]=useState(false)
  const [detail,setDetail]=useState<ProductionBatch|null>(null)
  const [reason,setReason]=useState('')
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [busy,setBusy]=useState(false)
  const lock=useRef(false)
  const attempt=useRef<{id:string;recipe_id:string;revision:number;rounds:number;actual_qty:number;note:string}|null>(null)
  const [attempted,setAttempted]=useState(false)
  const ingredients=data?.ingredients ?? []
  const recipe=data?.recipes.find(r=>r.id===selected)
  const output=ingredients.find(i=>i.id===recipe?.output_id)
  const amount=Number(rounds),yieldQty=Number(actual)
  const rows=recipe ? productionPreview(recipe,amount,ingredients) : []
  const total=rows.reduce((sum,r)=>sum+r.cost,0)
  const valid=!!recipe?.is_active && !!output?.is_active && output.unit===recipe.output_unit && output.stock_qty>=0 && amount>0 && amount<=1000 && yieldQty>0 && yieldQty<=1000000 && rows.length>0 && rows.every(r=>!r.unavailable && r.shortage===0 && r.qty>0)
  function refresh() {
    void qc.invalidateQueries({queryKey:['production']})
    for(const key of ['ingredients-full','ingredients','stock-movements']) void qc.invalidateQueries({queryKey:[key]})
    refreshProductionStock()
  }
  function selectRecipe(id:string) {setSelected(id);setRounds('1');setActual('');setNote('');setError('');setMessage('')}
  async function produce() {
    if(lock.current || !recipe) return
    lock.current=true;setBusy(true);setError('')
    try {
      attempt.current ??= {id:crypto.randomUUID(),recipe_id:recipe.id,revision:recipe.revision,rounds:amount,actual_qty:yieldQty,note}
      setAttempted(true)
      const result=await productionAction<ProductionBatch>(token,'produce',attempt.current)
      setMessage(`บันทึกแล้ว: ${result.output_name} ${formatStockQty(result.actual_qty,result.output_unit)} · ปรับสต็อกเรียบร้อย`)
      setSelected('');setReview(false);setActual('');setNote('');setAttempted(false);attempt.current=null;refresh()
    } catch(e){setError(e instanceof Error?e.message:'บันทึกไม่ได้ กรุณาตรวจประวัติก่อนเริ่มรายการใหม่')}
    finally{lock.current=false;setBusy(false)}
  }
  async function cancelBatch() {
    if(lock.current || !detail || !reason.trim())return
    lock.current=true;setBusy(true);setError('')
    try{await productionAction(token,'cancel',{id:detail.id,reason});setDetail(null);setReason('');setMessage('ยกเลิกและคืนสต็อกเรียบร้อย');refresh()}
    catch(e){setError(e instanceof Error?e.message:'ยกเลิกไม่ได้')}
    finally{lock.current=false;setBusy(false)}
  }
  return <div className="h-full overflow-y-auto p-4 md:p-6"><div className="mx-auto max-w-5xl space-y-5 pb-8">
    <header className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-green-700 tracking-wide">MOOSTIES · PREP KITCHEN</p><h1 className="text-2xl font-bold text-green-950 mt-1">ผลิตวัตถุดิบ</h1><p className="text-sm text-gray-600 mt-1">ผสมวัตถุดิบ → บันทึกผลผลิต → พร้อมใช้ในหน้าขาย</p></div><button className="btn-secondary text-sm shrink-0" disabled={isFetching||busy||!online} onClick={()=>void refetch()}>รีเฟรช</button></header>
    <nav className="grid grid-cols-3 bg-white/80 border rounded-2xl p-1 gap-1" aria-label="หน้าการผลิต">{([['produce','ผลิต'],['recipes','สูตรผลิต'],['history','ประวัติ']] as const).map(([key,label])=><button key={key} className={`py-3 rounded-xl font-semibold ${tab===key?'bg-green-800 text-white':'text-gray-600'}`} onClick={()=>{setTab(key);setError('')}}>{label}</button>)}</nav>
    {!online && <p role="alert" className="p-3 bg-amber-50 text-amber-900 rounded-xl">เชื่อมต่ออินเทอร์เน็ตก่อนบันทึกการผลิต</p>}
    {!token && <p role="alert">กรุณาเข้าสู่ระบบด้วย PIN อีกครั้ง</p>}
    {loadError && <p role="alert" className="p-3 bg-red-50 text-red-800 rounded-xl">{loadError.message}</p>}
    {message && <p role="status" className="p-4 bg-green-100 text-green-950 rounded-xl">{message}</p>}
    {error && !review && !detail && <p role="alert" className="text-red-800 bg-red-50 p-3 rounded-xl">{error}</p>}
    {isLoading ? <p>กำลังโหลดสูตรและสต็อก…</p> : data && <>
    {tab==='produce' && <div className="grid lg:grid-cols-[1fr_1.1fr] gap-5">
      <section className="bg-white rounded-2xl border p-5 space-y-5">
        <h2 className="font-bold text-lg">1. เลือกสูตรที่จะผลิต</h2>
        <select aria-label="เลือกสูตรผลิต" className="input" value={selected} onChange={e=>selectRecipe(e.target.value)}><option value="">เลือกสูตร เช่น ซอส / ครีมชีส</option>{data.recipes.filter(r=>r.is_active).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select>
        {!data.recipes.some(r=>r.is_active) && <div className="text-sm text-gray-600 bg-gray-50 rounded-xl p-4">ยังไม่มีสูตรผลิต{data.can_manage ? <button className="block text-green-800 underline mt-2" onClick={()=>setEditing(null)}>+ สร้างสูตรแรก</button> : <p className="mt-2">ให้เจ้าของร้านตั้งสูตรก่อนเริ่มผลิต</p>}</div>}
        {recipe && <><h2 className="font-bold text-lg">2. จำนวนรอบที่ผลิต</h2><div className="flex gap-2">{[1,2,3].map(n=><button key={n} className={`px-4 py-2 rounded-xl border ${amount===n?'bg-green-100 border-green-600':''}`} onClick={()=>setRounds(String(n))}>{n} รอบ</button>)}</div><label className="block text-sm">กำหนดจำนวนรอบเอง<input className="input mt-1" type="number" min="0.001" max="1000" step="0.001" value={rounds} onChange={e=>setRounds(e.target.value)}/></label><p className="bg-green-50 text-green-900 p-3 rounded-xl">คาดว่าจะได้ <strong>{formatStockQty(round3(recipe.expected_qty*amount),recipe.output_unit)}</strong></p>
        {recipe.instructions && <div><h3 className="font-bold mb-1">วิธีทำ</h3><p className="whitespace-pre-wrap text-sm text-gray-600">{recipe.instructions}</p></div>}</>}
      </section>
      <section className="bg-white rounded-2xl border p-5 space-y-4">
        <h2 className="font-bold text-lg">ส่วนผสมที่ต้องใช้</h2>
        {!recipe ? <p className="text-gray-500 text-sm py-12 text-center">เลือกสูตรเพื่อดูส่วนผสมและสต็อก</p> : <>
          <div className="divide-y">{rows.map(r=><div key={r.ingredient_id} className="py-3 flex gap-3 justify-between"><div className="min-w-0"><p className="font-semibold">{r.name}</p><p className="text-xs text-gray-500">มี {formatStockQty(r.stock,r.base_unit)} · หลังผลิต {formatStockQty(round3(r.stock-r.qty),r.base_unit)}</p>{r.unavailable && <p className="text-xs text-red-700">วัตถุดิบหรือหน่วยเปลี่ยนแปลง ให้เจ้าของตรวจสูตร</p>}{r.shortage>0 && <p className="text-sm text-red-700 font-bold">ขาด {formatStockQty(r.shortage,r.base_unit)}</p>}</div><strong className="shrink-0 text-sm">{formatStockQty(r.qty,r.base_unit)}</strong></div>)}</div>
          <p className="text-sm flex justify-between"><span>ต้นทุนส่วนผสมโดยประมาณ</span><strong>{formatBahtSymbol(total)}</strong></p>
          <div className="border-t pt-4 space-y-3"><h2 className="font-bold text-lg">3. ชั่งผลผลิตจริง</h2><label className="block text-sm">ได้ {output?.name} กี่{recipe.output_unit}<input className="input mt-2 text-xl" type="number" min="0.001" max="1000000" step="0.001" placeholder="กรอกหลังผลิตเสร็จ" value={actual} onChange={e=>setActual(e.target.value)}/></label><button className="text-sm text-green-800 underline" onClick={()=>setActual(String(round3(recipe.expected_qty*amount)))}>ได้เท่ากับสูตร ({formatStockQty(round3(recipe.expected_qty*amount),recipe.output_unit)})</button>{yieldQty>0 && <p className="text-xs text-gray-500">ต้นทุนรอบนี้ ≈ {(total/yieldQty).toFixed(4)} บาท/{recipe.output_unit}</p>}<label className="block text-sm">หมายเหตุ (ถ้ามี)<textarea className="input mt-1" rows={2} value={note} maxLength={1000} onChange={e=>setNote(e.target.value)}/></label>
          {output && (!output.is_active || output.stock_qty<0 || output.unit!==recipe.output_unit) && <p className="text-red-800 text-sm">ตรวจผลผลิต: ปิดใช้งาน เปลี่ยนหน่วย หรือสต็อกติดลบ</p>}
          <button className="btn-primary w-full min-h-12" disabled={!valid||!online||busy} onClick={()=>{setReview(true);setError('')}}>ตรวจรายการและยืนยันผลิต</button><p className="text-xs text-gray-500">ต้นทุนคำนวณอีกครั้งจากสต็อกล่าสุดตอนยืนยัน</p></div>
        </>}
      </section>
    </div>}
    {tab==='recipes' && <section className="space-y-3"><div className="flex justify-between gap-2 items-center"><p className="text-sm text-gray-600">สูตรต่อ 1 รอบ · {data.recipes.length} สูตร</p>{data.can_manage && <button className="btn-primary" onClick={()=>setEditing(null)}>+ เพิ่มสูตร</button>}</div>{!data.recipes.length && <p className="bg-white p-6 rounded-xl">เริ่มจากตั้งสูตรแรก เช่น ครีมชีส หรือซอสสตรอว์เบอร์รี</p>}{data.recipes.map(r=><div key={r.id} className="bg-white border rounded-2xl p-5 flex gap-3 justify-between"><div><h3 className="font-bold">{r.name}{!r.is_active && <span className="text-gray-500 text-xs ml-2">ปิดใช้งาน</span>}</h3><p className="text-sm text-gray-600 mt-1">{ingredients.find(i=>i.id===r.output_id)?.name} · {formatStockQty(r.expected_qty,r.output_unit)} / รอบ · {r.items.length} ส่วนผสม</p></div>{data.can_manage && <button className="btn-secondary shrink-0 self-start" onClick={()=>setEditing(r)}>แก้ไข</button>}</div>)}</section>}
    {tab==='history' && <section className="space-y-3"><p className="text-sm text-gray-500">ประวัติการผลิตของสาขา · หน้าละ 20 รายการ</p>{!data.history.length && <p className="bg-white rounded-xl p-6">ยังไม่มีรายการผลิตในหน้านี้</p>}{data.history.slice(0,20).map(b=><button key={b.id} className="w-full text-left bg-white border rounded-2xl p-4 flex gap-3 justify-between items-center" onClick={()=>{setDetail(b);setReason('');setError('')}}><div><p className="font-bold">{b.recipe_name}</p><p className="text-xs text-gray-500 mt-1">{new Date(b.created_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})} · {b.user_name}</p><p className={`text-xs mt-1 ${b.status==='cancelled'?'text-red-700':'text-green-800'}`}>{b.status==='cancelled'?'ยกเลิกแล้ว':'ผลิตสำเร็จ'} · ดูรายละเอียด ›</p></div><strong className="text-green-900 text-right">{formatStockQty(b.actual_qty,b.output_unit)}</strong></button>)}<div className="flex justify-between items-center"><button className="btn-secondary" disabled={page===0||isFetching} onClick={()=>setPage(page-1)}>ก่อนหน้า</button><span className="text-sm">หน้า {page+1}</span><button className="btn-secondary" disabled={data.history.length<=20||isFetching} onClick={()=>setPage(page+1)}>ถัดไป</button></div></section>}
    </>}
    {editing!==undefined && data && <ProductionRecipeEditor recipe={editing} ingredients={ingredients} token={token} onClose={()=>setEditing(undefined)} reload={()=>void refetch()} onSaved={()=>{setEditing(undefined);setMessage('บันทึกสูตรเรียบร้อย');refresh()}}/>}
    {review && recipe && <div className="fixed inset-0 z-40 bg-black/45 flex items-center justify-center p-3"><section role="dialog" aria-modal="true" aria-labelledby="production-confirm" className="bg-white rounded-2xl p-5 w-full max-w-lg max-h-[90dvh] overflow-y-auto space-y-4"><h2 id="production-confirm" className="font-bold text-xl">ยืนยันผลิต {recipe.name}</h2><p className="text-sm">ใช้ส่วนผสมตามสูตร {rounds} รอบ</p><ul className="text-sm space-y-2">{rows.map(r=><li key={r.ingredient_id} className="flex justify-between gap-3"><span>{r.name}</span><strong>−{formatStockQty(r.qty,r.base_unit)}</strong></li>)}</ul><p className="bg-green-50 rounded-xl p-4 font-bold text-green-900">รับเข้า {output?.name} +{formatStockQty(yieldQty,recipe.output_unit)}</p>{error && <p role="alert" className="bg-red-50 text-red-800 p-3 rounded-xl">{error}</p>}{attempted && <p className="text-xs text-gray-600">หากเน็ตขัดข้อง กดตรวจสอบ/ลองซ้ำได้โดยไม่ตัดสต็อกซ้ำ หากต้องเปลี่ยนจำนวน ให้ปิดแล้วตรวจประวัติก่อนเริ่มใหม่</p>}<div className="flex gap-2"><button className="btn-secondary" disabled={busy} onClick={()=>{setReview(false);attempt.current=null;setAttempted(false)}}>{attempted?'ปิด / ตรวจประวัติ':'กลับไปแก้ไข'}</button><button className="btn-primary flex-1 min-h-12" disabled={busy||!online||(!attempted&&!valid)} onClick={()=>void produce()}>{busy?'กำลังบันทึก…':attempted?'ตรวจสอบ / ลองซ้ำ':'ยืนยันผลิตและปรับสต็อก'}</button></div></section></div>}
    {detail && <div className="fixed inset-0 z-40 bg-black/45 flex items-center justify-center p-3"><section role="dialog" aria-modal="true" aria-labelledby="batch-detail" className="bg-white rounded-2xl p-5 w-full max-w-lg max-h-[90dvh] overflow-y-auto space-y-4"><header className="flex justify-between gap-3"><h2 id="batch-detail" className="font-bold text-xl">{detail.recipe_name}</h2><button disabled={busy} onClick={()=>setDetail(null)}>ปิด</button></header><p className="text-sm text-gray-500">{new Date(detail.created_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})} · {detail.user_name}</p><p className="text-xs text-gray-400 break-all">รหัส {detail.id}</p><p className="bg-green-50 p-3 rounded-xl">ผลิตจริง <strong>{formatStockQty(detail.actual_qty,detail.output_unit)}</strong><br/><span className="text-sm">คาดไว้ {formatStockQty(detail.expected_qty,detail.output_unit)} · {detail.rounds} รอบ</span></p><div className="divide-y">{detail.items.map(i=><div key={i.ingredient_id} className="py-2 flex gap-3 justify-between text-sm"><span>{i.name}</span><span>{formatStockQty(i.qty,i.unit)}</span></div>)}</div><p className="text-sm">ต้นทุนรวม {formatBahtSymbol(detail.total_cost)} · {Number(detail.batch_unit_cost).toFixed(4)} บาท/{detail.output_unit}</p>{detail.note && <p className="text-sm whitespace-pre-wrap">หมายเหตุ: {detail.note}</p>}{detail.status==='cancelled'?<p className="bg-red-50 p-3 text-red-800 rounded-xl">ยกเลิกแล้ว: {detail.cancel_reason}</p>:data?.can_manage && <div className="border-t pt-4 space-y-3"><p className="text-xs text-gray-600">ยกเลิกได้เมื่อผลผลิตยังไม่มีการใช้งานหรือปรับสต็อก/ต้นทุนภายหลัง ระบบจะคืนส่วนผสมและนำผลผลิตออก</p><label className="block text-sm">เหตุผลยกเลิก<input className="input mt-1" value={reason} onChange={e=>setReason(e.target.value)} maxLength={500}/></label><button className="btn-secondary w-full text-red-700" disabled={busy||!reason.trim()||!online} onClick={()=>{if(window.confirm('ยืนยันยกเลิกรายการผลิตนี้และย้อนสต็อก?'))void cancelBatch()}}>{busy?'กำลังยกเลิก…':'ยกเลิกการผลิตและคืนสต็อก'}</button></div>}{error && <p role="alert" className="text-red-800 bg-red-50 p-3 rounded-xl">{error}</p>}</section></div>}
  </div></div>
}
