import {readFileSync} from 'node:fs'
import {describe,it,expect} from 'vitest'
import postcss from 'postcss'
import tailwind from 'tailwindcss'

describe('responsive form layout regression',()=>{
  it('allows width utilities to override input defaults',async()=>{
    const source=readFileSync('src/index.css','utf8')
    const result=await postcss([tailwind('./tailwind.config.js')]).process(source,{from:'src/index.css'})
    const rules:string[]=[]
    result.root.walkRules(rule=>{rules.push(rule.selector)})
    expect(rules.indexOf('.input')).toBeGreaterThanOrEqual(0)
    expect(rules.indexOf('.w-28')).toBeGreaterThan(rules.indexOf('.input'))
    expect(rules.indexOf('.w-auto')).toBeGreaterThan(rules.indexOf('.input'))
  })
  it('does not pin menu quantities to narrow inline widths',()=>{
    expect(readFileSync('src/components/ProductEditor.tsx','utf8')).not.toMatch(/width: '(72|80|92)px'/)
    expect(readFileSync('src/components/inventory/ProductionRecipeEditor.tsx','utf8')).toContain('quantity-unit-row')
    expect(readFileSync('index.html','utf8')).not.toContain('user-scalable=no')
  })
})
