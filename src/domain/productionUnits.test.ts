import { describe, expect, it } from 'vitest'
import type { Ingredient } from '@/types'
import { canonicalProductionUnit, prepUnitKey, productionUnitIsValid } from './productionUnits'
import { productionPreview } from './production'

const milk={id:'milk',name:'นมสด',unit:'ML',stock_qty:1000,cost_per_unit:0.05,is_active:true,units:[{name:'ML',factor_to_base:1},{name:'แกลอน',factor_to_base:2000}]} as Ingredient

describe('production unit aliases',()=>{
  it.each(['ML','ml','มล','มล.','มิลลิลิตร'])('recognizes %s as millilitres without changing quantity',name=>{
    expect(canonicalProductionUnit(milk,name,1)).toBe('ML')
    expect(productionUnitIsValid(milk,name,1)).toBe(true)
  })
  it('keeps different dimensions and scale factors distinct',()=>{
    expect(prepUnitKey('กิโลกรัม')).not.toBe(prepUnitKey('กรัม'))
    expect(prepUnitKey('ML')).not.toBe(prepUnitKey('กรัม'))
    expect(productionUnitIsValid(milk,'กรัม',1)).toBe(false)
    expect(productionUnitIsValid(milk,'แกลอน',1)).toBe(false)
    expect(productionUnitIsValid(milk,'แกลอน',2000)).toBe(true)
    expect(canonicalProductionUnit(milk,'ไม่รู้หน่วย',1)).toBe('ไม่รู้หน่วย')
  })
  it('allows a saved Thai ml recipe with an ML stock label in the production preview',()=>{
    const rows=productionPreview({id:'r',name:'ชีส',output_id:'cheese',output_unit:'กรัม',expected_qty:80,instructions:'',is_active:true,revision:1,items:[{ingredient_id:'milk',input_qty:80,input_unit:'มล.',base_unit:'มล.',factor:1}]},1,[milk])
    expect(rows[0]).toMatchObject({qty:80,unavailable:false,cost:4})
  })
})
