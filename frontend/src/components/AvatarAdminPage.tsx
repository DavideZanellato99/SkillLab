import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchAdminAvatars,
  createAvatar,
  updateAvatar,
  deleteAvatar,
} from '../services/admin';
import type { AdminAvatar, AdminAvatarPayload } from '../services/admin';
import { fetchOrganizations } from '../services/organizations';
import type { Organization } from '../services/organizations';
import { isSuperAdmin } from '../services/auth';
import { getAvatarImageUrl } from '../services/api';
import { categoryBadgeClasses } from './categoryStyles';
import Select from './Select';
import DataTable, { Td, Tr } from './DataTable';
import Tooltip from './Tooltip';
import { matchesSearch } from './tableSearch';
import type { DataTableColumn } from './DataTable';

/* Shared styles (same look as the users admin page) */
const fieldCls = 'flex flex-col gap-1.5';
const labelCls = 'text-xs font-medium tracking-wide text-slate-400';
const inputWrapperCls =
  'flex items-center gap-2 rounded-xl border border-white/6 bg-slate-800/50 px-4 transition focus-within:border-violet-600 focus-within:shadow-[0_0_0_3px_rgba(124,58,237,0.1)]';
const inputCls =
  'flex-1 border-none bg-transparent py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-50';
const textareaCls =
  'w-full resize-y rounded-xl border border-white/6 bg-slate-800/50 px-4 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-violet-600 focus:shadow-[0_0_0_3px_rgba(124,58,237,0.1)] disabled:cursor-not-allowed disabled:opacity-50';
const submitBtnCls =
  'mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-none bg-gradient-to-br from-violet-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-px hover:shadow-[0_6px_20px_rgba(124,58,237,0.35)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60';
const overlayCls =
  'fixed inset-0 z-[200] flex animate-fade-in items-center justify-center bg-black/60 p-4 backdrop-blur-lg [animation-duration:0.2s]';
const modalCloseCls =
  'absolute right-4 top-4 cursor-pointer rounded-lg border-none bg-transparent p-1.5 text-slate-500 transition hover:bg-white/8 hover:text-slate-100';
const formErrorCls =
  'mb-4 flex animate-fade-in-up items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2 text-[0.82rem] text-red-300 [animation-duration:0.2s]';
const spinnerCls = 'h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white';
const actionBtnCls =
  'flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-white/6 bg-white/4 text-slate-400 transition disabled:cursor-not-allowed disabled:opacity-40';
const sectionTitleCls =
  'mb-3 mt-2 border-b border-white/6 pb-2 text-[0.72rem] font-semibold uppercase tracking-widest text-violet-400';

const AVATAR_COLUMNS: DataTableColumn[] = [
  { key: 'avatar', label: 'Avatar' },
  { key: 'ambito', label: 'Ambito' },
  { key: 'categoria', label: 'Categoria' },
  { key: 'difficolta', label: 'Difficoltà' },
  { key: 'conversazioni', label: 'Conversazioni', align: 'center' },
  { key: 'azioni', label: 'Azioni', align: 'right' },
];

/* ── Persona sheet form definition ─────────────────────
 * Every avatar is a training persona: the form is generated from this
 * config. `textarea` marks long fields rendered full-width; `options`
 * renders a select (the first option is the default). */
interface ProfileField {
  key: string;
  label: string;
  textarea?: boolean;
  placeholder?: string;
  options?: string[];
}

interface ProfileSection {
  title: string;
  fields: ProfileField[];
}

const PROFILE_SECTIONS: ProfileSection[] = [
  {
    title: 'Anagrafica',
    fields: [
      { key: 'NOME', label: 'Nome *', placeholder: 'Giovanni' },
      { key: 'COGNOME', label: 'Cognome *', placeholder: 'Salemmi' },
      { key: 'SESSO', label: 'Sesso' },
      { key: 'DATA_NASCITA', label: 'Data di nascita', placeholder: '09/12/1999' },
      { key: 'LUOGO_NASCITA', label: 'Luogo di nascita' },
      { key: 'NAZIONALITA', label: 'Nazionalità' },
      { key: 'LINGUA_MADRE', label: 'Lingua madre' },
      { key: 'CITTA_RESIDENZA', label: 'Città di residenza' },
      { key: 'STATO_CIVILE', label: 'Stato civile' },
      { key: 'NOME_CONIUGE', label: 'Nome del coniuge' },
      { key: 'PROFESSIONE_CONIUGE', label: 'Professione del coniuge' },
      { key: 'NUMERO_FIGLI', label: 'Numero di figli' },
      { key: 'ETA_FIGLIO_1', label: 'Età primo figlio' },
      { key: 'ETA_FIGLIO_2', label: 'Età secondo figlio' },
      { key: 'ANIMALI_DOMESTICI', label: 'Animali domestici' },
    ],
  },
  {
    title: 'Lavoro e finanze',
    fields: [
      { key: 'TITOLO_DI_STUDIO', label: 'Titolo di studio' },
      { key: 'PROFESSIONE', label: 'Professione' },
      { key: 'AZIENDA', label: 'Azienda' },
      { key: 'RUOLO', label: 'Ruolo' },
      { key: 'REDDITO_ANNUO', label: 'Reddito annuo', placeholder: '35.000,00 euro' },
      { key: 'PATRIMONIO', label: 'Patrimonio' },
      { key: 'LIQUIDITA', label: 'Liquidità' },
      { key: 'DEBITI', label: 'Debiti' },
      { key: 'INVESTIMENTI_POSSEDUTI', label: 'Investimenti posseduti' },
      { key: 'IMMOBILI_POSSEDUTI', label: 'Immobili posseduti' },
      { key: 'LIVELLO_CONOSCENZA_BANCARIA', label: 'Conoscenza bancaria', placeholder: 'Bassa / Media / Alta' },
      { key: 'LIVELLO_CONOSCENZA_INVESTIMENTI', label: 'Conoscenza investimenti' },
      { key: 'LIVELLO_CONOSCENZA_PREVIDENZA', label: 'Conoscenza previdenza' },
      { key: 'LIVELLO_CONOSCENZA_MUTUI', label: 'Conoscenza mutui' },
    ],
  },
  {
    title: 'Storia e vita personale',
    fields: [
      { key: 'STORIA_PERSONALE', label: 'Storia personale', textarea: true },
      { key: 'EVENTI_SIGNIFICATIVI', label: 'Eventi significativi', textarea: true },
      { key: 'PAURE', label: 'Paure', textarea: true },
      { key: 'OBIETTIVI_PERSONALI', label: 'Obiettivi personali', textarea: true },
      { key: 'ASPIRAZIONI', label: 'Aspirazioni', textarea: true },
    ],
  },
  {
    title: 'Personalità',
    fields: [
      { key: 'PERSONALITA_DESCRIZIONE', label: 'Descrizione della personalità', textarea: true },
      { key: 'LIVELLO_ESTROVERSIONE', label: 'Estroversione', placeholder: '60%' },
      { key: 'LIVELLO_EMPATICO', label: 'Empatia', placeholder: '40%' },
      { key: 'LIVELLO_PAZIENZA', label: 'Pazienza', placeholder: '30%' },
      { key: 'LIVELLO_FIDUCIA', label: 'Fiducia negli altri', placeholder: '30%' },
      { key: 'PROPENSIONE_CONFLITTO', label: 'Propensione al conflitto', placeholder: '60%' },
      { key: 'PROPENSIONE_RISCHIO', label: 'Propensione al rischio', placeholder: '40%' },
      { key: 'CAPACITA_ASCOLTO', label: 'Capacità di ascolto', placeholder: '50%' },
    ],
  },
  {
    title: 'Stato emotivo',
    fields: [
      { key: 'EMOZIONE_INIZIALE', label: 'Emozione iniziale', placeholder: 'Arrabbiato' },
      { key: 'INTENSITA_EMOZIONE', label: 'Intensità emozione', placeholder: 'Alta' },
      { key: 'TRIGGER_POSITIVI', label: 'Trigger positivi', textarea: true, placeholder: 'Empatia, rassicurazione, competenza' },
      { key: 'TRIGGER_NEGATIVI', label: 'Trigger negativi', textarea: true, placeholder: 'Fretta, incompetenza, lunghe attese' },
    ],
  },
  {
    title: 'Stile di conversazione',
    fields: [
      { key: 'LUNGHEZZA_MEDIA_RISPOSTE', label: 'Lunghezza media risposte', placeholder: 'Breve / Media / Lunga' },
      { key: 'VELOCITA_PARLATO', label: 'Velocità del parlato', placeholder: 'Bassa / Media / Alta' },
      { key: 'USO_IRONIA', label: 'Uso dell’ironia', placeholder: 'Si, moderato / No' },
      { key: 'USO_DIALETTO', label: 'Uso del dialetto', placeholder: 'Si / No' },
      { key: 'FORMALITA_LINGUAGGIO', label: 'Formalità del linguaggio', placeholder: 'Formale / Informale' },
    ],
  },
  {
    title: 'Scenario della chiamata',
    fields: [
      { key: 'TIPO_SCENARIO', label: 'Tipo di scenario', textarea: true, placeholder: 'Cosa è successo e perché il cliente è coinvolto...' },
      { key: 'DESCRIZIONE_PROBLEMATICA', label: 'Vera causa del problema (il cliente NON la conosce)', textarea: true },
      { key: 'OBIEZIONI_PREVISTE', label: 'Obiezioni previste', textarea: true },
      { key: 'OBIETTIVO_NASCOSTO', label: 'Obiettivo nascosto della simulazione', textarea: true },
      { key: 'GRADO_DIFFICOLTA', label: 'Grado di difficoltà', placeholder: '8/10' },
    ],
  },
  {
    title: 'Regole e segreti',
    fields: [
      { key: 'FATTI_IMMUTABILI', label: 'Fatti immutabili', textarea: true },
      { key: 'SEGRETI', label: 'Segreti (mai rivelati)', textarea: true },
      { key: 'INFORMAZIONI_DA_NON_RIVELARE_SPONTANEAMENTE', label: 'Informazioni da non rivelare spontaneamente', textarea: true },
      { key: 'ARGOMENTI_SENSIBILI', label: 'Argomenti sensibili', textarea: true },
    ],
  },
];

const ALL_PROFILE_KEYS = PROFILE_SECTIONS.flatMap((s) => s.fields.map((f) => f.key));

function emptyProfile(): Record<string, string> {
  return Object.fromEntries(ALL_PROFILE_KEYS.map((k) => [k, '']));
}

interface FormState {
  category: string;
  description: string;
  imageUrl: string;
  voiceId: string;
  /** '' means a global persona; otherwise the owning organization id. */
  organizationId: string;
  profile: Record<string, string>;
}

function emptyForm(): FormState {
  return { category: 'Clienti', description: '', imageUrl: '', voiceId: '', organizationId: '', profile: emptyProfile() };
}

function formFromAvatar(a: AdminAvatar): FormState {
  return {
    category: a.category,
    description: a.description ?? '',
    imageUrl: a.image_url,
    voiceId: a.voice_id ?? '',
    organizationId: a.organization_id ?? '',
    profile: { ...emptyProfile(), ...a.profile },
  };
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className={formErrorCls}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-px shrink-0 text-red-500">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>{message}</span>
    </div>
  );
}

export default function AvatarAdminPage() {
  const { user } = useAuth();
  const [avatars, setAvatars] = useState<AdminAvatar[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [search, setSearch] = useState('');

  // Scope options: a global persona (no org) plus one entry per organization
  const orgScopeOptions = [
    { value: '', label: 'Globale (tutte le organizzazioni)' },
    ...organizations.map((o) => ({ value: o.id, label: o.name })),
  ];

  const visibleAvatars = avatars.filter((a) =>
    matchesSearch(search, a.name, a.description, a.category, a.difficulty),
  );

  // Modal state: 'new' = create, AdminAvatar = edit, null = closed
  const [editing, setEditing] = useState<AdminAvatar | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [deleting, setDeleting] = useState<AdminAvatar | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const flashSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 6000);
  };

  const loadAvatars = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await fetchAdminAvatars();
      setAvatars(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossibile caricare gli avatar.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin(user)) {
      loadAvatars();
      fetchOrganizations()
        .then(setOrganizations)
        .catch(() => setOrganizations([]));
    }
  }, [user, loadAvatars]);

  const openCreate = () => {
    setForm(emptyForm());
    setFormError('');
    setEditing('new');
  };

  const openEdit = (a: AdminAvatar) => {
    setForm(formFromAvatar(a));
    setFormError('');
    setEditing(a);
  };

  const setProfileField = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, profile: { ...prev.profile, [key]: value } }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.profile.NOME.trim() && !form.profile.COGNOME.trim()) {
      setFormError('La scheda deve contenere almeno il nome o il cognome del cliente.');
      return;
    }
    setFormError('');
    setIsSaving(true);

    const payload: AdminAvatarPayload = {
      category: form.category.trim() || 'Clienti',
      description: form.description.trim() || null,
      image_url: form.imageUrl.trim() || null,
      voice_id: form.voiceId.trim() || null,
      organization_id: form.organizationId || null,
      profile: form.profile,
    };

    try {
      if (editing === 'new') {
        const created = await createAvatar(payload);
        setAvatars((prev) => [...prev, created]);
        flashSuccess(`Avatar ${created.name} creato con successo.`);
      } else if (editing) {
        const updated = await updateAvatar(editing.id, payload);
        setAvatars((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        flashSuccess(`Avatar ${updated.name} aggiornato con successo.`);
      }
      setEditing(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Errore durante il salvataggio.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleting) return;
    setDeleteError('');
    setIsDeleting(true);
    try {
      const result = await deleteAvatar(deleting.id);
      setAvatars((prev) => prev.filter((a) => a.id !== deleting.id));
      setDeleting(null);
      flashSuccess(result.message);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Errore durante l'eliminazione.");
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isSuperAdmin(user)) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-6 py-12">
        <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-white/6 bg-gray-900/60 p-16 text-center text-red-300">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <h2 className="font-heading text-2xl text-slate-100">Accesso Negato</h2>
          <p className="max-w-[400px] text-slate-400">Solo gli utenti con ruolo <strong>Super Admin</strong> possono gestire gli avatar.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 py-12">
      <header className="mb-12 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="mb-1 font-heading text-3xl font-bold text-slate-100">Gestione Avatar</h1>
          <p className="text-[0.95rem] text-slate-500">Crea, modifica ed elimina i clienti simulati e le loro schede persona.</p>
        </div>
        <button
          className="flex cursor-pointer items-center gap-2 rounded-xl border-none bg-gradient-to-br from-violet-600 to-cyan-500 px-6 py-2 text-sm font-semibold text-white shadow-[0_4px_12px_rgba(124,58,237,0.25)] transition hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(124,58,237,0.4)]"
          onClick={openCreate}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Nuovo Avatar
        </button>
      </header>

      {successMsg && (
        <div className="mb-8 flex animate-fade-in-up items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-6 py-4 text-sm text-emerald-400 [animation-duration:0.2s]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span>{successMsg}</span>
        </div>
      )}

      {error && <ErrorBox message={error} />}

      {isLoading ? (
        <div className="flex flex-col items-center justify-center gap-4 p-16 text-slate-500">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-violet-600/15 border-t-violet-600" />
          <p>Caricamento avatar...</p>
        </div>
      ) : (
        <DataTable
          columns={AVATAR_COLUMNS}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Cerca per nome, categoria o difficoltà..."
          isEmpty={visibleAvatars.length === 0}
          emptyMessage={
            search
              ? 'Nessun avatar corrisponde alla ricerca.'
              : 'Nessun avatar presente. Crea il primo con "Nuovo Avatar".'
          }
        >
          {visibleAvatars.map((a) => (
            <Tr key={a.id}>
              <Td>
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-white/6">
                    <img className="h-full w-full object-cover" src={getAvatarImageUrl(a.image_url)} alt={a.name} />
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-semibold text-slate-100">{a.name}</span>
                    {a.description && (
                      <span className="max-w-[320px] truncate text-xs text-slate-500">{a.description}</span>
                    )}
                  </div>
                </div>
              </Td>
              <Td>
                {a.organization_id ? (
                  <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2 py-0.5 text-[0.65rem] font-semibold text-cyan-400">
                    {a.organization_name ?? 'Organizzazione'}
                  </span>
                ) : (
                  <span className="rounded-full border border-violet-600/25 bg-violet-600/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-violet-400">
                    Globale
                  </span>
                )}
              </Td>
              <Td>
                <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider ${categoryBadgeClasses(a.category)}`}>
                  {a.category}
                </span>
              </Td>
              <Td>
                <span className="text-[0.85rem] text-orange-400">{a.difficulty ?? '—'}</span>
              </Td>
              <Td align="center">
                <span className="inline-block min-w-8 rounded-full border border-white/6 bg-white/4 px-2 py-0.5 text-[0.8rem] font-semibold text-slate-100">
                  {a.conversation_count}
                </span>
              </Td>
              <Td>
                <div className="flex items-center justify-end gap-2">
                  <Tooltip content="Modifica avatar">
                    <button
                      className={`${actionBtnCls} hover:border-violet-600 hover:bg-violet-600/12 hover:text-violet-400`}
                      onClick={() => openEdit(a)}
                      aria-label={`Modifica ${a.name}`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                      </svg>
                    </button>
                  </Tooltip>
                  <Tooltip content="Elimina avatar">
                    <button
                      className={`${actionBtnCls} hover:border-red-500 hover:bg-red-500/10 hover:text-red-500`}
                      onClick={() => { setDeleteError(''); setDeleting(a); }}
                      aria-label={`Elimina ${a.name}`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </Tooltip>
                </div>
              </Td>
            </Tr>
          ))}
        </DataTable>
      )}

      {/* Modal Crea/Modifica Avatar */}
      {editing && (
        <div className={overlayCls} onClick={() => !isSaving && setEditing(null)}>
          <div
            className="relative max-h-[92vh] w-full max-w-[780px] animate-modal-in overflow-y-auto rounded-3xl border border-white/6 bg-gray-900/95 p-10 shadow-[0_24px_80px_rgba(0,0,0,0.5),0_0_60px_rgba(124,58,237,0.08)] backdrop-blur-2xl max-[480px]:rounded-2xl max-[480px]:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <button className={modalCloseCls} onClick={() => setEditing(null)} disabled={isSaving}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-2xl border border-violet-600/20 bg-violet-600/10">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <h2 className="mb-1 font-heading text-[1.4rem] font-bold text-slate-100 max-[480px]:text-xl">
                {editing === 'new' ? 'Crea Nuovo Avatar' : `Modifica ${editing.name}`}
              </h2>
            </div>

            {formError && <ErrorBox message={formError} />}

            <form className="flex flex-col gap-4" onSubmit={handleSave}>
              {/* ── Dati base ── */}
              <h3 className={sectionTitleCls}>Dati base</h3>
              <div className={fieldCls}>
                <label className={labelCls} htmlFor="av-description">Brief per l'operatore (descrizione visibile allo studente)</label>
                <textarea
                  id="av-description"
                  className={textareaCls}
                  rows={2}
                  placeholder="Cliente al telefono: la sua carta è stata rifiutata e chiama arrabbiato..."
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  disabled={isSaving}
                />
              </div>
              <div className={fieldCls}>
                <label className={labelCls} htmlFor="av-org">Ambito (organizzazione proprietaria)</label>
                <Select
                  id="av-org"
                  value={form.organizationId}
                  onChange={(value) => setForm((p) => ({ ...p, organizationId: value }))}
                  options={orgScopeOptions}
                  disabled={isSaving}
                />
                <p className="text-[0.7rem] text-slate-500">
                  «Globale» rende la persona visibile a ogni organizzazione; altrimenti resta privata di quella scelta.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 max-[600px]:grid-cols-1">
                <div className={fieldCls}>
                  <label className={labelCls} htmlFor="av-category">Categoria</label>
                  <div className={inputWrapperCls}>
                    <input
                      type="text"
                      id="av-category"
                      className={inputCls}
                      value={form.category}
                      onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                      disabled={isSaving}
                    />
                  </div>
                </div>
                <div className={fieldCls}>
                  <label className={labelCls} htmlFor="av-voice">Voice ID Cartesia</label>
                  <div className={inputWrapperCls}>
                    <input
                      type="text"
                      id="av-voice"
                      className={inputCls}
                      placeholder="es. b34ba556-..."
                      value={form.voiceId}
                      onChange={(e) => setForm((p) => ({ ...p, voiceId: e.target.value }))}
                      disabled={isSaving}
                    />
                  </div>
                </div>
                <div className={fieldCls}>
                  <label className={labelCls} htmlFor="av-image">URL immagine</label>
                  <div className={inputWrapperCls}>
                    <input
                      type="text"
                      id="av-image"
                      className={inputCls}
                      placeholder="/static/avatars/..."
                      value={form.imageUrl}
                      onChange={(e) => setForm((p) => ({ ...p, imageUrl: e.target.value }))}
                      disabled={isSaving}
                    />
                  </div>
                </div>
              </div>

              {/* ── Scheda persona ── */}
              {PROFILE_SECTIONS.map((section) => (
                <div key={section.title}>
                  <h3 className={sectionTitleCls}>{section.title}</h3>
                  <div className="grid grid-cols-2 gap-3 max-[600px]:grid-cols-1">
                    {section.fields.map((field) =>
                      field.textarea ? (
                        <div key={field.key} className={`${fieldCls} col-span-2 max-[600px]:col-span-1`}>
                          <label className={labelCls} htmlFor={`pf-${field.key}`}>{field.label}</label>
                          <textarea
                            id={`pf-${field.key}`}
                            className={textareaCls}
                            rows={2}
                            placeholder={field.placeholder}
                            value={form.profile[field.key] ?? ''}
                            onChange={(e) => setProfileField(field.key, e.target.value)}
                            disabled={isSaving}
                          />
                        </div>
                      ) : field.options ? (
                        <div key={field.key} className={fieldCls}>
                          <label className={labelCls} htmlFor={`pf-${field.key}`}>{field.label}</label>
                          <Select
                            id={`pf-${field.key}`}
                            value={form.profile[field.key] || field.options[0]}
                            onChange={(value) => setProfileField(field.key, value)}
                            options={field.options.map((option) => ({ value: option, label: option }))}
                            disabled={isSaving}
                          />
                        </div>
                      ) : (
                        <div key={field.key} className={fieldCls}>
                          <label className={labelCls} htmlFor={`pf-${field.key}`}>{field.label}</label>
                          <div className={inputWrapperCls}>
                            <input
                              type="text"
                              id={`pf-${field.key}`}
                              className={inputCls}
                              placeholder={field.placeholder}
                              value={form.profile[field.key] ?? ''}
                              onChange={(e) => setProfileField(field.key, e.target.value)}
                              disabled={isSaving}
                            />
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              ))}

              <button type="submit" className={submitBtnCls} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <span className={spinnerCls} />
                    Salvataggio...
                  </>
                ) : editing === 'new' ? (
                  'Crea Avatar'
                ) : (
                  'Salva Modifiche'
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Conferma Eliminazione */}
      {deleting && (
        <div className={overlayCls} onClick={() => !isDeleting && setDeleting(null)}>
          <div
            className="relative max-h-[90vh] w-full max-w-[420px] animate-modal-in overflow-y-auto rounded-3xl border border-white/6 bg-gray-900/95 p-12 shadow-[0_24px_80px_rgba(0,0,0,0.5),0_0_60px_rgba(124,58,237,0.08)] backdrop-blur-2xl max-[480px]:rounded-2xl max-[480px]:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <button className={modalCloseCls} onClick={() => setDeleting(null)} disabled={isDeleting}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-2xl border border-red-500/25 bg-red-500/10">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </div>
              <h2 className="mb-1 font-heading text-[1.4rem] font-bold text-slate-100 max-[480px]:text-xl">Elimina Avatar</h2>
              <p className="text-[0.85rem] text-slate-500">
                Stai per eliminare <strong className="text-slate-100">{deleting.name}</strong>
                {deleting.conversation_count > 0 && (
                  <> e le sue <strong className="text-slate-100">{deleting.conversation_count} conversazioni</strong></>
                )}
                . L'operazione non è reversibile.
              </p>
            </div>

            {deleteError && <ErrorBox message={deleteError} />}

            <div className="flex gap-3">
              <button
                className="flex flex-1 cursor-pointer items-center justify-center rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/8 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => setDeleting(null)}
                disabled={isDeleting}
              >
                Annulla
              </button>
              <button
                className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border-none bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 hover:shadow-[0_6px_20px_rgba(239,68,68,0.35)] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <span className={spinnerCls} />
                    Eliminazione...
                  </>
                ) : (
                  'Elimina Definitivamente'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
