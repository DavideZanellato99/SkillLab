import { useState, useCallback, useEffect } from 'react';
import AvatarCard from './AvatarCard';
import Toast from './Toast';
import { useAvatars, useCategories } from '../hooks/useApi';

interface AvatarGalleryProps {
  onStatsUpdate: (totalAvatars: number, totalSelections: number) => void;
}

export default function AvatarGallery({ onStatsUpdate }: AvatarGalleryProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Array<{
    id: number;
    title: string;
    message: string;
    type: 'success' | 'error';
  }>>([]);

  const { data: avatars = [], isLoading, isError } = useAvatars(activeCategory);
  const { data: categories = [] } = useCategories();

  const addToast = useCallback((title: string, message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, title, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Update stats when avatars change
  useEffect(() => {
    const totalSelections = avatars.reduce((sum, a) => sum + a.selection_count, 0);
    onStatsUpdate(avatars.length, totalSelections);
  }, [avatars, onStatsUpdate]);

  // Show error toast on query failure
  useEffect(() => {
    if (isError) {
      addToast('Connection Error', 'Unable to connect to the server. Make sure the backend is running.', 'error');
    }
  }, [isError, addToast]);

  return (
    <>
      {/* Category Filters */}
      <div className="category-filter" id="category-filter">
        <button
          className={`filter-btn${activeCategory === null ? ' active' : ''}`}
          onClick={() => setActiveCategory(null)}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            className={`filter-btn${activeCategory === cat ? ' active' : ''}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Avatar Grid */}
      {isLoading ? (
        <div className="avatar-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton-card">
              <div className="skeleton-image" />
              <div className="skeleton-body">
                <div className="skeleton-line short" />
                <div className="skeleton-line medium" />
                <div className="skeleton-line" />
              </div>
            </div>
          ))}
        </div>
      ) : avatars.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🎭</div>
          <p className="empty-state-text">No avatars found in this category.</p>
        </div>
      ) : (
        <div className="avatar-grid" id="avatar-grid">
          {avatars.map((avatar, index) => (
            <AvatarCard
              key={avatar.id}
              avatar={avatar}
              index={index}
            />
          ))}
        </div>
      )}

      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            title={toast.title}
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </>
  );
}
