interface HeaderProps {
  totalAvatars: number;
  totalSelections: number;
}

export default function Header({ totalAvatars, totalSelections }: HeaderProps) {
  return (
    <section className="hero" id="hero">
      <div className="hero-content">
        <div className="header-badge">
          <span className="dot"></span>
          <span>Avatar Gallery</span>
        </div>

        <h1>
          Choose Your{' '}
          <span className="gradient-text">Avatar</span>
        </h1>

        <p className="header-subtitle">
          Explore our curated collection of unique avatars. 
          Pick the one that best represents your digital identity.
        </p>

        <div className="stats-bar">
          <div className="stat-item">
            <div className="stat-value">{totalAvatars}</div>
            <div className="stat-label">Avatars</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{totalSelections}</div>
            <div className="stat-label">Selections</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">4</div>
            <div className="stat-label">Categories</div>
          </div>
        </div>
      </div>
    </section>
  );
}
