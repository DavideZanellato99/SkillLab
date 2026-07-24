import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchEvaluationsReport, fetchEvaluationsReportXlsx } from '../services/admin';
import type { EvaluationReportRow } from '../services/admin';
import { saveBlob } from '../services/api';
import { fetchOrganizations } from '../services/organizations';
import type { Organization } from '../services/organizations';
import { isAdmin, isSuperAdmin } from '../services/auth';
import SearchSelect from './SearchSelect';
import Select from './Select';
import ConversationModeBadge, { conversationModeLabel } from './ConversationModeBadge';
import type { ConversationMode } from '../services/api';
import DataTable, { Td, Tr } from './DataTable';
import Tooltip from './Tooltip';
import { matchesSearch } from './tableSearch';
import ConversationDetailModal from './ConversationDetailModal';

/* Dashboard admin: grafici di riepilogo sui punteggi delle valutazioni,
 * globali o filtrati per singolo utente tramite la ricerca in alto. */

const cardCls = 'rounded-2xl border border-white/6 bg-gray-900/60 p-6 backdrop-blur-md';

/* Stessa convenzione colori dell'EvaluationModal: ≥7 verde, ≥5 arancio, <5 rosso */
function scoreTextColor(score: number): string {
  if (score >= 7) return 'text-emerald-400';
  if (score >= 5) return 'text-orange-400';
  return 'text-red-400';
}

function scoreBarColor(score: number): string {
  if (score >= 7) return 'bg-emerald-500';
  if (score >= 5) return 'bg-orange-500';
  return 'bg-red-500';
}

function formatScore(score: number): string {
  return score.toLocaleString('it-IT', { maximumFractionDigits: 1 });
}

function formatDay(date: Date): string {
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('it-IT', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function displayName(row: EvaluationReportRow): string {
  return row.user_nome && row.user_cognome
    ? `${row.user_nome} ${row.user_cognome}`
    : row.user_email;
}

interface DayPoint {
  date: Date;
  avg: number;
  count: number;
}

interface CriterionAvg {
  key: string;
  label: string;
  avg: number;
}

/* Intestazioni brevi per le colonne dei criteri nella tabella. La prima parola
 * dell'etichetta completa non basta a distinguerli, "Corretta identificazione
 * del cliente" diventerebbe "Corretta". L'etichetta intera resta nel tooltip.
 * Le chiavi sono quelle di openai_service.EVALUATION_CRITERIA. */
const CRITERION_SHORT_LABELS: Record<string, string> = {
  rispetto_fasi_chiamata: 'Fasi',
  empatia: 'Empatia',
  sicurezza_competenza: 'Sicurezza',
  appropriatezza_linguaggio: 'Linguaggio',
  identificazione_cliente: 'Identificazione',
  comprensione_casistica: 'Casistica',
};

function shortCriterionLabel(key: string, label: string): string {
  return CRITERION_SHORT_LABELS[key] ?? label.split(' ')[0].replace(/[,;:]$/, '');
}

interface UserAvg {
  userId: string;
  name: string;
  email: string;
  avg: number;
  count: number;
}

/* ── Selettore di canale: scopa l'intera dashboard ──
 *
 * Le due modalità si valutano sugli stessi criteri ma non sono confrontabili
 * alla pari (al telefono contano tono e tempi, in chat la scrittura), quindi
 * di default la dashboard mostra le sole chiamate e i due canali si mescolano
 * solo se lo si chiede esplicitamente. */

type ModeFilter = ConversationMode | 'all';

const MODE_FILTERS: { value: ModeFilter; label: string }[] = [
  { value: 'voice', label: 'Chiamate' },
  { value: 'text', label: 'Chat' },
  { value: 'all', label: 'Entrambe' },
];

/* Come si legge il canale attivo dentro le descrizioni delle sezioni */
const MODE_SUFFIX: Record<ModeFilter, string> = {
  voice: 'sulle chiamate',
  text: 'sulle chat',
  all: 'su chiamate e chat',
};

function ModeFilterTabs({
  value,
  onChange,
}: {
  value: ModeFilter;
  onChange: (value: ModeFilter) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Canale delle conversazioni"
      className="flex shrink-0 gap-1 rounded-xl border border-white/6 bg-slate-800/50 p-1"
    >
      {MODE_FILTERS.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(opt.value)}
            className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              isActive
                ? 'bg-violet-600/20 text-violet-200 shadow-[inset_0_0_0_1px_rgba(124,58,237,0.35)]'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Grafico a linee: media giornaliera del voto complessivo ── */

function TrendChart({ points }: { points: DayPoint[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 240;
  const M = { left: 34, right: 24, top: 18, bottom: 28 };
  const plotW = Math.max(0, width - M.left - M.right);
  const plotH = H - M.top - M.bottom;

  const minT = points.length ? points[0].date.getTime() : 0;
  const maxT = points.length ? points[points.length - 1].date.getTime() : 0;
  const x = useCallback(
    (t: number) =>
      maxT === minT ? M.left + plotW / 2 : M.left + ((t - minT) / (maxT - minT)) * plotW,
    [minT, maxT, M.left, plotW],
  );
  const y = (v: number) => M.top + (1 - v / 10) * plotH;

  const handleMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!points.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let nearest = 0;
    let best = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(px - x(p.date.getTime()));
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    setHoverIdx(nearest);
  };

  // Etichette X: tutte se poche, altrimenti un sottoinsieme uniforme
  const labelStep = points.length > 8 ? Math.ceil(points.length / 6) : 1;

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.date.getTime()).toFixed(1)} ${y(p.avg).toFixed(1)}`)
    .join(' ');

  const hover = hoverIdx !== null ? points[hoverIdx] : null;
  const last = points[points.length - 1];

  return (
    <div ref={containerRef} className="relative w-full">
      {width > 0 && (
        <svg
          width={width}
          height={H}
          onPointerMove={handleMove}
          onPointerLeave={() => setHoverIdx(null)}
        >
          {/* Griglia orizzontale: hairline pieno, recessivo */}
          {[0, 2, 4, 6, 8, 10].map((v) => (
            <g key={v}>
              <line
                x1={M.left}
                y1={y(v)}
                x2={width - M.right}
                y2={y(v)}
                stroke={v === 0 ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)'}
                strokeWidth="1"
              />
              <text
                x={M.left - 8}
                y={y(v) + 3.5}
                textAnchor="end"
                fontSize="10"
                fill="#64748b"
              >
                {v}
              </text>
            </g>
          ))}

          {/* Etichette asse X */}
          {points.map((p, i) =>
            i % labelStep === 0 || i === points.length - 1 ? (
              <text
                key={i}
                x={x(p.date.getTime())}
                y={H - 8}
                textAnchor="middle"
                fontSize="10"
                fill="#64748b"
              >
                {formatDay(p.date)}
              </text>
            ) : null,
          )}

          {/* Crosshair */}
          {hover && (
            <line
              x1={x(hover.date.getTime())}
              y1={M.top}
              x2={x(hover.date.getTime())}
              y2={M.top + plotH}
              stroke="rgba(255,255,255,0.18)"
              strokeWidth="1"
            />
          )}

          {/* Linea 2px, join arrotondati */}
          {points.length > 1 && (
            <path
              d={path}
              fill="none"
              stroke="#7c3aed"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {/* Marker con anello nel colore della superficie */}
          {points.map((p, i) => (
            <circle
              key={i}
              cx={x(p.date.getTime())}
              cy={y(p.avg)}
              r={hoverIdx === i ? 5.5 : 4.5}
              fill="#7c3aed"
              stroke="#0e1422"
              strokeWidth="2"
            />
          ))}

          {/* Etichetta diretta solo sull'ultimo punto (testo in token, non nel colore serie) */}
          {last && hoverIdx === null && (
            <text
              x={x(last.date.getTime())}
              y={y(last.avg) - 12}
              textAnchor="middle"
              fontSize="11"
              fontWeight="600"
              fill="#cbd5e1"
            >
              {formatScore(last.avg)}
            </text>
          )}
        </svg>
      )}

      {/* Tooltip: il valore guida, l'etichetta segue */}
      {hover && width > 0 && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-white/10 bg-gray-950/95 px-3 py-2 shadow-lg"
          style={{
            left: Math.min(Math.max(x(hover.date.getTime()), 70), width - 70),
            top: y(hover.avg) - 12,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="flex items-center gap-2">
            <span className="h-0.5 w-3 rounded bg-violet-500" />
            <span className="text-sm font-bold text-slate-100">{formatScore(hover.avg)}/10</span>
          </div>
          <div className="mt-0.5 text-[0.7rem] text-slate-400">
            {hover.count} {hover.count === 1 ? 'valutazione' : 'valutazioni'} ·{' '}
            {hover.date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Riga a barra (meter): riempimento = punteggio/10, colore per fascia ── */

function MeterRow({
  label,
  sub,
  score,
  dimmed = false,
  highlighted = false,
  fullLabel = false,
}: {
  label: string;
  sub?: string;
  score: number;
  dimmed?: boolean;
  highlighted?: boolean;
  /* Etichetta sempre per intero su una riga (mai troncata): la mette sopra
   * la barra invece che affiancata, così non deve condividere spazio con nulla. */
  fullLabel?: boolean;
}) {
  if (fullLabel) {
    return (
      <div
        className={`rounded-lg px-2 py-1.5 transition-opacity ${dimmed ? 'opacity-40' : ''} ${
          highlighted ? 'bg-white/4' : ''
        }`}
      >
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <p className="whitespace-nowrap text-[0.82rem] font-medium text-slate-300">{label}</p>
          <span className={`shrink-0 text-right text-sm font-bold ${scoreTextColor(score)}`}>
            {formatScore(score)}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/6">
          <div
            className={`h-full rounded-full transition-all ${scoreBarColor(score)}`}
            style={{ width: `${Math.max(0, Math.min(100, score * 10))}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`grid grid-cols-[minmax(0,200px)_1fr_56px] items-center gap-4 rounded-lg px-2 py-1.5 transition-opacity max-sm:grid-cols-[minmax(0,130px)_1fr_56px] ${
        dimmed ? 'opacity-40' : ''
      } ${highlighted ? 'bg-white/4' : ''}`}
    >
      <div className="min-w-0">
        <Tooltip content={label} truncateOnly>
          <p className="truncate text-[0.82rem] font-medium text-slate-300">{label}</p>
        </Tooltip>
        {sub && <p className="truncate text-[0.68rem] text-slate-500">{sub}</p>}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/6">
        <div
          className={`h-full rounded-full transition-all ${scoreBarColor(score)}`}
          style={{ width: `${Math.max(0, Math.min(100, score * 10))}%` }}
        />
      </div>
      <span className={`text-right text-sm font-bold ${scoreTextColor(score)}`}>
        {formatScore(score)}
      </span>
    </div>
  );
}

/* ── Card KPI ── */

function KpiCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={cardCls}>
      <p className="mb-2 text-xs font-medium tracking-wide text-slate-500">{label}</p>
      {children}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const showOrgFilter = isSuperAdmin(user);
  const [rows, setRows] = useState<EvaluationReportRow[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [orgFilter, setOrgFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [modeFilter, setModeFilter] = useState<ModeFilter>('voice');
  const [search, setSearch] = useState('');
  const [detailRow, setDetailRow] = useState<EvaluationReportRow | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  /* Excel del report: stesse righe della dashboard (stesso scope server
   * per organizzazione), i filtri più fini li offre il foglio stesso */
  const handleExportXlsx = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const blob = await fetchEvaluationsReportXlsx(orgFilter || undefined);
      saveBlob(blob, `report-valutazioni-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Esportazione non riuscita.');
    } finally {
      setIsExporting(false);
    }
  };

  const orgFilterOptions = [
    { value: '', label: 'Tutte le organizzazioni' },
    ...organizations.map((o) => ({ value: o.id, label: o.name })),
  ];

  useEffect(() => {
    if (!isAdmin(user)) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setError('');
      try {
        const data = await fetchEvaluationsReport(orgFilter || undefined);
        if (!cancelled) setRows(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Impossibile caricare la dashboard.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, orgFilter]);

  useEffect(() => {
    if (isSuperAdmin(user)) {
      fetchOrganizations()
        .then(setOrganizations)
        .catch(() => setOrganizations([]));
    }
  }, [user]);

  /* Il selettore di canale sta a monte di tutto il resto: ogni conteggio,
   * media e grafico qui sotto parte da queste righe, non da rows. */
  const scopedRows = useMemo(
    () => (modeFilter === 'all' ? rows : rows.filter((r) => r.mode === modeFilter)),
    [rows, modeFilter],
  );

  /* Utenti presenti nelle valutazioni (per la ricerca utente).
   * Volutamente su tutte le righe e non su scopedRows: se l'elenco si
   * restringesse col canale, l'utente selezionato potrebbe sparire dalle
   * opzioni e la sua chip svanirebbe pur restando il filtro attivo. */
  const usersInData = useMemo(() => {
    const map = new Map<string, { name: string; email: string }>();
    for (const r of rows) {
      if (!map.has(r.user_id)) map.set(r.user_id, { name: displayName(r), email: r.user_email });
    }
    return Array.from(map, ([id, u]) => ({ id, ...u })).sort((a, b) =>
      a.name.localeCompare(b.name, 'it'),
    );
  }, [rows]);

  /* Il filtro utente scopa KPI, andamento e criteri */
  const filtered = useMemo(
    () => (selectedUserId ? scopedRows.filter((r) => r.user_id === selectedUserId) : scopedRows),
    [scopedRows, selectedUserId],
  );

  const overallAvg = useMemo(
    () =>
      filtered.length
        ? filtered.reduce((sum, r) => sum + r.overall_score, 0) / filtered.length
        : null,
    [filtered],
  );

  /* Media per giorno (asse temporale del grafico a linee) */
  const trendPoints = useMemo<DayPoint[]>(() => {
    const byDay = new Map<string, { sum: number; count: number; date: Date }>();
    for (const r of filtered) {
      const d = new Date(r.conversation_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const entry = byDay.get(key) ?? {
        sum: 0,
        count: 0,
        date: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
      };
      entry.sum += r.overall_score;
      entry.count += 1;
      byDay.set(key, entry);
    }
    return Array.from(byDay.values())
      .map((e) => ({ date: e.date, avg: e.sum / e.count, count: e.count }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [filtered]);

  /* Media per criterio, nell'ordine in cui i criteri arrivano dal backend */
  const criteriaAvgs = useMemo<CriterionAvg[]>(() => {
    const acc = new Map<string, { label: string; sum: number; count: number }>();
    const order: string[] = [];
    for (const r of filtered) {
      for (const c of r.criteria) {
        if (!acc.has(c.key)) {
          acc.set(c.key, { label: c.label, sum: 0, count: 0 });
          order.push(c.key);
        }
        const entry = acc.get(c.key)!;
        entry.sum += c.score;
        entry.count += 1;
      }
    }
    return order.map((key) => {
      const e = acc.get(key)!;
      return { key, label: e.label, avg: e.sum / e.count };
    });
  }, [filtered]);

  const bestCriterion = useMemo(
    () =>
      criteriaAvgs.length
        ? criteriaAvgs.reduce((a, b) => (b.avg > a.avg ? b : a))
        : null,
    [criteriaAvgs],
  );
  const worstCriterion = useMemo(
    () =>
      criteriaAvgs.length
        ? criteriaAvgs.reduce((a, b) => (b.avg < a.avg ? b : a))
        : null,
    [criteriaAvgs],
  );

  /* Confronto tra utenti: sempre su tutti gli utenti del canale attivo,
   * il filtro utente evidenzia soltanto */
  const userAvgs = useMemo<UserAvg[]>(() => {
    const acc = new Map<string, UserAvg & { sum: number }>();
    for (const r of scopedRows) {
      const entry =
        acc.get(r.user_id) ??
        { userId: r.user_id, name: displayName(r), email: r.user_email, avg: 0, count: 0, sum: 0 };
      entry.sum += r.overall_score;
      entry.count += 1;
      acc.set(r.user_id, entry);
    }
    return Array.from(acc.values())
      .map((e) => ({ userId: e.userId, name: e.name, email: e.email, avg: e.sum / e.count, count: e.count }))
      .sort((a, b) => b.avg - a.avg);
  }, [scopedRows]);

  const detailRows = useMemo(
    () =>
      [...filtered].sort(
        (a, b) => new Date(b.conversation_at).getTime() - new Date(a.conversation_at).getTime(),
      ),
    [filtered],
  );

  const searchedRows = useMemo(
    () =>
      detailRows.filter((r) =>
        matchesSearch(
          search,
          r.conversation_title,
          // The channel is searchable by the same word the badge shows
          conversationModeLabel(r.mode),
          displayName(r),
          r.user_email,
          r.avatar_name,
          formatDateTime(r.conversation_at),
        ),
      ),
    [detailRows, search],
  );

  if (!isAdmin(user)) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-6 py-12">
        <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-white/6 bg-gray-900/60 p-16 text-center text-red-300">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <h2 className="font-heading text-2xl text-slate-100">Accesso Negato</h2>
          <p className="max-w-[400px] text-slate-400">
            Solo gli utenti con ruolo <strong>Super Admin</strong> o <strong>Organization Admin</strong> possono
            visualizzare la dashboard.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 py-12">
      <header className="mb-8 flex items-start justify-between gap-4 max-sm:flex-col">
        <div>
          <h1 className="mb-1 font-heading text-3xl font-bold text-slate-100">Dashboard</h1>
          <p className="text-[0.95rem] text-slate-500">
            Riepilogo dei punteggi delle valutazioni delle conversazioni, per canale e globale o per
            singolo utente.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 max-sm:w-full">
          {showOrgFilter && (
            <Select
              id="dashboard-org-filter"
              className="min-w-[220px] max-sm:flex-1"
              value={orgFilter}
              onChange={(value) => {
                setOrgFilter(value);
                setSelectedUserId('');
              }}
              options={orgFilterOptions}
            />
          )}
          <button
            className="flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-[0.85rem] font-medium text-slate-400 transition hover:-translate-y-px hover:border-violet-600 hover:bg-violet-600/12 hover:text-violet-300 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            onClick={handleExportXlsx}
            disabled={isExporting || isLoading || rows.length === 0}
            title="Scarica il report delle valutazioni in Excel"
          >
            {isExporting ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-600/25 border-t-violet-600" />
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            )}
            Esporta Excel
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-8 flex animate-fade-in-up items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-sm text-red-300 [animation-duration:0.2s]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col items-center justify-center gap-4 p-16 text-slate-500">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-violet-600/15 border-t-violet-600" />
          <p>Caricamento dashboard...</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-white/6 bg-gray-900/60 p-16 text-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
          <h2 className="font-heading text-xl text-slate-100">Nessuna valutazione disponibile</h2>
          <p className="max-w-[420px] text-sm text-slate-500">
            I grafici appariranno quando le conversazioni con gli avatar verranno valutate.
          </p>
        </div>
      ) : (
        <>
          {/* Riga filtri: scopa tutto ciò che sta sotto */}
          <div className="mb-6 flex items-center gap-3 max-lg:flex-wrap">
            <label htmlFor="dashboard-user-filter" className="text-xs font-medium tracking-wide text-slate-400">
              Utente
            </label>
            <SearchSelect
              id="dashboard-user-filter"
              value={selectedUserId}
              onChange={setSelectedUserId}
              options={usersInData.map((u) => ({ value: u.id, label: u.name, sub: u.email }))}
              placeholder="Cerca per nome o email..."
              emptyHint="Tutti gli utenti"
              className="w-full max-w-[440px]"
            />
            <span className="ml-auto text-xs font-medium tracking-wide text-slate-400 max-lg:ml-0">
              Canale
            </span>
            <ModeFilterTabs value={modeFilter} onChange={setModeFilter} />
          </div>

          {/* Il canale può non avere nessuna conversazione: senza questo avviso
            * i KPI a zero si leggerebbero come un errore di caricamento. */}
          {scopedRows.length === 0 && (
            <div className="mb-6 flex items-center gap-2 rounded-xl border border-white/6 bg-slate-800/40 px-6 py-4 text-sm text-slate-400">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate-500">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span>
                Nessuna valutazione {MODE_SUFFIX[modeFilter]}. Cambia canale per vedere i dati
                disponibili.
              </span>
            </div>
          )}

          {/* KPI */}
          <div className="mb-6 grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
            <KpiCard label="Voto medio complessivo">
              <p className="font-heading text-4xl font-bold text-slate-100">
                {overallAvg !== null ? (
                  <>
                    <span className={scoreTextColor(overallAvg)}>{formatScore(overallAvg)}</span>
                    <span className="text-lg font-medium text-slate-500"> /10</span>
                  </>
                ) : (
                  '—'
                )}
              </p>
            </KpiCard>
            <KpiCard label="Conversazioni valutate">
              <p className="font-heading text-4xl font-bold text-slate-100">{filtered.length}</p>
            </KpiCard>
            <KpiCard label="Criterio più forte">
              {bestCriterion ? (
                <>
                  <Tooltip content={bestCriterion.label} truncateOnly>
                    <p className="truncate text-[0.95rem] font-semibold text-slate-100">
                      {bestCriterion.label}
                    </p>
                  </Tooltip>
                  <p className={`mt-1 text-xl font-bold ${scoreTextColor(bestCriterion.avg)}`}>
                    {formatScore(bestCriterion.avg)}
                    <span className="text-xs font-medium text-slate-500"> /10</span>
                  </p>
                </>
              ) : (
                <p className="text-2xl text-slate-500">—</p>
              )}
            </KpiCard>
            <KpiCard label="Criterio più debole">
              {worstCriterion ? (
                <>
                  <Tooltip content={worstCriterion.label} truncateOnly>
                    <p className="truncate text-[0.95rem] font-semibold text-slate-100">
                      {worstCriterion.label}
                    </p>
                  </Tooltip>
                  <p className={`mt-1 text-xl font-bold ${scoreTextColor(worstCriterion.avg)}`}>
                    {formatScore(worstCriterion.avg)}
                    <span className="text-xs font-medium text-slate-500"> /10</span>
                  </p>
                </>
              ) : (
                <p className="text-2xl text-slate-500">—</p>
              )}
            </KpiCard>
          </div>

          {/* Andamento nel tempo */}
          <div className={`${cardCls} mb-6`}>
            <h2 className="text-sm font-semibold text-slate-300">Andamento nel tempo</h2>
            <p className="mb-4 text-xs text-slate-500">
              Media giornaliera del voto complessivo {MODE_SUFFIX[modeFilter]}
              {selectedUserId ? ', per l’utente selezionato' : ''}
            </p>
            {trendPoints.length > 0 ? (
              <TrendChart points={trendPoints} />
            ) : (
              <p className="py-10 text-center text-sm italic text-slate-500">
                Nessuna valutazione per la selezione corrente.
              </p>
            )}
          </div>

          {/* Media per criterio */}
          <div className={`${cardCls} mb-6`}>
            <h2 className="text-sm font-semibold text-slate-300">Media per criterio</h2>
            <p className="mb-4 text-xs text-slate-500">
              Punteggio medio dei 6 criteri di valutazione {MODE_SUFFIX[modeFilter]}
            </p>
            {criteriaAvgs.length > 0 ? (
              <div className="flex flex-col gap-2.5">
                {criteriaAvgs.map((c) => (
                  <MeterRow key={c.key} label={c.label} score={c.avg} fullLabel />
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-sm italic text-slate-500">
                Nessuna valutazione per la selezione corrente.
              </p>
            )}
          </div>

          {/* Confronto tra utenti */}
          <div className={`${cardCls} mb-6`}>
            <h2 className="text-sm font-semibold text-slate-300">Confronto tra utenti</h2>
            <p className="mb-4 text-xs text-slate-500">
              Voto medio complessivo per utente, su tutte le valutazioni {MODE_SUFFIX[modeFilter]}
            </p>
            {userAvgs.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {userAvgs.map((u) => (
                  <MeterRow
                    key={u.userId}
                    label={u.name}
                    sub={`${u.count} ${u.count === 1 ? 'valutazione' : 'valutazioni'}`}
                    score={u.avg}
                    dimmed={selectedUserId !== '' && u.userId !== selectedUserId}
                    highlighted={selectedUserId !== '' && u.userId === selectedUserId}
                  />
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-sm italic text-slate-500">
                Nessuna valutazione per la selezione corrente.
              </p>
            )}
          </div>

          {/* Vista tabellare: tutti i valori raggiungibili senza hover */}
          <DataTable
            columns={[
              { key: 'conversazione', label: 'Conversazione' },
              { key: 'data', label: 'Data' },
              { key: 'utente', label: 'Utente' },
              { key: 'avatar', label: 'Avatar' },
              ...criteriaAvgs.map((c) => ({
                key: c.key,
                label: shortCriterionLabel(c.key, c.label),
                title: c.label,
                align: 'center' as const,
                compact: true,
              })),
              { key: 'voto', label: 'Voto', align: 'right' },
            ]}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Cerca per conversazione, utente o avatar..."
            isEmpty={searchedRows.length === 0}
            emptyMessage={
              search
                ? 'Nessuna valutazione corrisponde alla ricerca.'
                : 'Nessuna valutazione per la selezione corrente.'
            }
          >
            {searchedRows.map((r) => (
              <Tooltip key={r.conversation_id} content="Vedi conversazione e valutazione" anchor="cursor">
                <Tr
                  className="cursor-pointer"
                  onClick={() => setDetailRow(r)}
                >
                <Td>
                  <div className="flex items-center gap-2">
                    <ConversationModeBadge mode={r.mode} iconOnly />
                    <span className="text-[0.85rem] font-medium text-slate-100">{r.conversation_title}</span>
                  </div>
                </Td>
                <Td className="text-[0.82rem] text-slate-400">{formatDateTime(r.conversation_at)}</Td>
                <Td>
                  <span className="text-[0.85rem] font-medium text-slate-100">{displayName(r)}</span>
                </Td>
                <Td className="text-[0.82rem] text-slate-400">{r.avatar_name}</Td>
                {criteriaAvgs.map((c) => {
                  const crit = r.criteria.find((rc) => rc.key === c.key);
                  return (
                    <Td key={c.key} align="center" compact>
                      {crit ? (
                        <span className={`text-[0.82rem] font-semibold tabular-nums ${scoreTextColor(crit.score)}`}>
                          {formatScore(crit.score)}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </Td>
                  );
                })}
                  <Td align="right">
                    <span className={`text-sm font-bold tabular-nums ${scoreTextColor(r.overall_score)}`}>
                      {formatScore(r.overall_score)}/10
                    </span>
                  </Td>
                </Tr>
              </Tooltip>
            ))}
          </DataTable>
        </>
      )}

      {detailRow && (
        <ConversationDetailModal row={detailRow} onClose={() => setDetailRow(null)} />
      )}
    </div>
  );
}

