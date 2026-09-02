/* La sola scrittura della guida introduttiva: è stata vista.
 *
 * Non c'è una query che le corrisponda, per la stessa ragione per cui non
 * c'è per il profilo (vedi `useProfile`): la data che dice se la guida deve
 * comparire arriva con l'utente, che vive nel contesto di autenticazione e
 * non in cache. Per questo qui non si invalida niente e si restituisce
 * l'utente aggiornato: è il contesto che va allineato, e lo fa chi chiama.
 */

import { useMutation } from '@tanstack/react-query'
import { markTutorialSeen } from '../services/profile'

export function useMarkTutorialSeen() {
  return useMutation({ mutationFn: markTutorialSeen })
}
