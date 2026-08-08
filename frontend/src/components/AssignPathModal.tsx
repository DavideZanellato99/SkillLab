import { useMemo, useState } from 'react'
import { useAssignPath, useAssignableUsers, useAssignments } from '../hooks/useTraining'
import type { TrainingPath } from '../services/training'
import FormError from './FormError'
import LoadingState from './LoadingState'
import ModalShell, { ModalHeader } from './ModalShell'
import PrimaryButton from './PrimaryButton'
import SearchInput from './SearchInput'
import Spinner from './Spinner'
import { UserPlusIcon } from './icons'
import { matchesSearch } from './tableSearch'

/* Affidare un percorso: si scelgono le persone, e basta.
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
 * Chi il percorso ce l'ha già compare spento e spuntato, e il server lo
 * lascia stare comunque: è la differenza fra assegnare a tutta la classe e
 * doversi ricordare chi c'era già. */

export default function AssignPathModal({
  path,
  onClose,
}: {
  path: TrainingPath
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const { data: users = [], isPending: isLoadingUsers } = useAssignableUsers(path.organization_id)
  const { data: assignments = [] } = useAssignments(path.organization_id, path.id)
  const assignMutation = useAssignPath()

  const already = useMemo(() => new Set(assignments.map((a) => a.user_id)), [assignments])

  const visible = useMemo(
    () =>
      users.filter((u) =>
        matchesSearch(search, `${u.nome} ${u.cognome}`.trim(), u.email, u.nome, u.cognome),
      ),
    [users, search],
  )
  // Chi si può ancora aggiungere fra quelli che la ricerca lascia vedere:
  // il "seleziona tutti" parla di questi, non dell'organizzazione intera.
  const selectable = useMemo(() => visible.filter((u) => !already.has(u.id)), [visible, already])
  const allSelected = selectable.length > 0 && selectable.every((u) => selected.has(u.id))

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev)
      for (const user of selectable) {
        if (allSelected) next.delete(user.id)
        else next.add(user.id)
      }
      return next
    })

  const error = assignMutation.error
    ? assignMutation.error instanceof Error
      ? assignMutation.error.message
      : 'Assegnazione non riuscita.'
    : ''

  const handleAssign = async () => {
    if (selected.size === 0) return
    assignMutation.reset()
    try {
      await assignMutation.mutateAsync({ path_id: path.id, user_ids: Array.from(selected) })
      onClose()
    } catch {
      // Il messaggio è nella mutation, il banner qui sotto lo mostra
    }
  }

  return (
    <ModalShell
      onClose={onClose}
      locked={assignMutation.isPending}
      size="md"
      padding="md"
      layout="tall"
    >
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
              const has = already.has(user.id)
              const checked = has || selected.has(user.id)
              return (
                <label
                  key={user.id}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 transition ${
                    has
                      ? 'cursor-default text-slate-500'
                      : checked
                        ? 'cursor-pointer bg-violet-600/15 text-slate-100'
                        : 'cursor-pointer text-slate-400 hover:bg-white/4'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-violet-600"
                    checked={checked}
                    disabled={has}
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
                  {has && (
                    <span className="shrink-0 text-[0.72rem] text-slate-500">già assegnato</span>
                  )}
                </label>
              )
            })}
          </div>
        )}

        <div className="mt-4 shrink-0">
          {error && <FormError message={error} />}
          <PrimaryButton
            variant="submit"
            onClick={handleAssign}
            disabled={selected.size === 0 || assignMutation.isPending}
          >
            {assignMutation.isPending && <Spinner variant="button" />}
            {selected.size === 0
              ? 'Scegli chi deve percorrerlo'
              : `Assegna a ${selected.size} ${selected.size === 1 ? 'persona' : 'persone'}`}
          </PrimaryButton>
        </div>
      </div>
    </ModalShell>
  )
}
