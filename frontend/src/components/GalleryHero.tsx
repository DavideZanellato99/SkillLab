/* La testata di una galleria: cosa si sta guardando, in una riga, e i due
 * numeri che dicono quanto ce n'è.
 *
 * Nasce dalla testata della galleria degli avatar e si è spostata qui quando
 * è servita anche al simulatore tecnico: sono due schermate che si aprono
 * dalla stessa barra e presentano un catalogo, e due testate scritte due
 * volte sarebbero due testate che prima o poi non si somigliano più.
 *
 * I numeri contano sempre il catalogo intero, che è quello che la testata sta
 * presentando: quanti ne restano dopo un filtro lo dice la griglia sotto,
 * mostrandoli. Chi la usa passa i conteggi che ha già in mano, così la
 * testata non chiede niente per conto proprio.
 *
 * La spaziatura la decide chi la mette in pagina: qui sotto sta una volta il
 * `main` di una schermata e una volta la fascia sopra di esso, e le due
 * hanno bisogno di margini diversi. */

interface HeroStat {
  value: number
  label: string
  /** Finché non si sa, al posto del numero sta un segnaposto. */
  isLoading?: boolean
}

interface GalleryHeroProps {
  /** La parte del titolo in bianco. */
  title: string
  /** La parola in fondo al titolo, quella colorata. */
  highlight: string
  description: string
  stats: HeroStat[]
  /** Margini e imbottitura, che cambiano da una schermata all'altra. */
  className?: string
  id?: string
}

const statValueCls =
  'font-heading text-3xl font-extrabold bg-gradient-to-br from-violet-600 to-cyan-500 bg-clip-text text-transparent max-md:text-2xl'
const statLabelCls = 'mt-0.5 text-xs uppercase tracking-widest text-slate-500'

/** Il numero, o un segnaposto finché non si sa: uno zero che poi diventa
 *  dodici si legge come un catalogo vuoto. */
function Stat({ value, label, isLoading }: HeroStat) {
  return (
    <div className="text-center">
      <div className={statValueCls}>{isLoading ? '…' : value}</div>
      <div className={statLabelCls}>{label}</div>
    </div>
  )
}

export default function GalleryHero({
  title,
  highlight,
  description,
  stats,
  className = '',
  id,
}: GalleryHeroProps) {
  return (
    <section className={`relative overflow-hidden text-center ${className}`} id={id}>
      {/* L'alone dietro la testata */}
      <div
        className="pointer-events-none absolute -top-1/2 left-1/2 z-0 h-[800px] w-[800px] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,rgba(124,58,237,0.12)_0%,rgba(6,182,212,0.06)_30%,transparent_60%)]"
        aria-hidden="true"
      />

      <div className="relative z-10">
        <h1 className="mb-4 animate-fade-in-up font-heading text-[clamp(2.5rem,6vw,4rem)] font-extrabold leading-[1.1] [animation-delay:0.1s]">
          {title}{' '}
          <span className="animate-gradient-shift bg-gradient-to-br from-violet-600 to-cyan-500 bg-[length:200%_auto] bg-clip-text text-transparent">
            {highlight}
          </span>
        </h1>

        <p className="mx-auto max-w-[600px] animate-fade-in-up text-[clamp(1rem,2vw,1.2rem)] font-light leading-relaxed text-slate-400 [animation-delay:0.2s]">
          {description}
        </p>

        <div className="mb-8 mt-6 flex animate-fade-in-up justify-center gap-12 px-8 py-6 [animation-delay:0.4s] max-md:gap-6">
          {stats.map((stat) => (
            <Stat key={stat.label} {...stat} />
          ))}
        </div>
      </div>
    </section>
  )
}
