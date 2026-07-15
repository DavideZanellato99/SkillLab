import { useEffect, useState, useCallback } from 'react';
import type { Avatar } from '../services/api';
import { fetchAvatars, fetchCategories, selectAvatar } from '../services/api';
import AvatarCard from './AvatarCard';
import Toast from './Toast';

interface AvatarGalleryProps {
  onStatsUpdate: (totalAvatars: number, totalSelections: number) => void;
}

export default function AvatarGallery({ onStatsUpdate }: AvatarGalleryProps) {
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedAvatarId, setSelectedAvatarId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Array<{
    id: number;
    title: string;
    message: string;
    type: 'success' | 'error';
  }>>([]);

  const addToast = useCallback((title: string, message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, title, message, type }]);
    // Auto-remove after 4 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Load avatars and categories
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [avatarsData, categoriesData] = await Promise.all([
        fetchAvatars(activeCategory ?? undefined),
        fetchCategories(),
      ]);
      setAvatars(avatarsData);
      setCategories(categoriesData);

      // Update stats
      const totalSelections = avatarsData.reduce((sum, a) => sum + a.selection_count, 0);
      onStatsUpdate(avatarsData.length, totalSelections);
    } catch (error) {
      console.error('Failed to load data:', error);
      addToast('Connection Error', 'Unable to connect to the server. Make sure the backend is running.', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeCategory, onStatsUpdate, addToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle avatar selection
  const handleSelect = async (avatar: Avatar) => {
    try {
      const response = await selectAvatar(avatar.id);
      if (response.success) {
        setSelectedAvatarId(avatar.id);
        addToast('Avatar Selected!', response.message, 'success');
        // Reload to get updated selection counts
        await loadData();
      }
    } catch (error) {
      console.error('Failed to select avatar:', error);
      addToast('Selection Failed', 'Could not save your selection. Please try again.', 'error');
    }
  };

  // Handle category filter
  const handleCategoryClick = (category: string | null) => {
    setActiveCategory(category);
  };

  return (
    <>
      {/* Category Filters */}
      <div className="category-filter" id="category-filter">
        <button
          className={`filter-btn${activeCategory === null ? ' active' : ''}`}
          onClick={() => handleCategoryClick(null)}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            className={`filter-btn${activeCategory === cat ? ' active' : ''}`}
            onClick={() => handleCategoryClick(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Avatar Grid */}
      {loading ? (
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
              isSelected={selectedAvatarId === avatar.id}
              onSelect={handleSelect}
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
