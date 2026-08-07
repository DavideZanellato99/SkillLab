import type { SimulationAnswerResult } from '../services/simulations'

/* Come si rilegge una domanda di ordinamento o di abbinamento: quello che è
 * stato risposto, con accanto la chiave.
 *
 * Sono i due tipi in cui una risposta può essere giusta a metà, e per questo
 * l'esito non può limitarsi a una crocetta: chi ha preso 0,7 deve vedere
 * *quale* passo era fuori posto, altrimenti il voto è un numero da accettare
 * e non una cosa da cui imparare. Ogni riga porta quindi il proprio esito, e
 * la sequenza giusta si rilegge di seguito sotto le righe.
 *
 * Il verde e il rosso dicono la stessa cosa che dicono sulle alternative a
 * scelta multipla, e non sono l'unico segnale: accanto a ogni riga sbagliata
 * c'è scritto dove andava. */

const rowCls = 'flex items-start gap-2 rounded-xl border px-3 py-2 text-[0.85rem]'
const rightCls = 'border-emerald-500/30 bg-emerald-500/8 text-emerald-200'
const wrongCls = 'border-red-500/30 bg-red-500/8 text-red-200'

/** Se due elementi sono lo stesso, come li confronta il server. */
const same = (a: string, b: string) =>
  a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase()

export function OrderedAnswer({ answer, own }: { answer: SimulationAnswerResult; own: boolean }) {
  if (answer.given_steps.length === 0) {
    return (
      <>
        <p className="mb-3 text-xs italic text-slate-500">
          {own ? 'Hai lasciato questa domanda in bianco.' : 'Domanda lasciata in bianco.'}
        </p>
        <CorrectOrder steps={answer.correct_steps} />
      </>
    )
  }
  return (
    <>
      <p className="mb-1.5 text-xs font-semibold tracking-wide text-slate-400">
        {own ? 'La tua sequenza' : 'Sequenza indicata'}
      </p>
      <ul className="mb-3 flex list-none flex-col gap-1.5">
        {answer.given_steps.map((step, index) => {
          const rightPlace = same(step, answer.correct_steps[index] ?? '')
          /* Dove andava davvero questo passo. Senza questo numero un elenco
             tutto rosso non insegna niente, perché non si vede di quanto si
             era sbagliato. */
          const wanted = answer.correct_steps.findIndex((s) => same(s, step))
          return (
            <li key={index} className={`${rowCls} ${rightPlace ? rightCls : wrongCls}`}>
              <span className="font-semibold tabular-nums">{index + 1}</span>
              <span className="flex-1">{step}</span>
              {!rightPlace && wanted >= 0 && (
                <span className="shrink-0 text-xs opacity-70">va al {wanted + 1}</span>
              )}
            </li>
          )
        })}
      </ul>
      <CorrectOrder steps={answer.correct_steps} />
    </>
  )
}

function CorrectOrder({ steps }: { steps: string[] }) {
  if (steps.length === 0) return null
  return (
    <div className="mb-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
      <p className="mb-1.5 text-xs font-semibold tracking-wide text-emerald-400/90">
        Sequenza corretta
      </p>
      <ol className="flex list-none flex-col gap-1">
        {steps.map((step, index) => (
          <li key={index} className="flex gap-2 text-[0.85rem] leading-relaxed text-slate-300">
            <span className="shrink-0 tabular-nums text-slate-500">{index + 1}.</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function MatchedAnswer({ answer, own }: { answer: SimulationAnswerResult; own: boolean }) {
  /* Si parte dalle coppie giuste e non da quelle date, così le voci lasciate
     scoperte compaiono comunque: una voce senza abbinamento è una coppia
     sbagliata come le altre, e non vederla farebbe sembrare la domanda più
     corta di com'era. */
  const given = new Map(answer.given_pairs.map((p) => [p.left.trim().toLowerCase(), p.right]))
  return (
    <>
      {answer.given_pairs.length === 0 && (
        <p className="mb-3 text-xs italic text-slate-500">
          {own ? 'Hai lasciato questa domanda in bianco.' : 'Domanda lasciata in bianco.'}
        </p>
      )}
      <ul className="mb-3 flex list-none flex-col gap-1.5">
        {answer.correct_pairs.map((pair, index) => {
          const mine = given.get(pair.left.trim().toLowerCase()) ?? ''
          const isRight = same(mine, pair.right)
          return (
            <li key={index} className={`${rowCls} ${isRight ? rightCls : wrongCls}`}>
              <span className="flex-1">
                <span className="text-slate-300">{pair.left}</span>
                <span aria-hidden className="mx-2 opacity-50">
                  →
                </span>
                <span className={mine ? '' : 'italic opacity-70'}>{mine || 'nessuna scelta'}</span>
              </span>
              {!isRight && <span className="shrink-0 text-xs opacity-70">era: {pair.right}</span>}
            </li>
          )
        })}
      </ul>
    </>
  )
}
