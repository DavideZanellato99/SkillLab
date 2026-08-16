import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { isAdmin } from '../services/auth'
import { useAttempts, useComparableUsers, useSimulationAttempts } from '../hooks/useComparison'
import ComparisonConversations from './ComparisonConversations'
import ComparisonSimulations from './ComparisonSimulations'
import Select from './Select'
import TabBar from './TabBar'
import LoadingState from './LoadingState'
import FormError from './FormError'
import { PageContainer, PageHeader } from './PageLayout'

/* Confronto fra due prove della stessa persona.
 *
 * Lo studente vede le proprie; un admin sceglie una persona del proprio
 * tenant e legge le sue. Non c'è modo di mettere due persone a confronto:
 * la domanda a cui questa pagina risponde è "sono migliorato", e una
 * classifica fra studenti è un'altra domanda con altre conseguenze in aula.
 *
 * Due prove, una linguetta per ciascuna, come nella dashboard: una
 * conversazione valutata e un test tecnico si guardano una per volta, perché
 * il miglioramento in una non dice niente dell'altra. La persona invece si
 * sceglie una volta sola, accanto al titolo: è sempre la stessa. */

type ComparisonSection = 'conversazioni' | 'simulazioni'

export default function ComparisonPage() {
  const { user } = useAuth()
  const canPickUser = isAdmin(user)

  const [subjectId, setSubjectId] = useState('')
  const [section, setSection] = useState<ComparisonSection>('conversazioni')

  const { data: people = [] } = useComparableUsers(canPickUser)
  const {
    data: attempts = [],
    isPending: isLoadingAttempts,
    error,
    refetch: refetchAttempts,
  } = useAttempts(subjectId)
  const {
    data: simulationAttempts = [],
    isPending: isLoadingSimulations,
    error: simulationsError,
  } = useSimulationAttempts(subjectId)

  const isLoading = isLoadingAttempts || isLoadingSimulations
  const loadError = error ?? simulationsError

  /* Chi ha svolto le prove, che la metà parlata usa per aprire la
   * trascrizione: la persona scelta, o chi è collegato quando non se ne
   * sceglie nessuna. La differenza conta, perché una conversazione propria e
   * quella di un'altra persona si leggono da due endpoint diversi. */
  const person = people.find((p) => p.id === subjectId)
  const subject = person
    ? { nome: person.nome, cognome: person.cognome, email: person.email, isSelf: false }
    : {
        nome: user?.nome ?? '',
        cognome: user?.cognome ?? '',
        email: user?.email ?? '',
        isSelf: true,
      }

  return (
    <PageContainer width="split">
      <PageHeader
        title="Confronto tra i Tentativi"
        description={
          canPickUser
            ? 'Seleziona una persona e affianca due delle sue prove per osservare le differenze.'
            : 'Affianca due delle tue prove per osservare i progressi.'
        }
        /* La persona sta accanto al titolo perché non cambia passando da una
           prova all'altra: è la stessa di cui si guardano entrambe. Accanto
           al titolo e non in un riquadro suo, che con i filtri sotto faceva
           tre pannelli sovrapposti prima di arrivare a un voto.

           `relative z-30` perché la tendina cade sopra il pannello dei
           filtri, che con il suo backdrop-blur apre un contesto di
           impilamento e le passerebbe davanti. */
        actions={
          canPickUser && (
            <div className="relative z-30 w-[260px] max-sm:w-full">
              <label className="mb-1 block text-xs font-medium text-slate-400" htmlFor="subject">
                Persona
              </label>
              <Select
                id="subject"
                value={subjectId}
                onChange={setSubjectId}
                options={[
                  { value: '', label: 'Le Mie Prove' },
                  ...people.map((p) => ({
                    value: p.id,
                    label: `${p.nome} ${p.cognome}`.trim() || p.email,
                  })),
                ]}
              />
            </div>
          )
        }
      />

      {loadError && (
        <FormError
          message={
            loadError instanceof Error ? loadError.message : 'Impossibile caricare i tentativi.'
          }
          variant="page"
        />
      )}

      <TabBar
        items={[
          { value: 'conversazioni', label: `Conversazioni (${attempts.length})` },
          { value: 'simulazioni', label: `Simulazioni tecniche (${simulationAttempts.length})` },
        ]}
        value={section}
        onChange={setSection}
        ariaLabel="Prova da confrontare"
        className="mb-6 border-b border-white/6 pb-2"
      />

      {isLoading ? (
        <LoadingState message="Caricamento tentativi..." />
      ) : section === 'conversazioni' ? (
        <ComparisonConversations
          attempts={attempts}
          subject={subject}
          onReviewSaved={() => void refetchAttempts()}
        />
      ) : (
        <ComparisonSimulations attempts={simulationAttempts} isOwn={subject.isSelf} />
      )}
    </PageContainer>
  )
}
