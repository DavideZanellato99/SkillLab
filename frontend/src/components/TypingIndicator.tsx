/* I tre puntini che rimbalzano: l'avatar sta componendo la risposta, oppure
 * la trascrizione si sta ancora caricando. */

export default function TypingIndicator() {
  return (
    <div className="flex items-center gap-[5px] py-1">
      <span className="h-2 w-2 animate-typing-bounce rounded-full bg-slate-500"></span>
      <span className="h-2 w-2 animate-typing-bounce rounded-full bg-slate-500 [animation-delay:0.2s]"></span>
      <span className="h-2 w-2 animate-typing-bounce rounded-full bg-slate-500 [animation-delay:0.4s]"></span>
    </div>
  )
}
