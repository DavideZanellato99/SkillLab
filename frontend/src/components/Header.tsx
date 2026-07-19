interface HeaderProps {
  totalAvatars: number;
  totalCategories: number;
}

const statValueCls =
  'font-heading text-3xl font-extrabold bg-gradient-to-br from-violet-600 to-cyan-500 bg-clip-text text-transparent max-md:text-2xl';
const statLabelCls = 'mt-0.5 text-xs uppercase tracking-widest text-slate-500';

export default function Header({ totalAvatars, totalCategories }: HeaderProps) {
  return (
    <section className="relative overflow-hidden px-8 pb-12 pt-16 text-center max-md:px-4 max-md:pb-8 max-md:pt-12" id="hero">
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
          affrontare. Scegli con chi allenarti e chiamalo.
        </p>

        <div className="mb-8 mt-6 flex animate-fade-in-up justify-center gap-12 px-8 py-6 [animation-delay:0.4s] max-md:gap-6">
          <div className="text-center">
            <div className={statValueCls}>{totalAvatars}</div>
            <div className={statLabelCls}>Avatar</div>
          </div>
          <div className="text-center">
            <div className={statValueCls}>{totalCategories}</div>
            <div className={statLabelCls}>Categorie</div>
          </div>
        </div>
      </div>
    </section>
  );
}
