/* Definizione della scheda persona: da qui nasce l'intero form dell'avatar.
 *
 * Ogni avatar È una persona di training, e questa è la sua scheda: circa
 * ottanta campi che il backend trasforma nel prompt di roleplay. Vive in un
 * modulo suo perché è dato, non interfaccia: la pagina admin la percorre per
 * disegnare i campi, contare quanto è compilata e capire quali campi pesano
 * davvero sul realismo della simulazione.
 *
 * IMPORTANTE, e vale per ogni tipo di campo: un campo che non si applica al
 * personaggio resta VUOTO. Mai 0, mai "/", mai "n/d". Il prompt scarta i
 * marcatori di vuoto, quindi scriverli è solo un modo per illudersi di aver
 * compilato la scheda, ed è per questo che l'anteprima del prompt li segnala.
 */

export type ProfileFieldKind =
  /** Riga singola di testo libero (default) */
  | 'text'
  /** Testo lungo, a tutta larghezza */
  | 'textarea'
  /** Intero 0..100 reso come percentuale: il prompt legge questi tratti come intensità */
  | 'percent'
  /** Insieme chiuso di valori, sempre con la possibilità di tornare a vuoto */
  | 'choice'

export interface ProfileField {
  key: string
  label: string
  kind?: ProfileFieldKind
  placeholder?: string
  /** Valori proposti per i campi `choice`; un valore già salvato fuori elenco resta selezionabile */
  options?: string[]
  /** Nota sotto al campo, per le convenzioni che non stanno nell'etichetta */
  hint?: string
}

export interface ProfileSection {
  title: string
  fields: ProfileField[]
}

/* Insiemi di valori usati più volte nella scheda. */
const LEVELS = ['Bassa', 'Media', 'Alta']
const YES_NO = ['No', 'Si, moderato', 'Si, marcato']

/** Le dieci difficoltà, nel formato "n/10" che il modello Avatar espone. */
export const DIFFICULTY_OPTIONS = Array.from({ length: 10 }, (_, i) => `${i + 1}/10`)

export const PROFILE_SECTIONS: ProfileSection[] = [
  {
    title: 'Anagrafica',
    fields: [
      { key: 'NOME', label: 'Nome *', placeholder: 'Giovanni' },
      { key: 'COGNOME', label: 'Cognome *', placeholder: 'Salemmi' },
      { key: 'SESSO', label: 'Sesso', kind: 'choice', options: ['Uomo', 'Donna'] },
      { key: 'DATA_NASCITA', label: 'Data di nascita', placeholder: '09/12/1999' },
      { key: 'LUOGO_NASCITA', label: 'Luogo di nascita' },
      { key: 'NAZIONALITA', label: 'Nazionalità' },
      { key: 'LINGUA_MADRE', label: 'Lingua madre' },
      { key: 'CITTA_RESIDENZA', label: 'Città di residenza' },
      { key: 'STATO_CIVILE', label: 'Stato civile' },
      { key: 'NOME_CONIUGE', label: 'Nome del coniuge' },
      { key: 'PROFESSIONE_CONIUGE', label: 'Professione del coniuge' },
      { key: 'NUMERO_FIGLI', label: 'Numero di figli' },
      { key: 'ETA_FIGLIO_1', label: 'Età primo figlio' },
      { key: 'ETA_FIGLIO_2', label: 'Età secondo figlio' },
      { key: 'ANIMALI_DOMESTICI', label: 'Animali domestici' },
    ],
  },
  {
    title: 'Lavoro e finanze',
    fields: [
      { key: 'TITOLO_DI_STUDIO', label: 'Titolo di studio' },
      { key: 'PROFESSIONE', label: 'Professione' },
      { key: 'AZIENDA', label: 'Azienda' },
      { key: 'RUOLO', label: 'Ruolo' },
      { key: 'REDDITO_ANNUO', label: 'Reddito annuo', placeholder: '35.000,00 euro' },
      { key: 'PATRIMONIO', label: 'Patrimonio' },
      { key: 'LIQUIDITA', label: 'Liquidità' },
      { key: 'DEBITI', label: 'Debiti' },
      { key: 'INVESTIMENTI_POSSEDUTI', label: 'Investimenti posseduti' },
      { key: 'IMMOBILI_POSSEDUTI', label: 'Immobili posseduti' },
      {
        key: 'LIVELLO_CONOSCENZA_BANCARIA',
        label: 'Conoscenza bancaria',
        kind: 'choice',
        options: LEVELS,
      },
      {
        key: 'LIVELLO_CONOSCENZA_INVESTIMENTI',
        label: 'Conoscenza investimenti',
        kind: 'choice',
        options: LEVELS,
      },
      {
        key: 'LIVELLO_CONOSCENZA_PREVIDENZA',
        label: 'Conoscenza previdenza',
        kind: 'choice',
        options: LEVELS,
      },
      {
        key: 'LIVELLO_CONOSCENZA_MUTUI',
        label: 'Conoscenza mutui',
        kind: 'choice',
        options: LEVELS,
      },
    ],
  },
  {
    title: 'Storia e vita personale',
    fields: [
      { key: 'STORIA_PERSONALE', label: 'Storia personale', kind: 'textarea' },
      { key: 'EVENTI_SIGNIFICATIVI', label: 'Eventi significativi', kind: 'textarea' },
      { key: 'PAURE', label: 'Paure', kind: 'textarea' },
      { key: 'OBIETTIVI_PERSONALI', label: 'Obiettivi personali', kind: 'textarea' },
      { key: 'ASPIRAZIONI', label: 'Aspirazioni', kind: 'textarea' },
    ],
  },
  {
    title: 'Personalità',
    fields: [
      {
        key: 'PERSONALITA_DESCRIZIONE',
        label: 'Descrizione della personalità',
        kind: 'textarea',
      },
      { key: 'LIVELLO_ESTROVERSIONE', label: 'Estroversione', kind: 'percent' },
      { key: 'LIVELLO_EMPATICO', label: 'Empatia', kind: 'percent' },
      { key: 'LIVELLO_PAZIENZA', label: 'Pazienza', kind: 'percent' },
      { key: 'LIVELLO_FIDUCIA', label: 'Fiducia negli altri', kind: 'percent' },
      { key: 'PROPENSIONE_CONFLITTO', label: 'Propensione al conflitto', kind: 'percent' },
      { key: 'PROPENSIONE_RISCHIO', label: 'Propensione al rischio', kind: 'percent' },
      { key: 'CAPACITA_ASCOLTO', label: 'Capacità di ascolto', kind: 'percent' },
    ],
  },
  {
    title: 'Stato emotivo',
    fields: [
      { key: 'EMOZIONE_INIZIALE', label: 'Emozione iniziale', placeholder: 'Arrabbiato' },
      {
        key: 'INTENSITA_EMOZIONE',
        label: 'Intensità emozione',
        kind: 'choice',
        options: LEVELS,
      },
      {
        key: 'TRIGGER_POSITIVI',
        label: 'Trigger positivi',
        kind: 'textarea',
        placeholder: 'Empatia, rassicurazione, competenza',
      },
      {
        key: 'TRIGGER_NEGATIVI',
        label: 'Trigger negativi',
        kind: 'textarea',
        placeholder: 'Fretta, incompetenza, lunghe attese',
      },
    ],
  },
  {
    title: 'Stile di conversazione',
    fields: [
      {
        key: 'LUNGHEZZA_MEDIA_RISPOSTE',
        label: 'Lunghezza media risposte',
        kind: 'choice',
        options: ['Breve', 'Media', 'Lunga'],
      },
      {
        key: 'VELOCITA_PARLATO',
        label: 'Velocità del parlato',
        kind: 'choice',
        options: LEVELS,
        hint: 'Usata solo nelle chiamate: in chat non ha un equivalente e viene ignorata.',
      },
      { key: 'USO_IRONIA', label: 'Uso dell’ironia', kind: 'choice', options: YES_NO },
      { key: 'USO_DIALETTO', label: 'Uso del dialetto', kind: 'choice', options: YES_NO },
      {
        key: 'FORMALITA_LINGUAGGIO',
        label: 'Formalità del linguaggio',
        kind: 'choice',
        options: ['Formale', 'Informale'],
      },
    ],
  },
  {
    title: 'Scenario della chiamata',
    fields: [
      {
        key: 'TIPO_SCENARIO',
        label: 'Tipo di scenario',
        kind: 'textarea',
        placeholder: 'Cosa è successo e perché il cliente è coinvolto...',
      },
      {
        key: 'DESCRIZIONE_PROBLEMATICA',
        label: 'Vera causa del problema (il cliente NON la conosce)',
        kind: 'textarea',
      },
      { key: 'OBIEZIONI_PREVISTE', label: 'Obiezioni previste', kind: 'textarea' },
      {
        key: 'OBIETTIVO_NASCOSTO',
        label: 'Obiettivo nascosto della simulazione',
        kind: 'textarea',
      },
      {
        key: 'GRADO_DIFFICOLTA',
        label: 'Grado di difficoltà',
        kind: 'choice',
        options: DIFFICULTY_OPTIONS,
        hint: "L'unico campo della scheda visibile allo studente nella galleria.",
      },
    ],
  },
  {
    title: 'Regole e segreti',
    fields: [
      { key: 'FATTI_IMMUTABILI', label: 'Fatti immutabili', kind: 'textarea' },
      { key: 'SEGRETI', label: 'Segreti (mai rivelati)', kind: 'textarea' },
      {
        key: 'INFORMAZIONI_DA_NON_RIVELARE_SPONTANEAMENTE',
        label: 'Informazioni da non rivelare spontaneamente',
        kind: 'textarea',
      },
      { key: 'ARGOMENTI_SENSIBILI', label: 'Argomenti sensibili', kind: 'textarea' },
    ],
  },
]

export const ALL_PROFILE_KEYS = PROFILE_SECTIONS.flatMap((s) => s.fields.map((f) => f.key))

/* I campi senza i quali la simulazione non regge: non è la scheda anagrafica
 * a rendere credibile un cliente, è avere uno scenario, un'emozione da cui
 * partire e qualcosa su cui l'operatore debba faticare. La pagina li segnala
 * quando mancano, mentre tutti gli altri restano legittimamente opzionali. */
export const ESSENTIAL_KEYS = [
  'NOME',
  'COGNOME',
  'TIPO_SCENARIO',
  'DESCRIZIONE_PROBLEMATICA',
  'EMOZIONE_INIZIALE',
  'OBIEZIONI_PREVISTE',
  'PERSONALITA_DESCRIZIONE',
  'GRADO_DIFFICOLTA',
]

const ESSENTIAL_LABELS = new Map(
  PROFILE_SECTIONS.flatMap((s) => s.fields).map((f) => [f.key, f.label.replace(' *', '')]),
)

export function emptyProfile(): Record<string, string> {
  return Object.fromEntries(ALL_PROFILE_KEYS.map((k) => [k, '']))
}

export const isFilled = (value: string | undefined) => Boolean(value && value.trim())

/** Quanti campi della scheda hanno davvero un valore. */
export function countFilled(profile: Record<string, string>, keys: string[] = ALL_PROFILE_KEYS) {
  return keys.filter((k) => isFilled(profile[k])).length
}

/** Le etichette dei campi essenziali ancora vuoti, per avvisare chi compila. */
export function missingEssentials(profile: Record<string, string>): string[] {
  return ESSENTIAL_KEYS.filter((k) => !isFilled(profile[k])).map(
    (k) => ESSENTIAL_LABELS.get(k) ?? k,
  )
}

/** Etichetta di un campo a partire dalla sua chiave (per i messaggi diagnostici). */
export const fieldLabel = (key: string) => ESSENTIAL_LABELS.get(key) ?? key

/* Le percentuali sono scritte "60%" nella scheda ma si modificano come
 * numeri: queste due funzioni fanno da ponte, e tengono fermo il patto che
 * un campo vuoto resti vuoto invece di diventare "0%". */
export const percentToInput = (value: string | undefined) => (value ?? '').replace('%', '').trim()

export function inputToPercent(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '')
  if (!digits) return ''
  return `${Math.min(100, Number(digits))}%`
}
