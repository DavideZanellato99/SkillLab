/* Il menu del proprio account, in fondo a destra nella barra.
 *
 * Sta a parte perché è l'altra metà della navigazione: in fila stanno le
 * sezioni in cui si lavora, qui la propria scheda, le anagrafiche e i
 * controlli, che si aprono di rado e non meritano un posto fisso.
 *
 * Aperto o chiuso lo decide la barra, che tiene aperto un menu solo: questo e
 * il pannello delle sezioni escono dallo stesso angolo. */

import { useRef } from 'react'
import { Link, useLocation } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { getInitials, ROLE_BADGE_CLASSES, ROLE_LABELS, type AuthUser } from '../services/auth'
import Badge from './Badge'
import { ChevronDownIcon, LogoutIcon } from './icons'
import { profileMenuGroups } from './navEntries'

const menuItemCls =
  'flex w-full cursor-pointer items-center gap-2 rounded-lg border-none bg-transparent p-2 text-left text-[0.82rem] font-medium text-slate-400 no-underline transition hover:bg-white/8 hover:text-slate-100'
const menuItemActiveCls = 'bg-violet-600/10 text-slate-100'
const separatorCls = 'my-1 h-px bg-white/6'

/** Nome e cognome se ci sono, altrimenti l'indirizzo con cui si è entrati. */
function displayName(user: AuthUser): string {
  return user.nome && user.cognome ? `${user.nome} ${user.cognome}` : user.email
}

interface NavbarUserMenuProps {
  user: AuthUser
  isOpen: boolean
  onToggle: () => void
  onClose: () => void
}

export default function NavbarUserMenu({ user, isOpen, onToggle, onClose }: NavbarUserMenuProps) {
  const { logout } = useAuth()
  const { pathname } = useLocation()
  const triggerRef = useRef<HTMLButtonElement>(null)
  useCloseOnEscape(isOpen, onClose, triggerRef)

  const groups = profileMenuGroups(user)

  return (
    <>
      <div className="relative">
        {/* Niente aria-haspopup: dentro ci sono collegamenti in un
            riquadro, non un menu con la sua navigazione a frecce, e
            annunciarlo come tale prometterebbe tasti che non ci sono. Che
            sia aperto o chiuso lo dicono aria-expanded e aria-controls.

            Il nome scritto per intero anche per chi non lo vede: sotto i
            480px il nome sparisce per far posto, e il pulsante resterebbe
            due lettere. */}
        <button
          ref={triggerRef}
          className="flex cursor-pointer items-center gap-2 rounded-full border border-white/6 bg-white/4 py-1 pl-1 pr-2 text-[0.82rem] font-medium text-slate-400 transition hover:border-white/12 hover:bg-white/8 hover:text-slate-100 max-[480px]:p-1"
          onClick={onToggle}
          aria-label={`${displayName(user)}, menu del proprio account`}
          aria-expanded={isOpen}
          aria-controls="user-menu-dropdown"
          id="user-menu-trigger"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-cyan-500 text-xs font-bold text-white">
            {getInitials(user.nome, user.cognome, user.email)}
          </div>
          <span className="max-w-[120px] truncate max-[480px]:hidden">{displayName(user)}</span>
          <ChevronDownIcon
            size={14}
            className={`shrink-0 opacity-50 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {isOpen && (
          <div
            className="absolute right-0 top-[calc(100%+8px)] z-[100] min-w-60 animate-menu-in rounded-2xl border border-white/6 bg-gray-900/95 p-2 shadow-[0_16px_48px_rgba(0,0,0,0.5),0_0_40px_rgba(124,58,237,0.06)] backdrop-blur-2xl"
            id="user-menu-dropdown"
          >
            <div className="flex items-center gap-2 p-2">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-cyan-500 text-base font-bold text-white">
                {getInitials(user.nome, user.cognome, user.email)}
              </div>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-[0.85rem] font-semibold text-slate-100">
                  {displayName(user)}
                </span>
                <span className="truncate text-xs text-slate-500">{user.email}</span>
                <Badge tone={ROLE_BADGE_CLASSES[user.ruolo] ?? ''} className="mt-1">
                  {ROLE_LABELS[user.ruolo] ?? user.ruolo}
                </Badge>
              </div>
            </div>

            {/* Un separatore per gruppo, e nessun gruppo vuoto: chi non
                amministra vede la propria scheda e l'uscita, senza righe
                grigie a segnare dei vuoti.

                La chiave è la prima voce del gruppo, non la sua posizione:
                i gruppi compaiono e spariscono con il ruolo, e con l'indice
                React riuserebbe il riquadro di quello sparito per il gruppo
                che ne prende il posto. */}
            {groups.map((group) => (
              <div key={group[0].to}>
                <div className={separatorCls} />
                {group.map((entry) => {
                  const isActive = entry.isActive(pathname)
                  const { Icon } = entry
                  return (
                    <Link
                      key={entry.to}
                      to={entry.to}
                      className={`${menuItemCls} ${isActive ? menuItemActiveCls : ''}`}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={onClose}
                    >
                      <Icon size={16} />
                      {entry.label}
                    </Link>
                  )
                })}
              </div>
            ))}

            <div className={separatorCls} />
            <button
              className={`${menuItemCls} hover:bg-red-500/10 hover:text-red-300`}
              onClick={() => {
                logout()
                onClose()
              }}
            >
              <LogoutIcon size={16} />
              Esci
            </button>
          </div>
        )}
      </div>

      {/* Chiude il menu con un click fuori. Parte sotto la barra, che resta
          cliccabile: il pulsante che ha aperto il menu deve restare quello
          che lo richiude. */}
      {isOpen && (
        <div
          className="fixed inset-x-0 bottom-0 top-16 z-[99]"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
    </>
  )
}
