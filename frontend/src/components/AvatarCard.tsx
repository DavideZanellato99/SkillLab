import { useNavigate } from 'react-router-dom';
import type { Avatar } from '../services/api';
import { getAvatarImageUrl } from '../services/api';

interface AvatarCardProps {
  avatar: Avatar;
  index: number;
}

export default function AvatarCard({ avatar, index }: AvatarCardProps) {
  const navigate = useNavigate();
  const categoryClass = avatar.category.toLowerCase().replace('-', '-');

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
      className="avatar-card"
      onClick={handleClick}
      style={{ animationDelay: `${index * 0.08}s` }}
      id={`avatar-card-${avatar.id}`}
      role="button"
      tabIndex={0}
      aria-label={`Chatta con ${avatar.name}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(`/chat/${avatar.id}`);
        }
      }}
    >
      <div className="avatar-card-image">
        <img
          src={getAvatarImageUrl(avatar.image_url)}
          alt={avatar.name}
          loading="lazy"
        />
      </div>

      <div className="avatar-card-body">
        <span className={`avatar-card-category ${categoryClass}`}>
          {avatar.category}
        </span>
        <h3 className="avatar-card-name">{avatar.name}</h3>
        <p className="avatar-card-description">{avatar.description}</p>
      </div>

      <div className="avatar-card-footer">
        <span className="avatar-card-selections">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          {avatar.selection_count} {avatar.selection_count === 1 ? 'selection' : 'selections'}
        </span>
        <span className="chat-hint">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Chatta
        </span>
      </div>
    </div>
  );
}
