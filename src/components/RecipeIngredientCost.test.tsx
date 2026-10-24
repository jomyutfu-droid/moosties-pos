import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RecipeIngredientCost } from './RecipeIngredientCost'

describe('recipe ingredient cost display', () => {
  it('retains small unit prices and calculates the cost for the recipe quantity', () => {
    const html = renderToStaticMarkup(<RecipeIngredientCost qty={100} factor={1} unit="มล." costPerBaseUnit={0.045} />)
    expect(html).toContain('฿4.50')
    expect(html).toContain('0.045 บาท/มล.')
  })

  it('uses the selected unit conversion, consistent with the saved recipe', () => {
    const html = renderToStaticMarkup(<RecipeIngredientCost qty={2} factor={5} unit="ช้อน" costPerBaseUnit={0.12} />)
    expect(html).toContain('฿1.20')
    expect(html).toContain('0.6 บาท/ช้อน')
  })

  it.each([undefined, null, 0, NaN, -1])('flags unavailable costs (%s)', (cost) => {
    const html = renderToStaticMarkup(<RecipeIngredientCost qty={100} factor={1} unit="มล." costPerBaseUnit={cost} />)
    expect(html).toContain('ยังไม่ระบุต้นทุน')
    expect(html).not.toContain('฿0.00')
  })
})
