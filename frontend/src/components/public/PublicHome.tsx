/* La pagina pubblica: cosa è SkillLab e quali servizi offre, in sintesi.
 *
 * È l'unica pagina accessibile senza credenziali, e resta volutamente corta.
 * Chi la apre valuta in pochi secondi se la piattaforma risponde a un proprio
 * bisogno, quindi la presentazione si ferma prima delle condizioni, dei numeri
 * e delle configurazioni: quel livello di dettaglio interessa chi la
 * piattaforma la sta già usando, e lo trova all'interno. */

import {
  Hero,
  Section,
  Bento,
  FeatureCard,
  Steps,
  CtaSection,
  LoginButton,
  PublicPage,
  ghostBtnCls,
} from './publicUi'
import { PhoneIcon, ChecklistIcon, AwardIcon, TargetIcon, PlayIcon, ChartIcon } from './publicIcons'

const STEPS = [
  {
    title: 'Selezione della prova',
    text: 'Il catalogo raccoglie gli scenari di conversazione e i test disponibili.',
  },
  {
    title: 'Svolgimento',
    text: 'La sessione si conduce interamente dal browser, al telefono, in chat oppure come test sulle procedure interne.',
  },
  {
    title: 'Valutazione',
    text: 'Al termine la piattaforma restituisce un punteggio motivato e la documentazione integrale della prova.',
  },
]

export default function PublicHome() {
  return (
    <PublicPage>
      <Hero
        eyebrow="Formazione conversazionale con intelligenza artificiale"
        title="Simulazioni realistiche per le conversazioni"
        highlight="professionali"
        description="SkillLab è una piattaforma di formazione aziendale. Il personale si esercita con interlocutori simulati, al telefono o in chat, verifica la conoscenza delle procedure interne e riceve una valutazione strutturata della prestazione."
        actions={
          <>
            <LoginButton>Accedi</LoginButton>
            <a href="#servizi" className={ghostBtnCls}>
              I servizi
            </a>
          </>
        }
      />

      <Section
        id="servizi"
        kicker="Servizi"
        title="Esercitazione, verifica e misurazione dei risultati"
        description="La conduzione di una conversazione e la conoscenza delle procedure sono competenze distinte. La piattaforma le sviluppa separatamente e ne misura i risultati nel tempo."
      >
        <Bento>
          <FeatureCard span="half" accent icon={<PhoneIcon />} title="Roleplay con avatar">
            Interlocutori simulati con profilo e obiettivi definiti, che rispondono al telefono con
            voce naturale oppure in chat, mantenendo il ruolo assegnato per l'intera conversazione.
          </FeatureCard>
          <FeatureCard span="half" icon={<ChecklistIcon />} title="Simulatore tecnico">
            Test di verifica sulle procedure aziendali, con correzione immediata e motivazione delle
            risposte.
          </FeatureCard>
          <FeatureCard icon={<AwardIcon />} title="Valutazione della prestazione">
            Al termine di ogni prova viene prodotto un punteggio calcolato su criteri dichiarati,
            corredato dalle motivazioni e sottoponibile a revisione.
          </FeatureCard>
          <FeatureCard icon={<TargetIcon />} title="Percorsi e obiettivi">
            Le prove si organizzano in percorsi formativi assegnati al personale, con obiettivi
            definiti e avanzamento aggiornato automaticamente.
          </FeatureCard>
          <FeatureCard icon={<ChartIcon />} title="Andamento nel tempo">
            Lo storico delle sessioni documenta l'evoluzione della singola persona e l'andamento
            complessivo dell'organico.
          </FeatureCard>
          <FeatureCard span="full" icon={<PlayIcon />} title="Documentazione di ogni prova">
            Le conversazioni vengono trascritte integralmente e le telefonate registrate, rimanendo
            disponibili per il riascolto e la revisione.
          </FeatureCard>
        </Bento>
      </Section>

      <Section
        kicker="Utilizzo"
        title="Tre passaggi, senza installazioni"
        description="Per l'avvio sono sufficienti un browser e un microfono."
      >
        <Steps items={STEPS} />
      </Section>

      <CtaSection
        title="Accedi alla piattaforma"
        text="L'accesso avviene con le credenziali fornite dal proprio amministratore."
      />
    </PublicPage>
  )
}
