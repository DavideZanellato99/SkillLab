/* La propria scheda: chi si è, la password, la copia dei propri dati, e la
 * guida introduttiva da rivedere.
 *
 * Sezioni e gesti distinti, ognuno con il proprio modulo e il proprio banner:
 * un solo messaggio in cima alla pagina non direbbe a quale si riferisce.
 *
 * La guida è l'unica che non scrive niente: è un pulsante che la riapre, e sta
 * qui perché dopo il primo accesso questo è il solo posto da cui si ritrova.
 *
 * Quasi tutti i campi qui sono in sola lettura, perché l'anagrafica la tiene
 * l'amministrazione. Un campo spento senza una riga che dica perché è la cosa
 * che fa tornare indietro chi è arrivato fin qui per correggere il proprio
 * cognome, quindi ogni blocco porta la propria spiegazione. */

import { useState, type ChangeEvent, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { saveBlob } from '../services/api'
import { fetchMyDataExport } from '../services/profile'
import { useUpdateMyProfile, useChangeMyPassword } from '../hooks/useProfile'
import {
  ROLE_LABELS,
  ROLE_BADGE_CLASSES,
  PASSWORD_MIN_LENGTH,
  getUnmetPasswordRules,
  getInitials,
  isSuperAdmin,
  isSystemAccount,
} from '../services/auth'
import { errorMessage } from '../services/errors'
import Spinner from './Spinner'
import FormError from './FormError'
import FormSuccess from './FormSuccess'
import Notice from './Notice'
import { PageContainer, PageHeader } from './PageLayout'
import Badge from './Badge'
import Field, { TextInput } from './Field'
import PasswordField from './PasswordField'
import PasswordRules from './PasswordRules'
import PrimaryButton from './PrimaryButton'
import { DownloadIcon, LockIcon, MailIcon, ShieldIcon, SparkleIcon } from './icons'
import { openTutorial } from './tutorialEvents'
import { hasTutorial } from './tutorialSteps'

/* Shared form styles (same look as the other admin/auth forms) */
const sectionCls = 'mb-8 rounded-3xl border border-white/6 bg-gray-900/60 p-8 max-[480px]:p-6'
const hintCls = 'text-xs text-slate-500'

export default function ProfilePage() {
  const { user, updateUser } = useAuth()

  // --- "I miei dati" form state ---
  const [nome, setNome] = useState(user?.nome ?? '')
  const [cognome, setCognome] = useState(user?.cognome ?? '')
  const [profileValidationError, setProfileValidationError] = useState('')
  const [profileSuccess, setProfileSuccess] = useState('')

  // --- "Cambia Password" form state ---
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  /* La conferma si giudica quando si è finito di scriverla: confrontarla a
   * ogni tasto vorrebbe dire un "non coincidono" acceso per tutta la
   * digitazione, cioè un rimprovero a chi sta facendo la cosa giusta. */
  const [confirmTouched, setConfirmTouched] = useState(false)
  const [passwordValidationError, setPasswordValidationError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')

  /* L'esportazione dei propri dati resta fuori dalle mutation: produce uno
   * ZIP da salvare su disco, non uno stato da tenere. */
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  const profileMutation = useUpdateMyProfile()
  const passwordMutation = useChangeMyPassword()

  /* Ogni form ha un banner solo: mostra il messaggio della validazione
   * locale, oppure quello della scrittura che è andata storta. */
  const profileError =
    profileValidationError ||
    errorMessage(profileMutation.error, "Errore durante l'aggiornamento dei dati.")
  const passwordError =
    passwordValidationError ||
    errorMessage(passwordMutation.error, 'Errore durante il cambio password.')

  if (!user) return null

  /* L'anagrafica la tiene l'amministrazione, non l'interessato: chi si
   * allena e chi amministra un'organizzazione legge nome e cognome come
   * legge l'email, e per cambiarli passa da un amministratore. */
  const canEditName = isSuperAdmin(user)
  /* La guida non è per tutti i ruoli, e la sezione che la riapre nemmeno. */
  const showTutorialSection = hasTutorial(user)
  const isProfileDirty = nome.trim() !== user.nome || cognome.trim() !== user.cognome
  const passwordsMismatch =
    confirmTouched && confirmNewPassword !== '' && newPassword !== confirmNewPassword

  /* Un esito parla del modulo com'era quando è comparso: appena si torna a
   * scriverci dentro non descrive più quello che c'è a schermo, quindi se ne
   * va. La mutation si azzera solo se ha davvero un errore da dimenticare,
   * altrimenti sarebbe un ridisegno a ogni tasto premuto. */
  const clearProfileFeedback = () => {
    setProfileSuccess('')
    setProfileValidationError('')
    if (profileMutation.error) profileMutation.reset()
  }

  const clearPasswordFeedback = () => {
    setPasswordSuccess('')
    setPasswordValidationError('')
    if (passwordMutation.error) passwordMutation.reset()
  }

  const editProfileField = (set: (value: string) => void) => (e: ChangeEvent<HTMLInputElement>) => {
    set(e.target.value)
    clearProfileFeedback()
  }

  const editPasswordField = (set: (value: string) => void) => (value: string) => {
    set(value)
    clearPasswordFeedback()
  }

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault()
    clearProfileFeedback()

    const trimmedNome = nome.trim()
    const trimmedCognome = cognome.trim()
    if (!trimmedNome || !trimmedCognome) {
      setProfileValidationError('Nome e cognome non possono essere vuoti.')
      return
    }

    try {
      const updated = await profileMutation.mutateAsync({
        nome: trimmedNome,
        cognome: trimmedCognome,
      })
      // Il profilo di chi guarda vive nel contesto, non in cache: è lui che
      // va allineato perché la barra in alto mostri il nome nuovo.
      updateUser(updated)
      setNome(updated.nome)
      setCognome(updated.cognome)
      setProfileSuccess('Dati aggiornati con successo.')
    } catch {
      // Il messaggio è nella mutation, il banner lo mostra
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
    clearPasswordFeedback()

    /* Le due password diverse le dice il campo, non il banner in cima: chi
     * ha premuto sta guardando i campi, ed è lì che c'è da rimettere mano. */
    if (newPassword !== confirmNewPassword) {
      setConfirmTouched(true)
      return
    }

    const unmetRules = getUnmetPasswordRules(newPassword)
    if (unmetRules.length > 0) {
      setPasswordValidationError(
        `La nuova password non soddisfa i requisiti: ${unmetRules.join(', ').toLowerCase()}.`,
      )
      return
    }

    try {
      /* L'esito lo scrive il server e non questo modulo: il cambio password
       * chiude tutte le sessioni aperte e riapre questa, e nel caso in cui
       * quel rientro non riesca la risposta dice che serve accedere di
       * nuovo. Un "aggiornata con successo" scritto qui coprirebbe proprio
       * la frase che spiega perché fra un istante si finisce al login. */
      const esito = await passwordMutation.mutateAsync({
        current_password: currentPassword,
        new_password: newPassword,
      })
      setPasswordSuccess(esito.message)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmNewPassword('')
      setConfirmTouched(false)
    } catch {
      // Il messaggio è nella mutation, il banner lo mostra
    }
  }

  return (
    <PageContainer width="form">
      <PageHeader
        title="Il Mio Profilo"
        description={
          canEditName
            ? 'Visualizza i tuoi dati, aggiorna nome e cognome e gestisci la password del tuo account.'
            : 'Visualizza i tuoi dati e gestisci la password del tuo account.'
        }
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
          <Field
            label="Email"
            htmlFor="profile-email"
            hint={
              <p className={hintCls}>
                L'indirizzo identifica il tuo account e non si modifica da qui.
              </p>
            }
          >
            <TextInput
              type="email"
              id="profile-email"
              value={user.email}
              icon={<MailIcon size={16} className="shrink-0 text-slate-500" />}
              readOnly
              disabled
            />
          </Field>

          <div className="grid grid-cols-2 gap-3 max-[480px]:grid-cols-1">
            <Field label="Nome" htmlFor="profile-nome">
              <TextInput
                type="text"
                id="profile-nome"
                placeholder={canEditName ? 'Mario' : undefined}
                value={nome}
                onChange={editProfileField(setNome)}
                required={canEditName}
                readOnly={!canEditName}
                disabled={!canEditName || profileMutation.isPending}
              />
            </Field>

            <Field label="Cognome" htmlFor="profile-cognome">
              <TextInput
                type="text"
                id="profile-cognome"
                placeholder={canEditName ? 'Rossi' : undefined}
                value={cognome}
                onChange={editProfileField(setCognome)}
                required={canEditName}
                readOnly={!canEditName}
                disabled={!canEditName || profileMutation.isPending}
              />
            </Field>
          </div>

          {canEditName ? (
            <PrimaryButton
              type="submit"
              variant="submit"
              className="mt-1"
              disabled={profileMutation.isPending || !isProfileDirty}
            >
              {profileMutation.isPending ? (
                <>
                  <Spinner variant="button" />
                  Salvataggio...
                </>
              ) : (
                'Salva Modifiche'
              )}
            </PrimaryButton>
          ) : (
            /* Chi legge i due campi spenti ha diritto di sapere perché, e
               soprattutto a chi rivolgersi: senza questa riga la strada per
               correggere un cognome sbagliato non è scritta da nessuna
               parte. */
            <p className={hintCls}>
              Nome e cognome sono registrati dalla tua organizzazione. Per correggerli, rivolgiti a
              un amministratore.
            </p>
          )}
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

        {isSystemAccount(user) ? (
          <p className="text-[0.85rem] text-slate-500">
            Non è possibile cambiare la password dell'account di sistema.
          </p>
        ) : (
          <>
            {passwordSuccess && <FormSuccess message={passwordSuccess} />}
            {passwordError && <FormError message={passwordError} />}

            <form className="flex flex-col gap-4" onSubmit={handleChangePassword}>
              <PasswordField
                id="profile-current-password"
                label="Password Attuale"
                value={currentPassword}
                onChange={editPasswordField(setCurrentPassword)}
                Icon={LockIcon}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                disabled={passwordMutation.isPending}
              />

              <PasswordField
                id="profile-new-password"
                label="Nuova Password"
                value={newPassword}
                onChange={editPasswordField(setNewPassword)}
                Icon={LockIcon}
                placeholder="Inserisci la nuova password"
                autoComplete="new-password"
                minLength={PASSWORD_MIN_LENGTH}
                required
                disabled={passwordMutation.isPending}
              />

              {/* I requisiti stanno sotto il campo che descrivono, non in
                  fondo al modulo: si leggono mentre si sceglie la password,
                  che è l'unico momento in cui servono. */}
              <PasswordRules password={newPassword} />

              <PasswordField
                id="profile-confirm-new-password"
                label="Conferma Nuova Password"
                value={confirmNewPassword}
                onChange={editPasswordField(setConfirmNewPassword)}
                onBlur={() => setConfirmTouched(true)}
                Icon={ShieldIcon}
                placeholder="Conferma la nuova password"
                autoComplete="new-password"
                minLength={PASSWORD_MIN_LENGTH}
                required
                disabled={passwordMutation.isPending}
                error={passwordsMismatch ? 'Le nuove password non coincidono.' : undefined}
              />

              <PrimaryButton
                type="submit"
                variant="submit"
                className="mt-1"
                disabled={passwordMutation.isPending}
              >
                {passwordMutation.isPending ? (
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

      {/* La copia dei propri dati */}
      <section className={sectionCls}>
        <div className="mb-6">
          <h2 className="font-heading text-lg font-bold text-slate-100">Copia dei Miei Dati</h2>
          <p className="text-[0.85rem] text-slate-500">
            Scarica una copia di tutti i dati che la piattaforma conserva sul tuo conto.
          </p>
        </div>

        {exportError && <FormError message={exportError} />}

        <p className="mb-4 text-[0.85rem] leading-relaxed text-slate-400">
          L'archivio contiene il tuo profilo, le trascrizioni complete delle tue conversazioni, le
          valutazioni automatiche, le revisioni dei formatori, gli obiettivi assegnati, gli accessi
          e il registro delle tue attività. Include anche le registrazioni audio delle tue
          telefonate simulate, quindi le sue dimensioni possono essere rilevanti e la preparazione
          richiedere qualche secondo.
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
              <DownloadIcon size={16} className="shrink-0" />
              Scarica i Miei Dati
            </>
          )}
        </PrimaryButton>

        {/* L'attesa può durare, e lo spinner dentro il bottone lo vede solo
            chi ha il bottone davanti: questa riga resta leggibile anche a chi
            nel frattempo ha scorso la pagina. */}
        {isExporting && (
          <Notice className="mt-4">
            L'archivio si sta preparando, il download parte da solo appena è pronto
          </Notice>
        )}
      </section>

      {/* La guida introduttiva, per chi la riceve: compare da sola al primo
          ingresso e poi si ritrova solo qui, che è la ragione per cui questa
          sezione esiste. Il super admin non ha passi da leggere, e per lui la
          sezione non c'è: un pulsante che apre il nulla è peggio di un
          pulsante che manca. */}
      {showTutorialSection && (
        <section className={sectionCls}>
          <div className="mb-6">
            <h2 className="font-heading text-lg font-bold text-slate-100">Guida Introduttiva</h2>
            <p className="text-[0.85rem] text-slate-500">
              Un giro delle sezioni della piattaforma, con quello che si fa in ognuna.
            </p>
          </div>

          <p className="mb-4 text-[0.85rem] leading-relaxed text-slate-400">
            È la stessa guida che hai visto al primo accesso, e riparte dal principio. Dura pochi
            passi e la puoi chiudere quando vuoi.
          </p>

          <PrimaryButton type="button" variant="submit" className="mt-1" onClick={openTutorial}>
            <SparkleIcon size={16} className="shrink-0" />
            Rivedi la Guida
          </PrimaryButton>
        </section>
      )}
    </PageContainer>
  )
}
