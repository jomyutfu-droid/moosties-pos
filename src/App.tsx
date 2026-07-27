import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/AppLayout'
import { RequireAuth, RequireStaff, RequireRole } from '@/components/guards'
import { useAuthListener } from '@/hooks/useAuth'
import { useSessionStore } from '@/store/session'
import { refreshReferenceData, startAutoSync } from '@/lib/sync'
import { pendingOutboxCount } from '@/lib/db'
import PinPage from '@/pages/PinPage'
import PosPage from '@/pages/PosPage'
import MenuPage from '@/pages/MenuPage'
import InventoryPage from '@/pages/InventoryPage'
import ReportsPage from '@/pages/ReportsPage'
import UsersPage from '@/pages/UsersPage'
import SettingsPage from '@/pages/SettingsPage'
import QueuePage from '@/pages/QueuePage'
import TimePage from '@/pages/TimePage'
import CustomerDisplayPage from '@/pages/CustomerDisplayPage'

function App() {
  useAuthListener()
  const authReady = useSessionStore((s) => s.authReady)

  useEffect(() => {
    const stop = startAutoSync()
    return stop
  }, [])

  useEffect(() => {
    // ต้องรอ anonymous session ก่อน — ถ้ายิงเร็วเกินไป RLS จะปฏิเสธและแคชเมนูจะว่าง
    if (!authReady) return
    refreshReferenceData().catch(() => undefined)

    // ดึงข้อมูลอ้างอิงใหม่เป็นระยะ เพื่อให้เครื่อง POS เห็นราคา/สูตร/สต็อกที่แก้จากเครื่องอื่น
    // ข้ามรอบถ้ายังมีออเดอร์ค้างใน outbox — การรีเฟรชจะเขียนทับสต็อกที่ตัดไว้ล่วงหน้าแบบออฟไลน์
    const id = setInterval(async () => {
      if (!navigator.onLine) return
      if ((await pendingOutboxCount()) > 0) return
      refreshReferenceData().catch(() => undefined)
    }, 120_000)
    return () => clearInterval(id)
  }, [authReady])

  return (
    <Routes>
      {/* Feature 4: ลบ /login ออก — ใช้ anonymous auth แทน */}
      <Route
        path="/pin"
        element={
          <RequireAuth>
            <PinPage />
          </RequireAuth>
        }
      />

      {/* Feature 7: หน้าจอลูกค้า — ไม่ต้อง auth */}
      <Route path="/display" element={<CustomerDisplayPage />} />

      {/* หน้าหลัก — ต้องผ่าน RequireAuth (anonymous OK) + RequireStaff */}
      <Route
        element={
          <RequireAuth>
            <RequireStaff>
              <AppLayout />
            </RequireStaff>
          </RequireAuth>
        }
      >
        <Route path="/" element={<PosPage />} />
        <Route
          path="/menu"
          element={
            <RequireRole roles={['owner', 'manager']}>
              <MenuPage />
            </RequireRole>
          }
        />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route
          path="/reports"
          element={
            <RequireRole roles={['owner', 'manager']}>
              <ReportsPage />
            </RequireRole>
          }
        />
        <Route
          path="/users"
          element={
            <RequireRole roles={['owner']}>
              <UsersPage />
            </RequireRole>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireRole roles={['owner']}>
              <SettingsPage />
            </RequireRole>
          }
        />
        {/* Feature 6: คิวออเดอร์ */}
        <Route path="/queue" element={<QueuePage />} />
        {/* Feature 8: บันทึกเวลาพนักงาน */}
        <Route path="/time" element={<TimePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
