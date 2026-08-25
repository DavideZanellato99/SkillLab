/* La modifica di un utente: nome, cognome, ruolo e organizzazione.
 *
 * L'email non si tocca, perché è l'identità dell'account su Cognito. Il
 * ruolo del proprio account e quello dell'account di sistema nemmeno, ed è
 * scritto sotto al campo invece di essere solo spento: un controllo
 * disabilitato senza spiegazione sembra un guasto. */

import { useState } from 'react'

import type { AdminUser } from '../services/admin'
import type { RoleName } from '../services/auth'
import { isSystemAccount } from '../services/auth'
import { errorMessage } from '../services/errors'
import { useUpdateUser } from '../hooks/useAdminUsers'
import { ROLE_OPTIONS } from './adminUsersConfig'
import Field, { fieldCls, labelCls, TextInput } from './Field'
import FormError from './FormError'
import ModalShell, { ModalHeader } from './ModalShell'
import PrimaryButton from './PrimaryButton'
import Select from './Select'
import Spinner from './Spinner'
import { PencilIcon } from './icons'

interface UserEditModalProps {
  user: AdminUser
  /** True se si sta modificando il proprio account. */
  isSelf: boolean
  organizationOptions: { value: string; label: string }[]
  onClose: () => void
  onUpdated: (user: AdminUser) => void
}

export default function UserEditModal({
  user,
  isSelf,
  organizationOptions,
  onClose,
  onUpdated,
}: UserEditModalProps) {
  const updateMutation = useUpdateUser()

  const [nome, setNome] = useState(user.nome)
  const [cognome, setCognome] = useState(user.cognome)
  const [ruolo, setRuolo] = useState<RoleName>(user.ruolo as RoleName)
  const [organizationId, setOrganizationId] = useState(user.organization_id ?? '')
  const [validationError, setValidationError] = useState('')

  const systemAccount = isSystemAccount(user)
  const isPending = updateMutation.isPending
  const error =
    validationError ||
    errorMessage(updateMutation.error, "Errore durante l'aggiornamento dell'utente.")

  /* Una scheda intatta non si salva: la richiesta partirebbe lo stesso, e
   * scriverebbe chi ha toccato l'account e quando, lasciando nel registro
   * attività la traccia di una modifica che non c'è stata. Gli spazi ai bordi
   * non contano, perché il server li toglie comunque. */
  const isUnchanged =
    nome.trim() === user.nome &&
    cognome.trim() === user.cognome &&
    ruolo === user.ruolo &&
    organizationId === (user.organization_id ?? '')

  const roleLockedReason = isSelf
    ? 'Non puoi modificare il ruolo del tuo stesso account.'
    : systemAccount
      ? "Il ruolo dell'account di sistema non è modificabile."
      : ''

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError('')
    updateMutation.reset()

    if (ruolo !== 'super_admin' && !organizationId) {
      setValidationError("Seleziona l'organizzazione dell'utente.")
      return
    }

    try {
      const updated = await updateMutation.mutateAsync({
        userId: user.id,
        payload: {
          nome,
          cognome,
          ruolo,
          organization_id: ruolo === 'super_admin' ? null : organizationId,
        },
      })
      onUpdated(updated)
    } catch {
      // Il messaggio è nella mutation, la modale resta aperta a mostrarlo
    }
  }

  return (
    <ModalShell onClose={onClose} locked={isPending}>
      <ModalHeader
        iconWrapperCls="border border-violet-600/20 bg-violet-600/10"
        icon={<PencilIcon size={24} stroke="#7c3aed" />}
        title="Modifica Utente"
        description={<>{user.email}</>}
        className="mb-8"
      />

      {error && <FormError message={error} />}

      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome" htmlFor="edit-nome">
            <TextInput
              type="text"
              id="edit-nome"
              placeholder="Mario"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              disabled={isPending}
            />
          </Field>

          <Field label="Cognome" htmlFor="edit-cognome">
            <TextInput
              type="text"
              id="edit-cognome"
              placeholder="Rossi"
              value={cognome}
              onChange={(e) => setCognome(e.target.value)}
              required
              disabled={isPending}
            />
          </Field>
        </div>

        <div className={fieldCls}>
          <label className={labelCls} htmlFor="edit-ruolo">
            Ruolo del sistema
          </label>
          <Select
            id="edit-ruolo"
            value={ruolo}
            onChange={(value) => setRuolo(value as RoleName)}
            options={ROLE_OPTIONS}
            disabled={isPending || Boolean(roleLockedReason)}
          />
          {roleLockedReason && <p className="text-[0.7rem] text-slate-500">{roleLockedReason}</p>}
        </div>

        {ruolo !== 'super_admin' && (
          <div className={fieldCls}>
            <label className={labelCls} htmlFor="edit-org">
              Organizzazione
            </label>
            <Select
              id="edit-org"
              value={organizationId}
              onChange={setOrganizationId}
              options={organizationOptions}
              disabled={isPending || systemAccount}
            />
          </div>
        )}

        <PrimaryButton
          type="submit"
          variant="submit"
          className="mt-4"
          disabled={isPending || isUnchanged}
        >
          {isPending ? (
            <>
              <Spinner variant="button" />
              Salvataggio...
            </>
          ) : (
            'Salva Modifiche'
          )}
        </PrimaryButton>
        {/* Il motivo per cui il bottone è spento, come per il ruolo bloccato
            qui sopra: un controllo disabilitato senza spiegazione sembra un
            guasto. */}
        {isUnchanged && (
          <p className="text-center text-[0.7rem] text-slate-500">
            Cambia un campo per abilitare il salvataggio.
          </p>
        )}
      </form>
    </ModalShell>
  )
}
