import { useEffect, useRef, useState, type CSSProperties } from 'react'

interface Props {
  value: number
  onChange: (value: number) => void
  parse: (raw: string) => number
  className?: string
  placeholder?: string
  disabled?: boolean
  title?: string
  style?: CSSProperties
}

/**
 * Input ตัวเลขที่แก้บั๊ก 2 ชั้นพร้อมกัน:
 *
 * 1) เลข "0" นำหน้าค้างบนจอตอนพิมพ์ (ปัญหาที่รู้จักกันดีของ <input type="number"> ที่ควบคุมด้วย
 *    React state — พบและยืนยันแก้ได้จริงกับช่อง "รับเงินมา")
 *
 * 2) จุดทศนิยม/เครื่องหมายลบหายทันทีที่พิมพ์ — เกิดจากการแก้ข้อ 1 แบบเดิม ที่ derive ค่าที่แสดง
 *    จากตัวเลขล้วน ๆ ทุก keystroke (`value === 0 ? '' : String(value)`):
 *    - พิมพ์ "45." → parse("45.") = 45 → แสดงกลับเป็น "45" (จุดหายไปเงียบ ๆ) → พิมพ์ "5" ต่อ
 *      กลายเป็น "455" ไม่ใช่ "45.5" ที่ตั้งใจ — ราคาสินค้าเพี้ยนโดยไม่มีอะไรแจ้งเตือน
 *    - พิมพ์ "-" เพื่อใส่ค่าติดลบ (เช่น ลดปริมาณน้ำเชื่อมของตัวเลือก "หวานน้อย") → parse("-") = 0
 *      → แสดงกลับเป็นค่าว่าง (เครื่องหมายลบหายไป) → พิมพ์ต่อได้แต่เลขบวก ไม่มีทางตั้งค่าติดลบ
 *      ผ่านการพิมพ์ทีละตัวได้เลย — นี่คือสาเหตุที่ตัวเลือก "หวานน้อย" ไม่เคยลดน้ำเชื่อมได้จริง
 *
 * ทางแก้: เก็บ "ข้อความดิบ" ที่พิมพ์ไว้เป็น state ของ input เอง ไม่ derive จากตัวเลขทุก keystroke
 * จะ sync ค่าที่แสดงใหม่จาก value ภายนอก เฉพาะตอนที่ value เปลี่ยนจากแหล่งอื่นที่ไม่ใช่การพิมพ์ของ
 * ตัวเอง (เช่น สลับไปแก้สินค้าอื่น, ปุ่มลัดตั้งค่าให้) เท่านั้น
 */
export function NumberField({ value, onChange, parse, className, placeholder, disabled, title, style }: Props) {
  const [text, setText] = useState<string>(value === 0 ? '' : String(value))
  const lastCommitted = useRef(value)

  useEffect(() => {
    if (value !== lastCommitted.current) {
      setText(value === 0 ? '' : String(value))
      lastCommitted.current = value
    }
  }, [value])

  return (
    <input
      type="text"
      inputMode="decimal"
      className={className}
      style={style}
      placeholder={placeholder}
      disabled={disabled}
      title={title}
      value={text}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        setText(e.target.value)
        const n = parse(e.target.value)
        lastCommitted.current = n
        onChange(n)
      }}
    />
  )
}
