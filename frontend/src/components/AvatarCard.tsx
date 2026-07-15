import type { Avatar } from '../services/api';
import { getAvatarImageUrl } from '../services/api';

interface AvatarCardProps {
  avatar: Avatar;
  isSelected: boolean;
  onSelect: (avatar: Avatar) => void;
  index: number;
}

export default function AvatarCard({ avatar, isSelected, onSelect, index }: AvatarCardProps) {
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

    onSelect(avatar);
  };

  return (
    <div
      className={`avatar-card${isSelected ? ' selected' : ''}`}
      onClick={handleClick}
      style={{ animationDelay: `${index * 0.08}s` }}
      id={`avatar-card-${avatar.id}`}
      role="button"
      tabIndex={0}
      aria-label={`Select avatar ${avatar.name}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(avatar);
        }
      }}
    >
      {isSelected && (
        <div className="selected-check">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      )}

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
        <button
          className={`select-btn${isSelected ? ' selected' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(avatar);
          }}
        >
          {isSelected ? '✓ Selected' : 'Select'}
        </button>
      </div>
    </div>
  );
}
