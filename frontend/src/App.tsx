import { useState, useCallback } from 'react';
import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Header from './components/Header';
import AvatarGallery from './components/AvatarGallery';
import ChatPage from './components/ChatPage';
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
  return (
    <div className="app" id="app">
      <Navbar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/chat/:avatarId" element={<ChatPage />} />
      </Routes>
    </div>
  );
}

export default App;
