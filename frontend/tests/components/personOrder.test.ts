import { describe, expect, it } from 'vitest'

/* L'ordine con cui si elencano delle persone: per cognome, poi per nome, poi
 * per email.
 *
 * È la regola che il server applica alla tabella di gestione utenti
 * (`USER_SORT_COLUMNS`, `(cognome, nome, email)`), e vale identica negli
 * elenchi che il frontend ordina da sé: le stesse persone ordinate in due
 * modi in due schermate si leggono come due elenchi diversi. */

import { comparePeople } from '../../src/components/personOrder'

const persona = (nome: string, cognome: string, email = `${nome}@test.it`) => ({
  nome,
  cognome,
  email,
})

const ordinate = (...gente: ReturnType<typeof persona>[]) =>
  [...gente].sort(comparePeople).map((p) => `${p.nome} ${p.cognome}`.trim() || p.email)

describe('l’ordine delle persone', () => {
  it('mette in fila per cognome e non per nome', () => {
    expect(ordinate(persona('Anna', 'Zanetti'), persona('Zeno', 'Abate'))).toEqual([
      'Zeno Abate',
      'Anna Zanetti',
    ])
  })

  it('a parità di cognome guarda il nome', () => {
    expect(ordinate(persona('Marco', 'Rossi'), persona('Anna', 'Rossi'))).toEqual([
      'Anna Rossi',
      'Marco Rossi',
    ])
  })

  /* L'email è l'unico campo che c'è sempre: su un account appena invitato è
   * anche l'unico che si legge, e senza di lei due inviti finirebbero in un
   * ordine che cambia da un caricamento all'altro. */
  it('senza anagrafica ordina per email', () => {
    expect(ordinate(persona('', '', 'zeta@test.it'), persona('', '', 'alfa@test.it'))).toEqual([
      'alfa@test.it',
      'zeta@test.it',
    ])
  })

  /* Le regole della lingua, non quelle dei codici dei caratteri: senza, gli
   * accenti e le maiuscole finirebbero in fondo all'alfabeto. */
  it('non si fa ingannare da accenti e maiuscole', () => {
    expect(
      ordinate(persona('Ada', 'Zola'), persona('Ivo', 'Àbbate'), persona('Ugo', 'bianchi')),
    ).toEqual(['Ivo Àbbate', 'Ugo bianchi', 'Ada Zola'])
  })
})
