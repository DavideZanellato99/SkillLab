/* Notifiche dell'utente corrente.
 *
 * Nessuna di queste è memorizzata: il server le ricava ogni volta dalle
 * tappe dei percorsi assegnati e dalle revisioni del docente (vedi
 * backend/notifications.py). Di conseguenza una notifica che ha smesso di
 * essere vera, per esempio una scadenza spostata in avanti, sparisce da
 * sola alla lettura successiva, e qui non c'è nessuna cache da invalidare
 * a mano.
 *
 * L'unica cosa che si scrive è quali sono state lette. */

import { apiFetch } from './api'

export type NotificationKind =
  | 'assignment.assigned'
  | 'assignment.unlocked'
  | 'assignment.completed'
  | 'assignment.due_soon'
  | 'assignment.overdue'
  | 'review.published'

export interface AppNotification {
  /** Identità stabile dell'evento: è a questa che si riferisce la lettura. */
  key: string
  kind: NotificationKind
  title: string
  body: string
  /** Quando il fatto è diventato vero, non quando è stato generato. */
  at: string
  read: boolean
  link: string | null
}

export interface NotificationList {
  items: AppNotification[]
  unread: number
}

export const fetchNotifications = () => apiFetch<NotificationList>('/api/notifications')

/**
 * Segna come lette le chiavi indicate, o tutte quelle attualmente visibili
 * se non se ne passa nessuna: quali siano lo decide il server, che è l'unico
 * a sapere cosa è derivabile in questo momento.
 *
 * Risponde con la lista aggiornata, così il contatore della campanella si
 * ridisegna senza un secondo giro.
 */
export const markNotificationsRead = (keys?: string[]) =>
  apiFetch<NotificationList>('/api/notifications/read', {
    method: 'POST',
    body: { keys: keys ?? null },
  })
