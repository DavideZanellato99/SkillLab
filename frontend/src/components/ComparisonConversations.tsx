import { useMemo, useState } from 'react'
import type { Attempt } from '../services/comparison'
import ComparisonEmpty from './ComparisonEmpty'
import ComparisonFilterBar, { ComparisonWarnings } from './ComparisonFilterBar'
import ComparisonOpenButton from './ComparisonOpenButton'
import ComparisonTimeline from './ComparisonTimeline'
import ComparisonVerdict from './ComparisonVerdict'
import ConversationDetailModal from './ConversationDetailModal'
import ConversationModeBadge from './ConversationModeBadge'
import { conversationModeLabel, MODE_FILTERS } from './conversationMode'
import type { ModeFilter } from './conversationMode'
import {
  ANY,
  assignRole,
  filterOptions,
  matchesFilter,
  NO_PAIR,
  resolvePair,
  survivingFilter,
} from './comparisonFilters'
import type { Pair } from './comparisonFilters'
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
 * modo, e i sei criteri sono tarati su quello che quel cliente chiede.
 *
 * L'ordine di quello che si legge è l'ordine delle domande che ci si fa: di
 * quanto sono migliorato, su cosa, e infine quali erano le due prove. Il
 * verdetto in cima, i criteri sotto come suo perché, e il contesto delle due
 * conversazioni in fondo, dove serve solo a chi vuole risalire ai fatti. */

interface CriterionRow {
  key: string
  label: string
  left: number | null
  right: number | null
}

/**
 * Cosa è cambiato nei sei criteri, in una riga sola sotto il voto.
 *
 * Il voto complessivo può restare fermo mentre metà dei criteri si muovono in
 * due direzioni, e questa riga è l'unica cosa che lo dice prima di scendere a
 * leggere le barre. Si contano solo i criteri che tutte e due le prove hanno:
 * uno che esiste da una parte sola non è né migliorato né peggiorato.
 */
function changeSummary(rows: CriterionRow[]): string | null {
  const comparable = rows.filter(
    (row): row is CriterionRow & { left: number; right: number } =>
      row.left !== null && row.right !== null,
  )
  if (comparable.length === 0) return null

  const improved = comparable.filter((row) => row.right > row.left).length
  const worsened = comparable.filter((row) => row.right < row.left).length
  const unchanged = comparable.length - improved - worsened
  if (improved === 0 && worsened === 0) return 'Nessun criterio è cambiato fra le due prove'

  return [
    improved > 0
      ? `${improved} ${improved === 1 ? 'criterio migliorato' : 'criteri migliorati'}`
      : '',
    worsened > 0
      ? `${worsened} ${worsened === 1 ? 'criterio peggiorato' : 'criteri peggiorati'}`
      : '',
    unchanged > 0
      ? `${unchanged} ${unchanged === 1 ? 'criterio invariato' : 'criteri invariati'}`
      : '',
  ]
    .filter(Boolean)
    .join(', ')
}

/** Una delle due prove: da dove viene il voto e cosa ne è stato detto.
 *
 *  Il voto grande sta nel verdetto e qui compare in piccolo, accanto al nome:
 *  scritto due volte in grande, il numero avrebbe fatto cercare la differenza
 *  fra le due card proprio dove è già stata calcolata. Qui restano le cose che
 *  il verdetto non può riassumere, cioè le parole della valutazione. */
function AttemptPanel({
  role,
  attempt,
  onOpen,
}: {
  role: string
  attempt: Attempt
  onOpen: () => void
}) {
  const hasWords = attempt.summary || attempt.review_reason || attempt.review_note

  return (
    <div className="overflow-hidden rounded-2xl border border-white/6 bg-gray-900/60 p-5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-white/6 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-slate-400">
          {role}
        </span>
        <span className="text-[0.85rem] text-slate-200">{attempt.title}</span>
        <ConversationModeBadge mode={attempt.mode} />
        <span className={`text-[0.85rem] font-bold ${scoreTextColor(attempt.final_score)}`}>
          {formatScore(attempt.final_score)}
        </span>
      </div>
      <p className="text-[0.72rem] text-slate-500">
        {attempt.avatar_name} · {formatDate(attempt.conversation_at)}
      </p>

      {attempt.has_override && (
        <span className="mt-3 inline-flex rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-0.5 text-[0.68rem] font-semibold text-violet-300">
          Corretto dal docente · AI {formatScore(attempt.ai_score)}
        </span>
      )}

      {hasWords && (
        <div className="mt-4 flex flex-col gap-3">
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

      <ComparisonOpenButton
        label="Apri la Trascrizione"
        ariaLabel={`Apri la Trascrizione di ${attempt.title} del ${formatDate(attempt.conversation_at)}`}
        onClick={onOpen}
      />
    </div>
  )
}

/** Di chi sono le prove che si stanno guardando.
 *
 *  Serve solo ad aprire la trascrizione: l'intestazione della schermata dice
 *  chi ha parlato, e `isSelf` dice da dove si legge, perché una conversazione
 *  propria e quella di un'altra persona arrivano da due endpoint diversi. */
export interface ComparisonSubject {
  nome: string
  cognome: string
  email: string
  isSelf: boolean
}

export default function ComparisonConversations({
  attempts,
  subject,
  onReviewSaved,
}: {
  attempts: Attempt[]
  subject: ComparisonSubject
  /** Una correzione scritta dalla trascrizione cambia il voto di questa
   *  pagina, che sta mostrando il precedente. */
  onReviewSaved?: () => void
}) {
  /* Prima si restringe, poi si sceglie. I due filtri partono aperti: chi
   * arriva qui vuole vedere cosa ha fatto, e nascondergli metà delle proprie
   * prove per prudenza sarebbe una risposta incompleta. */
  const [modeFilter, setModeFilter] = useState<ModeFilter>(ANY)
  const [pickedAvatarId, setPickedAvatarId] = useState(ANY)
  const [picked, setPicked] = useState<Pair>(NO_PAIR)
  const [openAttempt, setOpenAttempt] = useState<Attempt | null>(null)

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

  /* Il confronto proposto è la prima contro l'ultima, fra quelle rimaste, e
   * dalla fila si sposta un posto per volta. Quando i tentativi cambiano (si
   * è scelta un'altra persona, o si è stretto un filtro) una coppia che non
   * appartiene più a questa lista torna al default: tenerla mostrerebbe un
   * confronto vuoto senza dire perché. */
  const idOf = (a: Attempt) => a.conversation_id
  const { leftId, rightId } = resolvePair(filtered, idOf, picked)

  const left = useMemo(() => filtered.find((a) => idOf(a) === leftId) ?? null, [filtered, leftId])
  const right = useMemo(
    () => filtered.find((a) => idOf(a) === rightId) ?? null,
    [filtered, rightId],
  )

  const entries = filtered.map((a) => ({
    id: a.conversation_id,
    when: a.conversation_at,
    title: a.title,
    score: a.final_score,
    badge: <ConversationModeBadge mode={a.mode} iconOnly />,
  }))

  /* I criteri dell'uno e dell'altro, appaiati per chiave: una valutazione
   * vecchia può avere criteri che non esistono più, e vanno mostrati
   * comunque invece di sparire dal confronto. */
  const criteriaRows = useMemo<CriterionRow[]>(() => {
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
   * sono tarati su quello che quel cliente chiede, e al telefono e in chat
   * non si risponde nello stesso modo. Dirlo è più utile che impedirlo, ed è
   * quello che resta da fare quando i filtri sono aperti. */
  const warnings =
    left && right
      ? [
          left.avatar_id !== right.avatar_id
            ? `Il confronto riguarda due scenari diversi, ${left.avatar_name} e ${right.avatar_name}: i punteggi non sono direttamente comparabili, perché ogni scenario mette alla prova competenze diverse.`
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
          di impilamento, quindi lo z-index della tendina del Select resta
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

        <ComparisonTimeline
          label="Conversazioni Valutate"
          entries={entries}
          leftId={leftId}
          rightId={rightId}
          onAssign={(role, id) => setPicked(assignRole({ leftId, rightId }, role, id))}
        />

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
          <ComparisonVerdict
            before={{
              score: left.final_score,
              caption: `${left.avatar_name} · ${formatDate(left.conversation_at)}`,
            }}
            after={{
              score: right.final_score,
              caption: `${right.avatar_name} · ${formatDate(right.conversation_at)}`,
            }}
          >
            {changeSummary(criteriaRows)}
          </ComparisonVerdict>

          <div className={`${cardCls} mb-6`}>
            <h2 className="mb-4 text-sm font-semibold text-slate-300">Punteggi per Criterio</h2>
            {/* Le due colonne di barre vanno intestate: senza, si legge un
                paio di numeri senza sapere quale conversazione è quale, e
                tocca risalire al verdetto ogni volta. Le stesse due parole
                del verdetto e della fila di scelta, così le tre parti della
                pagina si chiamano allo stesso modo. */}
            <div className="mb-3 grid grid-cols-2 gap-4 border-b border-white/6 pb-2">
              {[
                { attempt: left, role: 'Prima' },
                { attempt: right, role: 'Dopo' },
              ].map(({ attempt, role }) => (
                <span
                  key={attempt.conversation_id}
                  className="truncate text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400"
                >
                  <span className="text-violet-300">{role}</span> · {attempt.title} ·{' '}
                  {formatDate(attempt.conversation_at)}
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

          {/* Il contesto in fondo: chi è arrivato fin qui ha già letto di
              quanto e su cosa, e adesso vuole sapere di quali due prove si
              stava parlando. Senza `items-start` i due riquadri si stirano
              all'altezza del più alto, e le sintesi sono lunghe quanto
              capita. */}
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Le Due Conversazioni</h2>
          <div className="grid grid-cols-2 items-start gap-6 max-md:grid-cols-1">
            <AttemptPanel role="Prima" attempt={left} onOpen={() => setOpenAttempt(left)} />
            <AttemptPanel role="Dopo" attempt={right} onOpen={() => setOpenAttempt(right)} />
          </div>
        </>
      )}

      {/* Le due trascrizioni non stanno affiancate qui dentro, e non è una
          dimenticanza: due conversazioni non hanno niente su cui appaiarsi,
          i turni sono diversi di numero e di ordine, quindi due colonne di
          messaggi scorrerebbero ognuna per conto suo sotto un verdetto che
          si vuole leggere per primo. Si aprono invece nella schermata in cui
          una trascrizione si legge già (`ConversationDetailModal`), che porta
          con sé i momenti citati dalla valutazione, la registrazione della
          chiamata e le note del docente. Rifarne una qui sarebbe una seconda
          trascrizione più povera, e destinata a divergere dalla prima.

          Niente `onDeleted`: questa non è una schermata di amministrazione
          delle conversazioni, e il cestino compare solo dove lo si passa. */}
      {openAttempt && (
        <ConversationDetailModal
          scope={subject.isSelf ? 'own' : 'admin'}
          row={{
            conversation_id: openAttempt.conversation_id,
            mode: openAttempt.mode,
            user_nome: subject.nome,
            user_cognome: subject.cognome,
            user_email: subject.email,
            avatar_name: openAttempt.avatar_name,
            conversation_at: openAttempt.conversation_at,
          }}
          onClose={() => setOpenAttempt(null)}
          onReviewSaved={onReviewSaved}
        />
      )}
    </>
  )
}
