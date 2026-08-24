import { describe, expect, it } from 'vitest'

import { queryKeys } from '../../src/hooks/queryKeys'

/* Le chiavi di cache non si rompono mai rumorosamente: due chiavi che si
 * sovrappongono mescolano due risposte diverse nella stessa voce, e una
 * chiave con dentro `undefined` sdoppia la cache senza che niente segnali
 * l'errore. Questi test guardano proprio quelle due cose. */

/** Tutte le chiavi che l'app può produrre, con il nome del punto che le crea. */
const chiavi: [string, readonly unknown[]][] = [
  ['avatars.all', queryKeys.avatars.all],
  ['avatars.list', queryKeys.avatars.list()],
  ['avatars.detail', queryKeys.avatars.detail('a-1')],
  ['categories.all', queryKeys.categories.all],
  ['categories.mine', queryKeys.categories.mine],
  ['categories.admin', queryKeys.categories.admin('org-1')],
  ['categories.admin senza tenant', queryKeys.categories.admin()],
  ['conversations.all', queryKeys.conversations.all],
  ['conversations.byAvatar', queryKeys.conversations.byAvatar('a-1')],
  ['conversations.detail', queryKeys.conversations.detail('c-1')],
  ['conversations.adminDetail', queryKeys.conversations.adminDetail('c-1')],
  ['evaluations.byConversation', queryKeys.evaluations.byConversation('c-1')],
  ['recordings.info', queryKeys.recordings.info('c-1')],
  ['organizations.all', queryKeys.organizations.all],
  ['organizations.list', queryKeys.organizations.list],
  ['organizations.detail', queryKeys.organizations.detail('org-1')],
  ['users.all', queryKeys.users.all],
  ['users.list', queryKeys.users.list({ search: 'anna' })],
  ['auditLogs.all', queryKeys.auditLogs.all],
  ['auditLogs.list', queryKeys.auditLogs.list({ action: 'user.create' })],
  ['auditLogs.actions', queryKeys.auditLogs.actions],
  ['reports.users', queryKeys.reports.users('org-1', 30)],
  ['reports.users senza filtri', queryKeys.reports.users()],
  ['reports.evaluations', queryKeys.reports.evaluations('org-1')],
  ['reports.evaluations senza tenant', queryKeys.reports.evaluations()],
  ['reports.simulations', queryKeys.reports.simulations('org-1')],
  ['training.all', queryKeys.training.all],
  ['training.paths', queryKeys.training.paths('org-1')],
  ['training.paths senza tenant', queryKeys.training.paths()],
  ['training.assignments', queryKeys.training.assignments('org-1', 'p-1')],
  ['training.assignments senza filtri', queryKeys.training.assignments()],
  ['training.mine', queryKeys.training.mine],
  ['training.assignableContent', queryKeys.training.assignableContent('org-1')],
  ['training.assignableUsers', queryKeys.training.assignableUsers('org-1')],
  ['simulations.all', queryKeys.simulations.all],
  ['simulations.list', queryKeys.simulations.list],
  ['simulations.detail', queryKeys.simulations.detail('s-1')],
  ['simulations.attempts', queryKeys.simulations.attempts('s-1')],
  ['simulations.attempt', queryKeys.simulations.attempt('t-1')],
  ['simulations.results', queryKeys.simulations.results('s-1')],
  ['simulations.adminList', queryKeys.simulations.adminList],
  ['simulations.adminDetail', queryKeys.simulations.adminDetail('s-1')],
  ['comparison.people', queryKeys.comparison.people],
  ['comparison.attempts', queryKeys.comparison.attempts('u-1')],
  ['comparison.attempts propri', queryKeys.comparison.attempts()],
  ['comparison.simulationAttempts', queryKeys.comparison.simulationAttempts('u-1')],
  ['comparison.simulationAttempts propri', queryKeys.comparison.simulationAttempts()],
  ['notifications', queryKeys.notifications],
  ['voices', queryKeys.voices],
  ['personaPrompt', queryKeys.personaPrompt({ nome: 'Anna' }, 'voice')],
]

describe('queryKeys', () => {
  it('non produce due chiavi uguali per domande diverse', () => {
    const viste = new Map<string, string>()
    for (const [nome, chiave] of chiavi) {
      const serializzata = JSON.stringify(chiave)
      expect(
        viste.get(serializzata),
        `${nome} collide con ${viste.get(serializzata)}`,
      ).toBeUndefined()
      viste.set(serializzata, nome)
    }
  })

  /* `undefined` dentro una chiave sopravvive al confronto ma non alla
   * serializzazione: due letture che intendevano la stessa cosa finiscono in
   * due voci di cache diverse, e chi ne invalida una lascia l'altra vecchia
   * sullo schermo. I filtri assenti hanno per questo un segnaposto scritto. */
  it('sostituisce i filtri assenti con un segnaposto, mai con undefined', () => {
    for (const [nome, chiave] of chiavi) {
      expect(chiave.includes(undefined), `${nome} contiene undefined`).toBe(false)
    }

    expect(queryKeys.training.assignments()).toEqual([
      'training',
      'assignments',
      '__all__',
      '__all__',
    ])
    expect(queryKeys.reports.users()).toEqual(['reports', 'users', '__all__', '__ever__'])
    expect(queryKeys.comparison.attempts()).toEqual(['comparison', 'attempts', '__me__'])
  })

  /* Le chiavi di un'area cominciano tutte con il suo prefisso: è quello che
   * le mutation invalidano quando non sanno esattamente dove ha inciso la
   * scrittura. Un ramo che non comincia con `all` resterebbe vecchio. */
  it('tiene ogni area sotto il prefisso che le mutation invalidano', () => {
    const rami: [readonly unknown[], readonly (readonly unknown[])[]][] = [
      [queryKeys.avatars.all, [queryKeys.avatars.list(), queryKeys.avatars.detail('a-1')]],
      [
        queryKeys.training.all,
        [
          queryKeys.training.paths('org-1'),
          queryKeys.training.assignments(),
          queryKeys.training.mine,
          queryKeys.training.assignableContent('org-1'),
          queryKeys.training.assignableUsers('org-1'),
        ],
      ],
      [
        queryKeys.simulations.all,
        [
          queryKeys.simulations.list,
          queryKeys.simulations.detail('s-1'),
          queryKeys.simulations.attempts('s-1'),
          queryKeys.simulations.adminList,
        ],
      ],
      [queryKeys.users.all, [queryKeys.users.list({})]],
      [queryKeys.auditLogs.all, [queryKeys.auditLogs.list({}), queryKeys.auditLogs.actions]],
      [
        queryKeys.organizations.all,
        [queryKeys.organizations.list, queryKeys.organizations.detail('org-1')],
      ],
      [queryKeys.categories.all, [queryKeys.categories.mine, queryKeys.categories.admin()]],
      [
        queryKeys.conversations.all,
        [queryKeys.conversations.byAvatar('a-1'), queryKeys.conversations.detail('c-1')],
      ],
    ]

    for (const [prefisso, figlie] of rami) {
      for (const figlia of figlie) {
        expect(figlia.slice(0, prefisso.length)).toEqual(prefisso)
      }
    }
  })
})
