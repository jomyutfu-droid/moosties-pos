import { useState } from 'react'
import { budgetPeriod, budgetToday, channelLabels, expenseLabels, summarizeBudget, type BudgetEntry, type BudgetData } from '@/domain/shopBudget'
import { useShopBudget } from '@/hooks/useShopBudget'
import { formatBahtSymbol as baht } from '@/lib/money'
const empty: BudgetData = { sales: [], entries: [], line_man_days: [] }
const dateLabel = (d: string) => new Date(`${d}T12:00:00+07:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })

export default function ShopBudgetPage() {
 const [range, setRange] = useState(() => budgetPeriod('month'))
 const [preset, setPreset] = useState('month')
 const report = useShopBudget(range.from, range.to)
 const [editor, setEditor] = useState<BudgetEntry | null>(null)
 const [receipt, setReceipt] = useState<string | null>(null)
 const [actionError, setActionError] = useState('')
 const data = report.data ?? empty
 const summary = summarizeBudget(data)
 const validRange = !!range.from && !!range.to && range.from <= range.to && (Date.parse(range.to) - Date.parse(range.from)) / 86400000 <= 366
 const usable = !!report.data && !report.isError && validRange
 function add(kind: 'expense' | 'platform') {
  setActionError('')
  setEditor({ id: crypto.randomUUID(), kind, entry_date: range.to > budgetToday() ? budgetToday() : range.to, category: kind === 'expense' ? 'other' : 'line_man', amount: 0, fees: 0, cogs: null, note: '' })
 }
 async function voidEntry(entry: BudgetEntry) {
  if (!window.confirm(`ยกเลิกรายการ ${dateLabel(entry.entry_date)} จำนวน ${baht(entry.amount)} หรือไม่?`)) return
  setActionError('')
  try { await report.mutation.mutateAsync({ action: 'void', entry: { id: entry.id } }) }
  catch (e) { setActionError(e instanceof Error ? e.message : 'ยกเลิกไม่สำเร็จ') }
 }
 async function showReceipt(id: string) {
  setActionError('')
  try { setReceipt(await report.receipt(id)) }
  catch (e) { setActionError(e instanceof Error ? e.message : 'เปิดใบเสร็จไม่สำเร็จ') }
 }
 return <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
  <header className="flex flex-wrap items-start justify-between gap-3">
   <div><p className="text-xs tracking-widest text-brand-700 font-semibold">MOOSTIES · สำหรับเจ้าของร้าน</p><h1 className="text-2xl sm:text-3xl font-bold mt-1">งบบริหารร้าน</h1><p className="text-sm text-gray-500 mt-2">ยอดขาย ต้นทุน และกำไรจากการดำเนินงานในหน้าเดียว</p></div>
   <button className="btn-secondary" disabled={report.isFetching || !validRange} onClick={() => void report.refetch()}>{report.isFetching ? 'กำลังโหลด…' : '↻ อัปเดตยอด'}</button>
  </header>
  <section className="card p-4 space-y-3" aria-label="ช่วงเวลารายงาน">
   <div className="flex flex-wrap gap-2">{([['today','วันนี้'],['week','สัปดาห์นี้'],['month','เดือนนี้']] as const).map(([key, label]) => <button key={key} className={preset === key ? 'btn-primary' : 'btn-secondary'} onClick={() => { setPreset(key); setRange(budgetPeriod(key)) }}>{label}</button>)}</div>
   <div className="grid grid-cols-2 gap-3 max-w-lg">
    <label className="text-sm">ตั้งแต่<input aria-label="วันที่เริ่มต้น" type="date" className="input mt-1" value={range.from} onChange={e => { setPreset('custom'); setRange({ ...range, from: e.target.value }) }} /></label>
    <label className="text-sm">ถึง<input aria-label="วันที่สิ้นสุด" type="date" className="input mt-1" value={range.to} onChange={e => { setPreset('custom'); setRange({ ...range, to: e.target.value }) }} /></label>
   </div>
   {!validRange && <p role="alert" className="text-red-700 text-sm">เลือกวันเริ่มต้นไม่เกินวันสิ้นสุด และช่วงไม่เกิน 367 วัน</p>}
  </section>
  {report.isError && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">โหลดงบไม่สำเร็จ: {report.error.message}</p>}
  {report.isLoading && <p role="status">กำลังรวบรวมยอดขายและค่าใช้จ่าย…</p>}
  {usable && <>
   <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
    <Metric label="ยอดขายสุทธิ" value={summary.sales} /><Metric label="ต้นทุนสินค้าที่ขาย" value={summary.cogs} />
    <Metric label="ค่าใช้จ่ายรวม" value={summary.totalExpenses} hint="รวมค่าธรรมเนียมแพลตฟอร์ม" />
    <Metric label={summary.profit < 0 ? 'ขาดทุนเบื้องต้น' : 'กำไรเบื้องต้น'} value={summary.profit} highlight hint="ตามข้อมูลที่บันทึก" />
   </div>
   <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
    <strong>ตรวจความครบถ้วนก่อนใช้ยอดกำไร</strong>
    <p className="mt-1">ค่าแรง/โบนัส ค่าเช่า น้ำไฟ และของเสีย ใช้ยอดที่เจ้าของบันทึกในหน้านี้ ยังไม่ดึงจากหน้าค่าแรงหรือรายการทิ้งอัตโนมัติ กรุณาบันทึกเฉพาะค่าใช้จ่ายของช่วงที่เลือก และไม่ลงรายการเดิมซ้ำ</p>
    {summary.warnings.length > 0 && <details className="mt-2"><summary className="cursor-pointer font-semibold">มีข้อมูลที่ต้องตรวจเพิ่ม {summary.warnings.length} รายการ</summary><ul className="mt-2 space-y-1 max-h-48 overflow-auto">{summary.warnings.map(w => <li key={w}>• {w}</li>)}</ul></details>}
    {!data.entries.some(e => e.kind === 'expense') && <p className="mt-2 font-semibold">ยังไม่มีค่าใช้จ่ายที่บันทึกในช่วงนี้</p>}
   </section>
   <section className="card overflow-hidden">
    <div className="p-4 sm:p-5 border-b"><h2 className="text-lg font-bold">จากยอดขาย ถึงกำไรของร้าน</h2><p className="text-xs text-gray-500 mt-1">{dateLabel(range.from)} – {dateLabel(range.to)} · วันที่ตามเวลาประเทศไทย</p></div>
    <div className="p-4 sm:p-5 space-y-1">
     {summary.channels.map(c => <AmountRow key={c.source} label={`ขาย${channelLabels[c.source]}`} value={c.sales} />)}
     <AmountRow label="ยอดขายสุทธิรวม" value={summary.sales} strong />
     <AmountRow label="หัก ต้นทุนวัตถุดิบและบรรจุภัณฑ์ที่ขาย" value={-summary.cogs} />
     <AmountRow label="กำไรขั้นต้น" value={summary.gross} strong />
     {summary.channels.filter(c => c.source !== 'store').map(c => <AmountRow key={c.source} label={`ค่าธรรมเนียม ${channelLabels[c.source]}`} value={-c.fees} />)}
     {summary.expenses.map(e => <AmountRow key={e.category} label={expenseLabels[e.category]} value={-e.amount} />)}
     <div className={`mt-3 rounded-xl px-4 py-3 ${summary.profit < 0 ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-900'}`}><AmountRow label="กำไร / ขาดทุนจากการดำเนินงาน" value={summary.profit} strong /><p className="text-xs mt-1">เป็นงบบริหารเบื้องต้น ยังไม่รวมรายการที่ไม่ได้บันทึก เช่น ค่าเสื่อมราคา ดอกเบี้ย และภาษีเงินได้</p></div>
    </div>
   </section>
   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    <button className="btn-primary min-h-14" onClick={() => add('expense')}>＋ บันทึกค่าใช้จ่าย</button>
    <button className="btn-secondary min-h-14" onClick={() => add('platform')}>＋ บันทึกยอด Grab / LINE MAN</button>
   </div>
   <p className="text-xs text-gray-500">ยอดซื้อวัตถุดิบที่ยังเหลือในสต๊อกไม่ใช่ต้นทุนขายทั้งก้อน · พร้อมเพย์และเงินสดรวมอยู่ในยอดขายหน้าร้าน · ยอดแพลตฟอร์มที่บันทึกใช้แทนยอด POS ของช่องทางและวันเดียวกัน</p>
   <section className="card p-4 sm:p-5"><h2 className="font-bold text-lg">รายการที่บันทึก</h2><p className="text-xs text-gray-500 mt-1 mb-3">แก้ไขหรือยกเลิกได้จากรายการเดิม เพื่อไม่ให้ยอดซ้ำ</p>
    {actionError && <p role="alert" className="text-red-700 mb-3">{actionError}</p>}
    {!data.entries.length && <p className="text-sm text-gray-400 py-4">ยังไม่มีรายการในช่วงวันที่นี้</p>}
    <div className="divide-y">{data.entries.map(e => <article key={e.id} className="py-3 space-y-2">
     <div className="flex justify-between gap-3"><div><p className="font-semibold">{e.kind === 'expense' ? expenseLabels[e.category as keyof typeof expenseLabels] : channelLabels[e.category as 'grab' | 'line_man']}</p><p className="text-xs text-gray-500">{dateLabel(e.entry_date)} · {e.kind === 'expense' ? 'ค่าใช้จ่าย' : 'ยอดขายสุทธิรายวัน'}</p></div><strong className="whitespace-nowrap">{baht(Number(e.amount))}</strong></div>
     {e.kind === 'platform' && <p className="text-xs text-gray-600">ค่าธรรมเนียม {baht(Number(e.fees))} · ต้นทุน {e.cogs == null ? (e.category === 'grab' ? 'ใช้ยอด POS (ต้องตรวจความครบถ้วน)' : 'ยังไม่ระบุ') : baht(Number(e.cogs))}</p>}
     {e.note && <p className="text-sm break-words text-gray-600">{e.note}</p>}
     <div className="flex flex-wrap gap-2"><button className="btn-secondary text-sm" onClick={() => { setActionError(''); setEditor(e) }}>แก้ไข</button>{e.has_receipt && <button className="btn-secondary text-sm" onClick={() => void showReceipt(e.id)}>ดูใบเสร็จ</button>}<button className="btn-ghost text-red-700 text-sm" disabled={report.mutation.isPending} onClick={() => void voidEntry(e)}>ยกเลิกรายการ</button></div>
    </article>)}</div>
   </section>
  </>}
  {editor && <BudgetEditor key={editor.id} entry={editor} busy={report.mutation.isPending} onClose={() => setEditor(null)} onSave={async entry => { await report.mutation.mutateAsync({ action: 'save', entry }); setEditor(null) }} />}
  {receipt && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="ใบเสร็จ"><div className="bg-white rounded-xl p-3 max-w-2xl max-h-[90dvh] overflow-auto"><button className="btn-secondary mb-3" onClick={() => setReceipt(null)}>ปิดใบเสร็จ</button><img src={receipt} alt="ใบเสร็จประกอบค่าใช้จ่าย" className="max-w-full" /></div></div>}
 </div>
}
function Metric({ label, value, hint, highlight }: { label: string; value: number; hint?: string; highlight?: boolean }) {
 return <div className={`rounded-2xl border p-4 ${highlight ? value < 0 ? 'bg-red-50 border-red-200 text-red-900' : 'bg-green-50 border-green-200 text-green-900' : 'bg-white border-gray-200'}`}><p className="text-sm">{label}</p><p className="text-xl sm:text-2xl font-bold mt-2 break-words">{baht(value)}</p>{hint && <p className="text-xs opacity-70 mt-1">{hint}</p>}</div>
}
function AmountRow({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
 return <div className={`flex items-baseline justify-between gap-4 py-2 ${strong ? 'font-bold border-t border-gray-100 mt-2' : 'text-sm text-gray-700'}`}><span>{label}</span><span className="whitespace-nowrap tabular-nums">{baht(value)}</span></div>
}
function BudgetEditor({ entry, busy, onClose, onSave }: { entry: BudgetEntry; busy: boolean; onClose: () => void; onSave: (entry: BudgetEntry) => Promise<void> }) {
 const [draft, setDraft] = useState(entry)
 const [amount, setAmount] = useState(entry.updated_at ? String(entry.amount) : '')
 const [fees, setFees] = useState(entry.updated_at ? String(entry.fees) : '')
 const [cogs, setCogs] = useState(entry.cogs == null ? '' : String(entry.cogs))
 const [error, setError] = useState('')
 const [reading, setReading] = useState(false)
 const platform = draft.kind === 'platform'
 async function attach(file?: File) {
  if (!file) return
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 1000000) { setError('เลือกรูป JPG, PNG หรือ WebP ขนาดไม่เกิน 1 MB'); return }
  setReading(true); setError('')
  try {
   const value = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(file) })
   setDraft(d => ({ ...d, receipt: value, has_receipt: true }))
  } catch { setError('อ่านไฟล์ไม่สำเร็จ') } finally { setReading(false) }
 }
 async function submit(e: React.FormEvent) {
  e.preventDefault(); setError('')
  if (busy || reading) return
  const numbers = [amount, ...(platform ? [fees] : []), ...(cogs !== '' ? [cogs] : [])]
  if (numbers.some(n => !n.trim() || !Number.isFinite(Number(n)) || Number(n) < 0 || Number(n) >= 1e12) || (!platform && Number(amount) <= 0)) { setError('กรอกจำนวนเงินให้ถูกต้อง ค่าใช้จ่ายต้องมากกว่า 0'); return }
  try { await onSave({ ...draft, amount: Number(amount), fees: platform ? Number(fees) : 0, cogs: platform && cogs !== '' ? Number(cogs) : null }) }
  catch (e) { setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ') }
 }
 return <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-labelledby="budget-editor-title">
  <form onSubmit={submit} className="bg-white rounded-2xl w-full max-w-lg max-h-[92dvh] overflow-y-auto p-5 space-y-4">
   <h2 id="budget-editor-title" className="text-xl font-bold">{entry.updated_at ? 'แก้ไข' : 'บันทึก'}{platform ? 'ยอดแพลตฟอร์ม' : 'ค่าใช้จ่าย'}</h2>
   <label className="block text-sm">วันที่ของ{platform ? 'ยอดขาย' : 'ค่าใช้จ่าย'}<input required type="date" className="input mt-1" value={draft.entry_date} max={budgetToday()} onChange={e => setDraft({ ...draft, entry_date: e.target.value })} /></label>
   <label className="block text-sm">{platform ? 'ช่องทางขาย' : 'ประเภทค่าใช้จ่าย'}<select className="input mt-1" value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value as BudgetEntry['category'] })}>{Object.entries(platform ? { grab: 'Grab', line_man: 'LINE MAN' } : expenseLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
   {platform && <p className="bg-green-50 rounded-lg p-3 text-sm text-green-900">กรอกยอดรวมทั้งวัน หลังหักส่วนลดที่ร้านรับผิดชอบและคืนเงิน แต่ก่อนหักค่าธรรมเนียม ยอดนี้จะใช้แทนยอดขาย POS ของช่องทางเดียวกันในวันนั้น</p>}
   <label className="block text-sm">{platform ? 'ยอดขายสุทธิทั้งวัน' : 'จำนวนเงิน'} (บาท)<input required inputMode="decimal" type="number" min={platform ? '0' : '0.01'} step="0.01" className="input mt-1" value={amount} onChange={e => setAmount(e.target.value)} /></label>
   {platform && <>
    <label className="block text-sm">ค่าธรรมเนียมรวมของวัน (บาท)<input required inputMode="decimal" type="number" min="0" step="0.01" className="input mt-1" value={fees} onChange={e => setFees(e.target.value)} /><span className="text-xs text-gray-500">รวม GP และค่าบริการที่ร้านรับผิดชอบ หากไม่มีให้กรอก 0</span></label>
    <label className="block text-sm">ต้นทุนสินค้าที่ขายของช่องทางนี้ทั้งวัน (บาท)<input inputMode="decimal" type="number" min="0" step="0.01" className="input mt-1" value={cogs} onChange={e => setCogs(e.target.value)} /><span className="text-xs text-gray-500">{draft.category === 'grab' ? 'เว้นว่างเพื่อใช้ต้นทุนบิล POS กรอกเองหาก POS มีออเดอร์ไม่ครบ' : 'LINE MAN ยังไม่เก็บต้นทุนในบิล หากเว้นว่าง งบจะเตือนว่าต้นทุนยังไม่ครบ'}</span></label>
   </>}
   {!platform && <p className="text-xs text-gray-500">บันทึกค่าใช้จ่ายตามช่วงที่เกิดขึ้น เช่น ค่าแรงและโบนัสรวมตามสรุปค่าแรง ไม่ลงยอดซื้อวัตถุดิบทั้งก้อนซ้ำกับต้นทุนสูตร</p>}
   <label className="block text-sm">หมายเหตุ / ช่วงที่ค่าใช้จ่ายครอบคลุม<textarea className="input mt-1" rows={2} maxLength={1000} value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} /></label>
   <label className="block text-sm">แนบใบเสร็จ (ไม่บังคับ)<input className="block mt-2 text-sm max-w-full" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => void attach(e.target.files?.[0])} /><span className="text-xs text-gray-500">JPG / PNG / WebP ไม่เกิน 1 MB</span></label>
   {draft.has_receipt && <div className="flex items-center gap-2 text-sm text-green-800">แนบใบเสร็จแล้ว<button type="button" className="btn-ghost" onClick={() => setDraft({ ...draft, receipt: null, has_receipt: false })}>เอารูปออก</button></div>}
   {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
   <div className="flex justify-end gap-2 sticky bottom-0 bg-white py-2"><button type="button" className="btn-ghost" disabled={busy || reading} onClick={onClose}>ยกเลิก</button><button className="btn-primary" disabled={busy || reading}>{busy ? 'กำลังบันทึก…' : reading ? 'กำลังอ่านรูป…' : 'บันทึก'}</button></div>
  </form>
 </div>
}
