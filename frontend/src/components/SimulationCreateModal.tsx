import { useRef, useState } from 'react'
import { useCreateSimulation } from '../hooks/useSimulations'
import type { Organization } from '../services/organizations'
import { DOCUMENT_ACCEPT, documentRejection } from '../services/simulations'
import type { SimulationKind, SimulationSource } from '../services/simulations'
import ModalShell, { ModalHeader } from './ModalShell'
import Field, { textareaCls, TextInput } from './Field'
import Select from './Select'
import PrimaryButton from './PrimaryButton'
import Spinner from './Spinner'
import FormError from './FormError'
import { FileTextIcon, UploadIcon } from './icons'
import { kindLabel } from './simulationFormat'

/* La creazione di una simulazione: titolo, organizzazione, tipo, chi scrive
 * le domande e, se le scrive il modello, il documento.
 *
 * Le domande non si scrivono qui, in nessuna delle due strade: la creazione
 * finisce con una bozza vuota che si apre subito sul pannello di revisione,
 * dove la generazione è un bottone e la scrittura a mano un elenco che
 * cresce. Sono attese di durata molto diversa, e incollarle una all'altra
 * significherebbe far ricaricare il documento a chi ha avuto sfortuna con il
 * modello.
 *
 * Le due scelte che non si cambiano più si fanno qui, ed è l'unica occasione.
 * Il tipo, perché le domande nascono già con delle alternative, con la
 * traccia della risposta attesa, con dei passi in ordine o con delle coppie
 * abbinate. E chi le scrive, perché un test scritto a
 * mano non ha documento e uno generato ne ha uno indicizzato. Chi si accorge
 * di aver scelto male ne crea una nuova. */

/* I quattro tipi nell'ordine in cui sono nati, che è anche quello dal più
 * usato al meno. Le stesse parole del badge, prese da `kindLabel`: qui si
 * sceglie il tipo che poi si leggerà scritto su ogni riga, e due parole
 * diverse per la stessa cosa sarebbero due tipi apparenti. */
const KIND_OPTIONS = (['multiple', 'open', 'ordering', 'matching'] as SimulationKind[]).map(
  (value) => ({ value, label: kindLabel(value) }),
)

const SOURCE_OPTIONS = [
  { value: 'ai', label: 'Generate da un documento' },
  { value: 'manual', label: 'Scritte a mano' },
]

interface SimulationCreateModalProps {
  /** Le organizzazioni fra cui scegliere: vuoto per l'organization admin. */
  organizations: Organization[]
  /** Il tenant di chi crea, quando non è il super admin. */
  defaultOrganizationId?: string | null
  onClose: () => void
  onCreated: (simulationId: string) => void
}

export default function SimulationCreateModal({
  organizations,
  defaultOrganizationId = null,
  onClose,
  onCreated,
}: SimulationCreateModalProps) {
  const create = useCreateSimulation()
  const fileInput = useRef<HTMLInputElement>(null)

  const [organizationId, setOrganizationId] = useState(defaultOrganizationId ?? '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [kind, setKind] = useState<SimulationKind>('multiple')
  const [source, setSource] = useState<SimulationSource>('ai')
  const [file, setFile] = useState<File | null>(null)
  /** Il file scelto che il server rifiuterebbe, con il perché. */
  const [rejected, setRejected] = useState<string | null>(null)

  /* Le tre domande che il server porrebbe all'upload, poste qui: un
   * documento da trenta megabyte, o un PDF che è in realtà un'immagine con
   * l'estensione sbagliata, non deve occupare la linea per il tempo di un
   * caricamento che finisce in un errore. */
  const chooseFile = (chosen: File | null) => {
    const rejection = chosen ? documentRejection(chosen) : null
    setRejected(rejection)
    setFile(rejection ? null : chosen)
  }

  const fromDocument = source === 'ai'
  /* L'organizzazione la si deve scegliere solo dove c'è da scegliere: senza
   * il campo è il server a metterci quella di chi sta creando. */
  const chosenOrganization = organizations.length === 0 || organizationId
  const canSubmit =
    chosenOrganization && title.trim() && (!fromDocument || file) && !create.isPending

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    create.mutate(
      {
        organizationId,
        title: title.trim(),
        description: description.trim(),
        kind,
        source,
        /* Il file resta selezionato se qualcuno torna sulla generazione dopo
         * averlo scelto, ma a mano non si manda: il server rifiuta una
         * simulazione scritta a mano che porta un documento. */
        file: fromDocument ? file : null,
      },
      { onSuccess: (simulation) => onCreated(simulation.id) },
    )
  }

  return (
    <ModalShell onClose={onClose} locked={create.isPending} size="md" padding="md">
      <ModalHeader
        icon={<FileTextIcon size={24} />}
        iconWrapperCls="border border-violet-600/20 bg-violet-600/10 text-violet-400"
        title="Nuova Simulazione"
        description={
          fromDocument
            ? 'Carica il documento da cui ricavare le domande.'
            : 'Le domande si redigono nel passaggio successivo.'
        }
        className="mb-6"
      />

      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        {/* L'organizzazione la sceglie chi ne amministra più di una. Per un
            organization admin è la propria, e un campo con un'opzione sola
            sarebbe una scelta che non è una scelta. */}
        {organizations.length > 0 && (
          <Field label="Organizzazione" htmlFor="simulation-org">
            <Select
              id="simulation-org"
              value={organizationId}
              onChange={setOrganizationId}
              options={organizations.map((o) => ({ value: o.id, label: o.name }))}
              placeholder="Scegli l'organizzazione"
              disabled={create.isPending}
            />
          </Field>
        )}

        <Field label="Domande" htmlFor="simulation-source">
          <Select
            id="simulation-source"
            value={source}
            onChange={(value) => setSource(value as SimulationSource)}
            options={SOURCE_OPTIONS}
            disabled={create.isPending}
          />
        </Field>

        <Field label="Tipo di Test" htmlFor="simulation-kind">
          <Select
            id="simulation-kind"
            value={kind}
            onChange={(value) => setKind(value as SimulationKind)}
            options={KIND_OPTIONS}
            disabled={create.isPending}
          />
        </Field>

        <Field label="Titolo" htmlFor="simulation-title">
          <TextInput
            id="simulation-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Es. Procedure di assistenza clienti"
            maxLength={150}
            disabled={create.isPending}
            required
          />
        </Field>

        <Field
          label="Descrizione"
          htmlFor="simulation-description"
          hint={<span className="text-xs text-slate-500">Facoltativa</span>}
        >
          <textarea
            id="simulation-description"
            className={textareaCls}
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Es. Le venti casistiche più frequenti del primo livello"
            disabled={create.isPending}
          />
        </Field>

        {/* Il documento è la sola differenza fra le due strade: a mano non
            c'è niente da leggere, e un campo spento sarebbe una promessa che
            il resto del pannello non mantiene. */}
        {fromDocument && (
          <Field
            label="Documento"
            hint={
              <span className="text-xs text-slate-500">
                PDF, DOCX, TXT o Markdown, fino a 10 MB. Un PDF composto da pagine scansionate non
                contiene testo e non può essere elaborato.
              </span>
            }
          >
            <input
              ref={fileInput}
              type="file"
              accept={DOCUMENT_ACCEPT}
              className="hidden"
              onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
              disabled={create.isPending}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={create.isPending}
              className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-dashed border-white/12 bg-slate-800/50 px-4 py-3 text-left text-sm text-slate-400 transition hover:border-violet-600/50 hover:bg-violet-600/8 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <UploadIcon size={18} className="shrink-0 text-slate-500" />
              <span className="min-w-0 flex-1 truncate">
                {file ? file.name : 'Scegli un file dal computer'}
              </span>
            </button>
          </Field>
        )}

        {rejected && <FormError message={rejected} />}
        {create.isError && <FormError message={(create.error as Error).message} />}

        <PrimaryButton type="submit" variant="submit" className="mt-1" disabled={!canSubmit}>
          {create.isPending ? (
            <>
              <Spinner variant="button" />
              {fromDocument ? 'Lettura del documento...' : 'Creazione...'}
            </>
          ) : fromDocument ? (
            'Carica e continua'
          ) : (
            'Crea e scrivi le domande'
          )}
        </PrimaryButton>
      </form>
    </ModalShell>
  )
}
