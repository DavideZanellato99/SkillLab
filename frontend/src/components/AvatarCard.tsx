import { useNavigate } from 'react-router-dom';
import type { Avatar } from '../services/api';
import { getAvatarImageUrl } from '../services/api';
import { categoryBadgeClasses } from './categoryStyles';

interface AvatarCardProps {
  avatar: Avatar;
  index: number;
}

export default function AvatarCard({ avatar, index }: AvatarCardProps) {
  const navigate = useNavigate();

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Create ripple effect
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.left = `${e.clientX - rect.left}px`;
    ripple.style.top = `${e.clientY - rect.top}px`;
    ripple.style.width = '50px';
    ripple.style.height = '50px';
    card.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);

    navigate(`/chat/${avatar.id}`);
  };

  return (
    <div
      className="group relative animate-slide-in-bottom cursor-pointer overflow-hidden rounded-3xl border border-white/6 bg-gray-900/60 backdrop-blur-xl transition hover:-translate-y-1.5 hover:scale-[1.02] hover:border-white/12 hover:bg-slate-800/70 hover:shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
      onClick={handleClick}
      style={{ animationDelay: `${index * 0.08}s` }}
      id={`avatar-card-${avatar.id}`}
      role="button"
      tabIndex={0}
      aria-label={`Parla con ${avatar.name}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(`/chat/${avatar.id}`);
        }
      }}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-gray-900 after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-3/5 after:bg-gradient-to-t after:from-gray-900/60 after:via-gray-900/40 after:to-transparent after:content-['']">
        <img
          className="h-full w-full object-cover transition-transform duration-[400ms] group-hover:scale-[1.08]"
          src={getAvatarImageUrl(avatar.image_url)}
          alt={avatar.name}
          loading="lazy"
        />
      </div>

      <div className="relative p-6">
        <div className="mb-2 flex items-center gap-2">
          <span className={`inline-block rounded-full px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-widest ${categoryBadgeClasses(avatar.category)}`}>
            {avatar.category}
          </span>
          {avatar.difficulty && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[0.7rem] font-semibold text-orange-400"
              title="Grado di difficoltà dello scenario"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l2.9 6.26L21.5 9.27l-4.75 4.63 1.12 6.53L12 17.35l-5.87 3.08 1.12-6.53L2.5 9.27l6.6-1.01L12 2z" />
              </svg>
              {avatar.difficulty}
            </span>
          )}
        </div>
        <h3 className="mb-1 font-heading text-lg font-bold text-slate-100">{avatar.name}</h3>
        <p className="line-clamp-2 text-[0.82rem] leading-normal text-slate-500">{avatar.description}</p>
      </div>

      <div className="flex items-center justify-between px-6 pb-6 pt-2">
        <span className="flex items-center gap-1 text-xs text-slate-500">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          {avatar.selection_count} {avatar.selection_count === 1 ? 'selection' : 'selections'}
        </span>
        <span className="flex items-center gap-1.5 rounded-full border border-white/6 bg-white/4 px-4 py-1 text-[0.8rem] font-medium text-slate-500 transition group-hover:scale-105 group-hover:border-violet-600 group-hover:bg-violet-600/15 group-hover:text-violet-400">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
          Parla
        </span>
      </div>
    </div>
  );
}
