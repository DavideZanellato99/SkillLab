/* Le voci del sito pubblico dentro la navbar, in due forme.
 *
 * Sono l'unico pezzo del sito vetrina che la navbar importa davvero, quindi
 * qui dentro non entrano né le pagine né i loro testi: solo i link, che
 * arrivano da [publicSections](publicSections.ts).
 *
 * Le due forme sono la stessa cosa a due larghezze. Sotto i 1024px le voci
 * non ci stanno in fila e finivano nascoste senza nessuna via alternativa,
 * cioè un sito di cinque pagine che dal telefono ne mostrava una. */

import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { PUBLIC_SECTIONS } from './publicSections'
import { CloseIcon, MenuIcon } from '../icons'

const linkCls =
  'relative flex items-center gap-1.5 rounded-lg px-4 py-2 text-[0.85rem] font-medium no-underline transition'
const activeCls =
  "bg-violet-600/10 text-slate-100 after:absolute after:-bottom-px after:left-1/2 after:h-0.5 after:w-5 after:-translate-x-1/2 after:rounded-sm after:bg-gradient-to-r after:from-violet-600 after:to-cyan-500 after:content-['']"
const idleCls = 'text-slate-400 hover:bg-white/8 hover:text-slate-100'

/* Le voci al centro della navbar. Non portano un contenitore proprio: quello
   è della navbar, che decide anche a che larghezza le voci spariscono. */
export function PublicNavLinks() {
  const { pathname } = useLocation()

  return (
    <>
      {PUBLIC_SECTIONS.map((section) => (
        <Link
          key={section.path}
          to={section.path}
          className={`${linkCls} ${pathname === section.path ? activeCls : idleCls}`}
        >
          {section.label}
        </Link>
      ))}
    </>
  )
}

/** Lo stesso elenco dal telefono: un pulsante e un pannello sotto la navbar. */
export function PublicNavMenu() {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        className="hidden cursor-pointer items-center rounded-full border border-white/6 bg-white/4 p-2 text-slate-400 transition hover:border-white/12 hover:bg-white/8 hover:text-slate-100 max-lg:flex"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? 'Chiudi il menu' : 'Apri il menu'}
        id="public-nav-toggle"
      >
        {open ? <CloseIcon size={18} /> : <MenuIcon size={18} />}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 top-16 z-[98]" onClick={() => setOpen(false)} />
          <div
            className="fixed inset-x-0 top-16 z-[99] animate-menu-in border-b border-white/6 bg-gray-900/95 p-3 shadow-[0_16px_48px_rgba(0,0,0,0.5)] backdrop-blur-2xl"
            id="public-nav-panel"
          >
            {PUBLIC_SECTIONS.map((section) => (
              <Link
                key={section.path}
                to={section.path}
                onClick={() => setOpen(false)}
                className={`flex flex-col gap-0.5 rounded-xl p-3 no-underline transition ${
                  pathname === section.path
                    ? 'bg-violet-600/10 text-slate-100'
                    : 'text-slate-300 hover:bg-white/8'
                }`}
              >
                <span className="text-[0.9rem] font-semibold">{section.label}</span>
                <span className="text-xs text-slate-500">{section.description}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  )
}
