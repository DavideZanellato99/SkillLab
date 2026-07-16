import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isNewPasswordRequired, isAdminUser, ROLE_LABELS } from '../services/auth';

type AuthStep = 'login' | 'new-password';

export default function Navbar() {
  const location = useLocation();
  const isHome = location.pathname === '/';
  const isAdminPage = location.pathname === '/admin';
  const { user, isAuthenticated, login, completeNewPassword, logout } = useAuth();

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authStep, setAuthStep] = useState<AuthStep>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [cognitoSession, setCognitoSession] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setCognitoSession('');
    setAuthStep('login');
    setErrorMessage('');
    setIsSubmitting(false);
  };

  const closeModal = () => {
    setShowAuthModal(false);
    resetForm();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      const result = await login(email, password);

      if (isNewPasswordRequired(result)) {
        // Cognito requires password change
        setCognitoSession(result.session);
        setAuthStep('new-password');
        setPassword('');
      } else {
        // Login successful
        closeModal();
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Errore durante il login.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (newPassword !== confirmNewPassword) {
      setErrorMessage('Le password non coincidono.');
      return;
    }

    if (newPassword.length < 8) {
      setErrorMessage('La password deve essere di almeno 8 caratteri.');
      return;
    }

    setIsSubmitting(true);

    try {
      await completeNewPassword(email, newPassword, cognitoSession);
      closeModal();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Errore durante il cambio password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = () => {
    logout();
    setShowUserMenu(false);
  };

  return (
    <>
      <nav className="navbar" id="navbar">
        <div className="navbar-inner">
          {/* Logo */}
          <Link to="/" className="navbar-logo" id="navbar-logo">
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
          </Link>

          {/* Center nav links */}
          <div className="navbar-links" id="navbar-links">
            <Link to="/" className={`navbar-link${isHome ? ' active' : ''}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
              </svg>
              Gallery
            </Link>
            {isAuthenticated && isAdminUser(user) && (
              <Link to="/admin" className={`navbar-link${isAdminPage ? ' active' : ''}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="8.5" cy="7" r="4" />
                  <line x1="20" y1="8" x2="20" y2="14" />
                  <line x1="23" y1="11" x2="17" y2="11" />
                </svg>
                Gestione Utenti
              </Link>
            )}
          </div>

          {/* Right side */}
          <div className="navbar-actions" id="navbar-actions">
            <div className="navbar-status">
              <span className="navbar-status-dot"></span>
              <span className="navbar-status-text">Online</span>
            </div>

            {isAuthenticated && user ? (
              /* Authenticated — show user menu */
              <div className="user-menu-wrapper">
                <button
                  className="user-menu-trigger"
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  id="user-menu-trigger"
                >
                  <div className="user-avatar-small">
                    {(user.nome || user.email)[0].toUpperCase()}
                  </div>
                  <span className="user-menu-name">
                    {user.nome && user.cognome
                      ? `${user.nome} ${user.cognome}`
                      : user.email}
                  </span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`user-menu-chevron${showUserMenu ? ' open' : ''}`}>
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                {showUserMenu && (
                  <div className="user-menu-dropdown" id="user-menu-dropdown">
                    <div className="user-menu-header">
                      <div className="user-avatar-large">
                        {(user.nome || user.email)[0].toUpperCase()}
                      </div>
                      <div className="user-menu-info">
                        <span className="user-menu-fullname">
                          {user.nome && user.cognome
                            ? `${user.nome} ${user.cognome}`
                            : user.email}
                        </span>
                        <span className="user-menu-email">{user.email}</span>
                        <span className={`user-menu-role user-menu-role--${user.ruolo}`}>
                          {ROLE_LABELS[user.ruolo] ?? user.ruolo}
                        </span>
                      </div>
                    </div>
                    {isAdminUser(user) && (
                      <>
                        <div className="user-menu-divider" />
                        <Link
                          to="/admin"
                          className="user-menu-item"
                          onClick={() => setShowUserMenu(false)}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                            <circle cx="8.5" cy="7" r="4" />
                            <line x1="20" y1="8" x2="20" y2="14" />
                            <line x1="23" y1="11" x2="17" y2="11" />
                          </svg>
                          Gestione Utenti
                        </Link>
                      </>
                    )}
                    <div className="user-menu-divider" />
                    <button className="user-menu-item user-menu-item--danger" onClick={handleLogout}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                      Esci
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Not authenticated — show login button */
              <button
                className="auth-trigger-btn"
                onClick={() => { resetForm(); setShowAuthModal(true); }}
                id="auth-trigger-btn"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                Accedi
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Close user menu when clicking outside */}
      {showUserMenu && (
        <div className="user-menu-backdrop" onClick={() => setShowUserMenu(false)} />
      )}

      {/* Auth Modal */}
      {showAuthModal && (
        <div className="auth-overlay" onClick={closeModal} id="auth-overlay">
          <div className="auth-modal" onClick={(e) => e.stopPropagation()} id="auth-modal">
            {/* Close button */}
            <button className="auth-modal-close" onClick={closeModal} aria-label="Chiudi">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {/* Modal header */}
            <div className="auth-modal-header">
              <div className="auth-modal-logo">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <defs>
                    <linearGradient id="authLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#7c3aed" />
                      <stop offset="100%" stopColor="#06b6d4" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                    stroke="url(#authLogoGrad)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              {authStep === 'login' ? (
                <>
                  <h2 className="auth-modal-title">Bentornato!</h2>
                  <p className="auth-modal-subtitle">Accedi per continuare su SkillLab</p>
                </>
              ) : (
                <>
                  <h2 className="auth-modal-title">Imposta nuova password</h2>
                  <p className="auth-modal-subtitle">
                    La tua password temporanea è scaduta. Scegline una nuova per continuare.
                  </p>
                </>
              )}
            </div>

            {/* Error message */}
            {errorMessage && (
              <div className="auth-error" id="auth-error">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Login Form */}
            {authStep === 'login' && (
              <form className="auth-form" onSubmit={handleLogin} id="auth-form">
                <div className="auth-field">
                  <label className="auth-label" htmlFor="auth-email">Email / Username</label>
                  <div className="auth-input-wrapper">
                    <svg className="auth-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                    <input
                      type="text"
                      id="auth-email"
                      className="auth-input"
                      placeholder="nome@esempio.com oppure admin"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="username"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <div className="auth-field">
                  <label className="auth-label" htmlFor="auth-password">Password</label>
                  <div className="auth-input-wrapper">
                    <svg className="auth-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <input
                      type="password"
                      id="auth-password"
                      className="auth-input"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={1}
                      autoComplete="current-password"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="auth-submit-btn"
                  id="auth-submit-btn"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <span className="auth-btn-spinner" />
                      Accesso in corso...
                    </>
                  ) : (
                    'Accedi'
                  )}
                </button>
              </form>
            )}

            {/* New Password Form */}
            {authStep === 'new-password' && (
              <form className="auth-form" onSubmit={handleNewPassword} id="auth-new-password-form">
                <div className="auth-field">
                  <label className="auth-label" htmlFor="auth-new-password">Nuova Password</label>
                  <div className="auth-input-wrapper">
                    <svg className="auth-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <input
                      type="password"
                      id="auth-new-password"
                      className="auth-input"
                      placeholder="Inserisci la nuova password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <div className="auth-field">
                  <label className="auth-label" htmlFor="auth-confirm-new-password">Conferma Nuova Password</label>
                  <div className="auth-input-wrapper">
                    <svg className="auth-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    <input
                      type="password"
                      id="auth-confirm-new-password"
                      className="auth-input"
                      placeholder="Conferma la nuova password"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <div className="auth-password-requirements">
                  <p className="auth-requirements-title">Requisiti password:</p>
                  <ul className="auth-requirements-list">
                    <li className={newPassword.length >= 8 ? 'met' : ''}>Almeno 8 caratteri</li>
                    <li className={/[A-Z]/.test(newPassword) ? 'met' : ''}>Una lettera maiuscola</li>
                    <li className={/[a-z]/.test(newPassword) ? 'met' : ''}>Una lettera minuscola</li>
                    <li className={/[0-9]/.test(newPassword) ? 'met' : ''}>Un numero</li>
                  </ul>
                </div>

                <button
                  type="submit"
                  className="auth-submit-btn"
                  id="auth-new-password-submit"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <span className="auth-btn-spinner" />
                      Aggiornamento...
                    </>
                  ) : (
                    'Imposta Password'
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
