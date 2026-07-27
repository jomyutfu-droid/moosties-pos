/**
 * ดึงข้อความ error ที่อ่านรู้เรื่องออกมาจากสิ่งที่ throw มา
 *
 * สำคัญ: PostgrestError ของ supabase-js เป็น "ออบเจกต์ธรรมดา" ({ message, details, hint, code })
 * ไม่ได้ extends Error — การเช็ค `err instanceof Error` จึงเป็น false เสมอสำหรับ error จาก Supabase
 * ทำให้สาเหตุจริง (เช่น RLS ปฏิเสธ, FK ไม่ตรง, คอลัมน์หาย) ถูกทิ้งแล้วเหลือแต่ข้อความ fallback กว้าง ๆ
 * ฟังก์ชันนี้จัดการทั้งสองแบบ และแนบรหัส/รายละเอียดมาด้วยเพื่อให้วินิจฉัยปัญหาได้
 */
export function errorMessage(err: unknown, fallback = 'เกิดข้อผิดพลาด'): string {
  if (!err) return fallback
  if (typeof err === 'string') return err
  if (err instanceof Error && err.message) return err.message

  if (typeof err === 'object') {
    const e = err as { message?: string; details?: string; hint?: string; code?: string }
    const parts: string[] = []
    if (e.message) parts.push(e.message)
    if (e.details && e.details !== e.message) parts.push(e.details)
    if (e.hint) parts.push(`แนะนำ: ${e.hint}`)
    if (parts.length) {
      return e.code ? `${parts.join(' — ')} [${e.code}]` : parts.join(' — ')
    }
  }
  return fallback
}

/** แปลงรหัส error ของ Postgres/Supabase ที่พบบ่อยเป็นคำอธิบายภาษาไทยที่ทำต่อได้ */
export function explainSupabaseError(err: unknown, fallback = 'เกิดข้อผิดพลาด'): string {
  const raw = errorMessage(err, fallback)
  const code = (err as { code?: string } | null)?.code

  switch (code) {
    case '42501': // insufficient_privilege
      return `ไม่มีสิทธิ์เขียนข้อมูล (RLS ปฏิเสธ) — ตรวจ policy ของตารางนี้ใน Supabase\n${raw}`
    case '23503': // foreign_key_violation
      return `ข้อมูลอ้างอิงไม่ถูกต้อง — พนักงาน/สาขาที่อ้างถึงอาจถูกลบไปแล้ว ลองสลับพนักงานใหม่\n${raw}`
    case '23502': // not_null_violation
      return `มีช่องที่จำเป็นว่างอยู่\n${raw}`
    case '42P01': // undefined_table
      return `ไม่พบตารางในฐานข้อมูล — ยังไม่ได้รันสคริปต์สร้างตาราง\n${raw}`
    case '42703': // undefined_column
      return `โครงสร้างตารางไม่ตรงกับที่แอปคาดไว้\n${raw}`
    case 'PGRST301':
    case '401':
      return `เซสชันหมดอายุ — ลองรีเฟรชหน้าเว็บ\n${raw}`
    default:
      return raw
  }
}
