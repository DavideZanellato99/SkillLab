/* La barra in cima, sempre presente: il logo, le sezioni e il proprio
 * account.
 *
 * Qui resta solo l'impaginazione. Quali voci esistono e a chi si mostrano sta
 * in `navEntries`, come si disegna una voce in `NavbarLink`, il menu del
 * profilo e quello che sostituisce le voci su schermo stretto nei propri
 * file: erano tutti dentro questo componente, che era diventato cinquecento
 * righe in cui lo stesso blocco di classi compariva sei volte. */

import { useCallback, useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { Link, useLocation } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { OPEN_LOGIN_EVENT } from './public/openLogin'
import { PublicNavLinks } from './public/PublicNav'
import AuthModal from './AuthModal'
import { UserIcon } from './icons'
import NavbarLink from './NavbarLink'
import NavbarMobileMenu from './NavbarMobileMenu'
import NavbarUserMenu from './NavbarUserMenu'
import { mainNavEntries } from './navEntries'
import { MAIN_CONTENT_ID } from './mainContent'
import NotificationsBell from './NotificationsBell'

export default function Navbar() {
  const { pathname } = useLocation()
  const { user, isAuthenticated } = useAuth()

  /* Aperta o chiusa, niente di più: quello che c'è dentro (i campi, il passo
     del cambio password, l'errore) vive in AuthModal, che nasce alla sua
     apertura e muore alla sua chiusura. */
  const [showAuthModal, setShowAuthModal] = useState(false)

  /* Quale dei due menu è aperto, e non due interruttori separati: escono
     dallo stesso angolo della barra e aperti insieme si coprirebbero a
     vicenda. Aprire l'uno chiude l'altro. */
  const [openMenu, setOpenMenu] = useState<'user' | 'sections' | null>(null)
  const closeMenus = useCallback(() => setOpenMenu(null), [])
  const toggleMenu = useCallback(
    (menu: 'user' | 'sections') => setOpenMenu((current) => (current === menu ? null : menu)),
    [],
  )

  /* Arrivati alla pagina il menu non serve più. Chiuderlo al click della voce
     non basterebbe: si va altrove anche dal logo o tornando indietro con il
     browser, e resterebbe aperto sopra la pagina nuova. */
  useEffect(() => {
    setOpenMenu(null)
  }, [pathname])

  /* I pulsanti delle pagine pubbliche chiedono di aprire la modale con
     questo evento: la modale vive qui, e loro non la conoscono. */
  useEffect(() => {
    const openLogin = () => setShowAuthModal(true)
    window.addEventListener(OPEN_LOGIN_EVENT, openLogin)
    return () => window.removeEventListener(OPEN_LOGIN_EVENT, openLogin)
  }, [])

  const entries = isAuthenticated ? mainNavEntries(user) : []

  /* Il salto al contenuto sposta il fuoco a mano invece di lasciar fare
     all'ancora: un href con il cancelletto resterebbe scritto nella barra
     dell'indirizzo, e un indirizzo con dentro il salto è quello che poi
     finisce in un segnalibro o in un collegamento mandato a qualcuno. */
  const skipToContent = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    const main = document.getElementById(MAIN_CONTENT_ID)
    if (!main) return
    main.focus()
    main.scrollIntoView({ behavior: 'instant', block: 'start' })
  }

  return (
    <>
      {/* Prima di ogni altra cosa raggiungibile da tastiera, e invisibile
          finché non lo si raggiunge: la barra è montata sempre e sta in cima
          a ogni pagina, quindi senza questo chi naviga da tastiera
          riattraversa il logo, le sezioni, le notifiche e il menu del proprio
          account a ogni cambio di schermata, prima di arrivare a quello per
          cui è entrato. */}
      <a
        href={`#${MAIN_CONTENT_ID}`}
        onClick={skipToContent}
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[110] focus:rounded-lg focus:border focus:border-violet-600/40 focus:bg-gray-900 focus:px-4 focus:py-2 focus:text-[0.82rem] focus:font-semibold focus:text-slate-100 focus:shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
      >
        Salta al contenuto
      </a>

      <nav
        className="fixed inset-x-0 top-0 z-[100] h-16 animate-slide-down border-b border-white/6 bg-night/70 backdrop-blur-2xl backdrop-saturate-150"
        id="navbar"
        aria-label="Barra di navigazione"
      >
        <div className="flex h-full w-full items-center justify-between px-4">
          {/* Logo. Porta a casa propria, che è la home pubblica per chi sta
              leggendo il sito e la galleria degli avatar per chi è
              collegato: sono due indirizzi distinti, e il logo è lo stesso. */}
          <Link
            to={isAuthenticated ? '/app' : '/'}
            className="group flex items-center gap-2 text-slate-100 no-underline transition hover:scale-[1.03]"
            id="navbar-logo"
          >
            <div className="flex h-[38px] w-[38px] items-center justify-center rounded-xl border border-violet-600/20 bg-violet-600/10 transition group-hover:border-violet-600/35 group-hover:bg-violet-600/20 group-hover:shadow-[0_0_20px_rgba(124,58,237,0.15)]">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <defs>
                  <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#7c3aed" />
                    <stop offset="100%" stopColor="#06b6d4" />
                  </linearGradient>
                </defs>
                <path
                  d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                  stroke="url(#logoGrad)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="font-heading text-xl font-bold tracking-tight">
              Skill
              <span className="animate-gradient-shift bg-gradient-to-br from-violet-600 to-cyan-500 bg-[length:200%_auto] bg-clip-text text-transparent">
                Lab
              </span>
            </span>
          </Link>

          {/* Le sezioni, in fila al centro.
              Si ritirano nel pannello a comparsa sotto i 1024px e non sotto i
              768: quattro voci con etichette come "Simulatore Tecnico"
              occupano da sole più di metà barra, e fra le due misure non
              sparivano né stavano, si schiacciavano contro il menu del
              proprio account.
              Prima dell'accesso lo stesso posto ospita la voce del sito
              pubblico, che è una sola: resta in fila a qualunque larghezza,
              quindi solo le voci di chi è collegato si ritirano nel pannello
              a comparsa. */}
          <div
            className={`flex items-center gap-1 ${isAuthenticated ? 'max-lg:hidden' : ''}`}
            id="navbar-links"
          >
            {!isAuthenticated && <PublicNavLinks />}
            {entries.map((entry) => (
              <NavbarLink key={entry.to} entry={entry} isActive={entry.isActive(pathname)} />
            ))}
          </div>

          {/* A destra: le notifiche e il proprio account, o l'accesso */}
          <div className="flex items-center gap-4 max-md:gap-2" id="navbar-actions">
            {isAuthenticated && user ? (
              <>
                <NotificationsBell />
                <NavbarUserMenu
                  user={user}
                  isOpen={openMenu === 'user'}
                  onToggle={() => toggleMenu('user')}
                  onClose={closeMenus}
                />
                {/* Le stesse sezioni della fila centrale, dove non ci stanno */}
                <NavbarMobileMenu
                  entries={entries}
                  isOpen={openMenu === 'sections'}
                  onToggle={() => toggleMenu('sections')}
                  onClose={closeMenus}
                />
              </>
            ) : (
              /* Prima dell'accesso: il pulsante che apre la modale */
              <button
                className="flex cursor-pointer items-center gap-1.5 rounded-full border border-white/6 bg-white/4 px-4 py-1.5 text-[0.82rem] font-medium text-slate-400 transition hover:-translate-y-px hover:border-violet-600 hover:bg-violet-600/12 hover:text-violet-400 hover:shadow-[0_4px_12px_rgba(124,58,237,0.15)]"
                onClick={() => setShowAuthModal(true)}
                id="auth-trigger-btn"
              >
                <UserIcon size={16} />
                Accedi
              </button>
            )}
          </div>
        </div>
      </nav>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </>
  )
}
