import { useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { updateMyProfile, changeMyPassword } from '../services/profile';
import {
  ROLE_LABELS,
  ROLE_BADGE_CLASSES,
  PASSWORD_MIN_LENGTH,
  PASSWORD_RULES,
  getUnmetPasswordRules,
  getInitials,
} from '../services/auth';

/* Shared form styles (same look as the other admin/auth forms) */
const fieldCls = 'flex flex-col gap-1.5';
const labelCls = 'text-xs font-medium tracking-wide text-slate-400';
const inputWrapperCls =
  'flex items-center gap-2 rounded-xl border border-white/6 bg-slate-800/50 px-4 transition focus-within:border-violet-600 focus-within:shadow-[0_0_0_3px_rgba(124,58,237,0.1)]';
const inputCls =
  'flex-1 border-none bg-transparent py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-50';
const submitBtnCls =
  'mt-1 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-none bg-gradient-to-br from-violet-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-px hover:shadow-[0_6px_20px_rgba(124,58,237,0.35)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60';
const formErrorCls =
  'mb-4 flex animate-fade-in-up items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2 text-[0.82rem] text-red-300 [animation-duration:0.2s]';
const formSuccessCls =
  'mb-4 flex animate-fade-in-up items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-[0.82rem] text-emerald-400 [animation-duration:0.2s]';
const spinnerCls = 'h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white';
const sectionCls = 'mb-8 rounded-3xl border border-white/6 bg-gray-900/60 p-8 max-[480px]:p-6';

function ErrorBox({ message }: { message: string }) {
  return (
    <div className={formErrorCls}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-px shrink-0 text-red-500">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>{message}</span>
    </div>
  );
}

function SuccessBox({ message }: { message: string }) {
  return (
    <div className={formSuccessCls}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
      <span>{message}</span>
    </div>
  );
}

export default function ProfilePage() {
  const { user, updateUser } = useAuth();

  // --- "I miei dati" form state ---
  const [nome, setNome] = useState(user?.nome ?? '');
  const [cognome, setCognome] = useState(user?.cognome ?? '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  // --- "Cambia password" form state ---
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  if (!user) return null;

  const isSystemAccount = user.cognito_sub.startsWith('mock-');
  const isProfileDirty = nome.trim() !== user.nome || cognome.trim() !== user.cognome;

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setProfileError('');
    setProfileSuccess('');

    const trimmedNome = nome.trim();
    const trimmedCognome = cognome.trim();
    if (!trimmedNome || !trimmedCognome) {
      setProfileError('Nome e cognome non possono essere vuoti.');
      return;
    }

    setIsSavingProfile(true);
    try {
      const updated = await updateMyProfile({ nome: trimmedNome, cognome: trimmedCognome });
      updateUser(updated);
      setNome(updated.nome);
      setCognome(updated.cognome);
      setProfileSuccess('Dati aggiornati con successo.');
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Errore durante l'aggiornamento dei dati.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword !== confirmNewPassword) {
      setPasswordError('Le nuove password non coincidono.');
      return;
    }

    const unmetRules = getUnmetPasswordRules(newPassword);
    if (unmetRules.length > 0) {
      setPasswordError(
        `La nuova password non soddisfa i requisiti: ${unmetRules.join(', ').toLowerCase()}.`,
      );
      return;
    }

    setIsChangingPassword(true);
    try {
      await changeMyPassword({ current_password: currentPassword, new_password: newPassword });
      setPasswordSuccess('Password aggiornata con successo.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Errore durante il cambio password.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[720px] px-6 py-12 max-md:px-4">
      <header className="mb-10">
        <h1 className="mb-1 font-heading text-3xl font-bold text-slate-100">Il Mio Profilo</h1>
        <p className="text-[0.95rem] text-slate-500">
          Visualizza i tuoi dati, aggiorna nome e cognome e gestisci la password del tuo account.
        </p>
      </header>

      {/* I miei dati */}
      <section className={sectionCls}>
        <div className="mb-6 flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-cyan-500 text-xl font-bold text-white">
            {getInitials(user.nome, user.cognome, user.email)}
          </div>
          <div className="min-w-0">
            <h2 className="truncate font-heading text-lg font-bold text-slate-100">
              {user.nome && user.cognome ? `${user.nome} ${user.cognome}` : user.email}
            </h2>
            <span className={`mt-1 inline-block w-fit rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider ${ROLE_BADGE_CLASSES[user.ruolo] ?? ''}`}>
              {ROLE_LABELS[user.ruolo] ?? user.ruolo}
            </span>
          </div>
        </div>

        {profileSuccess && <SuccessBox message={profileSuccess} />}
        {profileError && <ErrorBox message={profileError} />}

        <form className="flex flex-col gap-4" onSubmit={handleSaveProfile}>
          <div className={fieldCls}>
            <label className={labelCls} htmlFor="profile-email">Email</label>
            <div className={inputWrapperCls}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate-500">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
              <input
                type="email"
                id="profile-email"
                className={inputCls}
                value={user.email}
                readOnly
                disabled
              />
            </div>
            <p className="text-[0.7rem] text-slate-500">
              L'email non è modificabile. Contatta un amministratore per cambiarla.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 max-[480px]:grid-cols-1">
            <div className={fieldCls}>
              <label className={labelCls} htmlFor="profile-nome">Nome</label>
              <div className={inputWrapperCls}>
                <input
                  type="text"
                  id="profile-nome"
                  className={inputCls}
                  placeholder="Mario"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  required
                  disabled={isSavingProfile}
                />
              </div>
            </div>

            <div className={fieldCls}>
              <label className={labelCls} htmlFor="profile-cognome">Cognome</label>
              <div className={inputWrapperCls}>
                <input
                  type="text"
                  id="profile-cognome"
                  className={inputCls}
                  placeholder="Rossi"
                  value={cognome}
                  onChange={(e) => setCognome(e.target.value)}
                  required
                  disabled={isSavingProfile}
                />
              </div>
            </div>
          </div>

          <button type="submit" className={submitBtnCls} disabled={isSavingProfile || !isProfileDirty}>
            {isSavingProfile ? (
              <>
                <span className={spinnerCls} />
                Salvataggio...
              </>
            ) : (
              'Salva Modifiche'
            )}
          </button>
        </form>
      </section>

      {/* Cambia password */}
      <section className={sectionCls}>
        <div className="mb-6">
          <h2 className="font-heading text-lg font-bold text-slate-100">Cambia Password</h2>
          <p className="text-[0.85rem] text-slate-500">Scegli una nuova password per il tuo account.</p>
        </div>

        {isSystemAccount ? (
          <p className="text-[0.85rem] text-slate-500">
            Non è possibile cambiare la password dell'account di sistema.
          </p>
        ) : (
          <>
            {passwordSuccess && <SuccessBox message={passwordSuccess} />}
            {passwordError && <ErrorBox message={passwordError} />}

            <form className="flex flex-col gap-4" onSubmit={handleChangePassword}>
              <div className={fieldCls}>
                <label className={labelCls} htmlFor="profile-current-password">Password Attuale</label>
                <div className={inputWrapperCls}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate-500">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <input
                    type="password"
                    id="profile-current-password"
                    className={inputCls}
                    placeholder="••••••••"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    disabled={isChangingPassword}
                  />
                </div>
              </div>

              <div className={fieldCls}>
                <label className={labelCls} htmlFor="profile-new-password">Nuova Password</label>
                <div className={inputWrapperCls}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate-500">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <input
                    type="password"
                    id="profile-new-password"
                    className={inputCls}
                    placeholder="Inserisci la nuova password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={PASSWORD_MIN_LENGTH}
                    autoComplete="new-password"
                    disabled={isChangingPassword}
                  />
                </div>
              </div>

              <div className={fieldCls}>
                <label className={labelCls} htmlFor="profile-confirm-new-password">Conferma Nuova Password</label>
                <div className={inputWrapperCls}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate-500">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  <input
                    type="password"
                    id="profile-confirm-new-password"
                    className={inputCls}
                    placeholder="Conferma la nuova password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    required
                    minLength={PASSWORD_MIN_LENGTH}
                    autoComplete="new-password"
                    disabled={isChangingPassword}
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

              <button type="submit" className={submitBtnCls} disabled={isChangingPassword}>
                {isChangingPassword ? (
                  <>
                    <span className={spinnerCls} />
                    Aggiornamento...
                  </>
                ) : (
                  'Aggiorna Password'
                )}
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
