import { useSearchParams } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { isAdmin } from '../services/auth'
import { useAttempts, useComparableUsers, useSimulationAttempts } from '../hooks/useComparison'
import ComparisonConversations from './ComparisonConversations'
import ComparisonSimulations from './ComparisonSimulations'
import SearchSelect from './SearchSelect'
import TabBar, { TabPanel } from './TabBar'
import LoadingState from './LoadingState'
import { labelCls } from './Field'
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
 * sceglie una volta sola, accanto al titolo: è sempre la stessa.
 *
 * La persona e la linguetta stanno nell'indirizzo e non nello stato del
 * componente: un confronto è una cosa che un docente tiene aperta accanto a
 * un'altra scheda o riapre dopo essere andato a leggere una trascrizione, e
 * il tasto indietro deve riportarlo sulla persona di prima invece di farlo
 * uscire dalla pagina. I filtri e la coppia restano invece locali, perché si
 * cambiano di continuo mentre si guarda e riempirebbero la cronologia di
 * passi che nessuno vuole rifare a ritroso. */

type ComparisonSection = 'conversazioni' | 'simulazioni'

/** Come le due scelte si scrivono nell'indirizzo. */
const PERSON_PARAM = 'persona'
const SECTION_PARAM = 'prova'

export default function ComparisonPage() {
  const { user } = useAuth()
  const canPickUser = isAdmin(user)

  const [params, setParams] = useSearchParams()
  const section: ComparisonSection =
    params.get(SECTION_PARAM) === 'simulazioni' ? 'simulazioni' : 'conversazioni'
  /* La persona nell'indirizzo vale solo per chi la può scegliere: a uno
     studente il server risponderebbe comunque con le proprie prove, e la
     pagina intanto si scriverebbe accanto al titolo il nome di qualcun
     altro. */
  const subjectId = canPickUser ? (params.get(PERSON_PARAM) ?? '') : ''

  /* La linguetta sostituisce il passo invece di aggiungerne uno: passare da
     una prova all'altra è guardare la stessa pagina da un'altra parte,
     mentre la persona è un'altra pagina, ed è quella su cui il tasto
     indietro deve tornare. */
  const setParam = (name: string, value: string, replace = false) => {
    const next = new URLSearchParams(params)
    if (value) next.set(name, value)
    else next.delete(name)
    setParams(next, { replace })
  }

  const {
    data: people = [],
    error: peopleError,
    isPending: isLoadingPeople,
  } = useComparableUsers(canPickUser)
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

  /* Un caricamento fallito si dice, e ognuno per conto suo: le tre chiamate
     si rompono separatamente, e un elenco di persone caduto mentre le prove
     ci sono è un guasto diverso dal contrario. L'elenco delle persone
     falliva invece in silenzio, lasciando un selettore con dentro le sole
     proprie prove e nessuna spiegazione. */
  const loadErrors = [
    peopleError ? 'Impossibile caricare le persone da confrontare.' : '',
    error instanceof Error ? error.message : error ? 'Impossibile caricare i tentativi.' : '',
    simulationsError instanceof Error
      ? simulationsError.message
      : simulationsError
        ? 'Impossibile caricare i tentativi.'
        : '',
  ].filter(Boolean)

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

  /* Un admin che non si allena atterra sulle proprie prove, che sono zero, e
     leggeva soltanto che non c'è niente da confrontare: il selettore sta in
     cima, dall'altra parte della pagina, ed è quella la cosa da fare. Solo
     se c'è qualcuno da scegliere, altrimenti manderebbe a un elenco vuoto. */
  const emptyHint =
    canPickUser && subject.isSelf && !isLoadingPeople && people.length > 0
      ? 'Scegli una persona in alto per leggere le sue prove'
      : undefined

  /* Il numero compare quando è quello vero: durante il caricamento le due
     liste sono vuote, e una linguetta che dice "(0)" per diventare poi
     "(12)" ha detto una cosa falsa proprio mentre si decideva dove andare. */
  const tabLabel = (label: string, count: number, isLoading: boolean) =>
    isLoading ? label : `${label} (${count})`

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

           `relative z-30` perché i suggerimenti cadono sopra il pannello dei
           filtri, che con il suo backdrop-blur apre un contesto di
           impilamento e gli passerebbe davanti. */
        actions={
          canPickUser && (
            <div className="relative z-30 w-[380px] max-sm:w-full">
              {/* L'etichetta di ogni campo dell'app, non una riga di classi
                  scritta qui: in questa copia aveva perso la spaziatura delle
                  altre. */}
              <label className={`mb-1 block ${labelCls}`} htmlFor="subject">
                Persona
              </label>
              {/* Lo stesso campo con cui si sceglie una persona nella
                  dashboard, e non una tendina: un'aula intera si scorreva
                  voce per voce, mentre il nome che si cerca lo si sa già.
                  Sotto a ciascuno solo l'email, che è quello che distingue
                  due omonimi: quante prove ha si legge nelle linguette
                  appena scelto, e accanto all'indirizzo allungava ogni voce
                  con un numero che non cambia chi si sta cercando.

                  In ordine alfabetico sul nome che si legge, come nella
                  dashboard: è lo stesso campo sulla stessa aula, e chi lo
                  scorre a occhio invece di digitare cerca due volte nello
                  stesso posto. Qui e non nel server, perché l'ordine deve
                  seguire la label, che per chi non ha nome è l'email. */}
              <SearchSelect
                id="subject"
                value={subjectId}
                onChange={(value) => setParam(PERSON_PARAM, value)}
                options={people
                  .map((p) => ({
                    value: p.id,
                    label: `${p.nome} ${p.cognome}`.trim() || p.email,
                    sub: p.email,
                  }))
                  .sort((a, b) => a.label.localeCompare(b.label, 'it'))}
                placeholder="Cerca per nome o email..."
                emptyHint="Le Mie Prove"
              />
            </div>
          )
        }
      />

      {loadErrors.map((message) => (
        <FormError key={message} message={message} variant="page" />
      ))}

      <TabBar
        items={[
          {
            value: 'conversazioni',
            label: tabLabel('Conversazioni', attempts.length, isLoadingAttempts),
          },
          {
            value: 'simulazioni',
            label: tabLabel(
              'Simulazioni tecniche',
              simulationAttempts.length,
              isLoadingSimulations,
            ),
          },
        ]}
        value={section}
        onChange={(value) => setParam(SECTION_PARAM, value, true)}
        ariaLabel="Prova da confrontare"
        panelBase="confronto"
      />

      {/* Ogni metà aspetta i propri dati e non anche quelli dell'altra: le
          due chiamate partono insieme, ma legarle faceva aspettare alle
          conversazioni, che sono la linguetta aperta, l'elenco dei test, che
          in quel momento nessuno sta guardando. */}
      <TabPanel base="confronto" value={section}>
        {section === 'conversazioni' ? (
          isLoadingAttempts ? (
            <LoadingState message="Caricamento tentativi..." />
          ) : (
            <ComparisonConversations
              attempts={attempts}
              subject={subject}
              emptyHint={emptyHint}
              onReviewSaved={() => void refetchAttempts()}
            />
          )
        ) : isLoadingSimulations ? (
          <LoadingState message="Caricamento tentativi..." />
        ) : (
          <ComparisonSimulations
            attempts={simulationAttempts}
            isOwn={subject.isSelf}
            emptyHint={emptyHint}
          />
        )}
      </TabPanel>
    </PageContainer>
  )
}
