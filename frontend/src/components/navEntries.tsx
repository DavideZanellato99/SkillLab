/* Le voci di navigazione come dati, invece che come markup ripetuto.
 *
 * La stessa voce si presenta in tre posti: in fila nella barra, dentro il
 * pannello che la sostituisce su schermo stretto, e (per le sezioni di
 * amministrazione) nel menu del profilo. Scritte tre volte sarebbero tre
 * elenchi che prima o poi non si somigliano più: una voce nuova comparirebbe
 * in barra e non nel pannello, e chi apre l'applicazione dal telefono non
 * saprebbe che esiste.
 *
 * Qui c'è cosa si vede e a chi si mostra; come si disegna lo decide chi la
 * riceve, perché una riga a tutta larghezza e una pastiglia in fila non hanno
 * la stessa forma. */

import type { ComponentType } from 'react'
import type { AuthUser } from '../services/auth'
import { isAdmin, isStandardUser, isSuperAdmin } from '../services/auth'
import type { IconProps } from './icons'
import {
  BuildingIcon,
  ChartIcon,
  ChecklistIcon,
  CompareIcon,
  DashboardIcon,
  FileTextIcon,
  GridIcon,
  TargetIcon,
  UserIcon,
  UserPlusIcon,
  UsersIcon,
} from './icons'

export interface NavEntry {
  to: string
  label: string
  Icon: ComponentType<IconProps>
  /** Se la voce va accesa per l'indirizzo che si sta guardando. */
  isActive: (pathname: string) => boolean
}

/** Voce accesa solo sul proprio indirizzo esatto. */
const exact = (path: string) => (pathname: string) => pathname === path

/** Voce accesa anche sulle pagine che stanno dentro la sua: la mappa di un
 *  percorso è dentro i propri percorsi, non accanto. */
const within = (path: string) => (pathname: string) => pathname.startsWith(path)

/** Le sezioni in fila nella barra, nell'ordine in cui si presentano. */
export function mainNavEntries(user: AuthUser | null): NavEntry[] {
  const entries: NavEntry[] = [
    {
      to: '/app',
      label: 'Galleria Avatar',
      Icon: GridIcon,
      /* La chat di un avatar si apre dalla galleria e le appartiene: la voce
         resta accesa mentre si parla, altrimenti nella schermata dove si
         passa più tempo la barra non direbbe più dove si è. */
      isActive: (pathname) => pathname === '/app' || pathname.startsWith('/app/chat'),
    },
    /* Per tutti: le simulazioni della propria organizzazione, e tutte quante
       per il super admin. */
    {
      to: '/app/simulatore',
      label: 'Simulatore Tecnico',
      Icon: ChecklistIcon,
      isActive: within('/app/simulatore'),
    },
  ]

  /* I propri percorsi, per chi si allena. Chi amministra non ne riceve:
     compone e assegna dalla gestione percorsi, che sta nel menu del profilo,
     e questa voce porterebbe a una pagina che il suo ruolo non apre. */
  if (isStandardUser(user)) {
    entries.push({
      to: '/app/percorsi',
      label: 'Percorsi',
      Icon: TargetIcon,
      isActive: within('/app/percorsi'),
    })
  }

  /* Per tutti: lo studente confronta i propri tentativi, un admin quelli
     delle persone del proprio tenant. */
  entries.push({
    to: '/app/confronto',
    label: 'Confronto',
    Icon: CompareIcon,
    isActive: exact('/app/confronto'),
  })

  if (isAdmin(user)) {
    entries.push({
      to: '/app/admin/dashboard',
      label: 'Dashboard',
      Icon: DashboardIcon,
      isActive: exact('/app/admin/dashboard'),
    })
  }

  return entries
}

/* Il menu del profilo arriva a otto voci per il super admin, e otto righe
 * tutte uguali si leggono una per una. Sono raggruppate per cosa si va a
 * fare: la propria scheda, le anagrafiche (chi c'è: persone, organizzazioni,
 * interlocutori), quello che si compone (i test e i percorsi), e quello che
 * si controlla a cose fatte (il rendiconto e il registro). Ogni gruppo che
 * resta vuoto per il ruolo di chi guarda sparisce con il proprio separatore. */
export function profileMenuGroups(user: AuthUser | null): NavEntry[][] {
  const own: NavEntry[] = [
    {
      to: '/app/profile',
      label: 'Il Mio Profilo',
      Icon: UserIcon,
      isActive: exact('/app/profile'),
    },
  ]

  const registries: NavEntry[] = isSuperAdmin(user)
    ? [
        {
          to: '/app/admin',
          label: 'Gestione Utenti',
          Icon: UserPlusIcon,
          isActive: exact('/app/admin'),
        },
        {
          to: '/app/admin/organizations',
          label: 'Gestione Organizzazioni',
          Icon: BuildingIcon,
          isActive: exact('/app/admin/organizations'),
        },
        {
          to: '/app/admin/avatars',
          label: 'Gestione Avatar',
          Icon: UsersIcon,
          isActive: exact('/app/admin/avatars'),
        },
      ]
    : []

  /* Scrivere i test tecnici e comporre i percorsi è di entrambi i ruoli di
     amministrazione: chi amministra una sola organizzazione conosce le
     procedure su cui la sua gente va interrogata. */
  const authoring: NavEntry[] = isAdmin(user)
    ? [
        {
          to: '/app/admin/simulations',
          label: 'Gestione Simulazioni',
          Icon: ChecklistIcon,
          isActive: exact('/app/admin/simulations'),
        },
        {
          to: '/app/admin/training',
          label: 'Gestione Percorsi',
          Icon: TargetIcon,
          isActive: exact('/app/admin/training'),
        },
      ]
    : []

  const oversight: NavEntry[] = []
  if (isAdmin(user)) {
    oversight.push({
      to: '/app/admin/report',
      label: 'Report Attività',
      Icon: ChartIcon,
      isActive: exact('/app/admin/report'),
    })
  }
  if (isSuperAdmin(user)) {
    oversight.push({
      to: '/app/admin/logs',
      label: 'Registro Attività',
      Icon: FileTextIcon,
      isActive: exact('/app/admin/logs'),
    })
  }

  return [own, registries, authoring, oversight].filter((group) => group.length > 0)
}
