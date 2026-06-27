import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/AppLayout'
import { RequireAuth, RequireStaff, RequireRole } from '@/components/guards'
import { useAuthListener } from '@/hooks/useAuth'
import { refreshReferenceData } from '@/lib/sync'
import { startAutoSync } from '@/lib/sync'
import LoginPage from '@/pages/LoginPage'
import PinPage from '@/pages/PinPage'
import PosPage from '@/pages/PosPage'
import MenuPage from '@/pages/MenuPage'
import InventoryPage from '@/pages/InventoryPage'
import ReportsPage from '@/pages/ReportsPage'
import UsersPage from '@/pages/UsersPage'
import SettingsPage from '@/pages/SettingsPage'

function App() {
  useAuthListener()

  useEffect(() => {
    refreshReferenceData().catch(() => undefined)
    const stop = startAutoSync()
    return stop
  }, [])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/pin"
        element={
          <RequireAuth>
            <PinPage />
          </RequireAuth>
        }
      />
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
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
