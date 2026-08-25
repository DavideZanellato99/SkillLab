/* La navigazione su schermo stretto.
 *
 * Sotto i 1024px le voci non stanno in fila e la barra le nascondeva senza
 * metterci niente al posto: dal telefono restavano solo il logo e il menu
 * del profilo, e il simulatore, i percorsi e il confronto non si potevano
 * più raggiungere in nessun modo, benché le pagine esistessero e il ruolo le
 * aprisse. Qui le stesse voci tornano in un pannello a tutta larghezza.
 *
 * La soglia è quella della fila, e cambiarne una vuol dire cambiare
 * l'altra: fra le due misure le voci resterebbero in fila schiacciate, o
 * sparirebbero senza che questo pannello ci sia.
 *
 * Sono le stesse di `mainNavEntries`, non una copia scritta per il piccolo:
 * una sezione nuova compare in fila e nel pannello con lo stesso gesto.
 *
 * Aperto o chiuso lo decide la barra, che tiene aperto un menu solo: questo e
 * quello del profilo escono dallo stesso angolo e sovrapposti sarebbero
 * illeggibili. */

import { useRef } from 'react'
import { Link, useLocation } from 'react-router'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { CloseIcon, MenuIcon } from './icons'
import type { NavEntry } from './navEntries'

const rowCls =
  'flex items-center gap-3 rounded-xl px-4 py-3 text-[0.9rem] font-medium no-underline transition'
const rowActiveCls = 'bg-violet-600/12 text-slate-100 shadow-[inset_0_0_0_1px_rgba(124,58,237,0.3)]'
const rowIdleCls = 'text-slate-400 hover:bg-white/8 hover:text-slate-100'

interface NavbarMobileMenuProps {
  entries: NavEntry[]
  isOpen: boolean
  onToggle: () => void
  onClose: () => void
}

export default function NavbarMobileMenu({
  entries,
  isOpen,
  onToggle,
  onClose,
}: NavbarMobileMenuProps) {
  const { pathname } = useLocation()
  const triggerRef = useRef<HTMLButtonElement>(null)
  useCloseOnEscape(isOpen, onClose, triggerRef)

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="hidden h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-white/6 bg-white/4 text-slate-400 transition hover:border-white/12 hover:bg-white/8 hover:text-slate-100 max-lg:flex"
        onClick={onToggle}
        aria-label={isOpen ? 'Chiudi il menu di navigazione' : 'Apri il menu di navigazione'}
        aria-expanded={isOpen}
        aria-controls="navbar-mobile-menu"
        id="navbar-mobile-trigger"
      >
        {isOpen ? <CloseIcon size={18} /> : <MenuIcon size={18} />}
      </button>

      {isOpen && (
        <>
          {/* Il velo copre la pagina ma non la barra: il pulsante che ha
              aperto il pannello deve restare quello che lo richiude. */}
          <div
            className="fixed inset-x-0 bottom-0 top-16 z-[98] bg-night/60 backdrop-blur-sm lg:hidden"
            onClick={onClose}
            aria-hidden="true"
          />
          <nav
            id="navbar-mobile-menu"
            aria-label="Sezioni"
            className="fixed inset-x-0 top-16 z-[99] animate-menu-in border-b border-white/6 bg-gray-900/95 p-3 shadow-[0_16px_48px_rgba(0,0,0,0.5)] backdrop-blur-2xl lg:hidden"
          >
            <div className="flex flex-col gap-1">
              {entries.map((entry) => {
                const isActive = entry.isActive(pathname)
                const { Icon } = entry
                return (
                  <Link
                    key={entry.to}
                    to={entry.to}
                    className={`${rowCls} ${isActive ? rowActiveCls : rowIdleCls}`}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={onClose}
                  >
                    <Icon size={18} />
                    {entry.label}
                  </Link>
                )
              })}
            </div>
          </nav>
        </>
      )}
    </>
  )
}
