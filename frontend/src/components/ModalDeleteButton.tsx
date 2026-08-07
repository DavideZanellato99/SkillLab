import { TrashIcon } from './icons'

/* Il comando che elimina quello che la modale sta mostrando, in testa alla
 * schermata accanto al referto in PDF: la trascrizione di una conversazione,
 * l'esito di un test consegnato.
 *
 * Ha la stessa forma di [PdfDownloadButton](./PdfDownloadButton.tsx), perché
 * i due stanno uno a fianco all'altro e sono le due cose che si possono fare
 * a una prova già chiusa, e l'accento rosso solo al passaggio del mouse: un
 * pulsante rosso fisso in cima a una schermata che si apre per leggere
 * chiamerebbe il gesto sbagliato.
 *
 * Non decide lui chi lo vede: lo monta la modale, che sa se chi guarda sta
 * correggendo la prova di qualcun altro o rileggendo la propria. */

export default function ModalDeleteButton({
  label,
  onClick,
}: {
  /** Cosa si sta per eliminare: "Elimina conversazione", "Elimina tentativo". */
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/6 bg-white/4 px-5 py-2 text-sm font-medium text-slate-400 transition hover:-translate-y-px hover:border-red-500 hover:bg-red-500/12 hover:text-red-300"
      onClick={onClick}
    >
      <TrashIcon size={15} />
      {label}
    </button>
  )
}
