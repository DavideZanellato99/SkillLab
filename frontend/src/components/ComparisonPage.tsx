import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { isAdmin } from '../services/auth'
import { useAttempts, useComparableUsers, useSimulationAttempts } from '../hooks/useComparison'
import ComparisonConversations from './ComparisonConversations'
import ComparisonSimulations from './ComparisonSimulations'
import Select from './Select'
import TabBar from './TabBar'
import LoadingState from './LoadingState'
import { PageContainer, PageHeader } from './PageLayout'
import { cardCls } from './scoreFormat'

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
 * sceglie una volta sola, sopra le linguette: è sempre la stessa. */

type ComparisonSection = 'conversazioni' | 'simulazioni'

export default function ComparisonPage() {
  const { user } = useAuth()
  const canPickUser = isAdmin(user)

  const [subjectId, setSubjectId] = useState('')
  const [section, setSection] = useState<ComparisonSection>('conversazioni')

  const { data: people = [] } = useComparableUsers(canPickUser)
  const { data: attempts = [], isPending: isLoadingAttempts, error } = useAttempts(subjectId)
  const {
    data: simulationAttempts = [],
    isPending: isLoadingSimulations,
    error: simulationsError,
  } = useSimulationAttempts(subjectId)

  const isLoading = isLoadingAttempts || isLoadingSimulations
  const loadError = error ?? simulationsError

  return (
    <PageContainer width="split">
      <PageHeader
        title="Confronto tra i tentativi"
        description={
          canPickUser
            ? 'Scegli una persona e metti due delle sue prove una accanto all’altra per vedere cosa è cambiato.'
            : 'Metti due delle tue prove una accanto all’altra per vedere cosa è migliorato.'
        }
      />

      {loadError && (
        <div className="mb-8 rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-sm text-red-300">
          {loadError instanceof Error ? loadError.message : 'Impossibile caricare i tentativi.'}
        </div>
      )}

      {/* La persona sta sopra le linguette perché non cambia passando da una
          prova all'altra: è la stessa di cui si guardano entrambe. */}
      {canPickUser && (
        <div className={`${cardCls} relative z-30 mb-6`}>
          <div className="min-w-[240px] max-w-[420px]">
            <label className="mb-1 block text-xs font-medium text-slate-400" htmlFor="subject">
              Persona
            </label>
            <Select
              id="subject"
              value={subjectId}
              onChange={setSubjectId}
              options={[
                { value: '', label: 'Le mie prove' },
                ...people.map((p) => ({
                  value: p.id,
                  label: `${p.nome} ${p.cognome}`.trim() || p.email,
                })),
              ]}
            />
          </div>
        </div>
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
        <ComparisonConversations attempts={attempts} />
      ) : (
        <ComparisonSimulations attempts={simulationAttempts} />
      )}
    </PageContainer>
  )
}
