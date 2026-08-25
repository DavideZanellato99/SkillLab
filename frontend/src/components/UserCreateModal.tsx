/* La creazione di un utente: l'account nasce su Cognito e la password
 * temporanea parte via email, quindi qui non si sceglie nessuna password.
 *
 * Vive solo mentre è aperta, quindi i campi ripartono vuoti a ogni apertura
 * senza bisogno di svuotarli a mano. */

import { useState } from 'react'

import type { AdminUser } from '../services/admin'
import type { RoleName } from '../services/auth'
import { errorMessage } from '../services/errors'
import { useCreateUser } from '../hooks/useAdminUsers'
import { ROLE_OPTIONS } from './adminUsersConfig'
import Field, { fieldCls, labelCls, TextInput } from './Field'
import FormError from './FormError'
import ModalShell, { ModalHeader } from './ModalShell'
import PrimaryButton from './PrimaryButton'
import Select from './Select'
import Spinner from './Spinner'
import { UserPlusIcon } from './icons'

interface UserCreateModalProps {
  organizationOptions: { value: string; label: string }[]
  onClose: () => void
  onCreated: (user: AdminUser) => void
}

export default function UserCreateModal({
  organizationOptions,
  onClose,
  onCreated,
}: UserCreateModalProps) {
  const createMutation = useCreateUser()

  const [email, setEmail] = useState('')
  const [nome, setNome] = useState('')
  const [cognome, setCognome] = useState('')
  const [ruolo, setRuolo] = useState<RoleName>('user')
  const [organizationId, setOrganizationId] = useState('')
  /* La creazione ha una regola che il server non conosce (un utente non super
   * admin deve avere un'organizzazione): quel messaggio nasce qui, quindi
   * convive con quello della mutation. */
  const [validationError, setValidationError] = useState('')

  const isPending = createMutation.isPending
  const error =
    validationError ||
    errorMessage(createMutation.error, "Errore durante la creazione dell'utente.")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError('')
    createMutation.reset()

    if (ruolo !== 'super_admin' && !organizationId) {
      setValidationError("Seleziona l'organizzazione dell'utente.")
      return
    }

    try {
      const created = await createMutation.mutateAsync({
        email,
        nome,
        cognome,
        ruolo,
        organization_id: ruolo === 'super_admin' ? null : organizationId,
      })
      onCreated(created)
    } catch {
      // Il messaggio è nella mutation, la modale resta aperta a mostrarlo
    }
  }

  return (
    <ModalShell onClose={onClose} locked={isPending}>
      <ModalHeader
        iconWrapperCls="border border-violet-600/20 bg-violet-600/10"
        icon={<UserPlusIcon size={24} stroke="#7c3aed" />}
        title="Crea Nuovo Utente"
        description={
          <>L'utente verrà registrato su AWS Cognito e riceverà la password temporanea via email.</>
        }
        className="mb-8"
      />

      {error && <FormError message={error} />}

      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <Field label="Email" htmlFor="admin-email">
          <TextInput
            type="email"
            id="admin-email"
            placeholder="nuovo@utente.it"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isPending}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome" htmlFor="admin-nome">
            <TextInput
              type="text"
              id="admin-nome"
              placeholder="Mario"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              disabled={isPending}
            />
          </Field>

          <Field label="Cognome" htmlFor="admin-cognome">
            <TextInput
              type="text"
              id="admin-cognome"
              placeholder="Rossi"
              value={cognome}
              onChange={(e) => setCognome(e.target.value)}
              required
              disabled={isPending}
            />
          </Field>
        </div>

        <div className={fieldCls}>
          <label className={labelCls} htmlFor="admin-ruolo">
            Ruolo del sistema
          </label>
          <Select
            id="admin-ruolo"
            value={ruolo}
            onChange={(value) => setRuolo(value as RoleName)}
            options={ROLE_OPTIONS}
            disabled={isPending}
          />
        </div>

        {ruolo !== 'super_admin' && (
          <div className={fieldCls}>
            <label className={labelCls} htmlFor="admin-org">
              Organizzazione
            </label>
            {/* Il campo nasce vuoto, e senza il testo di richiamo la tendina
                si presentava con un trattino: un campo da compilare non deve
                sembrare un campo senza valore. */}
            <Select
              id="admin-org"
              value={organizationId}
              onChange={setOrganizationId}
              options={organizationOptions}
              placeholder="Seleziona un'organizzazione"
              disabled={isPending}
            />
            {organizationOptions.length === 0 && (
              <p className="text-[0.7rem] text-amber-400">
                Nessuna organizzazione disponibile: creane una prima di aggiungere utenti.
              </p>
            )}
          </div>
        )}

        <PrimaryButton type="submit" variant="submit" className="mt-4" disabled={isPending}>
          {isPending ? (
            <>
              <Spinner variant="button" />
              Creazione su Cognito...
            </>
          ) : (
            'Crea Utente'
          )}
        </PrimaryButton>
      </form>
    </ModalShell>
  )
}
