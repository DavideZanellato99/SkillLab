/* Il messaggio di conferma che compare in cima a una pagina e se ne va da
 * solo dopo qualche secondo.
 *
 * Era ricopiato in tre pagine di amministrazione, ognuna con il proprio
 * `setTimeout` orfano: un timer che nessuno annullava, quindi una pagina
 * lasciata prima della scadenza scriveva su un componente smontato, e due
 * conferme ravvicinate lasciavano in giro il timer della prima, che poi
 * cancellava la seconda in anticipo. Qui il timer è uno solo, viene
 * sostituito a ogni nuovo messaggio e muore con la pagina. */

import { useCallback, useEffect, useRef, useState } from 'react'

const FLASH_DURATION_MS = 6000

export function useFlashMessage(durationMs: number = FLASH_DURATION_MS) {
  const [message, setMessage] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const flash = useCallback(
    (text: string) => {
      setMessage(text)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setMessage(''), durationMs)
    },
    [durationMs],
  )

  return { message, flash }
}
