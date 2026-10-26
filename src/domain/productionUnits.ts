import type { Ingredient } from '@/types'

/** Only equivalent names share a key; kilograms are deliberately distinct from grams. */
export function prepUnitKey(name: string): string {
  const compact = name.trim().toLowerCase().replace(/[.\s]/g, '')
  if (['ml', 'มล', 'มิลลิลิตร'].includes(compact)) return 'volume_ml'
  if (['g', 'กรัม'].includes(compact)) return 'mass_g'
  if (['kg', 'กก', 'กิโลกรัม'].includes(compact)) return 'mass_kg'
  return `label:${name.trim().toLowerCase()}`
}

export function canonicalProductionUnit(ingredient: Ingredient | undefined, name: string, factor: number): string {
  if (!ingredient) return name
  if (factor === 1 && prepUnitKey(ingredient.unit) === prepUnitKey(name)) return ingredient.unit
  return ingredient.units?.find(unit => prepUnitKey(unit.name) === prepUnitKey(name) && Number(unit.factor_to_base) === factor)?.name ?? name
}

export function productionUnitIsValid(ingredient: Ingredient | undefined, name: string, factor: number): boolean {
  if (!ingredient || !Number.isFinite(factor) || factor <= 0) return false
  return (factor === 1 && prepUnitKey(name) === prepUnitKey(ingredient.unit)) ||
    !!ingredient.units?.some(unit => prepUnitKey(unit.name) === prepUnitKey(name) && Number(unit.factor_to_base) === factor)
}
