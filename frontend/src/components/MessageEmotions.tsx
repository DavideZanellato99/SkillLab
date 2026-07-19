import Tooltip from './Tooltip';

/* Hume EVI accoda ai messaggi utente un tag con le emozioni rilevate dalla
 * prosodia vocale, es. "{somewhat focused, slightly determined}". Qui il tag
 * viene separato dal testo, tradotto in italiano e mostrato come badge
 * "Tono di voce" sotto il messaggio, invece del testo grezzo tra graffe. */

export interface ParsedEmotion {
  /** Nome dell'emozione in italiano (es. "Concentrazione") */
  label: string;
  /** Avverbio di intensità in italiano (es. "leggermente") */
  intensityLabel: string;
  /** Intensità su scala 1-3, usata per i pallini del badge */
  level: 1 | 2 | 3;
  /** Testo originale inglese, mostrato nel tooltip */
  raw: string;
}

/** Avverbi di intensità usati da Hume, dal più lungo al più corto
 * (il matching prova i prefissi in quest'ordine) */
const INTENSITIES: Array<{ prefix: string; label: string; level: 1 | 2 | 3 }> = [
  { prefix: 'not at all', label: 'per nulla', level: 1 },
  { prefix: 'a little', label: 'un po’', level: 1 },
  { prefix: 'slightly', label: 'leggermente', level: 1 },
  { prefix: 'somewhat', label: 'in parte', level: 2 },
  { prefix: 'moderately', label: 'moderatamente', level: 2 },
  { prefix: 'quite', label: 'piuttosto', level: 2 },
  { prefix: 'extremely', label: 'estremamente', level: 3 },
  { prefix: 'intensely', label: 'intensamente', level: 3 },
  { prefix: 'very', label: 'molto', level: 3 },
];

/** Le 48 emozioni prosodiche di Hume, in forma aggettivale (come compaiono
 * nel tag) e nominale (per robustezza), tradotte in italiano */
const EMOTION_LABELS: Record<string, string> = {
  admiring: 'Ammirazione',
  admiration: 'Ammirazione',
  adoring: 'Adorazione',
  adoration: 'Adorazione',
  appreciative: 'Apprezzamento',
  'aesthetic appreciation': 'Apprezzamento estetico',
  amused: 'Divertimento',
  amusement: 'Divertimento',
  angry: 'Rabbia',
  anger: 'Rabbia',
  anxious: 'Ansia',
  anxiety: 'Ansia',
  awestruck: 'Meraviglia',
  awed: 'Meraviglia',
  awe: 'Meraviglia',
  awkward: 'Disagio',
  uncomfortable: 'Disagio',
  awkwardness: 'Disagio',
  bored: 'Noia',
  boredom: 'Noia',
  calm: 'Calma',
  calmness: 'Calma',
  focused: 'Concentrazione',
  concentrated: 'Concentrazione',
  concentration: 'Concentrazione',
  confused: 'Confusione',
  confusion: 'Confusione',
  contemplative: 'Riflessione',
  contemplation: 'Riflessione',
  contemptuous: 'Disprezzo',
  contempt: 'Disprezzo',
  content: 'Appagamento',
  contentment: 'Appagamento',
  craving: 'Brama',
  desirous: 'Desiderio',
  desire: 'Desiderio',
  determined: 'Determinazione',
  determination: 'Determinazione',
  disappointed: 'Delusione',
  disappointment: 'Delusione',
  disgusted: 'Disgusto',
  disgust: 'Disgusto',
  distressed: 'Angoscia',
  distress: 'Angoscia',
  doubtful: 'Dubbio',
  doubt: 'Dubbio',
  ecstatic: 'Estasi',
  euphoric: 'Estasi',
  ecstasy: 'Estasi',
  embarrassed: 'Imbarazzo',
  embarrassment: 'Imbarazzo',
  'empathic pain': 'Dolore empatico',
  empathetic: 'Empatia',
  entranced: 'Incanto',
  entrancement: 'Incanto',
  envious: 'Invidia',
  envy: 'Invidia',
  excited: 'Entusiasmo',
  excitement: 'Entusiasmo',
  fearful: 'Paura',
  afraid: 'Paura',
  fear: 'Paura',
  guilty: 'Senso di colpa',
  guilt: 'Senso di colpa',
  horrified: 'Orrore',
  horror: 'Orrore',
  interested: 'Interesse',
  interest: 'Interesse',
  joyful: 'Gioia',
  joy: 'Gioia',
  loving: 'Affetto',
  love: 'Amore',
  nostalgic: 'Nostalgia',
  nostalgia: 'Nostalgia',
  pained: 'Dolore',
  pain: 'Dolore',
  proud: 'Orgoglio',
  pride: 'Orgoglio',
  inspired: 'Ispirazione',
  realization: 'Consapevolezza',
  relieved: 'Sollievo',
  relief: 'Sollievo',
  romantic: 'Romanticismo',
  romance: 'Romanticismo',
  sad: 'Tristezza',
  sadness: 'Tristezza',
  satisfied: 'Soddisfazione',
  satisfaction: 'Soddisfazione',
  ashamed: 'Vergogna',
  shame: 'Vergogna',
  surprised: 'Sorpresa',
  surprise: 'Sorpresa',
  'surprise (negative)': 'Sorpresa (negativa)',
  'surprise (positive)': 'Sorpresa (positiva)',
  amazed: 'Stupore',
  sympathetic: 'Comprensione',
  sympathy: 'Comprensione',
  tired: 'Stanchezza',
  tiredness: 'Stanchezza',
  triumphant: 'Trionfo',
  triumph: 'Trionfo',
};

function parseEntry(entry: string): ParsedEmotion | null {
  const raw = entry.trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();
  let intensityLabel = '';
  let level: 1 | 2 | 3 = 2;
  let term = lower;

  for (const { prefix, label, level: lvl } of INTENSITIES) {
    if (lower.startsWith(`${prefix} `)) {
      intensityLabel = label;
      level = lvl;
      term = lower.slice(prefix.length + 1).trim();
      break;
    }
  }

  // Emozione non in mappa: mostra comunque il termine originale capitalizzato
  const label = EMOTION_LABELS[term] ?? term.charAt(0).toUpperCase() + term.slice(1);
  return { label, intensityLabel, level, raw };
}

/**
 * Separa il testo del messaggio dal tag emotivo finale di Hume.
 * Se il tag non c'è, restituisce il testo invariato ed emozioni vuote.
 */
export function splitEmotionTag(content: string): { text: string; emotions: ParsedEmotion[] } {
  const match = content.match(/\s*\{([^{}]+)\}\s*$/);
  if (!match) return { text: content, emotions: [] };

  const emotions = match[1]
    .split(',')
    .map(parseEntry)
    .filter((e): e is ParsedEmotion => e !== null);

  // Graffe finali che non descrivono emozioni: lascia il testo com'è
  if (emotions.length === 0) return { text: content, emotions: [] };

  return { text: content.slice(0, match.index).trimEnd(), emotions };
}

/** Riga compatta "Tono di voce" da mostrare dentro la bolla del messaggio
 * utente (sfondo viola, testo bianco) */
export default function MessageEmotions({ emotions }: { emotions: ParsedEmotion[] }) {
  if (emotions.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-white/10 pt-1.5 text-[0.6rem] leading-tight">
      <span className="font-semibold uppercase tracking-wide text-white/50">Tono</span>
      {emotions.map((e) => (
        <Tooltip
          key={e.raw}
          content={
            <>
              <span className="font-semibold text-slate-100">{e.label}</span>
              {e.intensityLabel && ` · ${e.intensityLabel}`}
              <span className="block text-[0.65rem] text-slate-500">rilevato: “{e.raw}”</span>
            </>
          }
        >
          <span className="inline-flex cursor-default items-baseline gap-0.5 rounded-full border border-white/25 px-1.5 py-px text-white/80">
            {e.label}
            <span aria-hidden className="text-[0.4rem] leading-none tracking-[0.1em]">
              {'●'.repeat(e.level)}
              <span className="opacity-30">{'●'.repeat(3 - e.level)}</span>
            </span>
          </span>
        </Tooltip>
      ))}
    </div>
  );
}
