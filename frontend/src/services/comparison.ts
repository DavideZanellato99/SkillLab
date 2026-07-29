/* Confronto fra i tentativi di una persona.
 *
 * Sempre una persona sola con se stessa: lo studente vede i propri, un
 * admin ne apre uno alla volta fra quelli del proprio tenant. Non esiste un
 * modo di mettere due persone a confronto, ed è voluto (vedi
 * backend/routers/comparison.py). */

import { apiFetch } from './api'
import type { EvaluationCriterionScore } from './admin'

export interface Attempt {
  conversation_id: string
  title: string
  mode: 'voice' | 'text'
  avatar_id: string
  avatar_name: string
  conversation_at: string
  evaluated_at: string
  /** Quello proposto dalla macchina. */
  ai_score: number
  /** Quello che conta: la correzione del docente quando c'è. */
  final_score: number
  has_override: boolean
  summary: string
  reviewer_name: string | null
  review_note: string | null
  review_reason: string | null
  criteria: EvaluationCriterionScore[]
}

export interface ComparableUser {
  id: string
  nome: string
  cognome: string
  email: string
  /** Quanti tentativi valutati ha: chi non ne ha non compare nell'elenco. */
  attempts: number
}

/** Le persone che il chiamante può aprire; vuoto per uno studente. */
export const fetchComparableUsers = () => apiFetch<ComparableUser[]>('/api/comparison/users')

/**
 * I tentativi valutati di una persona, dal più vecchio.
 *
 * Senza `userId` sono i propri. Uno studente che ne passasse uno altrui
 * riceve comunque i propri: è il server a deciderlo.
 */
export const fetchAttempts = (userId?: string) =>
  apiFetch<Attempt[]>('/api/comparison/attempts', {
    params: userId ? { user_id: userId } : undefined,
  })
