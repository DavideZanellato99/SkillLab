/* La modale di accesso: la richiesta delle credenziali e, quando Cognito la
 * impone al primo accesso, la scelta della nuova password.
 *
 * Stava dentro la Navbar, che è il posto da cui si apre ma non ha niente a
 * che vedere con quello che fa: undici stati e due handler di un form
 * abitavano lo stesso componente delle voci di menu. Qui sono soli.
 *
 * Vive solo mentre è aperta, ed è la ragione per cui non c'è nessun `reset`:
 * chiuderla la smonta, riaprirla la costruisce da capo, quindi i campi
 * ripartono vuoti senza che nessuno debba ricordarsi di svuotarli uno per
 * uno. */

import { useState } from 'react'

import { useAuth } from '../hooks/useAuth'
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_RULES,
  getUnmetPasswordRules,
  isNewPasswordRequired,
} from '../services/auth'
import { fieldCls, inputCls, labelCls, litIconCls, litInputWrapperCls } from './Field'
import FormError from './FormError'
import ModalShell from './ModalShell'
import PasswordToggle from './PasswordToggle'
import PrimaryButton from './PrimaryButton'
import Spinner from './Spinner'
import { LockIcon, MailIcon, ShieldIcon } from './icons'

type AuthStep = 'login' | 'new-password'

/** Il marchio in testa alla modale. */
function AuthLogo() {
  return (
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
  )
}

function AuthHeader({ step }: { step: AuthStep }) {
  const titleCls = 'mb-1 font-heading text-[1.4rem] font-bold text-slate-100 max-[480px]:text-xl'
  return (
    <div className="mb-8 text-center">
      <AuthLogo />
      {step === 'login' ? (
        <>
          <h2 className={titleCls}>Bentornato!</h2>
          <p className="text-[0.85rem] text-slate-500">Accedi per continuare su SkillLab</p>
        </>
      ) : (
        <>
          <h2 className={titleCls}>Imposta Nuova Password</h2>
          <p className="text-[0.85rem] text-slate-500">
            La tua password temporanea è scaduta. Scegline una nuova per continuare.
          </p>
        </>
      )}
    </div>
  )
}

/** Le regole della password che si accendono man mano che vengono soddisfatte. */
function PasswordRules({ password }: { password: string }) {
  return (
    <div className="rounded-xl border border-white/6 bg-white/3 px-4 py-2">
      <p className="mb-1 text-xs font-semibold text-slate-400">Requisiti password:</p>
      <ul className="flex list-none flex-col gap-1">
        {PASSWORD_RULES.map((rule) => {
          const met = rule.test(password)
          return (
            <li
              key={rule.label}
              className={`text-xs transition-colors ${met ? 'text-emerald-500' : 'text-slate-500'}`}
            >
              <span className="mr-2">{met ? '●' : '○'}</span>
              {rule.label}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default function AuthModal({ onClose }: { onClose: () => void }) {
  const { login, completeNewPassword } = useAuth()

  const [step, setStep] = useState<AuthStep>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [cognitoSession, setCognitoSession] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage('')
    setIsSubmitting(true)

    try {
      const result = await login(email, password)

      if (isNewPasswordRequired(result)) {
        // Cognito chiede di cambiare la password temporanea
        setCognitoSession(result.session)
        setStep('new-password')
        setPassword('')
      } else {
        onClose()
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Errore durante il login.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleNewPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage('')

    if (newPassword !== confirmNewPassword) {
      setErrorMessage('Le password non coincidono.')
      return
    }

    const unmetRules = getUnmetPasswordRules(newPassword)
    if (unmetRules.length > 0) {
      setErrorMessage(
        `La password non soddisfa i requisiti: ${unmetRules.join(', ').toLowerCase()}.`,
      )
      return
    }

    setIsSubmitting(true)

    try {
      await completeNewPassword(email, newPassword, cognitoSession)
      onClose()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Errore durante il cambio password.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <AuthHeader step={step} />

      {errorMessage && <FormError message={errorMessage} />}

      {step === 'login' && (
        <form className="flex flex-col gap-4" onSubmit={handleLogin} id="auth-form">
          <div className={fieldCls}>
            <label className={labelCls} htmlFor="auth-email">
              Email
            </label>
            <div className={litInputWrapperCls}>
              <MailIcon size={16} className={litIconCls} />
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
            <label className={labelCls} htmlFor="auth-password">
              Password
            </label>
            <div className={litInputWrapperCls}>
              <LockIcon size={16} className={litIconCls} />
              <input
                type={showPassword ? 'text' : 'password'}
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
              <PasswordToggle
                visible={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
                disabled={isSubmitting}
                controls="auth-password"
              />
            </div>
          </div>

          <PrimaryButton
            type="submit"
            variant="submit"
            className="mt-1"
            id="auth-submit-btn"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Spinner variant="button" />
                Accesso in corso...
              </>
            ) : (
              'Accedi'
            )}
          </PrimaryButton>
        </form>
      )}

      {step === 'new-password' && (
        <form
          className="flex flex-col gap-4"
          onSubmit={handleNewPassword}
          id="auth-new-password-form"
        >
          <div className={fieldCls}>
            <label className={labelCls} htmlFor="auth-new-password">
              Nuova Password
            </label>
            <div className={litInputWrapperCls}>
              <LockIcon size={16} className={litIconCls} />
              <input
                type={showNewPassword ? 'text' : 'password'}
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
              <PasswordToggle
                visible={showNewPassword}
                onToggle={() => setShowNewPassword((v) => !v)}
                disabled={isSubmitting}
                controls="auth-new-password"
              />
            </div>
          </div>

          <div className={fieldCls}>
            <label className={labelCls} htmlFor="auth-confirm-new-password">
              Conferma Nuova Password
            </label>
            <div className={litInputWrapperCls}>
              <ShieldIcon size={16} className={litIconCls} />
              <input
                type={showConfirmNewPassword ? 'text' : 'password'}
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
              <PasswordToggle
                visible={showConfirmNewPassword}
                onToggle={() => setShowConfirmNewPassword((v) => !v)}
                disabled={isSubmitting}
                controls="auth-confirm-new-password"
              />
            </div>
          </div>

          <PasswordRules password={newPassword} />

          <PrimaryButton
            type="submit"
            variant="submit"
            className="mt-1"
            id="auth-new-password-submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Spinner variant="button" />
                Aggiornamento...
              </>
            ) : (
              'Imposta Password'
            )}
          </PrimaryButton>
        </form>
      )}
    </ModalShell>
  )
}
