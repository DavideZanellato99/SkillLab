/* Le chiavi di cache di tutta l'app, in un posto solo.
 *
 * Stanno qui e non negli hook perché una chiave scritta a mano due volte è
 * un bug silenzioso: due stringhe che dovevano essere uguali e non lo sono
 * sdoppiano la cache senza che niente si rompa, e chi invalida la prima
 * lascia la seconda vecchia sullo schermo. Era già successo con
 * `['recording-info', id]`, ricopiata a mano in tre componenti.
 *
 * Ogni area ha un prefisso suo, ed `all` è il prefisso da invalidare quando
 * una mutation tocca qualcosa che non si sa esattamente dove sia cacheato.
 * I filtri entrano nella chiave: cambiare filtro è una domanda diversa,
 * quindi è una voce di cache diversa, non la stessa da sovrascrivere. */

export const queryKeys = {
  avatars: {
    all: ['avatars'] as const,
    /** Il catalogo intero: il filtro per categoria è locale alla galleria,
     *  quindi non ci sono più liste diverse per categoria da tenere in cache. */
    list: () => ['avatars', 'list'] as const,
    detail: (id: string) => ['avatars', 'detail', id] as const,
  },
  categories: {
    /** Da invalidare a ogni scrittura sull'anagrafica: le due liste sotto
     *  sono la stessa cosa vista da chi si allena e da chi la governa. */
    all: ['categories'] as const,
    /** L'elenco della propria organizzazione, per i filtri della galleria. */
    mine: ['categories', 'mine'] as const,
    /** L'anagrafica lato admin, per tenant quando se ne guarda uno solo. */
    admin: (organizationId?: string) =>
      ['categories', 'admin', organizationId ?? '__all__'] as const,
  },
  conversations: {
    all: ['conversations'] as const,
    byAvatar: (avatarId: string) => ['conversations', 'avatar', avatarId] as const,
    detail: (id: string) => ['conversations', 'detail', id] as const,
    /** Dettaglio lato admin: trascrizione, valutazione e revisione insieme. */
    adminDetail: (id: string) => ['conversations', 'admin-detail', id] as const,
  },
  evaluations: {
    byConversation: (conversationId: string) =>
      ['evaluations', 'conversation', conversationId] as const,
  },
  /** Metadati della registrazione di una chiamata (durata, se esiste). */
  recordings: {
    info: (conversationId: string) => ['recordings', 'info', conversationId] as const,
  },
  organizations: {
    all: ['organizations'] as const,
    list: ['organizations', 'list'] as const,
    detail: (id: string) => ['organizations', 'detail', id] as const,
  },
  users: {
    all: ['users'] as const,
    /** Elenco filtrato e paginato a finestra. */
    list: (filters: unknown) => ['users', 'list', filters] as const,
  },
  auditLogs: {
    all: ['audit-logs'] as const,
    list: (filters: unknown) => ['audit-logs', 'list', filters] as const,
    actions: ['audit-logs', 'actions'] as const,
  },
  reports: {
    /** Da invalidare quando spariscono le prove su cui i rendiconti si
     *  calcolano: il periodo e l'organizzazione stanno dentro ogni chiave,
     *  quindi non c'è una voce sola da rifare ma tutte quelle in cache. */
    all: ['reports'] as const,
    /** Recap per utente delle prove svolte, nel periodo scelto. */
    users: (organizationId?: string, days?: number) =>
      ['reports', 'users', organizationId ?? '__all__', days ?? '__ever__'] as const,
    /** Le prove di una persona sola, che si leggono aprendo la sua riga.
     *  Il periodo entra nella chiave come nell'elenco: sono due domande
     *  diverse, non lo stesso elenco filtrato dopo. */
    userDetail: (userId: string, days?: number) =>
      ['reports', 'user-detail', userId, days ?? '__ever__'] as const,
    /** Punteggi delle valutazioni per la dashboard, nel periodo scelto. */
    evaluations: (organizationId?: string, days?: number) =>
      ['reports', 'evaluations', organizationId ?? '__all__', days ?? '__ever__'] as const,
    /** Tentativi delle simulazioni tecniche, l'altra metà della dashboard. */
    simulations: (organizationId?: string, days?: number) =>
      ['reports', 'simulations', organizationId ?? '__all__', days ?? '__ever__'] as const,
  },
  /** I quadri d'insieme su una persona: una voce per persona, e dentro
   *  tutte le versioni scritte su di lei, dalla più recente. */
  debriefings: {
    byUser: (userId: string) => ['debriefings', userId] as const,
  },
  training: {
    all: ['training'] as const,
    /** I percorsi componibili, cioè i modelli fatti di tappe. */
    paths: (organizationId?: string) => ['training', 'paths', organizationId ?? '__all__'] as const,
    /** Percorsi affidati alle persone, visti da un admin. */
    assignments: (organizationId?: string, pathId?: string) =>
      ['training', 'assignments', organizationId ?? '__all__', pathId ?? '__all__'] as const,
    /** I percorsi di chi sta guardando, per la striscia in home. */
    mine: ['training', 'mine'] as const,
    /** Di cosa può essere fatta una tappa, in un'organizzazione. */
    assignableContent: (organizationId: string) =>
      ['training', 'assignable-content', organizationId] as const,
    /** Chi può ricevere un percorso. */
    assignableUsers: (organizationId: string) =>
      ['training', 'assignable-users', organizationId] as const,
  },
  simulations: {
    all: ['simulations'] as const,
    /** Le simulazioni che si possono svolgere. */
    list: ['simulations', 'list'] as const,
    detail: (id: string) => ['simulations', 'detail', id] as const,
    /** I propri tentativi su una simulazione. */
    attempts: (simulationId: string) => ['simulations', 'attempts', simulationId] as const,
    /** L'esito di un tentativo, con le spiegazioni. */
    attempt: (id: string) => ['simulations', 'attempt', id] as const,
    /** Tutti i tentativi di una simulazione, visti da un admin. */
    results: (simulationId: string) => ['simulations', 'results', simulationId] as const,
    /** L'elenco di gestione, bozze comprese. */
    adminList: ['simulations', 'admin-list'] as const,
    adminDetail: (id: string) => ['simulations', 'admin-detail', id] as const,
  },
  comparison: {
    all: ['comparison'] as const,
    /** Persone di cui un admin può leggere i tentativi. */
    people: ['comparison', 'people'] as const,
    attempts: (subjectId?: string) => ['comparison', 'attempts', subjectId ?? '__me__'] as const,
    /** I test tecnici della stessa persona, l'altra prova da confrontare. */
    simulationAttempts: (subjectId?: string) =>
      ['comparison', 'simulation-attempts', subjectId ?? '__me__'] as const,
  },
  notifications: ['notifications'] as const,
  /** Elenco delle voci disponibili per gli avatar. */
  voices: ['voices'] as const,
  /** Anteprima del prompt che una scheda persona produce, per canale. */
  personaPrompt: (profile: Record<string, string>, channel: string) =>
    ['persona-prompt', channel, profile] as const,
} as const
