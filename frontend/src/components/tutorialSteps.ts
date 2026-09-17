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
  body: 'La guida resta a disposizione nel tuo profilo, ti basta scendere in fondo alla pagina. Buona fortuna per il tuo percorso di formazione!',
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
      body: 'Ogni avatar è un interlocutore con la sua storia e il suo carattere. Lo selezioni, scegli se gestire il contatto tramite chat o chiamata e a conversazione terminata ricevi una valutazione sui criteri su cui ti stai allenando.',
      Icon: GridIcon,
      anchor: navAnchor('/app'),
    },
    {
      id: 'simulatore',
      title: 'Simulatore Tecnico',
      body: 'I test per metterti alla prova. Una volta terminato visualizzerai il punteggio e la correzione risposta per risposta.',
      Icon: ChecklistIcon,
      anchor: navAnchor('/app/simulatore'),
    },
    {
      id: 'percorsi',
      title: 'I tuoi percorsi',
      body: 'Gli obiettivi che il tuo formatore ti ha assegnato, da superare in ordine, il successivo si sblocca quando hai completato il precedente. La mappa mostra a che punto sei arrivato.',
      Icon: TargetIcon,
      anchor: navAnchor('/app/percorsi'),
    },
    {
      id: 'progressi',
      title: 'Progressi',
      body: "Come stai andando, la curva dei tuoi voti nel tempo, i criteri su cui perdi più punti e l'elenco delle prove che hai già svolto.",
      Icon: ChartIcon,
      anchor: navAnchor('/app/progressi'),
    },
    {
      id: 'confronto',
      title: 'Confronto',
      body: 'Da qua puoi mettere a confronto due tentativi da te effettuati. Il miglioramente parte dalla consapevolezza, riuscire a confrontare tutti i tuoi tentativi ti darà una marcia in più per affrontare le sfide del percorso.',
      Icon: CompareIcon,
      anchor: navAnchor('/app/confronto'),
    },
    {
      id: 'notifiche',
      title: 'Notifiche',
      body: "Tieni sempre d'occhio le notifiche! Il tuo formatore potrebbe volerti comunicare qualcosa o semplicemente un obiettivo del percorso è stato aggiornato.",
      Icon: InfoIcon,
      anchor: BELL,
    },
    {
      id: 'account',
      title: 'Il tuo account',
      body: 'Da qui gestisci il tuo profilo, imposta una password sicura e se temi che qualcuno ne sia venuto a conoscenza cambiala!',
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
      body: 'Questa piattaforma è un ambiente digitale dedicato alla formazione delle risorse. Come trainer gestisci il materiale su cui esercitarsi, assegni obiettivi alle risorse e ne segui i risultati.',
      Icon: SparkleIcon,
    },
    {
      id: 'galleria',
      title: 'Galleria Avatar',
      body: "Gli interlocutori a disposizione della tua organizzazione. Ogni avatar simula una casistica reale specificata nella descrizione. Puoi provarli in prima persona vivendo un'esperienza analoga a quella dei discenti.",
      Icon: GridIcon,
      anchor: navAnchor('/app'),
    },
    {
      id: 'simulatore',
      title: 'Simulatore Tecnico',
      body: 'Questa sezione riporta i test pubblicati. Anche in questo caso hai la possibilità di provarli ed eventualmente perfezionarli prima di renderli disponibili agli utenti.',
      Icon: ChecklistIcon,
      anchor: navAnchor('/app/simulatore'),
    },
    {
      id: 'confronto',
      title: 'Confronto',
      body: 'Da questa sezione puoi mettere a confronto due tentativi effettuati dalla stessa risorsa. Analizza i progressi e identifica eventuali aree di miglioramento.',
      Icon: CompareIcon,
      anchor: navAnchor('/app/confronto'),
    },
    {
      id: 'dashboard',
      title: 'Dashboard',
      body: 'Analytics della tua aula o di una singola risorsa: punteggi medi delle conversazioni e delle esercitazioni, analisi di trend e molto altro.',
      Icon: DashboardIcon,
      anchor: navAnchor('/app/admin/dashboard'),
    },
    {
      id: 'account',
      title: 'Il tuo account',
      body: "Il pulsante in alto a destra apre la sezione di gestione, fondamentale per creare o modificare esercitazioni, assegnare obiettivi e interrogare il sistema circa l'andamento di singole risorse.",
      Icon: UserIcon,
      anchor: ACCOUNT,
    },
    {
      id: 'simulazioni',
      title: 'Gestione Simulazioni',
      body: 'Da qua crei nuove esercitazioni o aggiorni quelle esistenti. Scegli tu la tipologia e la modalità di creazione delle domande.',
      Icon: ChecklistIcon,
      anchor: navAnchor('/app/admin/simulations'),
      opensUserMenu: true,
    },
    {
      id: 'gestione-percorsi',
      title: 'Gestione Percorsi',
      body: 'Un percorso è una sequenza di obiettivi da superare in ordine. Lo crei qui, gli dai scadenze e criteri da raggiungere e scegli tu a chi assegnarlo.',
      Icon: TargetIcon,
      anchor: navAnchor('/app/admin/training'),
      opensUserMenu: true,
    },
    {
      id: 'report',
      title: 'Report Attività',
      body: "L'attività di ogni persona: le conversazioni con gli avatar e le esercitazioni consegnate. È da qui che rileggi e/o riascolti una conversazione e correggi la valutazione assegnata dal sistema.",
      Icon: ChartIcon,
      anchor: navAnchor('/app/admin/report'),
      opensUserMenu: true,
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
