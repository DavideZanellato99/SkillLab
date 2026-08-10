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

/* Le tre righe del menu compatto. Sta qui e non fra le icone del sito
 * pubblico, che pure è l'unico posto in cui compare: quelle si scaricano
 * solo entrando in una pagina pubblica, mentre la navbar è sempre montata e
 * se la sarebbe portata dietro tutta per disegnare tre righe. */
export function MenuIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
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
