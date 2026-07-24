/* Percorsi di training assegnati: obiettivi (avatar + punteggio target,
 * scadenza opzionale) che il super admin affida agli utenti. Lo stato è
 * derivato dal backend a ogni lettura, mai memorizzato. */

import { apiFetch } from './api';

/**
 * "active": ancora aperto. "overdue": scadenza passata senza obiettivo.
 * "completed": obiettivo raggiunto. "completed_late": raggiunto dopo la
 * scadenza.
 */
export type AssignmentStatus = 'active' | 'overdue' | 'completed' | 'completed_late';

export interface TrainingAssignment {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  organization_id: string | null;
  organization_name: string | null;
  avatar_id: string;
  avatar_name: string;
  avatar_category: string;
  target_score: number;
  due_at: string | null;
  created_at: string;
  status: AssignmentStatus;
  /** Conversazioni valutate aperte dopo l'assegnazione. */
  attempts: number;
  best_score: number | null;
  achieved_at: string | null;
}

export interface CreateAssignmentsPayload {
  avatar_id: string;
  user_ids: string[];
  target_score: number;
  due_at: string | null;
}

/** I percorsi dell'utente corrente, per la home. */
export const fetchMyAssignments = () =>
  apiFetch<TrainingAssignment[]>('/api/training/assignments/me');

/** Tutti i percorsi nello scope dell'admin (l'org admin vede solo la sua). */
export const fetchAssignments = (organizationId?: string) =>
  apiFetch<TrainingAssignment[]>('/api/training/assignments', {
    params: organizationId ? { organization_id: organizationId } : undefined,
  });

/** Assegna un avatar come obiettivo a uno o più utenti (solo Super Admin). */
export const createAssignments = (payload: CreateAssignmentsPayload) =>
  apiFetch<TrainingAssignment[]>('/api/training/assignments', {
    method: 'POST',
    body: payload,
  });

/** Elimina un percorso assegnato (solo Super Admin). */
export const deleteAssignment = (assignmentId: string) =>
  apiFetch<{ message: string; success: boolean }>(`/api/training/assignments/${assignmentId}`, {
    method: 'DELETE',
  });
