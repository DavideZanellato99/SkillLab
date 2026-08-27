/* Quello che si vede al posto di una griglia che è rimasta senza tessere:
 * un'icona, una frase, e dove c'è qualcosa da fare il gesto che la rimedia.
 *
 * Il riquadro degli elenchi (`EmptyState`) qui non basta, e non è una
 * questione di aspetto: in una galleria il vuoto ha quasi sempre una causa
 * che chi guarda può togliere da sé, una ricerca troppo stretta o un filtro
 * acceso, e la cosa utile da mettergli davanti è il bottone che la annulla.
 * Solo il catalogo vuoto davvero non ha rimedio, e allora l'unica cosa da
 * dire è di chi è il lavoro che manca.
 *
 * Il punto finale non c'è, come in tutti gli stati vuoti dell'app. */

import type { ReactNode } from 'react'
import { Link } from 'react-router'

const actionCls =
  'cursor-pointer rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-sm font-medium text-slate-400 no-underline transition hover:bg-white/8 hover:text-slate-100'

/** Il gesto che rimedia al vuoto: o annulla qualcosa qui, o porta altrove. */
type EmptyAction = { label: string; onClick: () => void } | { label: string; to: string }

export default function GalleryEmpty({
  icon,
  message,
  action,
}: {
  icon: ReactNode
  /** Cosa non c'è, e perché. */
  message: string
  action?: EmptyAction
}) {
  return (
    <div className="animate-fade-in p-16 text-center max-md:p-8">
      <div className="mb-4 flex justify-center text-slate-600">{icon}</div>

      <p className="text-lg text-slate-500">{message}</p>

      {action && (
        <div className="mt-6 flex justify-center">
          {'to' in action ? (
            <Link to={action.to} className={actionCls}>
              {action.label}
            </Link>
          ) : (
            <button type="button" className={actionCls} onClick={action.onClick}>
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
