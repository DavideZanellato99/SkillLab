import { useState, type FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { saveBlob } from '../services/api'
import { updateMyProfile, changeMyPassword, fetchMyDataExport } from '../services/profile'
import {
  ROLE_LABELS,
  ROLE_BADGE_CLASSES,
  PASSWORD_MIN_LENGTH,
  PASSWORD_RULES,
  getUnmetPasswordRules,
  getInitials,
} from '../services/auth'
import PasswordToggle from './PasswordToggle'
import Spinner from './Spinner'
import FormError from './FormError'
import FormSuccess from './FormSuccess'
import { PageContainer, PageHeader } from './PageLayout'
import Badge from './Badge'
import Field, { fieldCls, labelCls, inputWrapperCls, inputCls, TextInput } from './Field'
import PrimaryButton from './PrimaryButton'

/* Shared form styles (same look as the other admin/auth forms) */
const sectionCls = 'mb-8 rounded-3xl border border-white/6 bg-gray-900/60 p-8 max-[480px]:p-6'

export default function ProfilePage() {
  const { user, updateUser } = useAuth()

  // --- "I miei dati" form state ---
  const [nome, setNome] = useState(user?.nome ?? '')
  const [cognome, setCognome] = useState(user?.cognome ?? '')
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileSuccess, setProfileSuccess] = useState('')

  // --- "Cambia password" form state ---
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false)

  // --- "I miei dati personali" (esportazione) ---
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  if (!user) return null

  const isSystemAccount = user.cognito_sub.startsWith('mock-')
  const isProfileDirty = nome.trim() !== user.nome || cognome.trim() !== user.cognome

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault()
    setProfileError('')
    setProfileSuccess('')

    const trimmedNome = nome.trim()
    const trimmedCognome = cognome.trim()
    if (!trimmedNome || !trimmedCognome) {
      setProfileError('Nome e cognome non possono essere vuoti.')
      return
    }

    setIsSavingProfile(true)
    try {
      const updated = await updateMyProfile({ nome: trimmedNome, cognome: trimmedCognome })
      updateUser(updated)
      setNome(updated.nome)
      setCognome(updated.cognome)
      setProfileSuccess('Dati aggiornati con successo.')
    } catch (err) {
      setProfileError(
        err instanceof Error ? err.message : "Errore durante l'aggiornamento dei dati.",
      )
    } finally {
      setIsSavingProfile(false)
    }
  }

  /* L'archivio può contenere le registrazioni audio, quindi è pesante e
   * arriva in un colpo solo: il bottone resta bloccato finché non è pronto */
  const handleExportMyData = async () => {
    if (isExporting) return
    setIsExporting(true)
    setExportError('')
    try {
      const blob = await fetchMyDataExport()
      saveBlob(blob, `dati-personali-${new Date().toISOString().slice(0, 10)}.zip`)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Esportazione dei dati non riuscita.')
    } finally {
      setIsExporting(false)
    }
  }

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')

    if (newPassword !== confirmNewPassword) {
      setPasswordError('Le nuove password non coincidono.')
      return
    }

    const unmetRules = getUnmetPasswordRules(newPassword)
    if (unmetRules.length > 0) {
      setPasswordError(
        `La nuova password non soddisfa i requisiti: ${unmetRules.join(', ').toLowerCase()}.`,
      )
      return
    }

    setIsChangingPassword(true)
    try {
      await changeMyPassword({ current_password: currentPassword, new_password: newPassword })
      setPasswordSuccess('Password aggiornata con successo.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmNewPassword('')
      setShowCurrentPassword(false)
      setShowNewPassword(false)
      setShowConfirmNewPassword(false)
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Errore durante il cambio password.')
    } finally {
      setIsChangingPassword(false)
    }
  }

  return (
    <PageContainer width="form">
      <PageHeader
        title="Il Mio Profilo"
        description="Visualizza i tuoi dati, aggiorna nome e cognome e gestisci la password del tuo account."
      />

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
            <Badge tone={ROLE_BADGE_CLASSES[user.ruolo] ?? ''} className="mt-1">
              {ROLE_LABELS[user.ruolo] ?? user.ruolo}
            </Badge>
          </div>
        </div>

        {profileSuccess && <FormSuccess message={profileSuccess} />}
        {profileError && <FormError message={profileError} />}

        <form className="flex flex-col gap-4" onSubmit={handleSaveProfile}>
          <div className={fieldCls}>
            <label className={labelCls} htmlFor="profile-email">
              Email
            </label>
            <div className={inputWrapperCls}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 text-slate-500"
              >
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
            <Field label="Nome" htmlFor="profile-nome">
              <TextInput
                type="text"
                id="profile-nome"
                placeholder="Mario"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
                disabled={isSavingProfile}
              />
            </Field>

            <Field label="Cognome" htmlFor="profile-cognome">
              <TextInput
                type="text"
                id="profile-cognome"
                placeholder="Rossi"
                value={cognome}
                onChange={(e) => setCognome(e.target.value)}
                required
                disabled={isSavingProfile}
              />
            </Field>
          </div>

          <PrimaryButton
            type="submit"
            variant="submit"
            className="mt-1"
            disabled={isSavingProfile || !isProfileDirty}
          >
            {isSavingProfile ? (
              <>
                <Spinner variant="button" />
                Salvataggio...
              </>
            ) : (
              'Salva Modifiche'
            )}
          </PrimaryButton>
        </form>
      </section>

      {/* Cambia password */}
      <section className={sectionCls}>
        <div className="mb-6">
          <h2 className="font-heading text-lg font-bold text-slate-100">Cambia Password</h2>
          <p className="text-[0.85rem] text-slate-500">
            Scegli una nuova password per il tuo account.
          </p>
        </div>

        {isSystemAccount ? (
          <p className="text-[0.85rem] text-slate-500">
            Non è possibile cambiare la password dell'account di sistema.
          </p>
        ) : (
          <>
            {passwordSuccess && <FormSuccess message={passwordSuccess} />}
            {passwordError && <FormError message={passwordError} />}

            <form className="flex flex-col gap-4" onSubmit={handleChangePassword}>
              <div className={fieldCls}>
                <label className={labelCls} htmlFor="profile-current-password">
                  Password Attuale
                </label>
                <div className={inputWrapperCls}>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 text-slate-500"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    id="profile-current-password"
                    className={inputCls}
                    placeholder="••••••••"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    disabled={isChangingPassword}
                  />
                  <PasswordToggle
                    visible={showCurrentPassword}
                    onToggle={() => setShowCurrentPassword((v) => !v)}
                    disabled={isChangingPassword}
                    controls="profile-current-password"
                  />
                </div>
              </div>

              <div className={fieldCls}>
                <label className={labelCls} htmlFor="profile-new-password">
                  Nuova Password
                </label>
                <div className={inputWrapperCls}>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 text-slate-500"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
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
                  <PasswordToggle
                    visible={showNewPassword}
                    onToggle={() => setShowNewPassword((v) => !v)}
                    disabled={isChangingPassword}
                    controls="profile-new-password"
                  />
                </div>
              </div>

              <div className={fieldCls}>
                <label className={labelCls} htmlFor="profile-confirm-new-password">
                  Conferma Nuova Password
                </label>
                <div className={inputWrapperCls}>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 text-slate-500"
                  >
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  <input
                    type={showConfirmNewPassword ? 'text' : 'password'}
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
                  <PasswordToggle
                    visible={showConfirmNewPassword}
                    onToggle={() => setShowConfirmNewPassword((v) => !v)}
                    disabled={isChangingPassword}
                    controls="profile-confirm-new-password"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-white/6 bg-white/3 px-4 py-2">
                <p className="mb-1 text-xs font-semibold text-slate-400">Requisiti password:</p>
                <ul className="flex list-none flex-col gap-1">
                  {PASSWORD_RULES.map((rule) => {
                    const met = rule.test(newPassword)
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

              <PrimaryButton
                type="submit"
                variant="submit"
                className="mt-1"
                disabled={isChangingPassword}
              >
                {isChangingPassword ? (
                  <>
                    <Spinner variant="button" />
                    Aggiornamento...
                  </>
                ) : (
                  'Aggiorna Password'
                )}
              </PrimaryButton>
            </form>
          </>
        )}
      </section>

      {/* I miei dati personali */}
      <section className={sectionCls}>
        <div className="mb-6">
          <h2 className="font-heading text-lg font-bold text-slate-100">I Miei Dati Personali</h2>
          <p className="text-[0.85rem] text-slate-500">
            Scarica una copia di tutto quello che la piattaforma conserva su di te.
          </p>
        </div>

        {exportError && <FormError message={exportError} />}

        <p className="mb-4 text-[0.85rem] leading-relaxed text-slate-400">
          L'archivio contiene il tuo profilo, le trascrizioni complete delle tue conversazioni, le
          valutazioni automatiche, le revisioni dei formatori, gli obiettivi assegnati, gli accessi
          e il registro delle tue attività. Include anche le registrazioni audio delle tue
          telefonate simulate, quindi può pesare parecchio e richiedere qualche secondo.
        </p>

        <PrimaryButton
          type="button"
          variant="submit"
          className="mt-1"
          onClick={handleExportMyData}
          disabled={isExporting}
        >
          {isExporting ? (
            <>
              <Spinner variant="button" />
              Preparazione dell'archivio...
            </>
          ) : (
            <>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Scarica i Miei Dati
            </>
          )}
        </PrimaryButton>
      </section>
    </PageContainer>
  )
}
