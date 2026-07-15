export default function Navbar() {
  return (
    <nav className="navbar" id="navbar">
      <div className="navbar-inner">
        {/* Logo */}
        <a href="/" className="navbar-logo" id="navbar-logo">
          <div className="navbar-logo-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <defs>
                <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#7c3aed" />
                  <stop offset="100%" stopColor="#06b6d4" />
                </linearGradient>
              </defs>
              <path
                d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="url(#logoGrad)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="navbar-logo-text">
            Skill<span className="navbar-logo-accent">Lab</span>
          </span>
        </a>

        {/* Center nav links */}
        <div className="navbar-links" id="navbar-links">
          <a href="#avatar-grid" className="navbar-link active">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
            </svg>
            Gallery
          </a>
          <a href="#category-filter" className="navbar-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            Categories
          </a>
        </div>

        {/* Right side */}
        <div className="navbar-actions" id="navbar-actions">
          <div className="navbar-status">
            <span className="navbar-status-dot"></span>
            <span className="navbar-status-text">Online</span>
          </div>
        </div>
      </div>
    </nav>
  );
}
