/* Percorsi di training assegnati: obiettivi (avatar + punteggio target,
 * scadenza opzionale) che un admin affida agli utenti. Lo stato è derivato
 * dal backend a ogni lettura, mai memorizzato.
 *
 * Assegnano sia il super admin sia l'organization admin; a quest'ultimo il
 * server impone comunque il proprio tenant, quindi qui non c'è nessun
 * controllo di ruolo da replicare. */

import { apiFetch } from './api'
import type { AuthUser } from './auth'

/**
 * "active": ancora aperto. "overdue": scadenza passata senza obiettivo.
 * "completed": obiettivo raggiunto. "completed_late": raggiunto dopo la
 * scadenza.
 */
export type AssignmentStatus = 'active' | 'overdue' | 'completed' | 'completed_late'

export interface TrainingAssignment {
  id: string
  user_id: string
  user_name: string
  user_email: string
  organization_id: string | null
  organization_name: string | null
  avatar_id: string
  avatar_name: string
  avatar_category: string
  /** Tinta della categoria, per la targhetta (vedi categoryStyles). */
  avatar_category_color: string
  target_score: number
  due_at: string | null
  created_at: string
  status: AssignmentStatus
  /** Conversazioni valutate aperte dopo l'assegnazione. */
  attempts: number
  best_score: number | null
  achieved_at: string | null
}

export interface CreateAssignmentsPayload {
  avatar_id: string
  user_ids: string[]
  target_score: number
  due_at: string | null
}

/** I percorsi dell'utente corrente, per la home. */
export const fetchMyAssignments = () =>
  apiFetch<TrainingAssignment[]>('/api/training/assignments/me')

/** Tutti i percorsi nello scope dell'admin (l'org admin vede solo la sua). */
export const fetchAssignments = (organizationId?: string) =>
  apiFetch<TrainingAssignment[]>('/api/training/assignments', {
    params: organizationId ? { organization_id: organizationId } : undefined,
  })

/**
 * Gli utenti a cui un avatar di quell'organizzazione può essere assegnato:
 * attivi, del tenant dell'avatar, super admin esclusi.
 *
 * La regola vive sul server, accanto alla validazione che rifiuta
 * l'assegnazione: filtrare qui una lista completa di utenti significherebbe
 * tenerne una copia libera di divergere da quella. All'org admin il server
 * impone la propria organizzazione, quindi il parametro può restare vuoto;
 * al super admin serve, perché "tutte" non è una risposta valida.
 */
export const fetchAssignableUsers = (organizationId?: string) =>
  apiFetch<AuthUser[]>('/api/training/assignable-users', {
    params: organizationId ? { organization_id: organizationId } : undefined,
  })

/** Assegna un avatar come obiettivo a uno o più utenti (admin). */
export const createAssignments = (payload: CreateAssignmentsPayload) =>
  apiFetch<TrainingAssignment[]>('/api/training/assignments', {
    method: 'POST',
    body: payload,
  })

/** Elimina un percorso assegnato (admin, solo quelli nel proprio scope). */
export const deleteAssignment = (assignmentId: string) =>
  apiFetch<{ message: string; success: boolean }>(`/api/training/assignments/${assignmentId}`, {
    method: 'DELETE',
  })
