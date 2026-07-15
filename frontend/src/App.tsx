import { useState, useCallback } from 'react';
import Navbar from './components/Navbar';
import Header from './components/Header';
import AvatarGallery from './components/AvatarGallery';
import './index.css';

function App() {
  const [totalAvatars, setTotalAvatars] = useState(0);
  const [totalSelections, setTotalSelections] = useState(0);

  const handleStatsUpdate = useCallback((avatars: number, selections: number) => {
    setTotalAvatars(avatars);
    setTotalSelections(selections);
  }, []);

  return (
    <div className="app" id="app">
      <Navbar />

      <Header totalAvatars={totalAvatars} totalSelections={totalSelections} />

      <main className="app-content">
        <AvatarGallery onStatsUpdate={handleStatsUpdate} />
      </main>
    </div>
  );
}

export default App;
