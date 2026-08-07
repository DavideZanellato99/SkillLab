import { useContext } from 'react'
import { AuthContext, type AuthContextType } from '../contexts/authContext'

/** Chi è collegato e cosa può fare con la propria sessione. Fuori da
 *  `AuthProvider` non c'è una sessione da leggere, e restituire un utente
 *  nullo nasconderebbe l'errore invece di dirlo. */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
