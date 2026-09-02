/* Cosa racconta la guida introduttiva, e a chi.
 *
 * I passi sono dati, non markup: il riquadro che li mostra è uno solo, e
 * quello che cambia fra un ruolo e l'altro è questo elenco. Chi amministra e
 * chi si allena non fanno le stesse cose, quindi non ricevono la stessa
 * guida: la prima parla di comporre, assegnare e controllare, la seconda di
 * allenarsi e di rivedere i propri risultati.
 *
 * Il super admin resta fuori e riceve un elenco vuoto, che è il modo in cui
 * la guida non parte: sta sopra i tenant e non è la persona che va presa per
 * mano al primo ingresso.
 *
 * Ogni passo indica l'elemento di cui parla con un selettore, e quell'elemento
 * è quello vero della pagina: le voci di navigazione si dichiarano con
 * `data-tour` (vedi `NavbarLink`), le tre cose che escono dall'angolo destro
 * della barra hanno già un id loro. Un passo può anche non avere ancora, e
 * allora il riquadro si mette al centro: il benvenuto e il commiato non
 * parlano di un punto dello schermo.
 *
 * Un'ancora che non si trova non è un errore: sotto i 1024px le sezioni si
 * ritirano in un pannello e la voce in fila non esiste. Il passo resta e si
 * legge al centro, perché quello che spiega vale comunque. */

import type { ComponentType } from 'react'
import type { AuthUser } from '../services/auth'
import { isStandardUser } from '../services/auth'
import type { IconProps } from './icons'
import {
  ChartIcon,
  ChecklistIcon,
  CompareIcon,
  DashboardIcon,
  GridIcon,
  InfoIcon,
  SparkleIcon,
  TargetIcon,
  UserIcon,
} from './icons'

export interface TutorialStep {
  /** Identifica il passo, e distingue i riquadri fra loro per React. */
  id: string
  title: string
  body: string
  Icon: ComponentType<IconProps>
  /** L'elemento da illuminare. Assente per i passi che non parlano di un
   *  punto preciso dello schermo. */
  anchor?: string
  /** Il passo parla di una voce che sta nel menu del proprio account: il menu
   *  va aperto, altrimenti si illuminerebbe il nulla. */
  opensUserMenu?: boolean
}

/** Il selettore di una voce di navigazione, dichiarato dalla voce stessa. */
const navAnchor = (to: string) => `[data-tour="${to}"]`

const BELL = '#notifications-trigger'
const ACCOUNT = '#user-menu-trigger'

/* Il commiato è lo stesso per tutti: dice dove si ritrova la guida, che è
 * l'unica cosa che serve sapere dopo averla letta. */
const closing: TutorialStep = {
  id: 'fine',
  title: 'Puoi rileggerla quando vuoi',
  body: 'La guida resta a disposizione nel tuo profilo, in fondo alla pagina. Da lì riparte dal primo passo tutte le volte che ti serve.',
  Icon: SparkleIcon,
}

function userSteps(): TutorialStep[] {
  return [
    {
      id: 'benvenuto',
      title: 'Benvenuto in SkillLab',
      body: 'Qui ti alleni a condurre una conversazione professionale, parlando con interlocutori simulati e misurandoti sulle procedure della tua organizzazione. Bastano pochi passi per sapere dove sta ogni cosa.',
      Icon: SparkleIcon,
    },
    {
      id: 'galleria',
      title: 'Galleria Avatar',
      body: 'Ogni avatar è un interlocutore con la sua storia e il suo carattere. Lo apri, scegli se scrivergli o telefonargli, e a conversazione chiusa ricevi una valutazione sui criteri su cui ti stai allenando.',
      Icon: GridIcon,
      anchor: navAnchor('/app'),
    },
    {
      id: 'simulatore',
      title: 'Simulatore Tecnico',
      body: 'I test sulle procedure della tua organizzazione. Ogni tentativo estrae le sue domande, e alla consegna trovi subito il punteggio e la correzione risposta per risposta.',
      Icon: ChecklistIcon,
      anchor: navAnchor('/app/simulatore'),
    },
    {
      id: 'percorsi',
      title: 'I tuoi percorsi',
      body: 'Le tappe che il tuo formatore ti ha assegnato, da superare in ordine: la successiva si apre quando hai chiuso la precedente, e la mappa mostra a che punto sei arrivato.',
      Icon: TargetIcon,
      anchor: navAnchor('/app/percorsi'),
    },
    {
      id: 'confronto',
      title: 'Confronto',
      body: "Due tuoi tentativi affiancati, per vedere cosa è cambiato fra la prima volta e l'ultima: i punteggi criterio per criterio, e le conversazioni una accanto all'altra.",
      Icon: CompareIcon,
      anchor: navAnchor('/app/confronto'),
    },
    {
      id: 'notifiche',
      title: 'Notifiche',
      body: 'Qui arrivano le tappe che ti vengono assegnate, quelle che si sbloccano, le scadenze vicine e le revisioni che il tuo formatore pubblica sulle tue conversazioni.',
      Icon: InfoIcon,
      anchor: BELL,
    },
    {
      id: 'account',
      title: 'Il tuo account',
      body: 'Da qui apri il tuo profilo, cambi la password e scarichi una copia dei dati che la piattaforma conserva sul tuo conto.',
      Icon: UserIcon,
      anchor: ACCOUNT,
    },
    closing,
  ]
}

function adminSteps(): TutorialStep[] {
  return [
    {
      id: 'benvenuto',
      title: 'Benvenuto in SkillLab',
      body: 'Su questa piattaforma la tua organizzazione si allena a condurre conversazioni professionali. Come amministratore prepari il materiale su cui esercitarsi, lo affidi alle persone e ne segui i risultati.',
      Icon: SparkleIcon,
    },
    {
      id: 'dashboard',
      title: 'Dashboard',
      body: 'Il riepilogo della tua organizzazione: i punteggi delle conversazioni valutate e dei test consegnati, nel complesso oppure su una singola persona.',
      Icon: DashboardIcon,
      anchor: navAnchor('/app/admin/dashboard'),
    },
    {
      id: 'galleria',
      title: 'Galleria Avatar',
      body: 'Gli interlocutori a disposizione della tua organizzazione. Puoi provarli in prima persona, esattamente come li incontra chi stai formando.',
      Icon: GridIcon,
      anchor: navAnchor('/app'),
    },
    {
      id: 'simulazioni',
      title: 'Gestione Simulazioni',
      body: 'Qui scrivi i test tecnici della tua organizzazione, a mano oppure ricavandoli da un documento aziendale, e li pubblichi quando sono pronti.',
      Icon: ChecklistIcon,
      anchor: navAnchor('/app/admin/simulations'),
      opensUserMenu: true,
    },
    {
      id: 'gestione-percorsi',
      title: 'Gestione Percorsi',
      body: 'Un percorso è una sequenza di tappe da superare in ordine. Lo componi qui, gli dai scadenze e criteri da raggiungere, e lo affidi alle persone della tua organizzazione.',
      Icon: TargetIcon,
      anchor: navAnchor('/app/admin/training'),
      opensUserMenu: true,
    },
    {
      id: 'report',
      title: 'Report Attività',
      body: "L'attività di ogni persona: le conversazioni con gli avatar e le simulazioni consegnate. È da qui che rileggi una conversazione e correggi la valutazione automatica.",
      Icon: ChartIcon,
      anchor: navAnchor('/app/admin/report'),
      opensUserMenu: true,
    },
    {
      id: 'confronto',
      title: 'Confronto',
      body: "Due tentativi della stessa persona affiancati, per vedere cosa è cambiato fra l'uno e l'altro. Scegli tu chi guardare, fra le persone della tua organizzazione.",
      Icon: CompareIcon,
      anchor: navAnchor('/app/confronto'),
    },
    closing,
  ]
}

/** I passi che spettano a chi sta guardando. Vuoto per il super admin, e
 *  vuoto vuol dire che la guida non compare. */
export function tutorialSteps(user: AuthUser | null): TutorialStep[] {
  if (isStandardUser(user)) return userSteps()
  if (user?.ruolo === 'organization_admin') return adminSteps()
  return []
}

/** Se a questo ruolo la guida spetta. Lo chiede il proprio profilo, che
 *  offre di rivederla soltanto a chi l'ha ricevuta. */
export const hasTutorial = (user: AuthUser | null): boolean => tutorialSteps(user).length > 0
