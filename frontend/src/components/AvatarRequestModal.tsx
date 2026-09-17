/* La richiesta di un avatar nuovo, scritta da un organization admin.
 *
 * Non è la scheda persona: quella ha settanta campi e la compila il super
 * admin. Qui stanno i pochi da cui la scheda nasce, chi è, in che categoria
 * va (un nome, anche di una categoria che non esiste ancora), che cosa gli è
 * successo. Il resto lo inventa la bozza del modello, o lo scrive chi la
 * rilegge.
 *
 * Vive solo mentre è aperta, quindi i campi ripartono vuoti a ogni apertura
 * senza bisogno di svuotarli a mano. */

import { useState } from 'react'

import { useAvatarRequests, useCreateAvatarRequest } from '../hooks/useAvatarRequests'
import type { AvatarRequest } from '../services/avatarRequests'
import { errorMessage } from '../services/errors'
import Field, { textareaCls, TextInput } from './Field'
import FormError from './FormError'
import ModalShell, { ModalHeader } from './ModalShell'
import PrimaryButton from './PrimaryButton'
import Spinner from './Spinner'
import { UserPlusIcon } from './icons'

/* Sotto questa lunghezza la problematica non racconta un caso: da tre parole
 * chi compila la scheda deve inventarsi lo scenario, che è esattamente quello
 * che la richiesta esiste per evitare. */
const MIN_PROBLEM_CHARS = 40

interface AvatarRequestModalProps {
  onClose: () => void
  onSent: (request: AvatarRequest) => void
}

export default function AvatarRequestModal({ onClose, onSent }: AvatarRequestModalProps) {
  const createMutation = useCreateAvatarRequest()
  /* Le richieste già in attesa, per non mandarne due per la stessa persona:
   * l'elenco è già in cache, lo legge il pannello da cui la modale si apre. */
  const { data: requests = [] } = useAvatarRequests()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [category, setCategory] = useState('')
  const [scenarioType, setScenarioType] = useState('')
  const [problem, setProblem] = useState('')
  const [validationError, setValidationError] = useState('')

  const isPending = createMutation.isPending
  const error =
    validationError || errorMessage(createMutation.error, "Errore durante l'invio della richiesta.")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError('')
    createMutation.reset()

    if (problem.trim().length < MIN_PROBLEM_CHARS) {
      setValidationError(
        `Descrivi la problematica con almeno ${MIN_PROBLEM_CHARS} caratteri: è da qui che nasce la scheda.`,
      )
      return
    }
    const sameName = requests.find(
      (r) =>
        r.status === 'pending' &&
        r.first_name.trim().toLowerCase() === firstName.trim().toLowerCase() &&
        r.last_name.trim().toLowerCase() === lastName.trim().toLowerCase(),
    )
    if (sameName) {
      setValidationError(
        `Una richiesta per ${sameName.first_name} ${sameName.last_name} è già in attesa.`,
      )
      return
    }

    try {
      const sent = await createMutation.mutateAsync({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        category: category.trim(),
        scenario_type: scenarioType.trim(),
        problem: problem.trim(),
      })
      onSent(sent)
    } catch {
      // Il messaggio è nella mutation, la modale resta aperta a mostrarlo
    }
  }

  return (
    <ModalShell onClose={onClose} locked={isPending} size="lg">
      <ModalHeader
        iconWrapperCls="border border-violet-600/20 bg-violet-600/10"
        icon={<UserPlusIcon size={24} stroke="#7c3aed" />}
        title="Richiedi un Avatar"
        description={
          <>
            Indica chi è il cliente e che cosa gli è successo: la scheda completa viene compilata
            dal super admin e l'avatar comparirà nella galleria della tua organizzazione.
          </>
        }
        className="mb-8"
      />

      {error && <FormError message={error} />}

      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-3 max-[480px]:grid-cols-1">
          <Field label="Nome" htmlFor="avatar-request-first-name">
            <TextInput
              type="text"
              id="avatar-request-first-name"
              placeholder="Giovanni"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              maxLength={100}
              required
              disabled={isPending}
            />
          </Field>
          <Field label="Cognome" htmlFor="avatar-request-last-name">
            <TextInput
              type="text"
              id="avatar-request-last-name"
              placeholder="Salemmi"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              maxLength={100}
              required
              disabled={isPending}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3 max-[480px]:grid-cols-1">
          {/* Testo libero e non l'elenco delle categorie esistenti: chi chiede
              può volere un gruppo che la galleria non ha ancora, e a crearlo
              è il super admin compilando la scheda. La lunghezza è quella del
              nome di una categoria, così può nascere tale e quale. */}
          <Field label="Categoria" htmlFor="avatar-request-category">
            <TextInput
              type="text"
              id="avatar-request-category"
              placeholder="Es. Clienti, Fornitori, Sportello reclami"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              maxLength={50}
              required
              disabled={isPending}
            />
          </Field>
          <Field label="Tipo di scenario" htmlFor="avatar-request-scenario">
            <TextInput
              type="text"
              id="avatar-request-scenario"
              placeholder="Es. Reclamo, richiesta di informazioni, disdetta"
              value={scenarioType}
              onChange={(e) => setScenarioType(e.target.value)}
              maxLength={200}
              required
              disabled={isPending}
            />
          </Field>
        </div>

        <Field
          label="Problematica"
          htmlFor="avatar-request-problem"
          hint={
            <p className="text-[0.7rem] text-slate-500">
              Cosa è accaduto al cliente e quale competenza deve esercitare l'operatore. Il resto
              della scheda viene composto attorno a questo.
            </p>
          }
        >
          <textarea
            id="avatar-request-problem"
            className={textareaCls}
            rows={4}
            placeholder="Es. Vede due addebiti uguali sulla carta nello stesso giorno e chiama convinto di essere stato truffato. In realtà è una preautorizzazione non ancora stornata."
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
            required
            disabled={isPending}
          />
        </Field>

        <PrimaryButton type="submit" variant="submit" className="mt-4" disabled={isPending}>
          {isPending ? (
            <>
              <Spinner variant="button" />
              Invio in corso...
            </>
          ) : (
            'Invia la Richiesta'
          )}
        </PrimaryButton>
      </form>
    </ModalShell>
  )
}
