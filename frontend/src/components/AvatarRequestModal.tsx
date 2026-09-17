/* La richiesta di un avatar nuovo, scritta da un organization admin.
 *
 * Non è la scheda persona: quella ha settanta campi e la compila il super
 * admin. Qui stanno i pochi da cui la scheda nasce, chi è, in che categoria
 * va (un nome, anche di una categoria che non esiste ancora), che cosa gli è
 * successo. Il resto lo inventa la bozza del modello, o lo scrive chi la
 * rilegge.
 *
 * Due schede: il modulo, e le richieste già mandate, in attesa o rifiutate
 * ([AvatarRequestsList](./AvatarRequestsList.tsx)). Stavano una sopra
 * l'altra, ma con molte richieste aperte il modulo finiva in fondo a una
 * modale lunghissima. Le schede compaiono solo quando c'è qualcosa da
 * elencare: senza richieste aperte c'è il modulo e basta.
 *
 * Dopo l'invio la modale non si chiude: passa all'elenco, dove la richiesta
 * nuova sta sotto il banner che la conferma, e i campi si svuotano per la
 * prossima. Il banner è uno solo, per l'invio e per il ritiro, e un errore
 * lo copre finché non è risolto. */

import { useState } from 'react'

import { useAvatarRequests, useCreateAvatarRequest } from '../hooks/useAvatarRequests'
import { useFlashMessage } from '../hooks/useFlashMessage'
import { errorMessage } from '../services/errors'
import AvatarRequestsList from './AvatarRequestsList'
import Field, { textareaCls, TextInput } from './Field'
import FilterTabs from './FilterTabs'
import FormError from './FormError'
import FormSuccess from './FormSuccess'
import ModalShell, { ModalHeader } from './ModalShell'
import PrimaryButton from './PrimaryButton'
import Spinner from './Spinner'
import { UserPlusIcon } from './icons'

/* Sotto questa lunghezza la problematica non racconta un caso: da tre parole
 * chi compila la scheda deve inventarsi lo scenario, che è esattamente quello
 * che la richiesta esiste per evitare. */
const MIN_PROBLEM_CHARS = 40

type Section = 'form' | 'sent'

interface AvatarRequestModalProps {
  onClose: () => void
}

export default function AvatarRequestModal({ onClose }: AvatarRequestModalProps) {
  const createMutation = useCreateAvatarRequest()
  /* Le richieste già mandate: per elencarle, e per non mandarne due per la
   * stessa persona. Le pubblicate non si vedono, l'avatar è già in galleria. */
  const { data: requests = [] } = useAvatarRequests()
  const open = requests.filter((r) => r.status !== 'published')
  const hasSent = open.length > 0
  const { message: successMsg, flash: flashSuccess } = useFlashMessage()

  /* La scheda scelta vale finché c'è un elenco: ritirata l'ultima richiesta
   * le schede spariscono e resta il modulo, senza che nessuno debba
   * riportarci la scelta a mano. */
  const [tab, setTab] = useState<Section>('form')
  const section: Section = hasSent ? tab : 'form'

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
      setFirstName('')
      setLastName('')
      setCategory('')
      setScenarioType('')
      setProblem('')
      setTab('sent')
      flashSuccess(
        `Richiesta per ${sent.first_name} ${sent.last_name} inviata: riceverai una notifica quando l'avatar sarà pubblicato.`,
      )
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
            Indica chi è il cliente e che cosa gli è successo: la scheda completa viene compilata da
            SkillLab e l'avatar comparirà nella galleria della tua organizzazione.
          </>
        }
        className="mb-8"
      />

      {error ? <FormError message={error} /> : successMsg && <FormSuccess message={successMsg} />}

      {/* Le schede ci sono solo quando le sezioni sono due: una scheda verso
          un elenco vuoto sarebbe un bottone che non porta da nessuna parte. */}
      {hasSent && (
        <div className="mb-6 flex justify-center">
          <FilterTabs
            value={section}
            onChange={setTab}
            ariaLabel="Sezione della richiesta"
            options={[
              { value: 'form', label: 'Nuova richiesta' },
              { value: 'sent', label: 'Richieste inviate', count: open.length },
            ]}
          />
        </div>
      )}

      {section === 'sent' && <AvatarRequestsList requests={open} onRemoved={flashSuccess} />}

      {/* I campi vivono nella modale e non nel form, quindi la scheda si può
          smontare e rimontare senza perdere quello che si stava scrivendo. */}
      {section === 'form' && (
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
      )}
    </ModalShell>
  )
}
