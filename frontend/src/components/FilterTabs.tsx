/* Il gruppo di pulsanti con cui si sceglie una cosa fra poche, in cima a una
 * schermata che poi si ridisegna intera.
 *
 * Nasce dal selettore di canale della dashboard e si è spostato qui quando è
 * servito il gemello per il tipo di test: due gruppi identici scritti due
 * volte sarebbero due gruppi che prima o poi non si somigliano più, e questi
 * stanno a due centimetri l'uno dall'altro nella stessa barra.
 *
 * Non è una tendina perché le opzioni sono due o tre e la scelta corrente va
 * letta senza aprire niente: qui si cambia spesso e si guarda cosa cambia.
 *
 * `radiogroup` e non una fila di bottoni: è una scelta sola fra alternative,
 * e chi naviga da tastiera o con uno screen reader deve sentirla come tale.
 *
 * Due forme, un componente solo. `compact` è il gruppo stretto in una barra
 * di filtri; `pills` è la fila larga e centrata dei filtri della galleria,
 * che sta in mezzo alla pagina, va a capo quando le categorie sono tante e
 * porta accanto a ogni voce quanti elementi contiene. La galleria le aveva
 * scritte a mano, come pulsanti sciolti e senza nessuna semantica di gruppo. */

interface FilterTabsOption<T extends string> {
  value: T
  label: string
  /** Quanti elementi ci sono dentro questa scelta. Solo per `pills`. */
  count?: number
}

interface FilterTabsProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: FilterTabsOption<T>[]
  /** Cosa si sta scegliendo, per chi non vede il gruppo. */
  ariaLabel: string
  variant?: 'compact' | 'pills'
  /** Il posto del gruppo nella pagina (margini, animazione di ingresso). */
  className?: string
}

const GROUP_CLS = {
  compact: 'flex shrink-0 gap-1 rounded-xl border border-white/6 bg-slate-800/50 p-1',
  pills: 'flex flex-wrap justify-center gap-2 max-[480px]:gap-1',
} as const

const OPTION_CLS = {
  compact: 'cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium transition',
  pills:
    'cursor-pointer rounded-full border px-6 py-2 text-[0.85rem] font-medium tracking-wide transition max-[480px]:px-4 max-[480px]:py-1 max-[480px]:text-[0.8rem]',
} as const

const ACTIVE_CLS = {
  compact: 'bg-violet-600/20 text-violet-200 shadow-[inset_0_0_0_1px_rgba(124,58,237,0.35)]',
  pills: 'border-violet-600 bg-violet-600/15 text-slate-100 shadow-[0_0_20px_rgba(124,58,237,0.2)]',
} as const

const IDLE_CLS = {
  compact: 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
  pills:
    'border-white/6 bg-white/4 text-slate-400 hover:-translate-y-px hover:border-white/12 hover:bg-white/8 hover:text-slate-100',
} as const

export default function FilterTabs<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  variant = 'compact',
  className = '',
}: FilterTabsProps<T>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={`${GROUP_CLS[variant]} ${className}`}>
      {options.map((opt) => {
        const isActive = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(opt.value)}
            className={`${OPTION_CLS[variant]} ${isActive ? ACTIVE_CLS[variant] : IDLE_CLS[variant]}`}
          >
            {opt.label}
            {/* Il numero è di contorno e resta più tenue dell'etichetta, ma
                dentro lo stesso bottone: è quella scelta a contenerne
                tanti, e letto a voce fa parte del suo nome. */}
            {opt.count !== undefined && (
              <span className="ml-2 text-[0.75em] opacity-60">{opt.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
