/* I pezzi con cui sono costruite le pagine pubbliche.
 *
 * Stesso motivo di [PageLayout](../PageLayout.tsx) dentro l'applicazione: le
 * pagine sono cinque, e senza un posto solo in cui stanno le card, le
 * intestazioni e i pulsanti, gli stessi valori finirebbero ricopiati cinque
 * volte con margini che divergono.
 *
 * Qui non c'è nessuna chiamata al server: il sito si legge senza essere
 * nessuno, quindi non ha dati da chiedere. */

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { openLogin } from './openLogin'
import { ArrowRightIcon } from './publicIcons'

export const primaryBtnCls =
  'inline-flex cursor-pointer items-center gap-2 rounded-full border-none bg-gradient-to-r from-violet-600 to-cyan-500 px-7 py-3.5 text-[0.95rem] font-semibold text-white no-underline shadow-[0_10px_30px_-10px_rgba(124,58,237,0.9)] transition duration-300 hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_18px_44px_-12px_rgba(124,58,237,0.95)]'

export const ghostBtnCls =
  'inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-7 py-3.5 text-[0.95rem] font-medium text-slate-300 no-underline backdrop-blur transition duration-300 hover:border-white/25 hover:bg-white/[0.08] hover:text-white'

/* Il vetro di cui è fatto tutto: un bordo appena visibile, una velatura in
   gradiente dall'alto e la sfocatura di quello che sta dietro. */
export const cardCls =
  'relative overflow-hidden rounded-3xl border border-white/8 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-7 backdrop-blur-xl'

export const cardIconCls =
  'inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600/30 to-cyan-500/15 text-violet-300 ring-1 ring-inset ring-white/10'

export function LoginButton({ children = 'Accedi' }: { children?: ReactNode }) {
  return (
    <button className={primaryBtnCls} onClick={openLogin}>
      {children}
      <ArrowRightIcon size={18} />
    </button>
  )
}

/* Il contenuto compare quando entra nello schermo, invece che tutto insieme
   al caricamento: su una pagina lunga un'animazione già finita prima di
   arrivarci è un'animazione sprecata.
   Dove l'osservatore non esiste il contenuto è visibile e basta, perché una
   pagina invisibile è un guasto molto peggiore di una pagina immobile. */
export function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    if (shown || !ref.current) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setShown(true)
      },
      { rootMargin: '0px 0px -10% 0px' },
    )
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [shown])

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${
        shown ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

/* Lo sfondo: due macchie di luce che si spostano lentissime e una griglia
   che si dissolve verso il basso. Decorative, quindi fuori dal flusso e
   trasparenti al mouse. */
function Backdrop() {
  return (
    <>
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 animate-aurora rounded-full bg-violet-600/20 blur-[140px]" />
      <div className="pointer-events-none absolute right-[-200px] top-[600px] h-[420px] w-[420px] animate-aurora rounded-full bg-cyan-500/12 blur-[130px] [animation-delay:-8s]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[900px] [background-image:linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)] [-webkit-mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]" />
    </>
  )
}

export function PublicPage({ children }: { children: ReactNode }) {
  return (
    <div className="relative overflow-hidden">
      <Backdrop />
      {children}
    </div>
  )
}

interface HeroProps {
  eyebrow: ReactNode
  title: ReactNode
  /** La coda del titolo, quella che prende il gradiente. */
  highlight: string
  description: ReactNode
  actions?: ReactNode
}

export function Hero({ eyebrow, title, highlight, description, actions }: HeroProps) {
  return (
    <section className="relative mx-auto max-w-[960px] px-6 pb-20 pt-28 text-center max-md:pt-16">
      <span className="mb-7 inline-flex animate-fade-in-up items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-[0.78rem] font-medium tracking-wide text-slate-300 backdrop-blur">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-400" />
        </span>
        {eyebrow}
      </span>

      <h1 className="mb-6 animate-fade-in-up font-heading text-6xl font-bold leading-[1.05] tracking-[-0.035em] text-slate-50 [animation-delay:0.1s] max-lg:text-5xl max-md:text-4xl">
        {title}{' '}
        <span className="animate-gradient-shift bg-gradient-to-r from-violet-400 via-cyan-300 to-violet-400 bg-[length:200%_auto] bg-clip-text text-transparent">
          {highlight}
        </span>
      </h1>

      <p className="mx-auto mb-10 max-w-[620px] animate-fade-in-up text-[1.05rem] leading-relaxed text-slate-400 [animation-delay:0.2s]">
        {description}
      </p>

      {actions && (
        <div className="flex animate-fade-in-up flex-wrap items-center justify-center gap-3 [animation-delay:0.3s]">
          {actions}
        </div>
      )}
    </section>
  )
}

interface SectionProps {
  id?: string
  /** La riga in maiuscoletto sopra il titolo: dice di cosa si parla. */
  kicker?: string
  title: ReactNode
  description?: ReactNode
  children: ReactNode
}

export function Section({ id, kicker, title, description, children }: SectionProps) {
  return (
    <section id={id} className="relative mx-auto max-w-[1120px] scroll-mt-24 px-6 pb-24">
      <Reveal>
        <div className="mb-10 flex flex-col gap-3">
          {kicker && (
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-violet-400">
              {kicker}
            </span>
          )}
          <h2 className="max-w-[760px] font-heading text-[2.15rem] font-bold leading-tight tracking-[-0.02em] text-slate-50 max-md:text-2xl">
            {title}
          </h2>
          {description && (
            <p className="max-w-[620px] leading-relaxed text-slate-400">{description}</p>
          )}
        </div>
        {children}
      </Reveal>
    </section>
  )
}

/* La griglia asimmetrica: sei colonne, e ogni card dichiara quante ne
   occupa. Card tutte uguali in fila per tre sono la forma più prevedibile
   che una pagina possa avere. */
const SPANS = {
  third: 'col-span-2 max-lg:col-span-3 max-md:col-span-6',
  half: 'col-span-3 max-md:col-span-6',
  twoThirds: 'col-span-4 max-md:col-span-6',
  full: 'col-span-6',
} as const

export function Bento({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-6 gap-5">{children}</div>
}

interface FeatureCardProps {
  icon?: ReactNode
  title: ReactNode
  children: ReactNode
  span?: keyof typeof SPANS
  /** Il riquadro in evidenza: sfondo più caldo e bordo acceso. */
  accent?: boolean
}

export function FeatureCard({
  icon,
  title,
  children,
  span = 'third',
  accent = false,
}: FeatureCardProps) {
  return (
    <div
      className={`group ${SPANS[span]} ${cardCls} transition duration-300 hover:-translate-y-1 hover:border-violet-500/40 ${
        accent ? 'border-violet-500/25 from-violet-600/12 to-cyan-500/[0.04]' : ''
      }`}
    >
      <div className="pointer-events-none absolute -right-20 -top-20 h-44 w-44 rounded-full bg-violet-600/25 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100" />
      <div className="relative">
        {icon && <div className={`${cardIconCls} mb-5`}>{icon}</div>}
        <h3 className="mb-2 font-heading text-[1.05rem] font-semibold tracking-tight text-slate-50">
          {title}
        </h3>
        <div className="text-[0.9rem] leading-relaxed text-slate-400">{children}</div>
      </div>
    </div>
  )
}

/** I numeri che descrivono il prodotto, in fila e separati da un filetto. */
export function StatStrip({ items }: { items: { value: string; label: string }[] }) {
  return (
    <section className="relative mx-auto max-w-[1120px] px-6 pb-24">
      <Reveal>
        <div className="grid grid-cols-4 divide-x divide-white/8 rounded-3xl border border-white/8 bg-white/[0.02] px-4 py-9 backdrop-blur-xl max-lg:grid-cols-2 max-lg:gap-y-8 max-lg:divide-x-0 max-md:grid-cols-1">
          {items.map((item) => (
            <div key={item.value} className="px-6 text-center">
              <div className="bg-gradient-to-br from-violet-400 to-cyan-400 bg-clip-text font-heading text-[2.6rem] font-bold leading-none tracking-tight text-transparent">
                {item.value}
              </div>
              <p className="mt-2 text-[0.85rem] leading-relaxed text-slate-500">{item.label}</p>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  )
}

export interface Step {
  title: string
  text: string
}

export function Steps({ items }: { items: Step[] }) {
  return (
    <div className="grid grid-cols-3 gap-5 max-md:grid-cols-1">
      {items.map((step, i) => (
        <div
          key={step.title}
          className={`${cardCls} transition duration-300 hover:border-white/15`}
        >
          <span className="mb-4 block bg-gradient-to-br from-violet-400 to-cyan-400/40 bg-clip-text font-heading text-5xl font-bold leading-none tracking-tight text-transparent">
            {String(i + 1).padStart(2, '0')}
          </span>
          <h3 className="mb-2 font-heading text-[1.05rem] font-semibold tracking-tight text-slate-50">
            {step.title}
          </h3>
          <p className="text-[0.9rem] leading-relaxed text-slate-400">{step.text}</p>
        </div>
      ))}
    </div>
  )
}

/** Un elenco di voci brevi, dove una tabella sarebbe stata di troppo. */
export function PillList({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[0.85rem] text-slate-300 backdrop-blur transition hover:border-violet-500/40 hover:text-slate-50"
        >
          {item}
        </span>
      ))}
    </div>
  )
}

interface SpecTableProps {
  head: ReactNode[]
  rows: ReactNode[][]
}

export function SpecTable({ head, rows }: SpecTableProps) {
  return (
    <div className="overflow-x-auto rounded-3xl border border-white/8 bg-white/[0.02] backdrop-blur-xl">
      <table className="w-full border-collapse text-left text-[0.9rem]">
        <thead>
          <tr className="border-b border-white/8">
            {head.map((cell, i) => (
              <th
                key={i}
                className="px-6 py-4 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-slate-500"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-white/6 transition-colors last:border-b-0 hover:bg-white/[0.03]"
            >
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`px-6 py-4 align-top leading-relaxed ${
                    j === 0 ? 'font-medium text-slate-100' : 'text-slate-400'
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Un criterio con il suo peso: la barra è il peso, non il punteggio. */
export function WeightRow({ label, weight }: { label: string; weight: number }) {
  return (
    <div className="group flex items-center gap-5 max-md:flex-col max-md:items-start max-md:gap-1.5">
      <span className="w-[330px] shrink-0 text-[0.9rem] text-slate-300 max-md:w-full">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/8 max-md:w-full">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-all duration-1000 ease-out"
          style={{ width: `${(weight / 22) * 100}%` }}
        />
      </div>
      <span className="w-11 shrink-0 text-right font-heading text-[0.9rem] font-bold text-slate-100 max-md:text-left">
        {weight}%
      </span>
    </div>
  )
}

export function SectionLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 text-[0.85rem] font-medium text-violet-300 no-underline transition hover:gap-2.5 hover:text-cyan-300"
    >
      {children}
      <ArrowRightIcon size={15} />
    </Link>
  )
}

export function CtaSection({
  title,
  text,
  label = 'Accedi',
}: {
  title: ReactNode
  text: ReactNode
  label?: string
}) {
  return (
    <section className="relative mx-auto max-w-[1120px] px-6 pb-28">
      <Reveal>
        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-violet-600/20 via-white/[0.03] to-cyan-500/15 p-16 text-center backdrop-blur-xl max-md:p-10">
          <div className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-52 w-[70%] rounded-full bg-violet-600/30 blur-[110px]" />
          <div className="relative">
            <h2 className="mb-3 font-heading text-[2rem] font-bold tracking-[-0.02em] text-slate-50 max-md:text-2xl">
              {title}
            </h2>
            <p className="mx-auto mb-8 max-w-[480px] leading-relaxed text-slate-400">{text}</p>
            <div className="flex justify-center">
              <LoginButton>{label}</LoginButton>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  )
}
