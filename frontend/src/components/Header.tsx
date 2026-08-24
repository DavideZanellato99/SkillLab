/* La testata della galleria: cosa sono gli avatar, e quanti ce n'è.
 *
 * I due numeri li legge da sé. Prima glieli passava la galleria, che li
 * calcolava sulla lista che aveva a schermo e li rimandava in su con una
 * callback: era un giro inutile (due render in più a ogni cambio di filtro)
 * e diceva la cosa sbagliata, perché scegliendo una categoria il numero
 * sotto "Avatar" calava, come se il catalogo si fosse rimpicciolito.
 *
 * Qui contano sempre il catalogo intero, che è quello che la testata sta
 * presentando: quanti ce n'è di quelli scelti lo dice la griglia sotto,
 * mostrandoli. Le due query sono le stesse della galleria e stanno nella
 * stessa cache, quindi non c'è nessuna chiamata in più. */

import { useAvatars, useCategories } from '../hooks/useAvatars'

const statValueCls =
  'font-heading text-3xl font-extrabold bg-gradient-to-br from-violet-600 to-cyan-500 bg-clip-text text-transparent max-md:text-2xl'
const statLabelCls = 'mt-0.5 text-xs uppercase tracking-widest text-slate-500'

/** Il numero, o un segnaposto finché non si sa: uno zero che poi diventa
 *  dodici si legge come un catalogo vuoto. */
function Stat({ value, label, isLoading }: { value: number; label: string; isLoading: boolean }) {
  return (
    <div className="text-center">
      <div className={statValueCls}>{isLoading ? '…' : value}</div>
      <div className={statLabelCls}>{label}</div>
    </div>
  )
}

export default function Header() {
  const { data: avatars = [], isLoading: loadingAvatars } = useAvatars()
  const { data: categories = [], isLoading: loadingCategories } = useCategories()

  return (
    <section
      className="relative overflow-hidden px-8 pb-12 pt-16 text-center max-md:px-4 max-md:pb-8 max-md:pt-12"
      id="hero"
    >
      {/* Radial glow behind the hero */}
      <div
        className="pointer-events-none absolute -top-1/2 left-1/2 z-0 h-[800px] w-[800px] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,rgba(124,58,237,0.12)_0%,rgba(6,182,212,0.06)_30%,transparent_60%)]"
        aria-hidden="true"
      />

      <div className="relative z-10">
        <h1 className="mb-4 animate-fade-in-up font-heading text-[clamp(2.5rem,6vw,4rem)] font-extrabold leading-[1.1] [animation-delay:0.1s]">
          Scegli il tuo{' '}
          <span className="animate-gradient-shift bg-gradient-to-br from-violet-600 to-cyan-500 bg-[length:200%_auto] bg-clip-text text-transparent">
            Avatar
          </span>
        </h1>

        <p className="mx-auto max-w-[600px] animate-fade-in-up text-[clamp(1rem,2vw,1.2rem)] font-light leading-relaxed text-slate-400 [animation-delay:0.2s]">
          Ogni avatar è un interlocutore simulato con personalità, emozioni e uno scenario da
          affrontare. Seleziona l'interlocutore con cui esercitarti e avvia la chiamata.
        </p>

        <div className="mb-8 mt-6 flex animate-fade-in-up justify-center gap-12 px-8 py-6 [animation-delay:0.4s] max-md:gap-6">
          <Stat value={avatars.length} label="Avatar" isLoading={loadingAvatars} />
          <Stat value={categories.length} label="Categorie" isLoading={loadingCategories} />
        </div>
      </div>
    </section>
  )
}
