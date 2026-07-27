/* Banner d'errore dei form e delle modali di conferma: icona + messaggio,
 * stesso stile in tutta l'area admin. Prima era il componente locale ErrorBox
 * di AdminPage, estratto qui perché lo condividono form e ConfirmModal. */

const formErrorCls =
  'mb-4 flex animate-fade-in-up items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2 text-[0.82rem] text-red-300 [animation-duration:0.2s]'

export default function FormError({ message }: { message: string }) {
  return (
    <div className={formErrorCls} role="alert">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-px shrink-0 text-red-500"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>{message}</span>
    </div>
  )
}
