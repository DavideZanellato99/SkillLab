import { useRef, useState } from 'react'
import { DOCUMENT_ACCEPT, documentRejection } from '../services/simulations'
import type { SimulationAdminDetail } from '../services/simulations'
import ConfirmModal from './ConfirmModal'
import Field, { TextInput, textareaCls } from './Field'
import FormError from './FormError'
import FormSuccess from './FormSuccess'
import PrimaryButton from './PrimaryButton'
import Spinner from './Spinner'
import { UploadIcon } from './icons'

/* I dati del test: il titolo, la descrizione e il documento da cui le domande
 * nascono.
 *
 * Stanno accanto alle domande e ai risultati, nello stesso pannello, perché
 * sono lo stesso test visto da un altro lato: chi apre la matita per
 * correggere un refuso nel titolo e chi la apre per rileggere la trentesima
 * domanda stanno lavorando sulla stessa cosa. Una modale a parte per due
 * campi vorrebbe dire uscire di qui, riaprire da capo e ritrovarsi in cima
 * all'elenco.
 *
 * Si cambia solo quello che si può cambiare senza contraddire le domande già
 * scritte. Non l'organizzazione, che si porterebbe dietro i tentativi di
 * persone che nell'organizzazione nuova non esistono; non il tipo di test e
 * non chi ha scritto le domande, perché le domande sono già nate dell'una o
 * dell'altra forma. A dirlo è il server (vedi `update_simulation`), e qui
 * quei campi non compaiono proprio: un campo spento sarebbe una promessa che
 * nessuno mantiene.
 *
 * La sostituzione del documento esiste dove un documento c'è: su un test
 * scritto a mano non ce n'è mai stato uno. Sostituirlo cancella i passaggi di
 * prima e ne indicizza di nuovi, e lascia stare le domande: sono il test, e
 * un test non si azzera perché la procedura è stata aggiornata. Restano lì a
 * citare passaggi che ora sono altri, ed è per questo che la conferma lo dice
 * a chiare lettere invece di limitarsi a chiedere se si è sicuri. */

interface SimulationSettingsPanelProps {
  simulation: SimulationAdminDetail
  /** Il titolo e la descrizione in scrittura, che vivono nel pannello che
   *  ospita questo: cambiando linguetta non si perdono. */
  title: string
  description: string
  onChange: (details: { title: string; description: string }) => void
  onSave: () => void
  isSaving: boolean
  /** L'ultimo salvataggio è riuscito, e da allora i campi non sono stati più
   *  toccati. */
  saved: boolean
  error: string
  /** `onDone` chiude la conferma quando la sostituzione è riuscita. */
  onReplaceDocument: (file: File, onDone: () => void) => void
  isReplacing: boolean
  documentError: string
  /** Un'altra operazione del pannello è in corso: qui non si tocca niente. */
  disabled?: boolean
}

export default function SimulationSettingsPanel({
  simulation,
  title,
  description,
  onChange,
  onSave,
  isSaving,
  saved,
  error,
  onReplaceDocument,
  isReplacing,
  documentError,
  disabled = false,
}: SimulationSettingsPanelProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  /* Il documento scelto, in attesa della conferma. Finché sta qui non è
   * partito niente: la sostituzione cancella l'indicizzazione di prima e
   * consuma una chiamata a pagamento, quindi non parte dal clic con cui si
   * sceglie un file. */
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  /** Il file scelto che il server rifiuterebbe, con il perché. */
  const [rejected, setRejected] = useState<string | null>(null)

  const isManual = simulation.source === 'manual'
  const busy = disabled || isSaving || isReplacing
  const changed = title !== simulation.title || description !== (simulation.description ?? '')
  const canSave = Boolean(title.trim()) && changed && !busy

  const chooseFile = (file: File | null) => {
    /* Il campo si svuota subito: senza, scegliere di nuovo lo stesso file
     * dopo aver annullato non emetterebbe nessun evento, e il bottone
     * sembrerebbe rotto. */
    if (fileInput.current) fileInput.current.value = ''
    /* Un file che il server rifiuterebbe non arriva nemmeno alla conferma:
     * il rifiuto si legge qui, subito, invece che dopo l'attesa di un
     * caricamento andato a vuoto. */
    const rejection = file ? documentRejection(file) : null
    setRejected(rejection)
    setPendingFile(rejection ? null : file)
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Field label="Titolo" htmlFor="simulation-settings-title">
        <TextInput
          id="simulation-settings-title"
          value={title}
          onChange={(e) => onChange({ title: e.target.value, description })}
          maxLength={150}
          disabled={busy}
        />
      </Field>

      <Field
        label="Descrizione"
        htmlFor="simulation-settings-description"
        hint={<span className="text-xs text-slate-500">Facoltativa</span>}
      >
        <textarea
          id="simulation-settings-description"
          className={textareaCls}
          rows={3}
          value={description}
          onChange={(e) => onChange({ title, description: e.target.value })}
          placeholder="Es. Le venti casistiche più frequenti del primo livello"
          disabled={busy}
        />
      </Field>

      {error && <FormError message={error} />}
      {/* Il buon esito sparisce al primo tasto premuto: «Dati aggiornati»
          sopra un titolo riscritto nel frattempo direbbe una cosa falsa. */}
      {saved && !error && !changed && <FormSuccess message="Dati aggiornati" />}

      <div className="flex">
        <PrimaryButton
          onClick={onSave}
          disabled={!canSave}
          icon={isSaving ? <Spinner variant="button" /> : undefined}
        >
          {isSaving ? 'Salvataggio...' : 'Salva i dati'}
        </PrimaryButton>
      </div>

      {!isManual && (
        <div className="mt-2 flex flex-col gap-2 border-t border-white/6 pt-5">
          <h3 className="text-[0.9rem] font-semibold text-slate-100">Documento</h3>
          <p className="text-[0.85rem] text-slate-400">
            {simulation.document_name}
            <span className="text-slate-600"> · </span>
            <span className="text-slate-500">
              {simulation.chunk_count === 1
                ? '1 passaggio indicizzato'
                : `${simulation.chunk_count} passaggi indicizzati`}
            </span>
          </p>
          <p className="text-xs leading-relaxed text-slate-500">
            Sostituendolo, i passaggi vengono indicizzati di nuovo. Le domande restano quelle di
            adesso e continuano a citare passaggi che ora sono altri: dopo la sostituzione vanno
            rilette, oppure rigenerate dal documento nuovo
          </p>

          <input
            ref={fileInput}
            type="file"
            accept={DOCUMENT_ACCEPT}
            className="hidden"
            onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
            disabled={busy}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            className="mt-1 flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-dashed border-white/12 bg-slate-800/50 px-4 py-2 text-sm text-slate-400 transition hover:border-violet-600/50 hover:bg-violet-600/8 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <UploadIcon size={16} className="shrink-0 text-slate-500" />
            Sostituisci il documento
          </button>

          {/* Fuori dalla conferma l'errore si legge lo stesso: la conferma si
              chiude quando la sostituzione riesce, e quello che va storto
              prima resta sotto il bottone che lo ha chiesto. */}
          {rejected && <FormError message={rejected} />}
          {documentError && !pendingFile && <FormError message={documentError} />}
        </div>
      )}

      {pendingFile && (
        <ConfirmModal
          elevated
          icon={<UploadIcon size={24} />}
          iconWrapperCls="border border-violet-600/20 bg-violet-600/10 text-violet-400"
          title="Sostituisci il documento"
          description={
            <>
              <strong>{pendingFile.name}</strong> prende il posto di{' '}
              <strong>{simulation.document_name}</strong>, e i suoi passaggi vengono indicizzati di
              nuovo.
              {simulation.questions.length > 0 && (
                <>
                  {' '}
                  Le {simulation.questions.length} domande già scritte restano dove sono: rileggile,
                  o rigenerale dal documento nuovo.
                </>
              )}
            </>
          }
          error={documentError}
          confirmLabel="Sostituisci e indicizza"
          pendingLabel="Indicizzazione..."
          confirmClassName="bg-violet-600/15 text-violet-300 hover:bg-violet-600/25"
          isPending={isReplacing}
          onConfirm={() => onReplaceDocument(pendingFile, () => setPendingFile(null))}
          onClose={() => setPendingFile(null)}
        />
      )}
    </div>
  )
}
