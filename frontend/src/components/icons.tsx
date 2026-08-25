/* Icone SVG usate in più punti dell'app, prima ricopiate riga per riga in
 * ogni pagina che ne aveva bisogno (il solo cestino compariva in dieci posti,
 * a volte 14px, a volte 15px, senza che la differenza volesse dire nulla).
 *
 * Sono tutte disegnate sulla stessa griglia 24x24 con tratto da 2: cambiano
 * solo `size` e `stroke`, così una voce di menu (14px, colore ereditato) e
 * l'icona grande di una modale (24px, colore dell'accento) restano la stessa
 * icona invece di essere due disegni che si somigliano. */

import type { ReactNode } from 'react'

export interface IconProps {
  size?: number
  /** Colore del tratto: di default eredita quello del testo attorno. */
  stroke?: string
  className?: string
}

/* Le voci dei menu kebab sono la misura più frequente, quindi 14 è il default
 * e sono le modali a dover chiedere esplicitamente la misura grande.
 *
 * È esportata perché il sito pubblico disegna altre icone, che non servono
 * dentro l'applicazione e stanno in un file loro: la griglia e il tratto
 * devono restare gli stessi anche là. */
export function IconBase({
  size = 14,
  stroke = 'currentColor',
  className,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  )
}

export function TrashIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </IconBase>
  )
}

/* L'orologio della scadenza di una tappa: sta accanto al termine ovunque
 * compaia, così quella riga si riconosce come termine prima di leggerla. */
export function ClockIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </IconBase>
  )
}

/* Il lucchetto di una tappa che non è ancora il suo turno, e la spunta di
 * quella superata: le due estremità di un percorso a tappe. */
export function LockIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </IconBase>
  )
}

/* La busta del campo email e lo scudo della password da confermare, le due
 * icone dei campi della modale di accesso. */
export function MailIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </IconBase>
  )
}

export function ShieldIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </IconBase>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <polyline points="20 6 9 17 4 12" />
    </IconBase>
  )
}

/* La matita con cui si apre la modifica di una riga, in ogni tabella. */
export function PencilIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </IconBase>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </IconBase>
  )
}

/* Pausa dentro un cerchio: sospendere è reversibile, il cerchio resta chiuso. */
export function SuspendIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="10" y1="15" x2="10" y2="9" />
      <line x1="14" y1="15" x2="14" y2="9" />
    </IconBase>
  )
}

export function ReactivateIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="9 12 11 14 15 10" />
    </IconBase>
  )
}

/* Cerchio sbarrato: la disabilitazione, a differenza della sospensione, chiude. */
export function DisableIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </IconBase>
  )
}

export function PlusIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </IconBase>
  )
}

/* Le due frecce con cui un elemento di un elenco cambia posto: nell'editor
 * di una domanda di ordinamento, e in mano a chi il test lo sta svolgendo.
 * Semplici punte e non frecce intere, perché stanno in bottoni da 24px in
 * fila verticale e un'asta le renderebbe due macchie. */
export function ChevronUpIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <polyline points="18 15 12 9 6 15" />
    </IconBase>
  )
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <polyline points="6 9 12 15 18 9" />
    </IconBase>
  )
}

/* Sagoma con il più accanto: crea un utente, non una cosa qualsiasi. */
export function UserPlusIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="20" y1="8" x2="20" y2="14" />
      <line x1="23" y1="11" x2="17" y2="11" />
    </IconBase>
  )
}

/* Le due forme in cui si può presentare una tappa di un percorso: parlare con
 * qualcuno o rispondere a delle domande. Stanno una accanto all'altra perché
 * sulla mappa si leggono per differenza, in una pastiglia da 12px appesa al
 * nodo: contano le sagome, non i dettagli. */
export function ChatIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M21 11.5a8.38 8.38 0 0 1-9 8.5 9.79 9.79 0 0 1-4-.9L3 21l1.9-5a9.79 9.79 0 0 1-.9-4 8.38 8.38 0 0 1 8.5-9 8.5 8.5 0 0 1 8.5 8.5z" />
    </IconBase>
  )
}

export function ChecklistIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-4" />
      <path d="m9 7 2 2 4-4" />
      <path d="M8 16h8" />
    </IconBase>
  )
}

/* Il meno che sta accanto al più fra i comandi della mappa: rimpicciolire e
 * ingrandire sono lo stesso gesto in due versi, quindi sono lo stesso disegno
 * meno un tratto. */
export function MinusIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <line x1="5" y1="12" x2="19" y2="12" />
    </IconBase>
  )
}

/** I cerchi concentrici del bersaglio: dove si è adesso, sulla mappa. */
export function TargetIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </IconBase>
  )
}

/* Le soglie sui singoli criteri di una tappa: tre cursori a quote diverse,
 * che è la stessa cosa che il pannello fa vedere, cioè un obiettivo solo
 * regolato criterio per criterio invece che in blocco. */
export function SlidersIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </IconBase>
  )
}

/** Il ritorno all'elenco da cui si è aperta una cosa sola. */
export function ArrowLeftIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </IconBase>
  )
}

/* La "i" accanto a un'etichetta: quello che ci sarebbe da sapere sul campo
 * sta nel tooltip che l'icona apre, e non in una riga di testo sotto che
 * occuperebbe spazio anche quando nessuno se lo sta chiedendo. */
export function InfoIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="11" x2="12" y2="16" />
      <line x1="12" y1="8" x2="12" y2="8" />
    </IconBase>
  )
}

export function ResendIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </IconBase>
  )
}

/* Due scintille: **l'ha scritto un modello**. È il segno con cui l'app
 * distingue ovunque quello che ha composto la macchina da quello che ha
 * composto una persona, dalla targhetta dell'origine di una simulazione al
 * bottone che propone un percorso. */
export function SparkleIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z" />
      <path d="M18 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z" />
    </IconBase>
  )
}

/* ── Le icone della barra di navigazione ────────────────────────────────
 *
 * Erano disegnate riga per riga dentro Navbar, una per voce, e la stessa
 * sagoma tornava altrove con un'altra misura: qui stanno sulla griglia di
 * tutte le altre, e la barra le chiama per nome. */

/** I quattro riquadri del catalogo: la galleria degli avatar. */
export function GridIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </IconBase>
  )
}

/* Due colonne di altezza diversa accanto a un asse: due prove messe una
 * accanto all'altra, che è esattamente cosa fa la pagina di confronto. */
export function CompareIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <line x1="12" y1="20" x2="12" y2="4" />
      <rect x="4" y="9" width="5" height="11" rx="1" />
      <rect x="15" y="5" width="5" height="15" rx="1" />
    </IconBase>
  )
}

/** I riquadri sbilanciati di un cruscotto, distinti dalla griglia regolare
 *  della galleria: lì sono tutte celle uguali, qui riquadri diversi. */
export function DashboardIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </IconBase>
  )
}

/** La propria scheda: una sagoma sola, senza il più di chi ne crea una. */
export function UserIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.58-6 8-6s8 2 8 6" />
    </IconBase>
  )
}

/** Il palazzo delle organizzazioni. */
export function BuildingIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 21h18" />
      <path d="M5 21V7l8-4v18" />
      <path d="M19 21V11l-6-4" />
      <line x1="9" y1="9" x2="9" y2="9.01" />
      <line x1="9" y1="12" x2="9" y2="12.01" />
      <line x1="9" y1="15" x2="9" y2="15.01" />
    </IconBase>
  )
}

/** Più sagome insieme: l'anagrafica degli avatar, che sono persone finte
 *  ma pur sempre un gruppo di interlocutori. */
export function UsersIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </IconBase>
  )
}

/** Le tre colonne di un rendiconto: il report delle attività. */
export function ChartIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </IconBase>
  )
}

/** Il foglio scritto del registro di audit. */
export function FileTextIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </IconBase>
  )
}

/** La porta con la freccia che ne esce: chiudere la sessione. */
export function LogoutIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </IconBase>
  )
}

/** Le tre righe che aprono la navigazione dove non ci sta in fila. */
export function MenuIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </IconBase>
  )
}

/** La lente della casella di ricerca e degli elenchi che non hanno dato
 *  nessun risultato. */
export function SearchIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </IconBase>
  )
}

/** Il microfono: la telefonata, che è il gesto principale della galleria. */
export function MicIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </IconBase>
  )
}

/* La freccia che scende sul vassoio: ogni cosa che l'applicazione consegna
 * come file, dal referto in PDF all'audio di una chiamata, dal foglio di
 * calcolo della dashboard alla copia dei propri dati. Era ricopiata in
 * quattro posti, a 13, 15 e 16 pixel, senza che la misura volesse dire
 * niente. */
export function DownloadIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </IconBase>
  )
}
