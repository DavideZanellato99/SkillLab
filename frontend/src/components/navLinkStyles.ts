/* La forma di una voce della barra di navigazione, accesa o spenta.
 *
 * Sta in un file suo e non dentro NavbarLink perché la usano in due: le voci
 * dell'applicazione e la voce del sito pubblico, che sono la stessa barra
 * vista prima e dopo l'accesso. Scritta due volte sarebbe una sottolineatura
 * che prima o poi non si somiglia più. */

const linkCls =
  'relative flex items-center gap-1.5 rounded-lg px-4 py-2 text-[0.85rem] font-medium no-underline transition'
const activeCls =
  "bg-violet-600/10 text-slate-100 after:absolute after:-bottom-px after:left-1/2 after:h-0.5 after:w-5 after:-translate-x-1/2 after:rounded-sm after:bg-gradient-to-r after:from-violet-600 after:to-cyan-500 after:content-['']"
const idleCls = 'text-slate-400 hover:bg-white/8 hover:text-slate-100'

export function navLinkClasses(isActive: boolean): string {
  return `${linkCls} ${isActive ? activeCls : idleCls}`
}
