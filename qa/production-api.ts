import type { ProductionBatch, ProductionData, ProductionRecipe } from '../src/domain/production'
const ingredient=(id:string,name:string,cost:number,stock:number)=>({id,name,cost_per_unit:cost,stock_qty:stock,unit:'กรัม',is_active:true,units:[],pack_qty:1,pack_price:cost,reorder_point:0,category:'วัตถุดิบ',expiry_alert_days:0,created_at:'',updated_at:''})
const data:ProductionData={can_manage:true,ingredients:[ingredient('a','นมสด',0.2,1000),ingredient('b','ผงชีส A',0.3,1000),ingredient('c','ผงชีส B',0.4,1000),ingredient('d','ครีมชีสผสม',1,100)],recipes:[{id:'recipe',name:'ครีมชีสสูตรร้าน',output_id:'d',output_unit:'กรัม',expected_qty:140,instructions:'ผสมผงชีสกับนมให้เข้ากัน แล้วแช่เย็น',is_active:true,revision:1,items:[{ingredient_id:'a',input_qty:80,input_unit:'กรัม',factor:1,base_unit:'กรัม'},{ingredient_id:'b',input_qty:50,input_unit:'กรัม',factor:1,base_unit:'กรัม'},{ingredient_id:'c',input_qty:12.5,input_unit:'กรัม',factor:1,base_unit:'กรัม'}]}],history:[]}
export async function productionAction<T>(_token:string,action:string,p:any={}):Promise<T>{
 if(action==='load')return structuredClone(data) as T
 if(action==='save_recipe') {const r={...p,revision:(p.revision??0)+1,output_unit:'กรัม',items:p.items.map((i:any)=>({...i,factor:1,base_unit:'กรัม'}))} as ProductionRecipe;data.recipes=[...data.recipes.filter(x=>x.id!==p.id),r];return {id:p.id} as T}
 if(action==='produce'){
  const existing=data.history.find(x=>x.id===p.id);if(existing)return existing as T
  const r=data.recipes.find(x=>x.id===p.recipe_id)!
  const items=r.items.map(x=>{const i=data.ingredients.find(i=>i.id===x.ingredient_id)!;return {ingredient_id:i.id,name:i.name,qty:x.input_qty*p.rounds,unit:i.unit,unit_cost:i.cost_per_unit}})
  if(items.some(x=>data.ingredients.find(i=>i.id===x.ingredient_id)!.stock_qty<x.qty))throw new Error('วัตถุดิบไม่พอ')
  items.forEach(x=>{data.ingredients.find(i=>i.id===x.ingredient_id)!.stock_qty-=x.qty})
  data.ingredients.find(i=>i.id===r.output_id)!.stock_qty+=p.actual_qty
  const b:ProductionBatch={id:p.id,recipe_name:r.name,output_name:'ครีมชีสผสม',output_unit:'กรัม',rounds:p.rounds,expected_qty:r.expected_qty*p.rounds,actual_qty:p.actual_qty,total_cost:36*p.rounds,batch_unit_cost:36*p.rounds/p.actual_qty,status:'completed',user_name:'พนักงานทดสอบ',created_at:new Date().toISOString(),note:p.note,cancel_reason:null,items}
  data.history.unshift(b);return b as T
 }
 if(action==='cancel'){const b=data.history.find(x=>x.id===p.id)!;b.status='cancelled';b.cancel_reason=p.reason;return b as T}
 throw new Error('Unknown fixture action')
}
export function refreshProductionStock(){}
