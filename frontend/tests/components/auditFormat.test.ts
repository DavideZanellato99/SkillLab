import { describe, expect, it } from 'vitest'

import type { AuditLog } from '../../src/services/auditLogs'
import {
  OUTCOME_CLASSES,
  OUTCOME_MEANINGS,
  detailLabel,
  detailValue,
  statusOutcome,
  summarize,
} from '../../src/components/auditFormat'

const riga = (over: Partial<AuditLog> = {}): AuditLog => ({
  id: 'log-1',
  created_at: '2026-03-01T10:00:00',
  user_id: 'u-1',
  user_email: 'anna@test.it',
  user_role: 'super_admin',
  organization_id: 'org-1',
  organization_name: 'Banca Esempio',
  action: 'user.create',
  action_label: 'Utente creato',
  resource_type: 'user',
  resource_id: 'u-2',
  method: 'POST',
  path: '/api/admin/users',
  status_code: 201,
  client_ip: '10.0.0.1',
  user_agent: 'Firefox',
  details: null,
  ...over,
})

describe('statusOutcome', () => {
  it('separa il riuscito dal rifiutato dal guasto', () => {
    expect(statusOutcome(200)).toBe('ok')
    expect(statusOutcome(201)).toBe('ok')
    expect(statusOutcome(403)).toBe('refused')
    expect(statusOutcome(422)).toBe('refused')
    expect(statusOutcome(500)).toBe('failed')
  })

  /* Il confine è il 400, cioè quello fra "il server ha fatto" e "il server ha
   * detto di no": un 3xx è una risposta riuscita, e stava fra le rifiutate. */
  it('conta una redirezione fra le riuscite', () => {
    expect(statusOutcome(302)).toBe('ok')
  })

  it('ha un colore e una spiegazione per ciascuno dei tre esiti', () => {
    for (const esito of ['ok', 'refused', 'failed'] as const) {
      expect(OUTCOME_CLASSES[esito]).toBeTruthy()
      expect(OUTCOME_MEANINGS[esito]).toBeTruthy()
    }
  })
})

describe('detailLabel', () => {
  /* Le chiavi arrivano come le ha scritte l'endpoint, e gli underscore sono
   * un modo di scrivere per il codice, non per chi legge il registro. */
  it('scioglie gli underscore in spazi', () => {
    expect(detailLabel('utenti_eliminati')).toBe('utenti eliminati')
    expect(detailLabel('nome')).toBe('nome')
  })
})

describe('detailValue', () => {
  it('legge una lista come un elenco e non come JSON', () => {
    expect(detailValue(['anna', 'marco'])).toBe('anna, marco')
  })

  it('scrive gli altri valori così come sono', () => {
    expect(detailValue(3)).toBe('3')
    expect(detailValue('Banca Esempio')).toBe('Banca Esempio')
  })
})

describe('summarize', () => {
  it("riassume la riga con quello che l'endpoint ha allegato", () => {
    expect(summarize(riga({ details: { nome: 'Banca Esempio', utenti_eliminati: 3 } }))).toEqual([
      { key: 'nome', label: 'nome', value: 'Banca Esempio' },
      { key: 'utenti_eliminati', label: 'utenti eliminati', value: '3' },
    ])
  })

  /* Un dettaglio vuoto o assente non è un'informazione: scritto, occuperebbe
   * la riga al posto di quelli che dicono qualcosa. */
  it('lascia fuori i dettagli vuoti', () => {
    expect(summarize(riga({ details: { nome: 'Banca', motivo: '', da: null } }))).toEqual([
      { key: 'nome', label: 'nome', value: 'Banca' },
    ])
  })

  it("senza dettagli ripiega sull'id della risorsa toccata", () => {
    expect(summarize(riga())).toEqual([{ key: 'resource_id', label: 'id', value: 'u-2' }])
    expect(summarize(riga({ details: {} }))).toEqual([
      { key: 'resource_id', label: 'id', value: 'u-2' },
    ])
  })

  it('non ha niente da dire su una riga che non tocca una risorsa', () => {
    expect(summarize(riga({ details: null, resource_id: null }))).toEqual([])
  })
})
