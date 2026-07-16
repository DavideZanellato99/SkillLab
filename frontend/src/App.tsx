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
      <main className="app-content">
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
      <div className="app" id="app">
        <div className="auth-loading-screen">
          <div className="auth-loading-spinner" />
          <p className="auth-loading-text">Caricamento...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app" id="app">
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
            <div className="auth-required-screen">
              <div className="auth-required-content">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="auth-required-icon">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <h2 className="auth-required-title">Accesso richiesto</h2>
                <p className="auth-required-subtitle">Effettua il login per accedere a SkillLab</p>
              </div>
            </div>
          } />
        )}
      </Routes>
    </div>
  );
}

export default App;
