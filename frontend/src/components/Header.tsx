interface HeaderProps {
  totalAvatars: number;
  totalSelections: number;
}

const statValueCls =
  'font-heading text-3xl font-extrabold bg-gradient-to-br from-violet-600 to-cyan-500 bg-clip-text text-transparent max-md:text-2xl';
const statLabelCls = 'mt-0.5 text-xs uppercase tracking-widest text-slate-500';

export default function Header({ totalAvatars, totalSelections }: HeaderProps) {
  return (
    <section className="relative overflow-hidden px-8 pb-12 pt-16 text-center max-md:px-4 max-md:pb-8 max-md:pt-12" id="hero">
      {/* Radial glow behind the hero */}
      <div
        className="pointer-events-none absolute -top-1/2 left-1/2 z-0 h-[800px] w-[800px] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,rgba(124,58,237,0.12)_0%,rgba(6,182,212,0.06)_30%,transparent_60%)]"
        aria-hidden="true"
      />

      <div className="relative z-10">
        <div className="mb-6 inline-flex animate-fade-in-up items-center gap-2 rounded-full border border-white/6 bg-white/4 px-4 py-1 text-[0.8rem] uppercase tracking-wider text-slate-400">
          <span className="h-1.5 w-1.5 animate-glow-pulse rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"></span>
          <span>Avatar Gallery</span>
        </div>

        <h1 className="mb-4 animate-fade-in-up font-heading text-[clamp(2.5rem,6vw,4rem)] font-extrabold leading-[1.1] [animation-delay:0.1s]">
          Choose Your{' '}
          <span className="animate-gradient-shift bg-gradient-to-br from-violet-600 to-cyan-500 bg-[length:200%_auto] bg-clip-text text-transparent">
            Avatar
          </span>
        </h1>

        <p className="mx-auto max-w-[600px] animate-fade-in-up text-[clamp(1rem,2vw,1.2rem)] font-light leading-relaxed text-slate-400 [animation-delay:0.2s]">
          Explore our curated collection of unique avatars.
          Pick the one that best represents your digital identity.
        </p>

        <div className="mb-8 mt-6 flex animate-fade-in-up justify-center gap-12 px-8 py-6 [animation-delay:0.4s] max-md:gap-6">
          <div className="text-center">
            <div className={statValueCls}>{totalAvatars}</div>
            <div className={statLabelCls}>Avatars</div>
          </div>
          <div className="text-center">
            <div className={statValueCls}>{totalSelections}</div>
            <div className={statLabelCls}>Selections</div>
          </div>
          <div className="text-center">
            <div className={statValueCls}>4</div>
            <div className={statLabelCls}>Categories</div>
          </div>
        </div>
      </div>
    </section>
  );
}
