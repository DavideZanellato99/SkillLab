import { useState, useCallback } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Navbar from './components/Navbar'
import Header from './components/Header'
import AvatarGallery from './components/AvatarGallery'
import ChatPage from './components/ChatPage'
import ComparisonPage from './components/ComparisonPage'
import AdminPage from './components/AdminPage'
import DashboardPage from './components/DashboardPage'
import UserReportPage from './components/UserReportPage'
import AvatarAdminPage from './components/AvatarAdminPage'
import AuditLogsPage from './components/AuditLogsPage'
import OrganizationsPage from './components/OrganizationsPage'
import TrainingPage from './components/TrainingPage'
import TrainingGoals from './components/TrainingGoals'
import ProfilePage from './components/ProfilePage'
import LandingPage from './components/LandingPage'
import RequireRole from './components/RequireRole'
import Spinner from './components/Spinner'
import './index.css'

function HomePage() {
  const [totalAvatars, setTotalAvatars] = useState(0)
  const [totalCategories, setTotalCategories] = useState(0)

  const handleStatsUpdate = useCallback((avatars: number, categories: number) => {
    setTotalAvatars(avatars)
    setTotalCategories(categories)
  }, [])

  return (
    <>
      <Header totalAvatars={totalAvatars} totalCategories={totalCategories} />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-6 pb-12 max-md:p-4">
        <TrainingGoals />
        <AvatarGallery onStatsUpdate={handleStatsUpdate} />
      </main>
    </>
  )
}

function App() {
  const { isAuthenticated, isLoading } = useAuth()

  // Show loading screen while auth state is initializing
  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col pt-16" id="app">
        <div className="flex min-h-[60vh] flex-1 flex-col items-center justify-center gap-6">
          <Spinner />
          <p className="text-sm text-slate-500">Caricamento...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col pt-16" id="app">
      <Navbar />
      <Routes>
        {isAuthenticated ? (
          <>
            {/* Every route states the role it needs: RequireRole is the single
                place where access is decided, and its `access` prop is
                mandatory, so a new route can't be added without one. */}
            <Route
              path="/"
              element={
                <RequireRole access="authenticated">
                  <HomePage />
                </RequireRole>
              }
            />
            <Route
              path="/chat/:avatarId"
              element={
                <RequireRole access="authenticated">
                  <ChatPage />
                </RequireRole>
              }
            />
            <Route
              path="/profile"
              element={
                <RequireRole access="authenticated">
                  <ProfilePage />
                </RequireRole>
              }
            />
            {/* Ogni ruolo entra dalla stessa porta: lo studente ci trova i
                propri tentativi, un admin il selettore delle persone del
                proprio tenant. È il server a decidere di chi sono. */}
            <Route
              path="/confronto"
              element={
                <RequireRole access="authenticated">
                  <ComparisonPage />
                </RequireRole>
              }
            />
            <Route
              path="/admin"
              element={
                <RequireRole access="super_admin">
                  <AdminPage />
                </RequireRole>
              }
            />
            <Route
              path="/admin/organizations"
              element={
                <RequireRole access="super_admin">
                  <OrganizationsPage />
                </RequireRole>
              }
            />
            <Route
              path="/admin/dashboard"
              element={
                <RequireRole access="admin">
                  <DashboardPage />
                </RequireRole>
              }
            />
            <Route
              path="/admin/training"
              element={
                <RequireRole access="admin">
                  <TrainingPage />
                </RequireRole>
              }
            />
            <Route
              path="/admin/report"
              element={
                <RequireRole access="admin">
                  <UserReportPage />
                </RequireRole>
              }
            />
            <Route
              path="/admin/avatars"
              element={
                <RequireRole access="super_admin">
                  <AvatarAdminPage />
                </RequireRole>
              }
            />
            <Route
              path="/admin/logs"
              element={
                <RequireRole access="super_admin">
                  <AuditLogsPage />
                </RequireRole>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        ) : (
          /* Not authenticated — public landing page */
          <Route path="*" element={<LandingPage />} />
        )}
      </Routes>
    </div>
  )
}

export default App
