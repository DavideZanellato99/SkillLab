/* La scheda persona a fisarmonica: otto sezioni, una alla volta.
 *
 * Aperte tutte insieme sono uno scroll di parecchi schermi, quindi resta
 * aperta solo quella su cui si sta lavorando. Il conteggio "3/7" sta
 * sull'intestazione proprio per questo: dice cosa manca là dentro senza
 * costringere ad aprirla.
 *
 * Una alla volta però vale per chi compila a mano. Quando una bozza riempie
 * di colpo campi in tutte e otto, rileggerla è il passo che quella
 * funzionalità chiede di fare, e con i pannelli chiusi sarebbero otto
 * aperture prima di poter leggere la prima riga: per quello c'è
 * `expandSignal`, e per lo stesso motivo l'apertura di tutte resta a portata
 * di mano anche senza bozza. */

import { useEffect, useState } from 'react'

import { countFilled, PROFILE_SECTIONS } from './avatarProfileConfig'
import ProfileFieldInput from './ProfileFieldInput'
import { ChevronDownIcon } from './icons'

const ALL_TITLES = PROFILE_SECTIONS.map((s) => s.title)

interface AvatarProfileSectionsProps {
  profile: Record<string, string>
  onFieldChange: (key: string, value: string) => void
  disabled: boolean
  /* Quando questo numero cambia, la fisarmonica si apre tutta. Un contatore
   * e non un interruttore: due bozze di seguito devono riaprire tutte e due
   * le volte, e un `true` rimasto `true` non sarebbe un cambiamento. */
  expandSignal?: number
}

export default function AvatarProfileSections({
  profile,
  onFieldChange,
  disabled,
  expandSignal = 0,
}: AvatarProfileSectionsProps) {
  // L'anagrafica parte aperta perché è da lì che si comincia sempre.
  const [openSections, setOpenSections] = useState<string[]>([PROFILE_SECTIONS[0].title])

  /* Il valore iniziale non è un segnale: all'apertura della scheda le sezioni
     restano come sopra, ed è solo il cambiamento successivo ad aprirle. */
  useEffect(() => {
    if (expandSignal === 0) return
    setOpenSections(ALL_TITLES)
  }, [expandSignal])

  const toggleSection = (title: string) =>
    setOpenSections((prev) =>
      prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title],
    )

  const allOpen = openSections.length === ALL_TITLES.length

  return (
    <div className="mt-2 flex flex-col gap-2">
      <button
        type="button"
        className="w-fit cursor-pointer self-end border-none bg-transparent p-0 text-[0.7rem] text-violet-400 underline-offset-2 transition hover:underline"
        onClick={() => setOpenSections(allOpen ? [] : ALL_TITLES)}
      >
        {allOpen ? 'Chiudi Tutte le Sezioni' : 'Apri Tutte le Sezioni'}
      </button>
      {PROFILE_SECTIONS.map((section) => {
        const keys = section.fields.map((f) => f.key)
        const filled = countFilled(profile, keys)
        const isOpen = openSections.includes(section.title)
        return (
          <div
            key={section.title}
            /* Niente overflow-hidden: ritaglierebbe le tendine dei Select
               interni. Gli angoli li arrotonda direttamente l'intestazione,
               che è l'unico figlio a sfondo pieno. */
            className="rounded-2xl border border-white/6 bg-white/2"
          >
            <button
              type="button"
              className={`flex w-full cursor-pointer items-center justify-between gap-3 border-none bg-transparent px-4 py-3 text-left transition hover:bg-white/4 ${
                isOpen ? 'rounded-t-2xl' : 'rounded-2xl'
              }`}
              onClick={() => toggleSection(section.title)}
              aria-expanded={isOpen}
            >
              <span className="text-[0.72rem] font-semibold uppercase tracking-widest text-violet-400">
                {section.title}
              </span>
              <span className="flex items-center gap-3">
                <span
                  className={`text-[0.7rem] ${filled === 0 ? 'text-slate-600' : 'text-slate-400'}`}
                >
                  {filled}/{keys.length}
                </span>
                <ChevronDownIcon
                  className={`shrink-0 transition-transform ${
                    isOpen ? 'rotate-180 text-violet-400' : 'text-slate-500'
                  }`}
                />
              </span>
            </button>
            {isOpen && (
              <div className="grid grid-cols-2 gap-3 border-t border-white/6 p-4 max-[600px]:grid-cols-1">
                {section.fields.map((field) => (
                  <ProfileFieldInput
                    key={field.key}
                    field={field}
                    value={profile[field.key] ?? ''}
                    onChange={(value) => onFieldChange(field.key, value)}
                    disabled={disabled}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
