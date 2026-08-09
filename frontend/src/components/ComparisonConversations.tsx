import { useMemo, useState } from 'react'
import type { Attempt } from '../services/comparison'
import ComparisonEmpty from './ComparisonEmpty'
import ComparisonFilterBar, { ComparisonWarnings } from './ComparisonFilterBar'
import ConversationModeBadge from './ConversationModeBadge'
import Select from './Select'
import { conversationModeLabel, MODE_FILTERS } from './conversationMode'
import type { ModeFilter } from './conversationMode'
import { ANY, filterOptions, matchesFilter, pickPair, survivingFilter } from './comparisonFilters'
import { Delta } from './scoreCharts'
import { cardCls, formatScore, scoreBarColor, scoreTextColor } from './scoreFormat'
import { formatDate } from './lastAccess'

/* La metà parlata del confronto: due conversazioni valutate, una accanto
 * all'altra, con lo scarto dei voti e quello di ogni criterio.
 *
 * I punteggi mostrati sono quelli finali, correzione del docente inclusa,
 * altrimenti il confronto contraddirebbe la pagella.
 *
 * Si sceglie fra le prove che i due filtri lasciano passare, il canale e lo
 * scenario: una telefonata e una chat scritta non si giudicano nello stesso
 * modo, e i sei criteri sono tarati sulla difficoltà di quel cliente. */

function attemptLabel(attempt: Attempt): string {
  return `${formatDate(attempt.conversation_at)} · ${attempt.title} · ${formatScore(
    attempt.final_score,
  )}/10`
}

/** Una colonna del confronto: il tentativo con il suo voto e le sue parole.
 *
 *  `baseline` è il tentativo di sinistra, quello rispetto a cui si misura:
 *  la variazione compare quindi solo a destra. Metterla su entrambe le
 *  colonne significherebbe scrivere lo stesso scarto due volte, una col
 *  segno rovesciato, e costringere a chiedersi quale dei due si legge. */
function AttemptPanel({ attempt, baseline }: { attempt: Attempt; baseline: Attempt | null }) {
  const delta = baseline ? attempt.final_score - baseline.final_score : null
  const hasWords = attempt.summary || attempt.review_reason || attempt.review_note

  return (
    /* Un pannello per tentativo invece di due blocchi sciolti affiancati:
       il bordo dice dove finisce una conversazione e comincia l'altra, che
       è la domanda che si fa chi legge un confronto. */
    <div className="relative overflow-hidden rounded-2xl border border-white/6 bg-gray-900/60">
      <div className="flex flex-col items-center gap-1 border-b border-white/6 bg-white/4 px-6 py-5">
        {/* Nell'angolo e non sotto il punteggio: appiccicata al numero si
          leggeva come una sua parte. Fuori dal flusso, in più, non serve
          riservarle spazio nella card senza variazione perché i due voti
          restino alla stessa altezza. */}
        {delta !== null && (
          <span className="absolute right-3 top-3">
            <Delta value={delta} />
          </span>
        )}
        <span className="flex items-center gap-2 px-4 text-center text-[0.78rem] text-slate-400">
          {attempt.title}
          <ConversationModeBadge mode={attempt.mode} />
        </span>
        <span className="text-[0.72rem] text-slate-500">
          {attempt.avatar_name} · {formatDate(attempt.conversation_at)}
        </span>
        <div className="mt-1 flex items-baseline gap-1">
          <span
            className={`font-heading text-4xl font-bold ${scoreTextColor(attempt.final_score)}`}
          >
            {formatScore(attempt.final_score)}
          </span>
          <span className="text-base text-slate-500">/ 10</span>
        </div>
        {/* Lo spazio della targhetta è riservato anche dove non c'è: le card
          stanno una accanto all'altra e una riga in più da un lato
          sposterebbe quel voto rispetto all'altro, che è proprio il
          confronto che si sta guardando. */}
        <div className="flex h-5 items-center">
          {attempt.has_override && (
            <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-0.5 text-[0.68rem] font-semibold text-violet-300">
              Corretto dal docente · AI {formatScore(attempt.ai_score)}
            </span>
          )}
        </div>
      </div>

      {hasWords && (
        <div className="flex flex-col gap-3 p-5">
          {attempt.summary && (
            <p className="text-[0.82rem] leading-relaxed text-slate-400">{attempt.summary}</p>
          )}
          {(attempt.review_reason || attempt.review_note) && (
            <div className="rounded-xl border border-violet-500/25 bg-violet-500/8 p-3">
              <span className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wide text-violet-300">
                {attempt.reviewer_name}
              </span>
              {attempt.review_reason && (
                <p className="mb-1 text-[0.8rem] leading-relaxed text-slate-300">
                  <span className="font-semibold text-slate-200">Motivo della correzione: </span>
                  {attempt.review_reason}
                </p>
              )}
              {attempt.review_note && (
                <p className="whitespace-pre-wrap text-[0.8rem] leading-relaxed text-slate-400">
                  {attempt.review_note}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ComparisonConversations({ attempts }: { attempts: Attempt[] }) {
  /* Prima si restringe, poi si sceglie. I due filtri partono aperti: chi
   * arriva qui vuole vedere cosa ha fatto, e nascondergli metà delle proprie
   * prove per prudenza sarebbe una risposta incompleta. */
  const [modeFilter, setModeFilter] = useState<ModeFilter>(ANY)
  const [pickedAvatarId, setPickedAvatarId] = useState(ANY)
  const [pickedLeftId, setPickedLeftId] = useState('')
  const [pickedRightId, setPickedRightId] = useState('')

  /* Gli scenari fra cui scegliere sono quelli del canale scelto, non tutti:
   * un cliente affrontato solo al telefono, offerto mentre si guardano le
   * chat, porta a una lista vuota e a nient'altro. */
  const byMode = useMemo(
    () => attempts.filter((a) => matchesFilter(modeFilter, a.mode)),
    [attempts, modeFilter],
  )
  const avatarOptions = useMemo(
    () =>
      filterOptions(
        byMode,
        (a) => a.avatar_id,
        (a) => a.avatar_name,
        'Tutti gli scenari',
      ),
    [byMode],
  )
  const avatarFilter = survivingFilter(avatarOptions, pickedAvatarId)

  const filtered = useMemo(
    () => byMode.filter((a) => matchesFilter(avatarFilter, a.avatar_id)),
    [byMode, avatarFilter],
  )

  /* Il confronto proposto è primo contro ultimo, fra quelli rimasti. Le due
   * scelte sono modificabili, ma quando i tentativi cambiano (si è scelta
   * un'altra persona, o si è stretto un filtro) una selezione che non
   * appartiene più a questa lista torna al default: tenerla mostrerebbe un
   * confronto vuoto senza dire perché. */
  const { leftId, rightId } = pickPair(
    filtered,
    (a) => a.conversation_id,
    pickedLeftId,
    pickedRightId,
  )

  const left = useMemo(
    () => filtered.find((a) => a.conversation_id === leftId) ?? null,
    [filtered, leftId],
  )
  const right = useMemo(
    () => filtered.find((a) => a.conversation_id === rightId) ?? null,
    [filtered, rightId],
  )

  const attemptOptions = filtered.map((a) => ({
    value: a.conversation_id,
    label: attemptLabel(a),
  }))

  /* I criteri dell'uno e dell'altro, appaiati per chiave: una valutazione
   * vecchia può avere criteri che non esistono più, e vanno mostrati
   * comunque invece di sparire dal confronto. */
  const criteriaRows = useMemo(() => {
    if (!left || !right) return []
    const labels = new Map<string, string>()
    const leftScores = new Map<string, number>()
    const rightScores = new Map<string, number>()
    for (const c of left.criteria) {
      labels.set(c.key, c.label)
      leftScores.set(c.key, c.score)
    }
    for (const c of right.criteria) {
      labels.set(c.key, c.label)
      rightScores.set(c.key, c.score)
    }
    return [...labels.entries()].map(([key, label]) => ({
      key,
      label,
      left: leftScores.get(key) ?? null,
      right: rightScores.get(key) ?? null,
    }))
  }, [left, right])

  /* Confrontare due prove di specie diversa si può, ma va detto: i criteri
   * sono tarati sulla difficoltà di quel cliente, e al telefono e in chat non
   * si risponde nello stesso modo. Dirlo è più utile che impedirlo, ed è
   * quello che resta da fare quando i filtri sono aperti. */
  const warnings =
    left && right
      ? [
          left.avatar_id !== right.avatar_id
            ? `Il confronto riguarda due scenari diversi, ${left.avatar_name} e ${right.avatar_name}: i punteggi non sono direttamente comparabili, perché la difficoltà del cliente varia.`
            : '',
          left.mode !== right.mode
            ? `Il confronto riguarda due canali diversi, ${conversationModeLabel(left.mode)} e ${conversationModeLabel(right.mode)}: al telefono e in chat si risponde in modi diversi, e i punteggi non sono direttamente comparabili.`
            : '',
        ].filter(Boolean)
      : []

  if (attempts.length === 0) {
    return <ComparisonEmpty>Nessuna conversazione valutata da confrontare</ComparisonEmpty>
  }

  if (attempts.length === 1) {
    return (
      <ComparisonEmpty>
        È stato valutato un solo tentativo: ne serve un secondo per effettuare un confronto
      </ComparisonEmpty>
    )
  }

  return (
    <>
      {/* `relative z-20`: il pannello ha backdrop-blur, che apre un contesto
          di impilamento, quindi lo z-index delle tendine dei Select resta
          confinato qui dentro e i pannelli che seguono nel DOM ci passerebbero
          sopra. Alzando il contenitore, tutto il suo contenuto viene con lui. */}
      <div className={`${cardCls} relative z-20 mb-8`}>
        <ComparisonFilterBar
          kindLabel="Modalità"
          kindValue={modeFilter}
          kindOptions={MODE_FILTERS}
          onKindChange={setModeFilter}
          targetId="conversation-avatar"
          targetLabel="Scenario"
          targetValue={avatarFilter}
          targetOptions={avatarOptions}
          onTargetChange={setPickedAvatarId}
        />

        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[240px] flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-400" htmlFor="left">
              Prima conversazione
            </label>
            <Select id="left" value={leftId} onChange={setPickedLeftId} options={attemptOptions} />
          </div>
          <div className="min-w-[240px] flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-400" htmlFor="right">
              Seconda conversazione
            </label>
            <Select
              id="right"
              value={rightId}
              onChange={setPickedRightId}
              options={attemptOptions}
            />
          </div>
        </div>

        <ComparisonWarnings messages={warnings} />
      </div>

      {/* I filtri restano sopra anche quando non lasciano passare niente: il
          riquadro dice cosa è successo, e quello con cui rimediare è a un
          gesto invece che dietro un ricaricamento della pagina. */}
      {filtered.length < 2 && (
        <ComparisonEmpty>
          {filtered.length === 0
            ? 'Nessuna conversazione corrisponde ai filtri scelti'
            : 'I filtri scelti lasciano una sola conversazione: ne serve una seconda per effettuare un confronto'}
        </ComparisonEmpty>
      )}

      {left && right && (
        <>
          {/* Senza `items-start` i due pannelli si stirano all'altezza
              della riga, cioè del più alto: le sintesi sono lunghe quanto
              capita, e due riquadri di altezza diversa affiancati fanno
              sembrare che a uno dei due manchi qualcosa. */}
          <div className="mb-8 grid grid-cols-2 gap-6 max-md:grid-cols-1">
            <AttemptPanel attempt={left} baseline={null} />
            <AttemptPanel attempt={right} baseline={left} />
          </div>

          <div className={cardCls}>
            <h2 className="mb-4 text-sm font-semibold text-slate-300">Punteggi per criterio</h2>
            {/* Le due colonne di barre vanno intestate: senza, si legge un
                paio di numeri senza sapere quale conversazione è quale, e
                tocca risalire ai pannelli sopra ogni volta. */}
            <div className="mb-3 grid grid-cols-2 gap-4 border-b border-white/6 pb-2">
              {[left, right].map((attempt) => (
                <span
                  key={attempt.conversation_id}
                  className="truncate text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400"
                >
                  {attempt.title} · {formatDate(attempt.conversation_at)}
                </span>
              ))}
            </div>
            <div className="flex flex-col gap-4">
              {criteriaRows.map((row) => (
                <div key={row.key}>
                  {/* La variazione accanto al nome del criterio e non in
                      fondo alla riga: all'estremità destra cadeva proprio
                      sopra il punteggio della colonna di destra, e i due
                      numeri incolonnati si leggevano come uno solo. */}
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <span className="text-[0.85rem] font-medium text-slate-100">{row.label}</span>
                    {row.left !== null && row.right !== null && (
                      <Delta value={row.right - row.left} />
                    )}
                  </div>
                  {/* Due colonne anche su schermo stretto: impilate
                      perderebbero l'incolonnamento con l'intestazione, e
                      due barre sottili ci stanno comunque. */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Il numero sotto la propria barra e non di fianco:
                        in fila finiva contro la barra della colonna
                        accanto, e i due punteggi si leggevano appaiati
                        invece che ognuno con il suo. */}
                    {[row.left, row.right].map((score, index) => (
                      <div key={index} className="flex flex-col gap-1">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/6">
                          {score !== null && (
                            <div
                              className={`h-full rounded-full transition-all ${scoreBarColor(score)}`}
                              style={{ width: `${Math.max(0, Math.min(100, score * 10))}%` }}
                            />
                          )}
                        </div>
                        <span
                          className={`text-[0.8rem] font-bold tabular-nums ${
                            score !== null ? scoreTextColor(score) : 'text-slate-600'
                          }`}
                        >
                          {score !== null ? formatScore(score) : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  )
}
