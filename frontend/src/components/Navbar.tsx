import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { OPEN_LOGIN_EVENT } from './LandingPage';
import {
  isNewPasswordRequired,
  isSuperAdmin,
  isAdmin,
  ROLE_LABELS,
  ROLE_BADGE_CLASSES,
  PASSWORD_MIN_LENGTH,
  PASSWORD_RULES,
  getUnmetPasswordRules,
} from '../services/auth';

type AuthStep = 'login' | 'new-password';

/* Shared form styles (auth modal) */
const fieldCls = 'flex flex-col gap-1.5';
const labelCls = 'text-xs font-medium tracking-wide text-slate-400';
const inputWrapperCls =
  'group flex items-center gap-2 rounded-xl border border-white/6 bg-slate-800/50 px-4 transition focus-within:border-violet-600 focus-within:shadow-[0_0_0_3px_rgba(124,58,237,0.1)]';
const inputIconCls = 'shrink-0 text-slate-500 transition-colors group-focus-within:text-violet-400';
const inputCls =
  'flex-1 border-none bg-transparent py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-50';
const submitBtnCls =
  'mt-1 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-none bg-gradient-to-br from-violet-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-px hover:shadow-[0_6px_20px_rgba(124,58,237,0.35)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60';
const menuItemCls =
  'flex w-full cursor-pointer items-center gap-2 rounded-lg border-none bg-transparent p-2 text-left text-[0.82rem] font-medium text-slate-400 no-underline transition hover:bg-white/8 hover:text-slate-100';

export default function Navbar() {
  const location = useLocation();
  const isHome = location.pathname === '/';
  const isDashboardPage = location.pathname === '/admin/dashboard';
  const isReportPage = location.pathname === '/admin/report';
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

  // The landing page CTAs ask to open the login modal via this event
  useEffect(() => {
    const openLogin = () => {
      setEmail('');
      setPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setCognitoSession('');
      setAuthStep('login');
      setErrorMessage('');
      setIsSubmitting(false);
      setShowAuthModal(true);
    };
    window.addEventListener(OPEN_LOGIN_EVENT, openLogin);
    return () => window.removeEventListener(OPEN_LOGIN_EVENT, openLogin);
  }, []);

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

    const unmetRules = getUnmetPasswordRules(newPassword);
    if (unmetRules.length > 0) {
      setErrorMessage(
        `La password non soddisfa i requisiti: ${unmetRules.join(', ').toLowerCase()}.`,
      );
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
      <nav
        className="fixed inset-x-0 top-0 z-[100] h-16 animate-slide-down border-b border-white/6 bg-night/70 backdrop-blur-2xl backdrop-saturate-150"
        id="navbar"
      >
        <div className="flex h-full w-full items-center justify-between px-4">
          {/* Logo */}
          <Link
            to="/"
            className="group flex items-center gap-2 text-slate-100 no-underline transition hover:scale-[1.03]"
            id="navbar-logo"
          >
            <div className="flex h-[38px] w-[38px] items-center justify-center rounded-xl border border-violet-600/20 bg-violet-600/10 transition group-hover:border-violet-600/35 group-hover:bg-violet-600/20 group-hover:shadow-[0_0_20px_rgba(124,58,237,0.15)]">
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
            <span className="font-heading text-xl font-bold tracking-tight">
              Skill
              <span className="animate-gradient-shift bg-gradient-to-br from-violet-600 to-cyan-500 bg-[length:200%_auto] bg-clip-text text-transparent">
                Lab
              </span>
            </span>
          </Link>

          {/* Center nav links */}
          <div className="flex items-center gap-1 max-md:hidden" id="navbar-links">
            <Link
              to="/"
              className={`relative flex items-center gap-1.5 rounded-lg px-4 py-2 text-[0.85rem] font-medium no-underline transition ${
                isHome
                  ? "bg-violet-600/10 text-slate-100 after:absolute after:-bottom-px after:left-1/2 after:h-0.5 after:w-5 after:-translate-x-1/2 after:rounded-sm after:bg-gradient-to-r after:from-violet-600 after:to-cyan-500 after:content-['']"
                  : 'text-slate-400 hover:bg-white/8 hover:text-slate-100'
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
              </svg>
              Gallery
            </Link>
            {isAuthenticated && isAdmin(user) && (
              <Link
                to="/admin/dashboard"
                className={`relative flex items-center gap-1.5 rounded-lg px-4 py-2 text-[0.85rem] font-medium no-underline transition ${
                  isDashboardPage
                    ? "bg-violet-600/10 text-slate-100 after:absolute after:-bottom-px after:left-1/2 after:h-0.5 after:w-5 after:-translate-x-1/2 after:rounded-sm after:bg-gradient-to-r after:from-violet-600 after:to-cyan-500 after:content-['']"
                    : 'text-slate-400 hover:bg-white/8 hover:text-slate-100'
                }`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="9" rx="1" />
                  <rect x="14" y="3" width="7" height="5" rx="1" />
                  <rect x="14" y="12" width="7" height="9" rx="1" />
                  <rect x="3" y="16" width="7" height="5" rx="1" />
                </svg>
                Dashboard
              </Link>
            )}
            {isAuthenticated && isAdmin(user) && (
              <Link
                to="/admin/report"
                className={`relative flex items-center gap-1.5 rounded-lg px-4 py-2 text-[0.85rem] font-medium no-underline transition ${
                  isReportPage
                    ? "bg-violet-600/10 text-slate-100 after:absolute after:-bottom-px after:left-1/2 after:h-0.5 after:w-5 after:-translate-x-1/2 after:rounded-sm after:bg-gradient-to-r after:from-violet-600 after:to-cyan-500 after:content-['']"
                    : 'text-slate-400 hover:bg-white/8 hover:text-slate-100'
                }`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
                Report Attività
              </Link>
            )}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-4" id="navbar-actions">
            {isAuthenticated && user ? (
              /* Authenticated — show user menu */
              <div className="relative">
                <button
                  className="flex cursor-pointer items-center gap-2 rounded-full border border-white/6 bg-white/4 py-1 pl-1 pr-2 text-[0.82rem] font-medium text-slate-400 transition hover:border-white/12 hover:bg-white/8 hover:text-slate-100 max-[480px]:p-1"
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  id="user-menu-trigger"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-cyan-500 text-xs font-bold text-white">
                    {(user.nome || user.email)[0].toUpperCase()}
                  </div>
                  <span className="max-w-[120px] truncate max-[480px]:hidden">
                    {user.nome && user.cognome
                      ? `${user.nome} ${user.cognome}`
                      : user.email}
                  </span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 opacity-50 transition-transform ${showUserMenu ? 'rotate-180' : ''}`}>
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                {showUserMenu && (
                  <div
                    className="absolute right-0 top-[calc(100%+8px)] z-[100] min-w-60 animate-menu-in rounded-2xl border border-white/6 bg-gray-900/95 p-2 shadow-[0_16px_48px_rgba(0,0,0,0.5),0_0_40px_rgba(124,58,237,0.06)] backdrop-blur-2xl"
                    id="user-menu-dropdown"
                  >
                    <div className="flex items-center gap-2 p-2">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-cyan-500 text-base font-bold text-white">
                        {(user.nome || user.email)[0].toUpperCase()}
                      </div>
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-[0.85rem] font-semibold text-slate-100">
                          {user.nome && user.cognome
                            ? `${user.nome} ${user.cognome}`
                            : user.email}
                        </span>
                        <span className="truncate text-xs text-slate-500">{user.email}</span>
                        <span className={`mt-1 w-fit rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider ${ROLE_BADGE_CLASSES[user.ruolo] ?? ''}`}>
                          {ROLE_LABELS[user.ruolo] ?? user.ruolo}
                        </span>
                      </div>
                    </div>
                    {isAdmin(user) && (
                      <>
                        <div className="my-1 h-px bg-white/6" />
                        {isSuperAdmin(user) && (
                          <Link
                            to="/admin"
                            className={menuItemCls}
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
                        )}
                        {isSuperAdmin(user) && (
                          <Link
                            to="/admin/avatars"
                            className={menuItemCls}
                            onClick={() => setShowUserMenu(false)}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                              <circle cx="12" cy="7" r="4" />
                            </svg>
                            Gestione Avatar
                          </Link>
                        )}
                        <Link
                          to="/admin/dashboard"
                          className={menuItemCls}
                          onClick={() => setShowUserMenu(false)}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="7" height="9" rx="1" />
                            <rect x="14" y="3" width="7" height="5" rx="1" />
                            <rect x="14" y="12" width="7" height="9" rx="1" />
                            <rect x="3" y="16" width="7" height="5" rx="1" />
                          </svg>
                          Dashboard
                        </Link>
                        <Link
                          to="/admin/report"
                          className={menuItemCls}
                          onClick={() => setShowUserMenu(false)}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="20" x2="18" y2="10" />
                            <line x1="12" y1="20" x2="12" y2="4" />
                            <line x1="6" y1="20" x2="6" y2="14" />
                          </svg>
                          Report Attività
                        </Link>
                      </>
                    )}
                    <div className="my-1 h-px bg-white/6" />
                    <button className={`${menuItemCls} hover:bg-red-500/10 hover:text-red-300`} onClick={handleLogout}>
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
                className="flex cursor-pointer items-center gap-1.5 rounded-full border border-white/6 bg-white/4 px-4 py-1.5 text-[0.82rem] font-medium text-slate-400 transition hover:-translate-y-px hover:border-violet-600 hover:bg-violet-600/12 hover:text-violet-400 hover:shadow-[0_4px_12px_rgba(124,58,237,0.15)]"
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
        <div className="fixed inset-0 z-[99]" onClick={() => setShowUserMenu(false)} />
      )}

      {/* Auth Modal */}
      {showAuthModal && (
        <div
          className="fixed inset-0 z-[200] flex animate-fade-in items-center justify-center bg-black/60 p-4 backdrop-blur-lg [animation-duration:0.2s]"
          onClick={closeModal}
          id="auth-overlay"
        >
          <div
            className="relative max-h-[90vh] w-full max-w-[420px] animate-modal-in overflow-y-auto rounded-3xl border border-white/6 bg-gray-900/95 p-12 shadow-[0_24px_80px_rgba(0,0,0,0.5),0_0_60px_rgba(124,58,237,0.08)] backdrop-blur-2xl max-[480px]:rounded-2xl max-[480px]:p-8"
            onClick={(e) => e.stopPropagation()}
            id="auth-modal"
          >
            {/* Close button */}
            <button
              className="absolute right-4 top-4 cursor-pointer rounded-lg border-none bg-transparent p-1.5 text-slate-500 transition hover:bg-white/8 hover:text-slate-100"
              onClick={closeModal}
              aria-label="Chiudi"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {/* Modal header */}
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-2xl border border-violet-600/20 bg-violet-600/10">
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
                  <h2 className="mb-1 font-heading text-[1.4rem] font-bold text-slate-100 max-[480px]:text-xl">Bentornato!</h2>
                  <p className="text-[0.85rem] text-slate-500">Accedi per continuare su SkillLab</p>
                </>
              ) : (
                <>
                  <h2 className="mb-1 font-heading text-[1.4rem] font-bold text-slate-100 max-[480px]:text-xl">Imposta nuova password</h2>
                  <p className="text-[0.85rem] text-slate-500">
                    La tua password temporanea è scaduta. Scegline una nuova per continuare.
                  </p>
                </>
              )}
            </div>

            {/* Error message */}
            {errorMessage && (
              <div className="mb-4 flex animate-fade-in-up items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2 text-[0.82rem] text-red-300 [animation-duration:0.2s]" id="auth-error">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-px shrink-0 text-red-500">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Login Form */}
            {authStep === 'login' && (
              <form className="flex flex-col gap-4" onSubmit={handleLogin} id="auth-form">
                <div className={fieldCls}>
                  <label className={labelCls} htmlFor="auth-email">Email</label>
                  <div className={inputWrapperCls}>
                    <svg className={inputIconCls} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                    <input
                      type="text"
                      id="auth-email"
                      className={inputCls}
                      placeholder="nome@esempio.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="username"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <div className={fieldCls}>
                  <label className={labelCls} htmlFor="auth-password">Password</label>
                  <div className={inputWrapperCls}>
                    <svg className={inputIconCls} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <input
                      type="password"
                      id="auth-password"
                      className={inputCls}
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
                  className={submitBtnCls}
                  id="auth-submit-btn"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
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
              <form className="flex flex-col gap-4" onSubmit={handleNewPassword} id="auth-new-password-form">
                <div className={fieldCls}>
                  <label className={labelCls} htmlFor="auth-new-password">Nuova Password</label>
                  <div className={inputWrapperCls}>
                    <svg className={inputIconCls} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <input
                      type="password"
                      id="auth-new-password"
                      className={inputCls}
                      placeholder="Inserisci la nuova password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={PASSWORD_MIN_LENGTH}
                      autoComplete="new-password"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <div className={fieldCls}>
                  <label className={labelCls} htmlFor="auth-confirm-new-password">Conferma Nuova Password</label>
                  <div className={inputWrapperCls}>
                    <svg className={inputIconCls} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    <input
                      type="password"
                      id="auth-confirm-new-password"
                      className={inputCls}
                      placeholder="Conferma la nuova password"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      required
                      minLength={PASSWORD_MIN_LENGTH}
                      autoComplete="new-password"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-white/6 bg-white/3 px-4 py-2">
                  <p className="mb-1 text-xs font-semibold text-slate-400">Requisiti password:</p>
                  <ul className="flex list-none flex-col gap-1">
                    {PASSWORD_RULES.map((rule) => {
                      const met = rule.test(newPassword);
                      return (
                        <li key={rule.label} className={`text-xs transition-colors ${met ? 'text-emerald-500' : 'text-slate-500'}`}>
                          <span className="mr-2">{met ? '●' : '○'}</span>
                          {rule.label}
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <button
                  type="submit"
                  className={submitBtnCls}
                  id="auth-new-password-submit"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
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
