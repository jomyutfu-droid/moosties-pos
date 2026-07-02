import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useSessionStore } from '@/store/session'

type NavRole = 'owner' | 'manager' | 'staff'

const navItems: { to: string; label: string; roles?: NavRole[] }[] = [
  { to: '/', label: 'หน้าขาย' },
  { to: '/menu', label: 'เมนู/สูตร', roles: ['owner', 'manager'] },
  { to: '/inventory', label: 'สต็อก', roles: ['owner', 'manager', 'staff'] },
  { to: '/queue', label: 'คิวออเดอร์', roles: ['owner', 'manager', 'staff'] },
  { to: '/time', label: 'เวลาพนักงาน', roles: ['owner', 'manager', 'staff'] },
  { to: '/reports', label: 'รายงาน', roles: ['owner', 'manager'] },
  { to: '/users', label: 'ผู้ใช้', roles: ['owner'] },
  { to: '/settings', label: 'ตั้งค่า', roles: ['owner'] },
]

export function AppLayout() {
  const online = useOnlineStatus()
  const activeStaff = useSessionStore((s) => s.activeStaff)
  const clearActiveStaff = useSessionStore((s) => s.clearActiveStaff)
  const navigate = useNavigate()

  const pendingCount =
    useLiveQuery(
      () => db.outbox_orders.where('status').anyOf(['pending', 'error']).count(),
      [],
      0,
    ) ?? 0

  const visibleItems = navItems.filter(
    (item) => !item.roles || (activeStaff && item.roles.includes(activeStaff.role as NavRole)),
  )

  function handleSwitchStaff() {
    clearActiveStaff()
    navigate('/pin')
  }

  function handleOpenDisplay() {
    window.open('/display', 'customer-display', 'width=800,height=600,menubar=no,toolbar=no')
  }

  const initials = activeStaff?.name?.charAt(0) ?? '?'
  const roleLabel: Record<string, string> = {
    owner: 'เจ้าของ', manager: 'ผู้จัดการ', staff: 'แคชเชียร์',
  }

  return (
    <div className="min-h-full flex bg-transparent">
      {/* ── Sidebar ── */}
      <aside
        className="hidden md:flex w-56 flex-none flex-col"
        style={{
          background: 'rgba(255,255,255,.45)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          borderRight: '1px solid rgba(255,255,255,.65)',
          zIndex: 2,
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
          <div
            className="w-8 h-8 flex-none rounded-[11px]"
            style={{
              background: 'linear-gradient(135deg,#16a34a,#4ade80)',
              boxShadow: 'inset 0 1px 2px rgba(255,255,255,.7)',
            }}
          />
          <span className="font-bold text-base" style={{ color: '#123524' }}>
            MOOSTTIES
          </span>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1 px-3 flex-1">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className="sidebar-nav-item"
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Staff footer */}
        <div
          className="p-3 flex flex-col gap-2.5"
          style={{ borderTop: '1px solid rgba(255,255,255,.55)' }}
        >
          {/* Avatar + name */}
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-none"
              style={{ background: 'rgba(255,255,255,.72)', color: '#123524' }}
            >
              {initials}
            </div>
            <div className="flex flex-col leading-snug min-w-0">
              <span className="text-[12.5px] font-semibold truncate" style={{ color: '#123524' }}>
                {activeStaff?.name ?? '-'}
              </span>
              <span className="text-[10.5px]" style={{ color: '#5c7466' }}>
                {roleLabel[activeStaff?.role ?? ''] ?? activeStaff?.role ?? ''}
              </span>
            </div>
          </div>

          {/* Online + sync */}
          <div className="flex items-center gap-1.5">
            <span
              className={`w-[7px] h-[7px] rounded-full flex-none ${online ? 'bg-brand-600' : 'bg-gray-400'}`}
            />
            <span className="text-[11px] font-medium" style={{ color: '#5c7466' }}>
              {online ? 'ออนไลน์' : 'ออฟไลน์'}
            </span>
            {pendingCount > 0 && (
              <span
                className="ml-auto text-[10.5px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(245,158,11,.16)', color: '#a8720a' }}
              >
                รอ sync {pendingCount}
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-1.5">
            <button
              onClick={handleSwitchStaff}
              className="flex-1 h-[34px] rounded-[10px] text-[11px] font-semibold transition-colors"
              style={{
                background: 'rgba(255,255,255,.65)',
                border: '1px solid rgba(255,255,255,.9)',
                color: '#123524',
              }}
            >
              สลับพนักงาน
            </button>
            <button
              onClick={handleOpenDisplay}
              className="h-[34px] px-3 rounded-[10px] text-[11px] font-semibold transition-colors"
              style={{
                background: 'linear-gradient(135deg,#16a34a,#4ade80)',
                color: '#fff',
              }}
              title="เปิดจอลูกค้า"
            >
              จอลูกค้า
            </button>
          </div>
        </div>
      </aside>

      {/* ── Mobile top bar ── */}
      <div
        className="md:hidden fixed top-0 inset-x-0 z-10 flex items-center gap-2 px-3 py-2"
        style={{
          background: 'rgba(255,255,255,.6)',
          backdropFilter: 'blur(14px)',
          borderBottom: '1px solid rgba(255,255,255,.7)',
        }}
      >
        <div
          className="w-7 h-7 rounded-[9px]"
          style={{ background: 'linear-gradient(135deg,#16a34a,#4ade80)' }}
        />
        <span className="font-bold text-sm" style={{ color: '#123524' }}>MOOSTTIES</span>
        <nav className="flex gap-1 ml-2 overflow-x-auto">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className="sidebar-nav-item text-xs px-3 py-1.5"
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* ── Main content ── */}
      <main className="flex-1 min-w-0 md:pt-0 pt-12">
        <Outlet />
      </main>
    </div>
  )
}
