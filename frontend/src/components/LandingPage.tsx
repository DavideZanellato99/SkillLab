/* Public landing page — the first thing a visitor sees before logging in.
 * Presents the platform in general terms: no specific vertical (banking,
 * sales, ...) is baked in, scenarios are whatever the admins create. */

/** Dispatched by the CTA buttons; the Navbar listens and opens the login modal. */
export const OPEN_LOGIN_EVENT = 'skilllab:open-login';

function openLogin() {
  window.dispatchEvent(new CustomEvent(OPEN_LOGIN_EVENT));
}

const primaryBtnCls =
  'flex cursor-pointer items-center gap-2 rounded-xl border-none bg-gradient-to-br from-violet-600 to-cyan-500 px-8 py-3 text-base font-semibold text-white shadow-[0_8px_24px_rgba(124,58,237,0.35)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(124,58,237,0.5)]';
const cardCls =
  'flex flex-col gap-3 rounded-2xl border border-white/6 bg-gray-900/60 p-8 backdrop-blur-md transition hover:-translate-y-1 hover:border-violet-600/35 hover:shadow-[0_12px_40px_rgba(124,58,237,0.12)]';
const cardIconCls =
  'flex h-12 w-12 items-center justify-center rounded-xl border border-violet-600/20 bg-violet-600/10 text-violet-400';

interface Feature {
  title: string;
  text: string;
  icon: React.ReactNode;
}

const FEATURES: Feature[] = [
  {
    title: 'Telefonate realistiche',
    text:
      'Premi Chiama, senti lo squillo e il tuo interlocutore risponde con una voce naturale. La conversazione è tutta a voce, in tempo reale, come una chiamata vera.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
      </svg>
    ),
  },
  {
    title: 'Personaggi con carattere',
    text:
      'Ogni personaggio ha una personalità completa: emozioni, obiettivi, punti deboli. Reagisce a come parli, si tranquillizza, si irrita, cambia atteggiamento, e non esce mai dal ruolo.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    title: 'Trascrizione e storico',
    text:
      'Mentre parli, la conversazione viene trascritta in tempo reale. Ogni chiamata resta nello storico: puoi rileggerla, confrontarla con le precedenti e vedere quanta strada hai fatto.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
  {
    title: 'Valutazione con feedback AI',
    text:
      'Dopo ogni chiamata ricevi un punteggio su linguaggio, affidabilità, empatia, gestione emotiva e capacità di risoluzione, con suggerimenti concreti su cosa migliorare la volta successiva.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="7" />
        <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
      </svg>
    ),
  },
  {
    title: 'Scenari su misura',
    text:
      'Assistenza clienti, vendita, colloqui, negoziazione: ogni conversazione può diventare allenamento. Chi amministra la piattaforma crea personaggi e scenari nuovi in pochi minuti.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="4" y1="21" x2="4" y2="14" />
        <line x1="4" y1="10" x2="4" y2="3" />
        <line x1="12" y1="21" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12" y2="3" />
        <line x1="20" y1="21" x2="20" y2="16" />
        <line x1="20" y1="12" x2="20" y2="3" />
        <line x1="1" y1="14" x2="7" y2="14" />
        <line x1="9" y1="8" x2="15" y2="8" />
        <line x1="17" y1="16" x2="23" y2="16" />
      </svg>
    ),
  },
  {
    title: 'Dashboard per i team',
    text:
      'Chi amministra l\'account vede l\'andamento di tutta l\'organizzazione: punteggio medio, criteri più forti e più deboli, confronto tra utenti e trend nel tempo.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    ),
  },
];

const STEPS = [
  {
    n: '1',
    title: 'Scegli il personaggio',
    text: 'Sfoglia la galleria e scegli con chi allenarti: ogni scenario ha il suo grado di difficoltà.',
  },
  {
    n: '2',
    title: 'Chiama',
    text: 'Premi il pulsante verde e aspetta lo squillo: il personaggio risponde al telefono e la conversazione inizia.',
  },
  {
    n: '3',
    title: 'Migliora',
    text: 'Ricevi subito un feedback con punteggi dettagliati, rileggi la trascrizione e ripeti lo scenario per misurare i tuoi progressi chiamata dopo chiamata.',
  },
];

export default function LandingPage() {
  return (
    <div className="relative overflow-hidden">
      {/* Decorative background glows */}
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[680px] -translate-x-1/2 rounded-full bg-violet-600/15 blur-[130px]" />
      <div className="pointer-events-none absolute right-[-140px] top-[520px] h-[360px] w-[360px] rounded-full bg-cyan-500/10 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 left-[-140px] h-[320px] w-[320px] rounded-full bg-violet-600/10 blur-[120px]" />

      {/* ── Hero ── */}
      <section className="relative mx-auto max-w-[900px] px-6 pb-20 pt-24 text-center max-md:pt-14">
        <span className="mb-6 inline-flex animate-fade-in-up items-center gap-2 rounded-full border border-violet-600/35 bg-violet-600/10 px-4 py-1.5 text-[0.8rem] font-medium text-violet-400">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
          </svg>
          Formazione conversazionale potenziata dall'AI
        </span>

        <h1 className="mb-6 animate-fade-in-up font-heading text-5xl font-bold leading-tight text-slate-100 [animation-delay:0.1s] max-md:text-3xl">
          La palestra per le conversazioni{' '}
          <span className="animate-gradient-shift bg-gradient-to-r from-violet-600 via-cyan-500 to-violet-600 bg-[length:200%_auto] bg-clip-text text-transparent">
            che contano
          </span>
        </h1>

        <p className="mx-auto mb-10 max-w-[640px] animate-fade-in-up text-lg leading-relaxed text-slate-400 [animation-delay:0.2s] max-md:text-base">
          SkillLab ti mette al telefono con persone simulate dall'intelligenza artificiale:
          interlocutori con carattere, emozioni e obiettivi, per allenare le tue capacità di
          comunicazione in un ambiente sicuro, dove sbagliare è il modo migliore di imparare.
        </p>

        <div className="flex animate-fade-in-up items-center justify-center gap-4 [animation-delay:0.3s] max-[480px]:flex-col">
          <button className={primaryBtnCls} onClick={openLogin} id="landing-login-btn">
            Accedi per iniziare
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
          <a
            href="#come-funziona"
            className="flex items-center gap-2 rounded-xl border border-white/6 bg-white/4 px-8 py-3 text-base font-medium text-slate-400 no-underline transition hover:border-violet-600 hover:bg-violet-600/12 hover:text-violet-400"
          >
            Scopri come funziona
          </a>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="relative mx-auto max-w-[1100px] px-6 pb-24">
        <div className="grid grid-cols-3 gap-6 max-lg:grid-cols-2 max-md:grid-cols-1">
          {FEATURES.map((f, i) => (
            <div key={f.title} className={`${cardCls} animate-fade-in-up`} style={{ animationDelay: `${0.1 + i * 0.1}s` }}>
              <div className={cardIconCls}>{f.icon}</div>
              <h3 className="font-heading text-lg font-bold text-slate-100">{f.title}</h3>
              <p className="text-sm leading-relaxed text-slate-400">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Come funziona ── */}
      <section id="come-funziona" className="relative mx-auto max-w-[1100px] scroll-mt-24 px-6 pb-24">
        <div className="mb-12 text-center">
          <h2 className="mb-2 font-heading text-3xl font-bold text-slate-100 max-md:text-2xl">Come funziona</h2>
          <p className="text-slate-500">Tre passi, nessuna preparazione richiesta: serve solo un microfono.</p>
        </div>
        <div className="grid grid-cols-3 gap-6 max-md:grid-cols-1">
          {STEPS.map((s, i) => (
            <div key={s.n} className="relative animate-fade-in-up rounded-2xl border border-white/6 bg-gray-900/40 p-8 text-center" style={{ animationDelay: `${0.1 + i * 0.15}s` }}>
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-cyan-500 font-heading text-xl font-bold text-white">
                {s.n}
              </div>
              <h3 className="mb-2 font-heading text-lg font-bold text-slate-100">{s.title}</h3>
              <p className="text-sm leading-relaxed text-slate-400">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA finale ── */}
      <section className="relative mx-auto max-w-[800px] px-6 pb-28 text-center">
        <div className="rounded-3xl border border-violet-600/25 bg-gradient-to-br from-violet-600/10 to-cyan-500/5 p-14 backdrop-blur-md max-md:p-8">
          <h2 className="mb-3 font-heading text-3xl font-bold text-slate-100 max-md:text-2xl">
            Pronto ad allenarti?
          </h2>
          <p className="mx-auto mb-8 max-w-[480px] text-slate-400">
            L'accesso è riservato: se la tua organizzazione usa SkillLab, entra con le credenziali
            che hai ricevuto via email.
          </p>
          <div className="flex justify-center">
            <button className={primaryBtnCls} onClick={openLogin}>
              Accedi
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
