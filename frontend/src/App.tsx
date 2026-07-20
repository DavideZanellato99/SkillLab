import { useState, useCallback } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import Header from './components/Header';
import AvatarGallery from './components/AvatarGallery';
import ChatPage from './components/ChatPage';
import AdminPage from './components/AdminPage';
import DashboardPage from './components/DashboardPage';
import UserReportPage from './components/UserReportPage';
import AvatarAdminPage from './components/AvatarAdminPage';
import ProfilePage from './components/ProfilePage';
import LandingPage from './components/LandingPage';
import './index.css';

function HomePage() {
  const [totalAvatars, setTotalAvatars] = useState(0);
  const [totalCategories, setTotalCategories] = useState(0);

  const handleStatsUpdate = useCallback((avatars: number, categories: number) => {
    setTotalAvatars(avatars);
    setTotalCategories(categories);
  }, []);

  return (
    <>
      <Header totalAvatars={totalAvatars} totalCategories={totalCategories} />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-6 pb-12 max-md:p-4">
        <AvatarGallery onStatsUpdate={handleStatsUpdate} />
      </main>
    </>
  );
}

function App() {
  const { isAuthenticated, isLoading } = useAuth();

  // Show loading screen while auth state is initializing
  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col pt-16" id="app">
        <div className="flex min-h-[60vh] flex-1 flex-col items-center justify-center gap-6">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-violet-600/15 border-t-violet-600" />
          <p className="text-sm text-slate-500">Caricamento...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col pt-16" id="app">
      <Navbar />
      <Routes>
        {isAuthenticated ? (
          <>
            <Route path="/" element={<HomePage />} />
            <Route path="/chat/:avatarId" element={<ChatPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/dashboard" element={<DashboardPage />} />
            <Route path="/admin/report" element={<UserReportPage />} />
            <Route path="/admin/avatars" element={<AvatarAdminPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        ) : (
          /* Not authenticated — public landing page */
          <Route path="*" element={<LandingPage />} />
        )}
      </Routes>
    </div>
  );
}

export default App;
