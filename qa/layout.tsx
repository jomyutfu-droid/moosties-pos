import {createRoot} from 'react-dom/client'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {useState} from 'react'
import ProductionPage from '../src/pages/ProductionPage'
import {IngredientEditor} from '../src/components/inventory/IngredientEditor'
import '../src/index.css'
const qc=new QueryClient({defaultOptions:{queries:{retry:false}}})
function Demo(){
 const [width,setWidth]=useState(390)
 const [view,setView]=useState('production')
 const embedded=new URLSearchParams(location.search).has('embedded')
 return <QueryClientProvider client={qc}>{!embedded ? <div><div className="p-3 flex gap-3 flex-wrap bg-amber-100">ข้อมูลจำลองเท่านั้น{[320,390,768,1024].map(w=><button key={w} onClick={()=>setWidth(w)}>{w}px</button>)}</div><iframe title="ทดสอบช่องกรอก" src="/?embedded" style={{width,maxWidth:'100%',height:900,border:'1px solid gray'}}/></div>:<><nav className="flex gap-2 p-2"><button onClick={()=>setView('production')}>ผลิต</button><button onClick={()=>setView('ingredient')}>หน่วยแปลง</button></nav>{view==='production'?<ProductionPage/>:<IngredientEditor ingredient={null} onClose={()=>setView('production')}/>}</>}</QueryClientProvider>
}
createRoot(document.getElementById('root')!).render(<Demo/>)
