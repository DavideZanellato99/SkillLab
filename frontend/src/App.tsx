import { useState, useCallback } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import Header from './components/Header';
import AvatarGallery from './components/AvatarGallery';
import ChatPage from './components/ChatPage';
import AdminPage from './components/AdminPage';
import './index.css';

function HomePage() {
  const [totalAvatars, setTotalAvatars] = useState(0);
  const [totalSelections, setTotalSelections] = useState(0);

  const handleStatsUpdate = useCallback((avatars: number, selections: number) => {
    setTotalAvatars(avatars);
    setTotalSelections(selections);
  }, []);

  return (
    <>
      <Header totalAvatars={totalAvatars} totalSelections={totalSelections} />
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
            <Route path="/admin" element={<AdminPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        ) : (
          <Route path="*" element={
            <div className="flex min-h-[60vh] flex-1 items-center justify-center">
              <div className="flex flex-col items-center gap-4 text-center">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500 opacity-50">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <h2 className="font-heading text-2xl font-bold text-slate-100">Accesso richiesto</h2>
                <p className="text-sm text-slate-500">Effettua il login per accedere a SkillLab</p>
              </div>
            </div>
          } />
        )}
      </Routes>
    </div>
  );
}

export default App;
