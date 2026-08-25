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
import { PASSWORD_MIN_LENGTH, getUnmetPasswordRules, isNewPasswordRequired } from '../services/auth'
import Field, { TextInput, litIconCls } from './Field'
import FormError from './FormError'
import ModalShell from './ModalShell'
import PasswordField from './PasswordField'
import PasswordRules from './PasswordRules'
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

export default function AuthModal({ onClose }: { onClose: () => void }) {
  const { login, completeNewPassword } = useAuth()

  const [step, setStep] = useState<AuthStep>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  /* La conferma si giudica quando si è finito di scriverla: confrontarla a
   * ogni tasto vorrebbe dire un "non coincidono" acceso per tutta la
   * digitazione, cioè un rimprovero a chi sta facendo la cosa giusta. */
  const [confirmTouched, setConfirmTouched] = useState(false)
  const [cognitoSession, setCognitoSession] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const passwordsMismatch =
    confirmTouched && confirmNewPassword !== '' && newPassword !== confirmNewPassword

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

    /* Le due password diverse le dice il campo, non il banner in cima: chi
     * ha premuto sta guardando i campi, ed è lì che c'è da rimettere mano. */
    if (newPassword !== confirmNewPassword) {
      setConfirmTouched(true)
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
          <Field label="Email" htmlFor="auth-email">
            <TextInput
              type="text"
              id="auth-email"
              placeholder="nome@esempio.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              disabled={isSubmitting}
              litIcon
              icon={<MailIcon size={16} className={litIconCls} />}
            />
          </Field>

          <PasswordField
            id="auth-password"
            label="Password"
            value={password}
            onChange={setPassword}
            Icon={LockIcon}
            placeholder="••••••••"
            autoComplete="current-password"
            minLength={1}
            required
            disabled={isSubmitting}
          />

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
          <PasswordField
            id="auth-new-password"
            label="Nuova Password"
            value={newPassword}
            onChange={setNewPassword}
            Icon={LockIcon}
            placeholder="Inserisci la nuova password"
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            required
            disabled={isSubmitting}
          />

          {/* I requisiti stanno sotto il campo che descrivono, non in fondo
              al modulo: si leggono mentre si sceglie la password, che è
              l'unico momento in cui servono. */}
          <PasswordRules password={newPassword} />

          <PasswordField
            id="auth-confirm-new-password"
            label="Conferma Nuova Password"
            value={confirmNewPassword}
            onChange={setConfirmNewPassword}
            onBlur={() => setConfirmTouched(true)}
            Icon={ShieldIcon}
            placeholder="Conferma la nuova password"
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            required
            disabled={isSubmitting}
            error={passwordsMismatch ? 'Le password non coincidono.' : undefined}
          />

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
