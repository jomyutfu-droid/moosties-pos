/** แฮช PIN ด้วย SHA-256 (Web Crypto) — ใช้สำหรับสลับผู้ใช้หน้าร้านด้วย PIN 4–6 หลัก */
export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(pin)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function verifyPin(pin: string, hash: string | null): Promise<boolean> {
  if (!hash) return false
  const computed = await hashPin(pin)
  return computed === hash
}
