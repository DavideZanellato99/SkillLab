import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { useOrganizations } from '../hooks/useOrganizations'
import { isSuperAdmin } from '../services/auth'
import {
  dashboardPath,
  viewFromPath,
  visibleViews,
  type DashboardScope,
  type DashboardView,
} from './dashboardViews'
import { prefetchPage } from './lazyPages'
import { PageContainer, PageHeader } from './PageLayout'
import PeriodOrgFilters from './PeriodOrgFilters'
import { PERIOD_OPTIONS } from './reportFormat'
import type { PeriodValue } from './reportFormat'
import TabBar from './TabBar'

/* Il guscio della sezione dashboard: il titolo, i due filtri che valgono per
 * tutte le viste e le linguette con cui si passa dall'una all'altra.
 *
 * Le viste sono quattro schermate e non quattro pannelli della stessa: sono
 * quattro domande diverse sulle stesse prove ("chi è messo bene", "il
 * programma funziona", "cosa è tarato male", "chi sta usando la
 * piattaforma"), e ognuna legge dati suoi. Quindi ognuna è una rotta, con il
 * proprio indirizzo da mandare a qualcuno e il proprio file che il browser
 * scarica solo entrandoci: aprire i punteggi non paga la scansione dei
 * percorsi per scoprire che non li si sta guardando.
 *
 * Periodo e organizzazione stanno qui e non nelle viste perché sono i due
 * filtri che il server capisce, cioè quelli che decidono quali righe
 * arrivano, e sono gli stessi per tutte e quattro: chi cambia linguetta li
 * ritrova dove li ha lasciati. Restano nell'indirizzo, che è la loro unica
 * copia, e viaggiano nel contesto dell'`Outlet` perché le viste non ne
 * tengano quattro letture libere di divergere. */

/* Come le due scelte del guscio si scrivono nell'indirizzo. In italiano come
 * le rotte, e corte: è un indirizzo che finisce copiato in una chat. */
const ORG_PARAM = 'organizzazione'
const PERIOD_PARAM = 'periodo'

/* I filtri delle singole viste che il guscio conosce, e per un motivo solo:
 * scelgono delle persone, e le persone stanno dentro l'organizzazione. Quando
 * quella cambia, o quando si azzera tutto, se ne vanno con lei: resterebbero
 * un filtro attivo e un confronto composto su gente che non è più in elenco. */
const PEOPLE_PARAMS = ['persona', 'confronto']

/** Il valore letto dall'indirizzo, se è uno di quelli che esistono. */
function pickOption<T extends string>(
  raw: string | null,
  options: readonly { value: T }[],
  fallback: T,
): T {
  return options.some((o) => o.value === raw) ? (raw as T) : fallback
}

export default function DashboardPage() {
  const { user } = useAuth()
  const showOrgFilter = isSuperAdmin(user)
  const { data: organizations = [] } = useOrganizations(isSuperAdmin(user))
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const view = viewFromPath(pathname)
  const views = visibleViews(isSuperAdmin(user))
  const current = views.find((v) => v.value === view) ?? views[0]

  const setParam = (name: string, value: string, daTogliere?: string[]) => {
    const next = new URLSearchParams(params)
    if (value) next.set(name, value)
    else next.delete(name)
    for (const altro of daTogliere ?? []) next.delete(altro)
    /* Sempre sostituendo il passo: qui si cambia filtro di continuo, e ogni
       scelta lasciata in cronologia sarebbe un tasto indietro che non riporta
       alla pagina di prima ma al periodo di prima. */
    setParams(next, { replace: true })
  }

  /* L'organizzazione nell'indirizzo vale solo per chi la può scegliere: a un
     org admin il server risponde comunque con la sua, e la pagina intanto si
     scriverebbe accanto al titolo il nome di un'altra. */
  const organizationId = showOrgFilter ? (params.get(ORG_PARAM) ?? '') : ''
  /* Il periodo è l'unico filtro che il server capisce insieme
     all'organizzazione: gli altri restringono righe già arrivate, questo
     decide quante ne arrivano. Parte da "Sempre" come nel report attività,
     perché un filtro già acceso mostrerebbe una pagina mezza vuota a chi non
     sa che esiste, e quella si legge come un dato sbagliato. */
  const period = pickOption<PeriodValue>(params.get(PERIOD_PARAM), PERIOD_OPTIONS, 'all')
  const days = period === 'all' ? undefined : Number(period)

  /* Azzerare riporta la sezione a tutta la storia e a tutte le
     organizzazioni, e con loro se ne vanno le persone scelte: stanno
     nell'elenco che l'organizzazione porta, come quando la si cambia. I
     filtri interni a una vista (il canale, il tipo di test) restano, che sono
     la prova di cui si stanno leggendo i grafici e non un modo di
     restringerli. */
  const resetFilters = () => {
    const next = new URLSearchParams(params)
    next.delete(PERIOD_PARAM)
    next.delete(ORG_PARAM)
    for (const nome of PEOPLE_PARAMS) next.delete(nome)
    setParams(next, { replace: true })
  }

  /* Cambiare linguetta cambia indirizzo e si porta dietro i filtri: sono di
     tutta la sezione, e ritrovarli accesi è quello che rende le quattro viste
     una schermata sola invece di quattro pagine slegate. */
  const openView = (next: DashboardView) => {
    navigate(`${dashboardPath(next)}${search}`)
  }

  const scope: DashboardScope = { organizationId, days, period }

  return (
    <PageContainer>
      <PageHeader title="Dashboard" description={current.description} />

      {/* Periodo e organizzazione sotto l'intestazione, come in ogni altro
          elenco dell'applicazione: sono i due filtri che il server capisce,
          cioè quelli che decidono quali righe arrivano. */}
      <PeriodOrgFilters
        idPrefix="dashboard"
        period={period}
        onPeriodChange={(value) => setParam(PERIOD_PARAM, value === 'all' ? '' : value)}
        organizationOptions={
          showOrgFilter ? organizations.map((o) => ({ value: o.id, label: o.name })) : undefined
        }
        organizationId={organizationId}
        /* Cambiando organizzazione le persone scelte non sono più fra quelle
           in elenco: se ne vanno con il filtro che le ha portate. */
        onOrganizationChange={
          showOrgFilter ? (value) => setParam(ORG_PARAM, value, PEOPLE_PARAMS) : undefined
        }
        onReset={resetFilters}
      />

      {/* Le linguette della sezione. Al passaggio del puntatore fanno partire
          il file della vista, come le voci della barra di navigazione: fra
          quel momento e il click c'è quanto basta perché arrivi. */}
      <TabBar
        items={views.map((v) => ({ value: v.value, label: v.label }))}
        value={current.value}
        onChange={openView}
        onItemHover={(next) => prefetchPage(dashboardPath(next))}
        ariaLabel="Vista della dashboard"
      />

      <Outlet context={scope} />
    </PageContainer>
  )
}
