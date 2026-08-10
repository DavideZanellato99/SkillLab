/* La scheda persona a fisarmonica: otto sezioni, una alla volta.
 *
 * Aperte tutte insieme sono uno scroll di parecchi schermi, quindi resta
 * aperta solo quella su cui si sta lavorando. Il conteggio "3/7" sta
 * sull'intestazione proprio per questo: dice cosa manca là dentro senza
 * costringere ad aprirla. */

import { useState } from 'react'

import { countFilled, PROFILE_SECTIONS } from './avatarProfileConfig'
import ProfileFieldInput from './ProfileFieldInput'

interface AvatarProfileSectionsProps {
  profile: Record<string, string>
  onFieldChange: (key: string, value: string) => void
  disabled: boolean
}

export default function AvatarProfileSections({
  profile,
  onFieldChange,
  disabled,
}: AvatarProfileSectionsProps) {
  // L'anagrafica parte aperta perché è da lì che si comincia sempre.
  const [openSections, setOpenSections] = useState<string[]>([PROFILE_SECTIONS[0].title])

  const toggleSection = (title: string) =>
    setOpenSections((prev) =>
      prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title],
    )

  return (
    <div className="mt-2 flex flex-col gap-2">
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
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`shrink-0 transition-transform ${
                    isOpen ? 'rotate-180 text-violet-400' : 'text-slate-500'
                  }`}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
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
