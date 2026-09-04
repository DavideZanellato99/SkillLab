/* Quale file serve per aprire un indirizzo.
 *
 * Si prova `pageImportFor` e non `prefetchPage`: la prima sceglie, la seconda
 * scarica, e una prova che scaricasse davvero le pagine misurerebbe il
 * bundler invece della regola.
 *
 * L'ultima prova è quella che conta nel tempo: ogni voce di navigazione deve
 * avere il proprio file. Senza, una sezione nuova aggiunta alla barra e
 * dimenticata in `lazyPages` non darebbe nessun errore, si aprirebbe soltanto
 * più lentamente di tutte le altre, ed è il genere di cosa che non si nota
 * più dopo il giorno in cui la si è scritta.
 */

import { describe, expect, it } from 'vitest'

import { pageImportFor, prefetchPage } from '../../src/components/lazyPages'
import { mainNavEntries, profileMenuGroups } from '../../src/components/navEntries'
import type { AuthUser } from '../../src/services/auth'

const utente = (ruolo: string) => ({ ruolo }) as AuthUser

describe('pageImportFor', () => {
  it('trova il file di un indirizzo fisso', () => {
    expect(pageImportFor('/app')).toBeTypeOf('function')
    expect(pageImportFor('/app/admin/dashboard')).toBeTypeOf('function')
  })

  it('ignora i filtri scritti nell indirizzo', () => {
    expect(pageImportFor('/app/admin?organization_id=abc')).toBe(pageImportFor('/app/admin'))
    expect(pageImportFor('/app/admin#in-fondo')).toBe(pageImportFor('/app/admin'))
  })

  it('trova il file di un indirizzo che porta un id', () => {
    expect(pageImportFor('/app/chat/8f14e45f')).toBeTypeOf('function')
    expect(pageImportFor('/app/percorsi/8f14e45f')).toBeTypeOf('function')
  })

  it('è lo stesso file qualunque sia l id', () => {
    expect(pageImportFor('/app/chat/uno')).toBe(pageImportFor('/app/chat/due'))
  })

  it('distingue l elenco dalla pagina che sta sotto', () => {
    expect(pageImportFor('/app/simulatore')).not.toBe(pageImportFor('/app/simulatore/uno'))
    expect(pageImportFor('/app/percorsi')).not.toBe(pageImportFor('/app/percorsi/uno'))
  })

  it('non ha niente da scaricare per il sito pubblico o per un indirizzo inventato', () => {
    expect(pageImportFor('/')).toBeUndefined()
    expect(pageImportFor('/app/inesistente')).toBeUndefined()
  })

  it('ogni voce di navigazione ha il proprio file', () => {
    for (const ruolo of ['super_admin', 'organization_admin', 'user']) {
      const voci = [...mainNavEntries(utente(ruolo)), ...profileMenuGroups(utente(ruolo)).flat()]
      expect(voci.length).toBeGreaterThan(0)
      for (const voce of voci) {
        expect(pageImportFor(voce.to), `manca il file di ${voce.to}`).toBeTypeOf('function')
      }
    }
  })
})

describe('prefetchPage', () => {
  it('su un indirizzo che non è di una pagina non fa niente', () => {
    expect(() => prefetchPage('/')).not.toThrow()
  })
})
