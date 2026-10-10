import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { LineManCheckoutModal } from './LineManCheckoutModal'
import type { CartLine } from '@/types'

vi.mock('@/lib/lineMan', () => ({ prepareLineManOrder: vi.fn(), submitLineManOrder: vi.fn() }))
vi.mock('@/store/session', () => ({ useSessionStore: () => ({ pinSessionToken: 'test' }) }))

describe('LINE MAN optional order number', () => {
  const line = { uid: 'test', qty: 1, product: { name: 'ชา' }, selectedOptions: [] } as unknown as CartLine
  const render = (lines: CartLine[]) => renderToStaticMarkup(<LineManCheckoutModal lines={lines} note="" onSuccess={() => {}} onClose={() => {}} />)

  it('enables saving a cart with the initial empty reference', () => {
    const html = render([line])
    expect(html).toContain('(ไม่จำเป็น)')
    const saveButton = html.match(/<button[^>]*>บันทึกออเดอร์และตัดสต็อก<\/button>/)?.[0]
    expect(saveButton).toBeDefined()
    expect(saveButton).not.toContain('disabled')
  })

  it('still disables saving an empty cart', () => {
    expect(render([]).match(/<button[^>]*>บันทึกออเดอร์และตัดสต็อก<\/button>/)?.[0]).toContain('disabled')
  })
})
