import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { isAdmin } from '../services/auth'
import { useAttempts, useComparableUsers, useSimulationAttempts } from '../hooks/useComparison'
import ComparisonConversations from './ComparisonConversations'
import ComparisonPeopleField from './ComparisonPeopleField'
import ComparisonProvaTabs from './ComparisonProvaTabs'
import type { ComparisonProva } from './ComparisonProvaTabs'
import ComparisonSimulations from './ComparisonSimulations'
import { comparePeople } from './personOrder'
import SearchSelect from './SearchSelect'
import { TabPanel } from './TabBar'
import LoadingState from './LoadingState'
import FormError from './FormError'
import { PageHeader } from './PageLayout'

/* La prima sezione del confronto: due prove della stessa persona, una
 * accanto all'altra. Lo studente vede le proprie; un admin sceglie una
 * persona del proprio tenant e legge le sue. La domanda a cui risponde è
 * "sono migliorato".
 *
 * La sezione porta la propria intestazione di pagina, con il titolo che la
 * nomina e il selettore della persona accanto: il titolo della pagina è
 * quello della sezione aperta, e non un "Confronto" sopra due sottotitoli,
 * perché chi legge "Confronto tra i Tentativi" sa già dov'è. Il comando sta
 * a destra del titolo e non sopra il contenuto: è quello che decide cosa
 * c'è sotto, e messo a tutta larghezza si leggeva come una seconda riga
 * della descrizione.
 *
 * La persona sta nell'indirizzo (`persona=`) e non nello stato: un confronto
 * è una cosa che un docente tiene aperta accanto a un'altra scheda o riapre
 * dopo essere andato a leggere una trascrizione, e il tasto indietro deve
 * riportarlo sulla persona di prima invece di farlo uscire dalla pagina.
 * Sceglierla aggiunge un passo, perché è un'altra pagina. */

/** Come la persona si scrive nell'indirizzo. */
const PERSON_PARAM = 'persona'

/** La radice degli id delle linguette della prova di questa sezione. L'altra
    sezione ha la sua (in ComparisonUsers): le due non stanno mai nella pagina
    insieme, ma due gruppi con gli stessi id sarebbero un errore che aspetta
    il giorno in cui ci staranno. */
const PROVA_BASE = 'confronto-tentativi-prova'

export default function ComparisonAttempts({
  prova,
  onProvaChange,
  sectionTabs,
}: {
  prova: ComparisonProva
  onProvaChange: (value: ComparisonProva) => void
  /** La linguetta con cui si passa all'altra sezione, che la pagina disegna
      per chi ne ha due e che sta sotto l'intestazione. */
  sectionTabs: ReactNode
}) {
  const { user } = useAuth()
  const canPickUser = isAdmin(user)

  const [params, setParams] = useSearchParams()
  /* La persona nell'indirizzo vale solo per chi la può scegliere: a uno
     studente il server risponderebbe comunque con le proprie prove, e la
     pagina intanto si scriverebbe accanto al titolo il nome di qualcun
     altro. */
  const subjectId = canPickUser ? (params.get(PERSON_PARAM) ?? '') : ''

  const setSubject = (value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(PERSON_PARAM, value)
    else next.delete(PERSON_PARAM)
    setParams(next)
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
     leggeva soltanto che non c'è niente da confrontare: il selettore sta
     accanto al titolo, dall'altra parte, ed è quella la cosa da fare. Solo
     se c'è qualcuno da scegliere, altrimenti manderebbe a un elenco vuoto. */
  const emptyHint =
    canPickUser && subject.isSelf && !isLoadingPeople && people.length > 0
      ? 'Scegli una persona qui sopra per leggere le sue prove'
      : undefined

  /* Il selettore della persona. Lo stesso campo con cui si sceglie una
     persona nella dashboard, e non una tendina: un'aula intera si scorreva
     voce per voce, mentre il nome che si cerca lo si sa già. Sotto a
     ciascuno solo l'email, che è quello che distingue due omonimi: quante
     prove ha si legge nell'elenco appena scelto.

     In ordine alfabetico sul nome che si legge, come nella dashboard. Qui e
     non nel server, perché l'ordine deve seguire la label, che per chi non
     ha nome è l'email. Per cognome, come nella tabella di gestione utenti
     (vedi `personOrder`): le stesse persone ordinate in due modi in due
     schermate si leggono come due elenchi diversi.

     Il contorno, etichetta sopra e posto accanto al titolo, è quello di
     `ComparisonPeopleField`, lo stesso dell'altra sezione. */
  const subjectPicker = canPickUser && (
    <ComparisonPeopleField label="Utente" htmlFor="subject">
      <SearchSelect
        id="subject"
        value={subjectId}
        onChange={setSubject}
        options={[...people].sort(comparePeople).map((p) => ({
          value: p.id,
          label: `${p.nome} ${p.cognome}`.trim() || p.email,
          sub: p.email,
        }))}
        placeholder="Cerca per nome o email..."
        emptyHint="Le mie Prove"
      />
    </ComparisonPeopleField>
  )

  return (
    <>
      <PageHeader
        title="Confronto tra i Tentativi"
        description={
          canPickUser
            ? 'Seleziona una persona e affianca due delle sue prove per osservare le differenze.'
            : 'Affianca due delle tue prove per osservare i progressi.'
        }
        actions={subjectPicker}
      />

      {loadErrors.map((message) => (
        <FormError key={message} message={message} variant="page" />
      ))}

      {sectionTabs}

      <ComparisonProvaTabs base={PROVA_BASE} value={prova} onChange={onProvaChange} />

      <TabPanel base={PROVA_BASE} value={prova}>
        {/* Ogni metà aspetta i propri dati e non anche quelli dell'altra: le
            due chiamate partono insieme, ma legarle faceva aspettare alle
            conversazioni, che sono la linguetta aperta, l'elenco dei test,
            che in quel momento nessuno sta guardando. */}
        {prova === 'conversazioni' ? (
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
    </>
  )
}
