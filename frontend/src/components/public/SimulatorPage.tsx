/* Il simulatore tecnico: come nasce un test, quali tipologie di domanda sono
 * disponibili e cosa restituisce al termine. */

import {
  Hero,
  Section,
  Bento,
  FeatureCard,
  Steps,
  CtaSection,
  SectionLink,
  LoginButton,
  PublicPage,
} from './publicUi'
import {
  ChoiceIcon,
  WriteIcon,
  OrderIcon,
  MatchIcon,
  EyeIcon,
  ClockIcon,
  DownloadIcon,
} from './publicIcons'

const PREPARATION = [
  {
    title: 'Documentazione',
    text: 'Circolari, manuali operativi e procedure in formato PDF, Word o testo costituiscono la base di riferimento del test.',
  },
  {
    title: 'Domande',
    text: "L'archivio viene generato automaticamente dai contenuti caricati oppure redatto dal formatore, e resta in bozza fino alla verifica.",
  },
  {
    title: 'Pubblicazione',
    text: 'Il test diventa disponibile al personale, che può svolgerlo tutte le volte necessarie.',
  },
]

export default function SimulatorPage() {
  return (
    <PublicPage>
      <Hero
        eyebrow="Simulatore tecnico"
        title="Verifica delle conoscenze"
        highlight="procedurali"
        description="Test costruiti sulla documentazione aziendale oppure redatti dal formatore. Ogni sessione propone dieci domande selezionate in modo casuale da un archivio di cinquanta, con correzione, spiegazione delle risposte e punteggio in decimi."
        actions={<LoginButton>Accedi</LoginButton>}
      />

      <Section
        kicker="Predisposizione"
        title="Da una procedura interna a un test"
        description="Le domande sono sempre verificate da una persona prima della pubblicazione."
      >
        <Steps items={PREPARATION} />
      </Section>

      <Section
        kicker="Tipologie"
        title="Quattro formati di domanda"
        description="Selezionabili in base alla competenza da verificare, con punteggi che confluiscono in una scala unica."
      >
        <Bento>
          <FeatureCard span="half" accent icon={<ChoiceIcon />} title="Scelta multipla">
            Selezione della risposta corretta fra le alternative proposte, con un tempo massimo per
            domanda che concorre al punteggio.
          </FeatureCard>
          <FeatureCard span="half" icon={<WriteIcon />} title="Risposta aperta">
            Risposta redatta liberamente su una traccia assegnata, valutata in base alla completezza
            rispetto ai contenuti attesi.
          </FeatureCard>
          <FeatureCard span="half" icon={<OrderIcon />} title="Ordinamento">
            Disposizione di una sequenza di passaggi nell&apos;ordine corretto, indicata per le
            procedure operative.
          </FeatureCard>
          <FeatureCard span="half" icon={<MatchIcon />} title="Abbinamento">
            Associazione fra due elenchi, indicata per casistiche, competenze e soglie di
            autorizzazione.
          </FeatureCard>
        </Bento>
      </Section>

      <Section
        kicker="Esito"
        title="Cosa resta al termine della prova"
        description="Ogni tentativo conserva le domande somministrate e le risposte fornite."
      >
        <Bento>
          <FeatureCard icon={<EyeIcon />} title="Dettaglio per domanda">
            Risposta fornita, risposta attesa, punteggio e spiegazione, con il riferimento al
            documento di origine quando previsto.
          </FeatureCard>
          <FeatureCard icon={<ClockIcon />} title="Confronto fra tentativi">
            Due prove sullo stesso test sono confrontabili domanda per domanda, con evidenza degli
            errori superati.
          </FeatureCard>
          <FeatureCard icon={<DownloadIcon />} title="Referto in PDF">
            Disponibile sia per chi ha svolto il test sia per chi ne segue i risultati.
            <div className="mt-4">
              <SectionLink to="/valutazione">Cruscotti e report</SectionLink>
            </div>
          </FeatureCard>
        </Bento>
      </Section>

      <CtaSection
        title="Accedi alla piattaforma"
        text="I test pubblicati si aprono dall'elenco delle simulazioni."
        label="Accedi"
      />
    </PublicPage>
  )
}
