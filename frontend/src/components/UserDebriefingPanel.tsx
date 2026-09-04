/* I quadri d'insieme su una persona, dentro la sua riga del report attività.
 *
 * Le altre due linguette elencano le prove una per una, questa risponde alla
 * terza domanda che ci si fa aprendo la riga di qualcuno, cioè «cosa devo
 * dirgli». Sta accanto alle altre due e non sopra, perché è dello stesso
 * ordine: tre domande sulla stessa persona, non una conclusione che vale più
 * degli elenchi da cui viene.
 *
 * **Aperto c'è sempre uno solo, e di default è l'ultimo.** Le versioni
 * precedenti stanno sotto, in righe da una riga, e si aprono al posto suo:
 * quello che vale è il quadro di adesso, e una schermata che ne mostrasse
 * due per intero obbligherebbe a decidere a quale credere. Che una vecchia
 * sia aperta lo dice la fascia in cima, perché leggere per attuale un testo
 * scritto tre mesi fa è l'unico modo in cui questa schermata può ingannare.
 *
 * Il disegno di un quadro e quello dello storico stanno in due file loro:
 * qui resta la scelta di quale mostrare, il bottone che ne fa scrivere uno
 * nuovo e i casi in cui non ce n'è ancora nessuno. */

import { useState } from 'react'
import { useUserDebriefings, useGenerateDebriefing } from '../hooks/useDebriefing'
import DebriefingHistory from './DebriefingHistory'
import DebriefingVersion from './DebriefingVersion'
import FormError from './FormError'
import LoadingState from './LoadingState'
import PrimaryButton from './PrimaryButton'
import Tooltip from './Tooltip'
import { formatDateTime } from './dateFormat'

/* Quante prove servono al server per accettare di scriverlo. Ripetuto qui
 * solo per dirlo prima di far partire una richiesta che verrebbe rifiutata,
 * come la coppia voto/motivazione della revisione: la regola che vale resta
 * quella del server, che risponde 409 con il conto esatto. */
const MIN_EVIDENCE = 3

export default function UserDebriefingPanel({
  userId,
  userName,
  evidenceCount,
}: {
  userId: string
  /* Il nome serve solo alla frase che spiega cosa si sta per far scrivere:
   * la richiesta viaggia sull'id. */
  userName: string
  /* Quante prove ha in tutto questa persona, per non offrire un bottone che
   * il server rifiuterebbe, oppure null quando chi ci monta non lo sa.
   *
   * Sono due cose diverse e prima erano una sola: il report contava le prove
   * del periodo che stava guardando, mentre il server, che il periodo non lo
   * conosce, legge tutte le prove che esistono. Con un periodo stretto la
   * schermata negava così il quadro a chi ne aveva venti in un anno. Non
   * saperlo vuol dire mostrare il bottone e lasciar rispondere il server, che
   * è comunque la regola che vale. */
  evidenceCount: number | null
}) {
  const { data: debriefings, isPending, error } = useUserDebriefings(userId)
  const generate = useGenerateDebriefing(userId)
  /* Quale versione è aperta. Un id e non un indice: dopo una generazione la
   * lista si sposta di uno, e un indice terrebbe aperta la riga sbagliata. */
  const [openId, setOpenId] = useState<string | null>(null)

  if (isPending) {
    return <LoadingState message="Caricamento del quadro d'insieme..." variant="modal" />
  }

  const loadError = error instanceof Error ? error.message : error ? 'Lettura non riuscita.' : ''
  const generateError = generate.error
    ? generate.error instanceof Error
      ? generate.error.message
      : 'Generazione non riuscita.'
    : ''

  const storico = debriefings ?? []
  const latest = storico[0]
  /* L'ultimo finché non si sceglie, e di nuovo l'ultimo se quello scelto non
   * c'è più: dopo una generazione la lista cambia sotto la selezione. */
  const shown = storico.find((d) => d.id === openId) ?? latest
  const isLatestShown = shown?.id === latest?.id

  /* Sotto la soglia il bottone non c'è, e al suo posto c'è il motivo. Un
   * bottone spento senza spiegazione manda a cercare cosa si è sbagliato. */
  const tooFewProofs =
    storico.length === 0 && evidenceCount !== null && evidenceCount < MIN_EVIDENCE
  /* Rigenerare senza prove nuove darebbe una versione che dice le stesse
   * cose, e il server la rifiuta: il bottone lo dice prima invece di far
   * partire una richiesta che tornerà indietro. */
  const nothingNew = latest !== undefined && !latest.is_stale

  const generateButton = (
    <PrimaryButton
      onClick={() => generate.mutate()}
      disabled={generate.isPending || nothingNew}
      className="shrink-0"
    >
      {generate.isPending
        ? 'Lettura delle prove in corso...'
        : latest
          ? 'Genera un quadro aggiornato'
          : "Genera il quadro d'insieme"}
    </PrimaryButton>
  )

  return (
    <div className="flex flex-col gap-4">
      {loadError && <FormError message={loadError} />}
      {generateError && <FormError message={generateError} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[0.95rem] font-semibold text-slate-100">Quadro d'insieme</h3>
            {latest?.is_stale && (
              <Tooltip content="Questa persona ha svolto altre prove dopo che il quadro è stato scritto: quello che leggi non le ha viste.">
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-widest text-amber-400">
                  Da aggiornare
                </span>
              </Tooltip>
            )}
          </div>
          {shown ? (
            <span className="text-xs text-slate-500">
              Scritto il {formatDateTime(shown.created_at)}, richiesto da {shown.requested_by}
            </span>
          ) : (
            <span className="text-xs text-slate-500">
              Gli elementi ricorrenti nelle prove di {userName}, che una prova alla volta non
              emergono
            </span>
          )}
        </div>

        {/* Spento quando non c'è niente di nuovo da leggere, con il motivo
            nel tooltip: `wrap` perché un elemento disabilitato non emette
            eventi del mouse, quindi senza involucro il motivo non si
            vedrebbe proprio nel caso in cui serve. */}
        {!tooFewProofs &&
          (nothingNew ? (
            <Tooltip content="Nessuna prova nuova dall'ultimo quadro d'insieme" wrap>
              {generateButton}
            </Tooltip>
          ) : (
            generateButton
          ))}
      </div>

      {/* L'attesa è la più lunga dell'area di amministrazione dopo la
          generazione di un serbatoio di domande, e dire quanto durerà è
          l'unica cosa che impedisce di premere il bottone una seconda
          volta credendo che non abbia funzionato. */}
      {generate.isPending && (
        <LoadingState
          message="Lettura delle prove di questa persona in corso. L'operazione può richiedere qualche minuto."
          variant="modal"
        />
      )}

      {tooFewProofs && (
        <p className="py-4 text-center text-[0.85rem] italic text-slate-500">
          Servono almeno {MIN_EVIDENCE} prove svolte per un quadro d'insieme. Con un numero
          inferiore riprodurrebbe le valutazioni già disponibili
        </p>
      )}

      {storico.length === 0 && !tooFewProofs && !generate.isPending && (
        <p className="py-4 text-center text-[0.85rem] italic text-slate-500">
          Nessun quadro d'insieme ancora scritto per questa persona
        </p>
      )}

      {shown && !generate.isPending && (
        <div className="flex flex-col gap-4">
          {/* Una versione vecchia riaperta lo dice in chiaro, e il modo di
              tornare all'attuale sta nella stessa riga che avvisa. */}
          {!isLatestShown && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/25 bg-amber-500/8 px-3 py-2">
              <span className="text-[0.8rem] text-amber-300">
                Stai leggendo un quadro precedente, scritto il {formatDateTime(shown.created_at)}
              </span>
              <button
                type="button"
                onClick={() => setOpenId(null)}
                className="text-[0.8rem] font-semibold text-amber-300 underline underline-offset-2 hover:text-amber-200"
              >
                Torna a quello attuale
              </button>
            </div>
          )}

          <DebriefingVersion debriefing={shown} />

          {/* Lo storico è lo stesso elenco del quadro di un percorso, quindi
              riceve righe e non debriefing: qui si dice quali dei propri
              campi sono le cinque cose che una riga mostra. */}
          <DebriefingHistory
            versions={storico.map((d) => ({
              id: d.id,
              createdAt: d.created_at,
              direction: d.direction,
              average: d.conversation_average,
              delta: d.conversation_average_delta,
            }))}
            currentId={shown.id}
            onSelect={(id) => setOpenId(id)}
          />
        </div>
      )}
    </div>
  )
}
