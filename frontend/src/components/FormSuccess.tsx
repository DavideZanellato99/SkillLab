/* Banner di conferma dei form: icona + messaggio, il gemello verde di
 * FormError. Prima era il componente locale SuccessBox di ProfilePage,
 * estratto qui perché la coppia errore/conferma va tenuta insieme: chi
 * aggiunge un form nuovo trova entrambi i banner nello stesso posto. */

const formSuccessCls =
  'mb-4 flex animate-fade-in-up items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-[0.82rem] text-emerald-400 [animation-duration:0.2s]'

export default function FormSuccess({ message }: { message: string }) {
  return (
    <div className={formSuccessCls} role="status">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0"
      >
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
      <span>{message}</span>
    </div>
  )
}
