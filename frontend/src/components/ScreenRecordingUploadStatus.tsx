import FormError from './FormError'
import Spinner from './Spinner'
import { MonitorIcon } from './icons'
import { secondaryButtonCls } from './SecondaryButton'

/* Che fine ha fatto la registrazione dello schermo, sopra l'esito del test.
 *
 * La consegna e il caricamento del video sono due chiamate, e la seconda
 * pesa cento volte la prima: l'esito compare appena arriva, e il video sale
 * dopo. Chi ha appena finito il test deve vedere che sta salendo, che è
 * salito, o che non è salito e può riprovare senza perdere niente, perché
 * il file è ancora nel suo browser finché la pagina resta aperta.
 *
 * Se la condivisione era stata interrotta lo si dice qui, con le parole
 * dell'avviso letto prima di cominciare: il test è stato consegnato in quel
 * momento, ed è il motivo per cui le domande dopo risultano in bianco. */

interface ScreenRecordingUploadStatusProps {
  /** La registrazione è stata fermata dall'utente prima della consegna. */
  interrupted: boolean
  /** Il browser non ha prodotto nessun video: niente da caricare. */
  empty: boolean
  isPending: boolean
  isSuccess: boolean
  error: string
  onRetry: () => void
}

export default function ScreenRecordingUploadStatus({
  interrupted,
  empty,
  isPending,
  isSuccess,
  error,
  onRetry,
}: ScreenRecordingUploadStatusProps) {
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-white/6 bg-gray-900/60 p-5">
      <p className="flex items-center gap-2 text-[0.9rem] font-semibold text-slate-100">
        <MonitorIcon size={15} className="text-violet-400" />
        Registrazione dello schermo
      </p>
      {interrupted && (
        <p className="text-[0.85rem] text-slate-400">
          La condivisione dello schermo è stata interrotta: il test è stato consegnato in quel
          momento con le risposte fornite fino a lì.
        </p>
      )}
      {empty ? (
        <p className="text-[0.85rem] text-slate-400">
          Il browser non ha prodotto nessuna registrazione. Il tentativo è stato comunque consegnato
          e risulterà privo di registrazione.
        </p>
      ) : isPending ? (
        <p className="flex items-center gap-2 text-[0.85rem] text-slate-400">
          <Spinner variant="small" />
          Caricamento della registrazione in corso, non chiudere la pagina...
        </p>
      ) : isSuccess ? (
        <p className="text-[0.85rem] text-slate-400">
          Registrazione caricata insieme al tentativo.
        </p>
      ) : (
        <>
          <FormError message={error || 'Non è stato possibile caricare la registrazione.'} />
          <p className="text-[0.85rem] text-slate-400">
            Il test è stato consegnato, la registrazione no: resta in questa pagina e ripeti il
            caricamento.
          </p>
          <button type="button" onClick={onRetry} className={`${secondaryButtonCls} w-fit`}>
            Riprova il Caricamento
          </button>
        </>
      )}
    </div>
  )
}
