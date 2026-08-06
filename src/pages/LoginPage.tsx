import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

/** PIN-only: ไม่มีหน้าล็อกอินอีเมล/รหัสผ่านอีกต่อไป */
export default function LoginPage() {
  const navigate = useNavigate()
  useEffect(() => {
    navigate('/pin', { replace: true })
  }, [navigate])
  return <div className="min-h-screen flex items-center justify-center text-gray-500">กำลังเปิดหน้ากรอก PIN…</div>
}
