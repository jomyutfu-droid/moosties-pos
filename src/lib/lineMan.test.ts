import { describe, expect, it, vi } from 'vitest'
import { prepareLineManOrder, submitLineManOrder } from './lineMan'
import type { CartLine } from '@/types'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }))

describe('LINE MAN checkout payload', () => {
  const line = {
    uid: 'test', qty: 1, unitPrice: 50, unitCogs: 0,
    product: { id: 'test', name: 'ชา', recipe_items: [], options: [] }, selectedOptions: [],
  } as unknown as CartLine

  it('creates distinct valid references for separate blank-number checkouts', () => {
    const first = prepareLineManOrder([line], '', '')
    const next = prepareLineManOrder([line], ' ', '')
    expect(first.reference).toBe(`POS-LM-${first.client_uuid}`.toUpperCase())
    expect(first.reference).not.toBe(next.reference)
    expect(JSON.stringify(first)).not.toMatch(/unit_price|unitPrice|cogs|subtotal|paid/)
    expect(prepareLineManOrder([line], '000abc', '').reference).toBe('000ABC')
  })

  it('sends exactly the same generated payload when retrying a failed request', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    try {
      const payload = prepareLineManOrder([line], '', '')
      rpc.mockResolvedValueOnce({ error: { message: 'network' } })
        .mockResolvedValueOnce({ data: { orderNo: 'LM-TEST' }, error: null })
      await expect(submitLineManOrder(payload, 'test-token')).rejects.toThrow('network')
      await expect(submitLineManOrder(payload, 'test-token')).resolves.toEqual({ orderNo: 'LM-TEST' })
      expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1])
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
