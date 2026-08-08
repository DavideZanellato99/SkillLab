/* La pagina di atterraggio: cosa offre la piattaforma, in sintesi.
 *
 * Resta volutamente corta. Chi arriva qui decide in pochi secondi se la cosa
 * lo riguarda, e le quattro pagine di sezione esistono proprio perché questa
 * non debba raccontare tutto. */

import {
  Hero,
  Section,
  Bento,
  FeatureCard,
  StatStrip,
  Steps,
  CtaSection,
  SectionLink,
  LoginButton,
  PublicPage,
  ghostBtnCls,
} from './publicUi'
import { PhoneIcon, ChecklistIcon, AwardIcon, TargetIcon, PlayIcon } from './publicIcons'

const NUMBERS = [
  { value: '2', label: 'canali per ogni simulazione, telefonico e scritto' },
  { value: '6', label: 'criteri di valutazione, con pesi dichiarati' },
  { value: '4', label: 'tipologie di test tecnico' },
  { value: '10', label: 'domande per sessione, selezionate in modo casuale' },
]

const STEPS = [
  {
    title: 'Selezione dello scenario',
    text: "Il catalogo raccoglie gli interlocutori simulati predisposti dall'organizzazione, ciascuno con il proprio grado di difficoltà.",
  },
  {
    title: 'Svolgimento',
    text: 'La sessione si svolge al telefono, in chat oppure come test tecnico sulle procedure interne.',
  },
  {
    title: 'Valutazione',
    text: 'Al termine la piattaforma restituisce un punteggio motivato, la documentazione della prova e il confronto con i tentativi precedenti.',
  },
]

export default function PublicHome() {
  return (
    <PublicPage>
      <Hero
        eyebrow="Formazione conversazionale con intelligenza artificiale"
        title="Simulazioni realistiche per le conversazioni"
        highlight="professionali"
        description="Il personale si esercita con interlocutori simulati, al telefono o in chat, e riceve una valutazione strutturata della prestazione. Un simulatore dedicato verifica la conoscenza delle procedure aziendali."
        actions={
          <>
            <LoginButton>Accedi</LoginButton>
            <a href="#funzionalita" className={ghostBtnCls}>
              Le funzionalità
            </a>
          </>
        }
      />

      <StatStrip items={NUMBERS} />

      <Section
        id="funzionalita"
        kicker="Funzionalità"
        title="Due ambiti di formazione, un unico percorso"
        description="La conduzione di una conversazione e la conoscenza delle procedure sono competenze distinte, e la piattaforma le allena separatamente."
      >
        <Bento>
          <FeatureCard span="half" accent icon={<PhoneIcon />} title="Roleplay con avatar">
            Interlocutori con profilo, tratti di personalità e obiettivi definiti, che rispondono al
            telefono con voce naturale oppure in chat mantenendo il proprio ruolo.
            <div className="mt-4">
              <SectionLink to="/roleplay">Approfondisci</SectionLink>
            </div>
          </FeatureCard>
          <FeatureCard span="half" icon={<ChecklistIcon />} title="Simulatore tecnico">
            Test costruiti sulla documentazione aziendale o redatti dal formatore, in quattro
            tipologie di domanda, con correzione e spiegazione delle risposte.
            <div className="mt-4">
              <SectionLink to="/simulatore">Approfondisci</SectionLink>
            </div>
          </FeatureCard>
          <FeatureCard icon={<AwardIcon />} title="Valutazione e revisione">
            Punteggio su sei criteri pesati, con riferimenti ai passaggi rilevanti. Il formatore può
            rettificarlo indicandone la motivazione.
          </FeatureCard>
          <FeatureCard icon={<PlayIcon />} title="Registrazione e trascrizione">
            Ogni conversazione viene trascritta integralmente e ogni telefonata registrata, con
            accesso dallo storico personale.
          </FeatureCard>
          <FeatureCard icon={<TargetIcon />} title="Obiettivi formativi">
            Obiettivi individuali con scadenza, avanzamento aggiornato automaticamente e notifica
            alle persone interessate.
          </FeatureCard>
        </Bento>
      </Section>

      <Section
        kicker="Utilizzo"
        title="Tre passaggi, nessuna configurazione"
        description="Per iniziare sono sufficienti un browser e un microfono."
      >
        <Steps items={STEPS} />
        <div className="mt-8">
          <SectionLink to="/piattaforma">
            Ruoli, modalità di adozione e trattamento dei dati
          </SectionLink>
        </div>
      </Section>

      <CtaSection
        title="Accedi alla piattaforma"
        text="L'accesso è riservato alle organizzazioni clienti, con le credenziali fornite dal proprio amministratore."
      />
    </PublicPage>
  )
}
