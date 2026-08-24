import { useMemo, useState } from 'react'
import {
  useAssignPath,
  useAssignableUsers,
  useAssignments,
  useDeleteAssignment,
} from '../hooks/useTraining'
import type { PathAssignment, TrainingPath } from '../services/training'
import ConfirmModal from './ConfirmModal'
import FormError from './FormError'
import LoadingState from './LoadingState'
import ModalShell, { ModalHeader } from './ModalShell'
import PrimaryButton from './PrimaryButton'
import SearchInput from './SearchInput'
import Spinner from './Spinner'
import { TrashIcon, UserPlusIcon } from './icons'
import { matchesSearch } from './tableSearch'

/* Chi percorre questo percorso: si spuntano le persone, e basta.
 *
 * Prima l'assegnazione partiva dall'avatar e solo dopo lasciava scegliere
 * gli utenti, che è il contrario di come si ragiona: chi assegna sa a chi
 * sta assegnando, e il percorso è già quello che ha in mano. Qui il
 * percorso è deciso, e la finestra fa una domanda sola.
 *
 * Le persone si cercano per nome o per email e si spuntano tutte insieme,
 * perché "tutta l'organizzazione" è il caso normale e spuntare venti caselle
 * a mano non è un modo di lavorare. Il "seleziona tutti" segue la ricerca:
 * cerca "mario" e prendi tutti i Mario, che è l'unico modo in cui quel
 * bottone risponde a quello che si sta guardando.
 *
 * Chi il percorso ce l'ha già compare spuntato, e togliergli la spunta lo
 * ritira: la casella dice chi lo sta percorrendo, quindi deve poterlo dire
 * anche al contrario. Prima era spenta, e il ritiro esisteva solo nella
 * linguetta degli assegnati: chi apriva questa finestra per togliere una
 * persona trovava una spunta che non si toglieva e nessuna indicazione di
 * dove andare.
 *
 * I ritiri però non partono al clic sulla casella: si accumulano, e prima
 * del salvataggio una conferma li nomina uno per uno con il punto a cui
 * ognuno è arrivato. Togliere una spunta è un gesto piccolo, mentre quello
 * che fa è far sparire un percorso dalla home di qualcuno che magari ne ha
 * superate quattro tappe su cinque. Le conversazioni e i test già svolti
 * restano dove sono, qui come nel ritiro dalla tabella.
 *
 * Il bottone di massa invece non ritira nessuno: aggiunge chi manca e
 * annulla la propria scelta, niente di più. "Deseleziona tutti" premuto per
 * abitudine, se ritirasse, toglierebbe il percorso a un'organizzazione
 * intera con un clic solo. */

const persone = (n: number) => `${n} ${n === 1 ? 'persona' : 'persone'}`

/** Aggiunge o toglie un id, senza mutare l'insieme di partenza. */
function toggleIn(set: Set<string>, id: string) {
  const next = new Set(set)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

export default function AssignPathModal({
  path,
  onClose,
}: {
  path: TrainingPath
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  // Chi riceve il percorso e chi se lo vede togliere: due insiemi separati,
  // perché la stessa casella spunta due gesti diversi a seconda di come
  // stava prima.
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  const [isConfirming, setIsConfirming] = useState(false)

  const { data: users = [], isPending: isLoadingUsers } = useAssignableUsers(path.organization_id)
  const { data: assignments = [] } = useAssignments(path.organization_id, path.id)
  const assignMutation = useAssignPath()
  const withdrawMutation = useDeleteAssignment()

  // L'assegnazione intera, non solo il fatto che ci sia: per ritirarla serve
  // il suo id, e per raccontarla serve il punto a cui è arrivata.
  const assigned = useMemo(() => new Map(assignments.map((a) => [a.user_id, a])), [assignments])

  const visible = useMemo(
    () =>
      users.filter((u) =>
        matchesSearch(search, `${u.nome} ${u.cognome}`.trim(), u.email, u.nome, u.cognome),
      ),
    [users, search],
  )
  // Chi si può ancora aggiungere fra quelli che la ricerca lascia vedere:
  // il "seleziona tutti" parla di questi, non dell'organizzazione intera.
  const selectable = useMemo(() => visible.filter((u) => !assigned.has(u.id)), [visible, assigned])
  const allSelected = selectable.length > 0 && selectable.every((u) => added.has(u.id))

  const isChecked = (id: string) => added.has(id) || (assigned.has(id) && !removed.has(id))

  const toggle = (id: string) => {
    if (assigned.has(id)) setRemoved((prev) => toggleIn(prev, id))
    else setAdded((prev) => toggleIn(prev, id))
  }

  const toggleAll = () =>
    setAdded((prev) => {
      const next = new Set(prev)
      for (const user of selectable) {
        if (allSelected) next.delete(user.id)
        else next.add(user.id)
      }
      return next
    })

  const withdrawals = useMemo(
    () =>
      Array.from(removed)
        .map((id) => assigned.get(id))
        .filter((a): a is PathAssignment => a !== undefined),
    [removed, assigned],
  )

  const isPending = assignMutation.isPending || withdrawMutation.isPending
  const errorOf = (error: unknown, fallback: string) =>
    error ? (error instanceof Error ? error.message : fallback) : ''
  const error =
    errorOf(assignMutation.error, 'Assegnazione non riuscita.') ||
    errorOf(withdrawMutation.error, 'Ritiro non riuscito.')

  /* Prima si affida e poi si ritira, con una richiesta per ritiro perché il
   * server ne conosce una alla volta. Un ritiro fallito lascia la conferma
   * aperta con il proprio errore: ripremere rifà anche le assegnazioni già
   * andate a buon fine, e il server lascia stare chi il percorso ce l'ha
   * già, quindi non raddoppia niente. */
  const apply = async () => {
    assignMutation.reset()
    withdrawMutation.reset()
    try {
      if (added.size > 0) {
        await assignMutation.mutateAsync({ path_id: path.id, user_ids: Array.from(added) })
      }
      for (const assignment of withdrawals) {
        await withdrawMutation.mutateAsync(assignment.id)
      }
      onClose()
    } catch {
      // Il messaggio è nella mutation, il banner qui sotto lo mostra
    }
  }

  const handleSave = () => {
    if (added.size === 0 && removed.size === 0) return
    if (withdrawals.length > 0) {
      setIsConfirming(true)
      return
    }
    void apply()
  }

  const actionLabel = () => {
    if (added.size > 0 && removed.size > 0) {
      return `Assegna a ${persone(added.size)} e ritira a ${removed.size}`
    }
    if (added.size > 0) return `Assegna a ${persone(added.size)}`
    if (removed.size > 0) return `Ritira a ${persone(removed.size)}`
    return 'Scegli chi deve percorrerlo'
  }

  return (
    <ModalShell onClose={onClose} locked={isPending} size="md" padding="md" layout="tall">
      <div className="flex min-h-0 flex-1 flex-col">
        <ModalHeader
          icon={<UserPlusIcon size={24} stroke="#a78bfa" />}
          iconWrapperCls="border border-violet-500/30 bg-violet-500/10"
          title={`Assegna «${path.title}»`}
          description={`${path.steps.length} ${
            path.steps.length === 1 ? 'tappa' : 'tappe'
          } da superare in ordine, a chi lo riceve`}
          className="mb-4"
        />

        <div className="mb-2 flex items-center gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Cerca per nome o email..."
            className="flex-1"
          />
          {selectable.length > 0 && (
            <button
              type="button"
              onClick={toggleAll}
              className="shrink-0 cursor-pointer border-none bg-transparent text-xs font-medium text-violet-400 transition hover:text-violet-300"
            >
              {allSelected ? 'Deseleziona tutti' : 'Seleziona tutti'}
            </button>
          )}
        </div>

        {isLoadingUsers ? (
          <LoadingState message="Caricamento delle persone..." variant="panel" />
        ) : visible.length === 0 ? (
          <p className="py-8 text-center text-sm italic text-slate-500">
            {search
              ? 'Nessuna persona corrisponde alla ricerca'
              : 'Nessun utente attivo in questa organizzazione'}
          </p>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-white/6 bg-gray-950/40 p-2">
            {visible.map((user) => {
              const checked = isChecked(user.id)
              const toWithdraw = removed.has(user.id)
              return (
                <label
                  key={user.id}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 transition ${
                    checked ? 'bg-violet-600/15 text-slate-100' : 'text-slate-400 hover:bg-white/4'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-violet-600"
                    checked={checked}
                    onChange={() => toggle(user.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.85rem] font-medium">
                      {user.nome && user.cognome ? `${user.nome} ${user.cognome}` : user.email}
                    </span>
                    <span className="block truncate text-[0.72rem] text-slate-500">
                      {user.email}
                    </span>
                  </span>
                  {toWithdraw ? (
                    <span className="shrink-0 text-[0.72rem] text-red-400">da ritirare</span>
                  ) : (
                    assigned.has(user.id) && (
                      <span className="shrink-0 text-[0.72rem] text-slate-500">già assegnato</span>
                    )
                  )}
                </label>
              )
            })}
          </div>
        )}

        <div className="mt-4 shrink-0">
          {!isConfirming && error && <FormError message={error} />}
          <PrimaryButton
            variant="submit"
            onClick={handleSave}
            disabled={(added.size === 0 && removed.size === 0) || isPending}
          >
            {isPending && <Spinner variant="button" />}
            {actionLabel()}
          </PrimaryButton>
        </div>
      </div>

      {isConfirming && (
        <ConfirmModal
          elevated
          icon={<TrashIcon size={24} stroke="#f87171" />}
          iconWrapperCls="border border-red-500/30 bg-red-500/10"
          title={
            withdrawals.length === 1
              ? 'Ritirare il percorso?'
              : `Ritirare il percorso a ${persone(withdrawals.length)}?`
          }
          description={
            <>
              «{path.title}» sparisce dalla home di chi è elencato qui sotto. Le conversazioni e i
              test già svolti restano dove sono.
              {added.size > 0 &&
                ` Nella stessa passata il percorso viene affidato a ${persone(added.size)}.`}
            </>
          }
          error={error}
          confirmLabel={
            withdrawals.length === 1 ? 'Ritira il percorso' : `Ritira a ${withdrawals.length}`
          }
          pendingLabel="Ritiro..."
          confirmClassName="bg-red-500/90 text-white hover:bg-red-500"
          isPending={isPending}
          onConfirm={() => void apply()}
          onClose={() => setIsConfirming(false)}
        >
          {/* A che punto è ognuno: un percorso quasi finito e uno appena
              affidato si ritirano con lo stesso clic, e la differenza la si
              vede solo se qualcuno la scrive. */}
          <ul className="mb-5 grid gap-1.5 rounded-xl border border-white/6 bg-gray-950/40 p-3">
            {withdrawals.map((assignment) => (
              <li key={assignment.id} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-[0.85rem] text-slate-200">
                  {assignment.user_name}
                </span>
                <span className="shrink-0 text-[0.72rem] text-slate-500">
                  {assignment.completed_steps === 0
                    ? 'non ancora cominciato'
                    : `${assignment.completed_steps} ${
                        assignment.completed_steps === 1 ? 'tappa superata' : 'tappe superate'
                      } su ${assignment.steps.length}`}
                </span>
              </li>
            ))}
          </ul>
        </ConfirmModal>
      )}
    </ModalShell>
  )
}
