/* Valutazione, revisione del formatore e strumenti di analisi: la parte
 * della piattaforma che misura i risultati. */

import {
  Hero,
  Section,
  Bento,
  FeatureCard,
  WeightRow,
  CtaSection,
  SectionLink,
  LoginButton,
  PublicPage,
  cardCls,
} from './publicUi'
import {
  DocumentIcon,
  PersonIcon,
  DownloadIcon,
  TargetIcon,
  TrendingUpIcon,
  DashboardIcon,
} from './publicIcons'

const CRITERIA = [
  { label: 'Corretta identificazione del cliente', weight: 22 },
  { label: 'Comprensione della casistica e risposte pertinenti', weight: 22 },
  { label: 'Rispetto delle fasi della chiamata', weight: 18 },
  { label: "Empatia e gestione dello stato d'animo", weight: 15 },
  { label: 'Sicurezza, competenza e autorevolezza', weight: 13 },
  { label: 'Appropriatezza di linguaggio, cortesia e professionalità', weight: 10 },
]

export default function EvaluationPage() {
  return (
    <PublicPage>
      <Hero
        eyebrow="Valutazione e analisi"
        title="Punteggi motivati e"
        highlight="verificabili"
        description="Ogni conversazione riceve una valutazione su sei criteri pesati, con motivazione e riferimenti ai passaggi rilevanti. Il formatore può rettificare il punteggio, e la rettifica prevale in ogni schermata, referto ed esportazione."
        actions={<LoginButton>Accedi</LoginButton>}
      />

      <Section
        kicker="Criteri"
        title="Sei criteri, pesi dichiarati"
        description="Il punteggio complessivo è la media pesata dei sei criteri, espressa in decimi."
      >
        <div className={`${cardCls} flex flex-col gap-5 p-9 max-md:p-7`}>
          {CRITERIA.map((c) => (
            <WeightRow key={c.label} label={c.label} weight={c.weight} />
          ))}
        </div>
      </Section>

      <Section
        kicker="Contenuto"
        title="Cosa riporta una valutazione"
        description="Ogni criterio è accompagnato dagli elementi che lo motivano, così il punteggio resta verificabile."
      >
        <Bento>
          <FeatureCard span="half" icon={<DocumentIcon />} title="Punteggio e riferimenti">
            Per ciascun criterio vengono indicati il punteggio, una valutazione discorsiva della
            prestazione e i passaggi della conversazione su cui si fonda, richiamabili nella
            trascrizione e, per le telefonate, nella registrazione.
          </FeatureCard>
          <FeatureCard span="half" accent icon={<PersonIcon />} title="Revisione del formatore">
            La valutazione automatica costituisce una proposta. Il formatore può rettificare il
            punteggio con motivazione obbligatoria, aggiungere una nota di sintesi e annotare
            singoli passaggi. La revisione è consultabile anche dalla persona valutata.
          </FeatureCard>
          <FeatureCard span="full" icon={<DownloadIcon />} title="Referto in PDF">
            Il documento riporta il punteggio complessivo, i sei criteri con i relativi commenti, le
            indicazioni di miglioramento, le note del formatore e la trascrizione integrale della
            conversazione. È disponibile sia per la persona valutata sia per chi ne segue la
            formazione, e un referto analogo è previsto per i test tecnici.
          </FeatureCard>
        </Bento>
      </Section>

      <Section
        kicker="Analisi"
        title="Dai singoli risultati all'andamento del gruppo"
        description="Gli strumenti a disposizione di chi coordina la formazione."
      >
        <Bento>
          <FeatureCard icon={<TargetIcon />} title="Obiettivi formativi">
            Punteggio da raggiungere su uno scenario, con scadenza facoltativa, avanzamento
            automatico e notifica alle persone interessate.
          </FeatureCard>
          <FeatureCard icon={<TrendingUpIcon />} title="Confronto fra tentativi">
            Due sessioni sullo stesso scenario affiancate criterio per criterio, per verificare
            l&apos;evoluzione della prestazione.
          </FeatureCard>
          <FeatureCard icon={<DashboardIcon />} title="Cruscotti e report">
            Andamento nel tempo, medie per criterio e report individuale, con esportazione in foglio
            di calcolo.
            <div className="mt-4">
              <SectionLink to="/piattaforma">Ruoli e visibilità</SectionLink>
            </div>
          </FeatureCard>
        </Bento>
      </Section>

      <CtaSection
        title="Accedi alla piattaforma"
        text="Valutazioni, obiettivi e strumenti di analisi sono disponibili in funzione del profilo assegnato."
      />
    </PublicPage>
  )
}
