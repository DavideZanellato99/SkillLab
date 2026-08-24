/* I criteri della valutazione, per chi li mostra in poco spazio.
 *
 * Le chiavi e le etichette intere sono del server (openai_service.
 * EVALUATION_CRITERIA) e arrivano con i dati: qui non se ne tiene una copia,
 * perché una lista ricopiata a mano è una lista che col tempo racconta
 * criteri diversi da quelli su cui il giudizio è stato dato.
 *
 * Quello che sta qui è solo il nome corto, che il server non ha motivo di
 * conoscere: serve alle intestazioni di una tabella, dove "Corretta
 * identificazione del cliente" occuperebbe tre volte lo spazio dei numeri
 * che stanno sotto. L'etichetta intera resta nel tooltip, sempre a un
 * passaggio del mouse.
 *
 * È l'unico posto in cui i criteri si accorciano. Dove c'è spazio per una
 * riga intera si scrive il nome per esteso, perché un'abbreviazione la
 * riconosce solo chi ha già imparato l'elenco: succede nel pannello con cui
 * una tappa pone le proprie soglie e nelle targhette che dicono a che punto
 * sono.
 */

/* La prima parola dell'etichetta intera non basterebbe a distinguerli:
 * "Corretta identificazione del cliente" diventerebbe "Corretta". */
const CRITERION_SHORT_LABELS: Record<string, string> = {
  rispetto_fasi_chiamata: 'Fasi',
  empatia: 'Empatia',
  sicurezza_competenza: 'Sicurezza',
  appropriatezza_linguaggio: 'Linguaggio',
  identificazione_cliente: 'Identificazione',
  comprensione_casistica: 'Casistica',
}

/**
 * Il nome corto di un criterio, con l'etichetta intera come ripiego.
 *
 * Il ripiego non è una formalità: un criterio aggiunto sul server compare
 * qui prima che qualcuno gli scriva il nome corto, e deve leggersi lo stesso
 * invece di lasciare una colonna senza intestazione.
 */
export function shortCriterionLabel(key: string, label: string): string {
  return CRITERION_SHORT_LABELS[key] ?? label.split(' ')[0].replace(/[,;:]$/, '')
}
