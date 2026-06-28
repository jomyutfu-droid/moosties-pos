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
  { to: '/queue', label: 'คิวออเดอร์', roles: ['owner', 'manager', 'staff'] }, // Feature 6
  { to: '/time', label: 'เวลาพนักงาน', roles: ['owner', 'manager', 'staff'] }, // Feature 8
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

  /** Feature 7: เปิดหน้าจอลูกค้าในหน้าต่างใหม่ */
  function handleOpenDisplay() {
    window.open('/display', 'customer-display', 'width=800,height=600,menubar=no,toolbar=no')
  }

  return (
    <div className="min-h-full flex flex-col md:flex-row bg-gray-50">
      <aside className="md:w-56 bg-white border-b md:border-b-0 md:border-r border-gray-200 flex md:flex-col">
        <div className="px-4 py-3 font-bold text-brand-700 text-lg">MOOSTTIES POS</div>
        <nav className="flex md:flex-col gap-1 px-2 pb-2 md:pb-4 overflow-x-auto">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `whitespace-nowrap px-3 py-2 rounded-lg text-sm font-medium ${
                  isActive ? 'bg-brand-600 text-white' : 'text-gray-700 hover:bg-gray-100'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden md:block mt-auto p-3 border-t border-gray-200 space-y-2">
          <div className="text-sm">
            <span className="text-gray-500">พนักงาน: </span>
            <span className="font-medium">{activeStaff?.name ?? '-'}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`inline-block w-2 h-2 rounded-full ${online ? 'bg-green-500' : 'bg-gray-400'}`}
            />
            <span className="text-gray-500">{online ? 'ออนไลน์' : 'ออฟไลน์'}</span>
            {pendingCount > 0 && (
              <span className="ml-auto rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">
                รอ sync {pendingCount}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={handleSwitchStaff} className="btn-secondary text-xs flex-1">
              สลับพนักงาน
            </button>
            <button onClick={handleOpenDisplay} className="btn-ghost text-xs" title="เปิดจอลูกค้า">
              📺
            </button>
          </div>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  )
}
