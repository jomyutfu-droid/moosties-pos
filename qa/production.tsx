import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import ProductionPage from '../src/pages/ProductionPage'
import '../src/index.css'
const qc=new QueryClient({defaultOptions:{queries:{retry:false}}})
function Demo(){
 const [mobile,setMobile]=useState(false)
 const embedded=new URLSearchParams(location.search).has('mobile')
 return <QueryClientProvider client={qc}>{!embedded && <div className="p-2 bg-amber-100 text-xs flex gap-4">ทดสอบด้วยข้อมูลจำลอง · ไม่เชื่อมต่อสต็อกจริง<button onClick={()=>setMobile(!mobile)}>สลับมือถือ / คอมพิวเตอร์</button></div>}{mobile?<iframe title="หน้าผลิตบนมือถือ" src="/?mobile" style={{width:390,height:850,border:'1px solid #aaa'}}/>:<div style={{height:embedded?'100dvh':'calc(100dvh - 35px)'}}><ProductionPage/></div>}</QueryClientProvider>
}
createRoot(document.getElementById('root')!).render(<Demo/> )
