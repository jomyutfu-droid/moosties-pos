import { useTouchKeyboard } from '@/store/touchKeyboard'

export function TouchKeyboardToggle() {
  const { enabled, toggle } = useTouchKeyboard()
  return <button type="button" className="btn-secondary text-xs" aria-pressed={enabled} onClick={toggle}
    title="จำการตั้งค่าคีย์บอร์ดเฉพาะเครื่องนี้">
    คีย์บอร์ดจอสัมผัส: {enabled ? 'เปิด' : 'ปิด'}
  </button>
}
