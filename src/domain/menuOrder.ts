const menuNameCollator = new Intl.Collator('th', { sensitivity: 'base', numeric: true })

/** Use the same alphabetical order for the online menu and offline POS catalog. */
export function compareMenuNames(a: { id: string; name: string }, b: { id: string; name: string }): number {
  return menuNameCollator.compare(a.name.trim(), b.name.trim()) || a.id.localeCompare(b.id)
}
