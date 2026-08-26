import { DetailField } from './DetailModal'
import { formatDateTime } from './dateFormat'
import { authorLabel, isPlaceholderAuthor } from '../services/authorship'
import type { Authored } from '../services/authorship'

/* Le due righe finali di ogni scheda: quando la riga è nata e quando è stata
 * toccata l'ultima volta, con il nome di chi. Un componente solo per utenti,
 * organizzazioni, avatar e simulazioni, così le schede non possono raccontare
 * la stessa cosa in quattro modi diversi. */

export default function AuthorshipFields({ row }: { row: Authored }) {
  return (
    <>
      <DetailField label="Creato il">
        <Moment at={row.created_at} by={row.created_by_email} />
      </DetailField>
      <DetailField label="Ultima Modifica">
        {/* Uguale alla creazione quando nessuno l'ha più toccata: dirlo è più
            utile che ripetere la stessa data come se fosse una modifica. */}
        {row.updated_at === row.created_at ? (
          <span className="text-slate-500">Mai modificato</span>
        ) : (
          <Moment at={row.updated_at} by={row.updated_by_email} />
        )}
      </DetailField>
    </>
  )
}

function Moment({ at, by }: { at: string; by: string }) {
  return (
    <>
      <div>{formatDateTime(at)}</div>
      <div
        className={`text-xs ${isPlaceholderAuthor(by) ? 'italic text-slate-500' : 'text-slate-400'}`}
      >
        {authorLabel(by)}
      </div>
    </>
  )
}
