/* Il roleplay: la simulazione telefonica e quella scritta, e il profilo che
 * determina il comportamento dell'interlocutore. */

import {
  Hero,
  Section,
  Bento,
  FeatureCard,
  SpecTable,
  PillList,
  CtaSection,
  SectionLink,
  LoginButton,
  PublicPage,
} from './publicUi'
import {
  PhoneIcon,
  ChatIcon,
  PersonIcon,
  PlayIcon,
  SparkIcon,
  AwardIcon,
  EyeIcon,
} from './publicIcons'

const PROFILE_SECTIONS = [
  'Anagrafica',
  'Situazione professionale',
  'Storia personale',
  'Tratti di personalità',
  'Stato emotivo',
  'Stile comunicativo',
  'Scenario e obiezioni previste',
]

export default function RoleplayPage() {
  return (
    <PublicPage>
      <Hero
        eyebrow="Roleplay telefonico e scritto"
        title="Esercitazioni realistiche su"
        highlight="conversazioni complesse"
        description="Il roleplay mette il personale di fronte a un interlocutore simulato con profilo, stato emotivo e obiettivi definiti. La conversazione si svolge al telefono con voce naturale oppure in chat, e l'interlocutore mantiene il proprio ruolo per l'intera sessione."
        actions={<LoginButton>Accedi</LoginButton>}
      />

      <Section
        kicker="La simulazione"
        title="Una telefonata, non una dimostrazione"
        description="Il dialogo si svolge interamente a voce e in tempo reale, con la stessa dinamica di una conversazione professionale."
      >
        <Bento>
          <FeatureCard
            span="twoThirds"
            accent
            icon={<PhoneIcon />}
            title="Conversazione in tempo reale"
          >
            Tempi di risposta compatibili con una telefonata reale, con la possibilità di
            intervenire mentre l&apos;interlocutore sta parlando. A ogni avatar è associata una voce
            dedicata, selezionabile fra quelle disponibili.
          </FeatureCard>
          <FeatureCard icon={<ChatIcon />} title="Canale scritto">
            Lo stesso scenario è disponibile in chat quando la modalità vocale non è praticabile.
          </FeatureCard>
          <FeatureCard icon={<PlayIcon />} title="Registrazione">
            Le telefonate sono registrate e riascoltabili dal browser, senza scaricare alcun file.
          </FeatureCard>
          <FeatureCard icon={<SparkIcon />} title="Trascrizione">
            Lo scambio viene trascritto integralmente e resta consultabile nello storico personale.
          </FeatureCard>
          <FeatureCard icon={<AwardIcon />} title="Valutazione">
            Al termine è possibile richiedere il punteggio, con i riferimenti ai passaggi rilevanti.
            <div className="mt-4">
              <SectionLink to="/valutazione">I criteri</SectionLink>
            </div>
          </FeatureCard>
        </Bento>
      </Section>

      <Section
        kicker="Canali"
        title="Telefono o chat, stesso scenario"
        description="Il canale viene scelto all'avvio e resta associato alla conversazione."
      >
        <SpecTable
          head={['', 'Telefono', 'Chat']}
          rows={[
            ['Modalità', 'Conversazione vocale in tempo reale', 'Conversazione scritta'],
            [
              'Documentazione prodotta',
              'Trascrizione e registrazione audio',
              'Trascrizione della conversazione',
            ],
            ['Valutazione', 'Sei criteri pesati', 'I medesimi criteri, esclusi gli aspetti vocali'],
          ]}
        />
      </Section>

      <Section
        kicker="Configurazione"
        title="Il profilo dell'interlocutore"
        description="Ogni avatar è definito da una scheda redatta da chi predispone la formazione, che ne determina il comportamento durante la conversazione."
      >
        <PillList items={PROFILE_SECTIONS} />
        <div className="mt-8 grid grid-cols-6 gap-5">
          <FeatureCard span="third" icon={<PersonIcon />} title="Redazione assistita">
            La scheda si compila per intero oppure si ottiene in bozza descrivendo il caso, o
            partendo da una conversazione già avvenuta. La proposta viene poi rivista e corretta
            prima della pubblicazione.
          </FeatureCard>
          <FeatureCard span="third" icon={<PersonIcon />} title="Coerenza del ruolo">
            L&apos;avatar non fornisce suggerimenti e non assume il ruolo di assistente: il
            comportamento resta coerente con il profilo assegnato.
          </FeatureCard>
          <FeatureCard span="third" icon={<EyeIcon />} title="Informativa preventiva">
            Prima della prima simulazione vocale viene presentata un&apos;informativa su
            registrazione, trascrizione e valutazione automatica della prestazione.
            <div className="mt-4">
              <SectionLink to="/piattaforma">Trattamento dei dati</SectionLink>
            </div>
          </FeatureCard>
        </div>
      </Section>

      <CtaSection
        title="Accedi alla piattaforma"
        text="Gli scenari configurati si aprono dal catalogo."
      />
    </PublicPage>
  )
}
