/* La presentazione generale: componenti, ruoli, adozione e trattamento dei
 * dati. È la pagina destinata a chi valuta l'adozione, quindi dice cosa la
 * piattaforma offre e cosa richiede all'organizzazione. */

import {
  Hero,
  Section,
  Bento,
  FeatureCard,
  SpecTable,
  Steps,
  CtaSection,
  SectionLink,
  LoginButton,
  PublicPage,
} from './publicUi'
import {
  PhoneIcon,
  ChecklistIcon,
  AwardIcon,
  PersonIcon,
  UsersIcon,
  ShieldIcon,
  MicIcon,
  DocumentIcon,
} from './publicIcons'

const CYCLE = [
  {
    title: 'Configurazione',
    text: "Gli amministratori predispongono gli interlocutori simulati e i test a partire dalle procedure dell'organizzazione.",
  },
  {
    title: 'Attività formativa',
    text: 'Il personale svolge simulazioni e test assegnati, con la possibilità di ripetere ogni scenario senza limitazioni.',
  },
  {
    title: 'Revisione e analisi',
    text: 'I formatori revisionano le valutazioni, assegnano gli obiettivi e consultano gli indicatori di sintesi.',
  },
]

const ROLES = [
  [
    'Personale in formazione',
    'Catalogo degli scenari, obiettivi assegnati, storico personale e confronto fra i propri tentativi',
    'I dati di altri utenti',
  ],
  [
    'Formatori',
    'Prove della propria organizzazione, revisione delle valutazioni, obiettivi, cruscotti e report',
    'I contenuti di altre organizzazioni',
  ],
  [
    'Amministratori',
    'Organizzazioni, account, avatar, simulazioni tecniche e registro delle attività',
    'Profilo riservato alla gestione della piattaforma',
  ],
]

export default function PlatformPage() {
  return (
    <PublicPage>
      <Hero
        eyebrow="La piattaforma"
        title="Formazione conversazionale e"
        highlight="misurazione dei risultati"
        description="SkillLab unisce l'esercitazione con interlocutori simulati alla valutazione strutturata della prestazione. Si utilizza da browser, i contenuti sono definiti dall'organizzazione e ogni sessione produce documentazione consultabile."
        actions={<LoginButton>Accedi</LoginButton>}
      />

      <Section
        kicker="Componenti"
        title="Tre parti, un solo percorso"
        description="Scenari, prove e punteggi restano collegati e si consultano in modo omogeneo."
      >
        <Bento>
          <FeatureCard icon={<PhoneIcon />} title="Roleplay">
            Conversazioni con interlocutori simulati, al telefono con voce naturale oppure in chat.
            <div className="mt-4">
              <SectionLink to="/roleplay">Approfondisci</SectionLink>
            </div>
          </FeatureCard>
          <FeatureCard icon={<ChecklistIcon />} title="Simulatore tecnico">
            Test di verifica sulle procedure interne, con correzione e spiegazione delle risposte.
            <div className="mt-4">
              <SectionLink to="/simulatore">Approfondisci</SectionLink>
            </div>
          </FeatureCard>
          <FeatureCard icon={<AwardIcon />} title="Valutazione e analisi">
            Punteggi motivati, revisione del formatore e indicatori sull&apos;andamento individuale
            e di gruppo.
            <div className="mt-4">
              <SectionLink to="/valutazione">Approfondisci</SectionLink>
            </div>
          </FeatureCard>
        </Bento>
      </Section>

      <Section kicker="Percorso" title="Dalla configurazione ai risultati">
        <Steps items={CYCLE} />
      </Section>

      <Section
        kicker="Ruoli"
        title="Tre profili, perimetri distinti"
        description="Ogni profilo accede alle sole informazioni di propria competenza."
      >
        <SpecTable head={['Profilo', 'Funzioni disponibili', 'Ambito escluso']} rows={ROLES} />
      </Section>

      <Section
        kicker="Adozione"
        title="Cosa serve, e cosa resta in capo all'organizzazione"
        description="La piattaforma è operativa senza interventi sulle postazioni, e la documentazione di conformità viene fornita a supporto degli adempimenti del cliente."
      >
        <Bento>
          <FeatureCard icon={<MicIcon />} title="Nessuna installazione">
            Si utilizza da browser: per le simulazioni vocali è sufficiente un microfono.
          </FeatureCard>
          <FeatureCard icon={<DocumentIcon />} title="Contenuti personalizzati">
            Gli scenari riproducono la casistica reale e i test derivano dalle procedure già in uso.
          </FeatureCard>
          <FeatureCard icon={<UsersIcon />} title="Gestione degli account">
            Account creati dagli amministratori, con sospensione e disattivazione a effetto
            immediato.
          </FeatureCard>
          <FeatureCard span="half" icon={<ShieldIcon />} title="Separazione fra organizzazioni">
            Avatar, test, conversazioni e account appartengono a una singola organizzazione. Ogni
            categoria di dato ha un periodo di conservazione dichiarato, al termine del quale viene
            eliminata, e ogni utente può scaricare i propri dati dalla pagina di profilo.
          </FeatureCard>
          <FeatureCard span="half" accent icon={<PersonIcon />} title="Intervento umano garantito">
            Il punteggio assegnato automaticamente può essere rettificato da un formatore, con
            motivazione registrata, e la rettifica prevale ovunque. L&apos;informativa al personale
            resta a carico del datore di lavoro, che mantiene il ruolo di titolare del trattamento.
          </FeatureCard>
        </Bento>
      </Section>

      <CtaSection
        title="Accedi alla piattaforma"
        text="Le organizzazioni clienti accedono con le credenziali fornite dal proprio amministratore."
      />
    </PublicPage>
  )
}
