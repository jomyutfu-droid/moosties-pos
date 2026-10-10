import { create } from 'zustand'

const key = 'moosties.touch-keyboard.v1'
export const useTouchKeyboard = create<{ enabled: boolean; toggle: () => void }>((set) => {
  let enabled = false
  try { enabled = localStorage.getItem(key) === 'on' } catch { /* Private browsing can block storage. */ }
  return { enabled, toggle: () => set(state => {
    const enabled = !state.enabled
    try { localStorage.setItem(key, enabled ? 'on' : 'off') } catch { /* Keep working for this session. */ }
    return { enabled }
  }) }
})
