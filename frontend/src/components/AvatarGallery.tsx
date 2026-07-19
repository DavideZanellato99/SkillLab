import { useState, useCallback, useEffect } from 'react';
import AvatarCard from './AvatarCard';
import Toast from './Toast';
import { useAvatars, useCategories } from '../hooks/useApi';

interface AvatarGalleryProps {
  onStatsUpdate: (totalAvatars: number, totalCategories: number) => void;
}

const filterBtnBase =
  'cursor-pointer rounded-full border px-6 py-2 text-[0.85rem] font-medium tracking-wide transition max-[480px]:px-4 max-[480px]:py-1 max-[480px]:text-[0.8rem]';
const filterBtnInactive =
  'border-white/6 bg-white/4 text-slate-400 hover:-translate-y-px hover:border-white/12 hover:bg-white/8 hover:text-slate-100';
const filterBtnActive =
  'border-violet-600 bg-violet-600/15 text-slate-100 shadow-[0_0_20px_rgba(124,58,237,0.2)]';

const gridCls =
  'grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-8 p-2 max-md:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] max-md:gap-4 max-[480px]:grid-cols-1';

const shimmerCls =
  'animate-shimmer bg-[linear-gradient(90deg,#111827_0%,rgba(255,255,255,0.05)_50%,#111827_100%)] bg-[length:200%_100%]';

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
    onStatsUpdate(avatars.length, categories.length);
  }, [avatars, categories, onStatsUpdate]);

  // Show error toast on query failure
  useEffect(() => {
    if (isError) {
      addToast('Errore di connessione', 'Impossibile contattare il server. Verifica che il backend sia in esecuzione.', 'error');
    }
  }, [isError, addToast]);

  return (
    <>
      {/* Category Filters */}
      <div className="mb-12 flex animate-fade-in-up flex-wrap justify-center gap-2 [animation-delay:0.3s] max-[480px]:gap-1" id="category-filter">
        <button
          className={`${filterBtnBase} ${activeCategory === null ? filterBtnActive : filterBtnInactive}`}
          onClick={() => setActiveCategory(null)}
        >
          Tutti
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            className={`${filterBtnBase} ${activeCategory === cat ? filterBtnActive : filterBtnInactive}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Avatar Grid */}
      {isLoading ? (
        <div className={gridCls}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-3xl border border-white/6 bg-gray-900/60">
              <div className={`aspect-square ${shimmerCls}`} />
              <div className="p-6">
                <div className={`mb-2 h-3 w-3/5 rounded-md ${shimmerCls}`} />
                <div className={`mb-2 h-3 w-4/5 rounded-md ${shimmerCls}`} />
                <div className={`mb-2 h-3 rounded-md ${shimmerCls}`} />
              </div>
            </div>
          ))}
        </div>
      ) : avatars.length === 0 ? (
        <div className="animate-fade-in p-16 text-center">
          <div className="mb-4 animate-float text-5xl">🎭</div>
          <p className="text-lg text-slate-500">Nessun avatar trovato in questa categoria.</p>
        </div>
      ) : (
        <div className={gridCls} id="avatar-grid">
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
      <div className="fixed right-8 top-20 z-[1000] flex flex-col gap-2 max-md:inset-x-4 max-md:top-[4.5rem]">
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
