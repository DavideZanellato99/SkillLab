import { useSearchParams } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { isAdmin } from '../services/auth'
import ComparisonAttempts from './ComparisonAttempts'
import type { ComparisonProva } from './ComparisonProvaTabs'
import ComparisonUsers from './ComparisonUsers'
import TabBar from './TabBar'
import { PageContainer } from './PageLayout'

/* La pagina del confronto: due sezioni, una linguetta per ciascuna.
 *
 * La prima ([ComparisonAttempts](./ComparisonAttempts.tsx)) affianca due
 * prove della stessa persona, e risponde a "sono migliorato". La seconda
 * ([ComparisonUsers](./ComparisonUsers.tsx)), che uno studente non vede,
 * mette una sotto l'altra le medie di più persone scelte da chi amministra,
 * e risponde a "come vanno questi quattro". Sta qui e non nella dashboard
 * perché anche lei si compone scegliendo delle persone.
 *
 * Erano due riquadri uno sotto l'altro, e sono diventati due linguette: sono
 * due domande diverse, e chi ne fa una non sta facendo l'altra, mentre il
 * secondo riquadro sotto il primo si leggeva come la continuazione dello
 * stesso confronto. Il titolo della pagina è quello della sezione aperta,
 * "Confronto tra i Tentativi" o "Confronto tra Utenti", e ogni sezione lo
 * scrive da sé insieme al comando che le sta accanto: un "Confronto" sopra
 * due sottotitoli diceva la stessa cosa due volte. Lo studente, che ha una
 * sezione sola, non vede nessuna linguetta di primo livello.
 *
 * Dentro ciascuna sezione, due prove e una linguetta per ciascuna, come nella
 * dashboard: una conversazione valutata e un test tecnico si guardano una
 * per volta, perché il miglioramento in una non dice niente dell'altra. La
 * scelta è una sola per tutte e due le sezioni, ed è per questo che la tiene
 * la pagina: sono la stessa prova guardata su una persona e su più persone,
 * e passando da una sezione all'altra si resta su quella.
 *
 * La sezione e la prova stanno nell'indirizzo, come la persona e le persone
 * messe a confronto che le sezioni scrivono da sé: un confronto è una cosa
 * che un docente tiene aperta accanto a un'altra scheda o manda a qualcuno.
 * Le linguette sostituiscono il passo invece di aggiungerne uno: passare da
 * una sezione o da una prova all'altra è guardare la stessa pagina da
 * un'altra parte, mentre la persona è un'altra pagina, ed è quella su cui il
 * tasto indietro deve tornare. */

type ComparisonSection = 'tentativi' | 'utenti'

/** Come le due scelte si scrivono nell'indirizzo. */
const SECTION_PARAM = 'sezione'
const PROVA_PARAM = 'prova'
/** Le persone del confronto tra utenti, che scrive ComparisonUsers. */
const COMPARE_PARAM = 'confronto'

export default function ComparisonPage() {
  const { user } = useAuth()
  const hasBothSections = isAdmin(user)

  const [params, setParams] = useSearchParams()
  const prova: ComparisonProva =
    params.get(PROVA_PARAM) === 'simulazioni' ? 'simulazioni' : 'conversazioni'
  /* La sezione vale solo per chi ne ha due. Un indirizzo con le persone del
     confronto tra utenti e senza sezione apre su quella: i link composti
     quando le due sezioni erano due riquadri della stessa pagina devono
     aprirsi ancora sul grafico che portano. */
  const section: ComparisonSection = !hasBothSections
    ? 'tentativi'
    : params.get(SECTION_PARAM) === 'utenti' ||
        (params.get(SECTION_PARAM) === null && params.has(COMPARE_PARAM))
      ? 'utenti'
      : 'tentativi'

  const setParam = (name: string, value: string) => {
    const next = new URLSearchParams(params)
    next.set(name, value)
    setParams(next, { replace: true })
  }
  const setProva = (value: ComparisonProva) => setParam(PROVA_PARAM, value)

  /* Le due sezioni, solo per chi ne ha due: uno studente ha la sola prima, e
     una linguetta sola non è una scelta. Senza `panelBase`, come le viste
     della dashboard: il contenuto comandato comincia sotto la barra e non ha
     un pannello proprio, e un `aria-controls` che punta a un id inesistente
     dice una cosa falsa. */
  const sectionTabs = hasBothSections && (
    <TabBar
      items={[
        { value: 'tentativi', label: 'Tra tentativi' },
        { value: 'utenti', label: 'Tra utenti' },
      ]}
      value={section}
      onChange={(value) => setParam(SECTION_PARAM, value)}
      ariaLabel="Sezione del confronto"
    />
  )

  return (
    <PageContainer width="split">
      {section === 'tentativi' ? (
        <ComparisonAttempts prova={prova} onProvaChange={setProva} sectionTabs={sectionTabs} />
      ) : (
        <ComparisonUsers prova={prova} onProvaChange={setProva} sectionTabs={sectionTabs} />
      )}
    </PageContainer>
  )
}
