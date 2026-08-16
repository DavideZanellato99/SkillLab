/* Il fondo delle pagine pubbliche: mappa delle sezioni, accesso e le
 * informazioni di conformità che chi valuta l'adozione si aspetta di trovare
 * senza doverle chiedere.
 *
 * Esiste solo prima dell'accesso: dentro l'applicazione ogni schermata
 * finisce con i propri dati, e un piè di pagina con la mappa del sito
 * pubblico sarebbe un secondo menu che non porta da nessuna parte. */

import { Link } from 'react-router'
import { PUBLIC_SECTIONS } from './publicSections'
import { openLogin } from './openLogin'

const linkCls =
  'text-[0.85rem] text-slate-500 no-underline transition hover:text-violet-400 text-left'

export default function PublicFooter() {
  return (
    <footer className="relative border-t border-white/8 bg-white/[0.02] backdrop-blur-xl">
      <div className="mx-auto grid max-w-[1120px] grid-cols-[1.4fr_1fr_1fr] gap-12 px-6 py-14 max-lg:grid-cols-2 max-md:grid-cols-1 max-md:gap-8 max-md:py-12">
        <div>
          <Link
            to="/"
            className="mb-4 flex items-center gap-2 text-slate-100 no-underline"
            id="footer-logo"
          >
            <div className="flex h-[38px] w-[38px] items-center justify-center rounded-xl border border-violet-600/20 bg-violet-600/10">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <defs>
                  <linearGradient id="footerLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#7c3aed" />
                    <stop offset="100%" stopColor="#06b6d4" />
                  </linearGradient>
                </defs>
                <path
                  d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                  stroke="url(#footerLogoGrad)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="font-heading text-xl font-bold tracking-tight">
              Skill
              <span className="bg-gradient-to-br from-violet-600 to-cyan-500 bg-clip-text text-transparent">
                Lab
              </span>
            </span>
          </Link>
          <p className="max-w-[320px] text-sm leading-relaxed text-slate-500">
            Piattaforma di formazione conversazionale per le aziende: simulazioni vocali e scritte,
            test sulle procedure interne, valutazione della prestazione con revisione del formatore.
          </p>
        </div>

        <nav className="flex flex-col gap-3">
          <h3 className="font-heading text-[0.8rem] font-semibold uppercase tracking-wide text-slate-400">
            La Piattaforma
          </h3>
          {PUBLIC_SECTIONS.map((section) => (
            <Link key={section.path} to={section.path} className={linkCls}>
              {section.label}
            </Link>
          ))}
        </nav>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-[0.8rem] font-semibold uppercase tracking-wide text-slate-400">
            Accesso
          </h3>
          <button
            className={`${linkCls} cursor-pointer border-none bg-transparent p-0`}
            onClick={openLogin}
          >
            Accedi alla piattaforma
          </button>
          <p className="text-[0.85rem] leading-relaxed text-slate-500">
            L&apos;accesso avviene con le credenziali fornite dal proprio amministratore
          </p>
        </div>
      </div>

      <div className="border-t border-white/6">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-3 px-6 py-8 text-xs leading-relaxed text-slate-600">
          <p>
            Riconoscimento vocale, generazione delle risposte e sintesi della voce sono affidati a
            fornitori esterni specializzati, ai quali non vengono trasmessi i dati identificativi
            delle persone in formazione. Registrazioni, conversazioni, test svolti e registro delle
            attività sono soggetti a periodi di conservazione definiti, e ogni utente può scaricare
            i propri dati dalla pagina di profilo.
          </p>
          <p>© {new Date().getFullYear()} SkillLab</p>
        </div>
      </div>
    </footer>
  )
}
