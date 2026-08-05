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
 * e chi naviga da tastiera o con uno screen reader deve sentirla come tale. */

interface FilterTabsProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  /** Cosa si sta scegliendo, per chi non vede il gruppo. */
  ariaLabel: string
}

export default function FilterTabs<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: FilterTabsProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex shrink-0 gap-1 rounded-xl border border-white/6 bg-slate-800/50 p-1"
    >
      {options.map((opt) => {
        const isActive = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(opt.value)}
            className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              isActive
                ? 'bg-violet-600/20 text-violet-200 shadow-[inset_0_0_0_1px_rgba(124,58,237,0.35)]'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
