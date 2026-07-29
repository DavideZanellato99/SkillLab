import { useState } from 'react'
import type { MessageAnnotation } from '../services/api'
import { deleteMessageAnnotation, saveMessageAnnotation } from '../services/admin'

/* La nota che il docente appunta su un singolo messaggio della trascrizione,
 * con il suo mini editor.
 *
 * Al massimo una nota per messaggio: annotare un messaggio già annotato lo
 * riscrive, quindi qui non c'è nessuna lista da gestire, solo un testo che
 * c'è o non c'è. */

const inputCls =
  'w-full rounded-lg border border-white/6 bg-white/4 px-3 py-2 text-[0.82rem] text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-violet-600 focus:bg-violet-600/8'

interface MessageAnnotationEditorProps {
  conversationId: string
  messageId: string
  annotation: MessageAnnotation | null
  /** null quando la nota è stata eliminata. */
  onChange: (messageId: string, annotation: MessageAnnotation | null) => void
}

export default function MessageAnnotationEditor({
  conversationId,
  messageId,
  annotation,
  onChange,
}: MessageAnnotationEditorProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [note, setNote] = useState(annotation?.note ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    const trimmed = note.trim()
    if (!trimmed) {
      setError("L'annotazione non può essere vuota.")
      return
    }
    setIsSaving(true)
    setError('')
    try {
      const saved = await saveMessageAnnotation(conversationId, messageId, trimmed)
      onChange(messageId, saved)
      setIsEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Salvataggio non riuscito.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!annotation) return
    setIsSaving(true)
    setError('')
    try {
      await deleteMessageAnnotation(annotation.id)
      onChange(messageId, null)
      setNote('')
      setIsEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eliminazione non riuscita.')
    } finally {
      setIsSaving(false)
    }
  }

  if (isEditing) {
    return (
      <div className="mt-1.5 rounded-xl border border-violet-500/25 bg-violet-500/8 p-2.5">
        <textarea
          className={`${inputCls} min-h-[60px] resize-y`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Cosa avrebbe dovuto fare qui..."
          autoFocus
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            className="cursor-pointer rounded-lg border-none bg-violet-600 px-3 py-1 text-[0.75rem] font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleSave}
            disabled={isSaving}
          >
            Salva
          </button>
          <button
            className="cursor-pointer rounded-lg border-none bg-transparent px-2 py-1 text-[0.75rem] text-slate-400 transition hover:text-slate-200"
            onClick={() => {
              setNote(annotation?.note ?? '')
              setError('')
              setIsEditing(false)
            }}
            disabled={isSaving}
          >
            Annulla
          </button>
          {annotation && (
            <button
              className="cursor-pointer rounded-lg border-none bg-transparent px-2 py-1 text-[0.75rem] text-slate-400 transition hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleDelete}
              disabled={isSaving}
            >
              Elimina
            </button>
          )}
        </div>
        {error && <p className="mt-1.5 text-[0.75rem] text-red-400">{error}</p>}
      </div>
    )
  }

  if (annotation) {
    return (
      <button
        className="mt-1.5 w-full cursor-pointer rounded-xl border border-violet-500/25 bg-violet-500/8 p-2.5 text-left transition hover:bg-violet-500/15"
        onClick={() => setIsEditing(true)}
        title="Modifica la nota"
      >
        <span className="mb-0.5 block text-[0.68rem] font-semibold uppercase tracking-wide text-violet-300">
          Nota di {annotation.reviewer_name}
        </span>
        <span className="block whitespace-pre-wrap text-[0.8rem] leading-relaxed text-slate-300">
          {annotation.note}
        </span>
      </button>
    )
  }

  return (
    <button
      className="mt-1 cursor-pointer rounded-lg border-none bg-transparent px-1.5 py-0.5 text-[0.72rem] font-medium text-slate-500 transition hover:text-violet-300"
      onClick={() => setIsEditing(true)}
    >
      + Annota
    </button>
  )
}
