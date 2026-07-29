import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchNotifications, markNotificationsRead } from '../services/notifications'
import type { AppNotification, NotificationKind } from '../services/notifications'

/* La campanella nella barra in alto: quante notifiche non lette ci sono e,
 * aprendola, quali.
 *
 * Le notifiche sono derivate dal server a ogni lettura, quindi qui non c'è
 * niente da tenere sincronizzato: basta richiedere la lista. Viene
 * ricontrollata a intervalli e al ritorno sulla scheda, perché il fatto che
 * l'annuncia (un obiettivo assegnato, una revisione pubblicata) accade
 * altrove mentre questa pagina è aperta. */

/** Ogni quanto ricontrollare mentre la scheda è in primo piano. Le notizie
 *  qui non sono al secondo, un minuto è abbondante e non pesa. */
const POLL_MS = 60_000

const ICONS: Record<NotificationKind, { path: React.ReactNode; cls: string }> = {
  'assignment.assigned': {
    cls: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
    path: (
      <>
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </>
    ),
  },
  'assignment.due_soon': {
    cls: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
    path: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  },
  'assignment.overdue': {
    cls: 'border-red-500/30 bg-red-500/10 text-red-300',
    path: (
      <>
        <circle cx="12" cy="12" r="9" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </>
    ),
  },
  'review.published': {
    cls: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
    path: (
      <>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </>
    ),
  },
}

/** "3 giorni fa", perché in un elenco di avvisi la distanza dice più della
 *  data: sotto il minuto si arrotonda ad "adesso". */
function relativeTime(iso: string): string {
  // Le date arrivano in UTC senza suffisso (convenzione delle colonne),
  // quindi va dichiarato o il browser le leggerebbe come ora locale.
  const at = new Date(iso.endsWith('Z') ? iso : `${iso}Z`)
  const minutes = Math.round((Date.now() - at.getTime()) / 60_000)
  if (minutes < 1) return 'adesso'
  if (minutes < 60) return `${minutes} min fa`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'ora' : 'ore'} fa`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} ${days === 1 ? 'giorno' : 'giorni'} fa`
  return at.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function NotificationsBell() {
  const navigate = useNavigate()
  const [items, setItems] = useState<AppNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [isOpen, setIsOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await fetchNotifications()
      setItems(data.items)
      setUnread(data.unread)
    } catch {
      // Silenzioso di proposito: la campanella è un accessorio, un errore
      // di rete qui non deve piazzare un avviso rosso in cima all'app.
    }
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, POLL_MS)
    // Tornare sulla scheda dopo un'ora è il momento in cui la lista in
    // memoria è più vecchia, quindi vale più di qualunque intervallo.
    const onVisible = () => {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  const markAll = async () => {
    try {
      const data = await markNotificationsRead()
      setItems(data.items)
      setUnread(data.unread)
    } catch {
      /* come sopra */
    }
  }

  const open = (notification: AppNotification) => {
    setIsOpen(false)
    if (!notification.read) {
      markNotificationsRead([notification.key])
        .then((data) => {
          setItems(data.items)
          setUnread(data.unread)
        })
        .catch(() => {})
    }
    if (notification.link) navigate(notification.link)
  }

  return (
    <div className="relative">
      <button
        className="relative flex cursor-pointer items-center justify-center rounded-full border border-white/6 bg-white/4 p-2 text-slate-400 transition hover:border-white/12 hover:bg-white/8 hover:text-slate-100"
        onClick={() => setIsOpen((v) => !v)}
        aria-label={unread > 0 ? `Notifiche, ${unread} non lette` : 'Notifiche'}
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-cyan-500 px-1 text-[0.62rem] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-[99]" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-[calc(100%+8px)] z-[100] w-[360px] animate-menu-in rounded-2xl border border-white/6 bg-gray-900/95 p-2 shadow-[0_16px_48px_rgba(0,0,0,0.5),0_0_40px_rgba(124,58,237,0.06)] backdrop-blur-2xl max-[480px]:w-[calc(100vw-2rem)]">
            <div className="flex items-center justify-between gap-2 px-2 py-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400">
                Notifiche
              </span>
              {unread > 0 && (
                <button
                  className="cursor-pointer rounded-lg border-none bg-transparent px-2 py-0.5 text-[0.72rem] font-semibold text-violet-300 transition hover:bg-violet-500/15"
                  onClick={markAll}
                >
                  Segna tutte come lette
                </button>
              )}
            </div>

            {items.length === 0 ? (
              <p className="px-2 py-8 text-center text-[0.82rem] text-slate-500">
                Nessuna notifica.
              </p>
            ) : (
              <div className="flex max-h-[60vh] flex-col overflow-y-auto">
                {items.map((notification) => {
                  const icon = ICONS[notification.kind]
                  return (
                    <button
                      key={notification.key}
                      className={`flex w-full cursor-pointer items-start gap-2.5 rounded-xl border-none p-2 text-left transition hover:bg-white/8 ${
                        notification.read ? 'bg-transparent' : 'bg-violet-500/8'
                      }`}
                      onClick={() => open(notification)}
                    >
                      <span
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${icon.cls}`}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          {icon.path}
                        </svg>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span
                            className={`text-[0.82rem] font-semibold ${
                              notification.read ? 'text-slate-400' : 'text-slate-100'
                            }`}
                          >
                            {notification.title}
                          </span>
                          {!notification.read && (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
                          )}
                        </span>
                        <span className="block text-[0.78rem] leading-relaxed text-slate-500">
                          {notification.body}
                        </span>
                        <span className="block text-[0.68rem] text-slate-600">
                          {relativeTime(notification.at)}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
