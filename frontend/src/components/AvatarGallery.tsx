/* Il catalogo degli avatar: la casella di ricerca, i filtri per categoria e
 * la griglia.
 *
 * Gli avatar arrivano tutti in una lettura sola e da lì non si torna più sul
 * server: cercare e scegliere una categoria sono giri su una lista che è già
 * in memoria (`avatarFilters`), quindi la griglia risponde nell'istante in
 * cui si preme, e il numero accanto a ogni categoria si sa senza chiederlo.
 * Prima ogni pastiglia era una richiesta e una voce di cache sua.
 *
 * Un guasto di rete si racconta in due modi, perché sono due situazioni
 * diverse: se non c'è niente a schermo la pagina lo dice e offre di
 * riprovare, se il catalogo è già lì da una lettura precedente basta un
 * avviso a scomparsa, perché quello che si vede resta buono. */

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useAvatars, useCategories } from '../hooks/useAvatars'
import { useFlashMessage } from '../hooks/useFlashMessage'
import { isSuperAdmin } from '../services/auth'
import AvatarCard from './AvatarCard'
import AvatarGalleryEmpty, { type EmptyReason } from './AvatarGalleryEmpty'
import { countByCategory, filterAvatars } from './avatarFilters'
import FilterTabs from './FilterTabs'
import FormError from './FormError'
import PrimaryButton from './PrimaryButton'
import SearchInput from './SearchInput'
import Toast from './Toast'

const gridCls =
  'grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-8 p-2 max-md:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] max-md:gap-4 max-[480px]:grid-cols-1'

const shimmerCls =
  'animate-shimmer bg-[linear-gradient(90deg,#111827_0%,rgba(255,255,255,0.05)_50%,#111827_100%)] bg-[length:200%_100%]'

/** Il valore della pastiglia "Tutti": il gruppo di scelta parla per stringhe,
 *  il catalogo intero è l'assenza di una categoria. */
const ALL = 'all'

export default function AvatarGallery() {
  const { user } = useAuth()

  /* L'id della categoria e non il suo nome: il nome si può rinominare
   * mentre la galleria è aperta, l'id no. */
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const { data: avatars = [], isLoading, isError, isFetching, refetch } = useAvatars()
  const { data: categories = [] } = useCategories()

  const counts = useMemo(() => countByCategory(avatars), [avatars])
  const visibleAvatars = useMemo(
    () => filterAvatars(avatars, activeCategoryId, search),
    [avatars, activeCategoryId, search],
  )

  /* Il catalogo è già a schermo e il rinfresco è fallito: si dice, senza
   * togliere quello che si vede, che potrebbe non essere l'ultima parola. */
  const { message: staleWarning, flash, clear } = useFlashMessage()
  useEffect(() => {
    if (isError && avatars.length > 0) {
      flash('Il catalogo a schermo potrebbe non essere aggiornato.')
    }
  }, [isError, avatars.length, flash])

  const options = [
    { value: ALL, label: 'Tutti', count: avatars.length },
    ...categories.map((cat) => ({
      value: cat.id,
      label: cat.name,
      count: counts[cat.id] ?? 0,
    })),
  ]

  /* Perché non c'è niente da mostrare, in ordine di quanto è facile
   * rimediarci: la ricerca, poi la categoria, e da ultimo il catalogo che è
   * vuoto davvero. */
  const emptyReason: EmptyReason =
    search.trim() !== '' ? 'search' : activeCategoryId !== null ? 'category' : 'catalog'

  return (
    <>
      {/* Ricerca e filtri */}
      <div className="mb-12 flex animate-fade-in-up flex-col items-center gap-4 [animation-delay:0.3s]">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Cerca per nome, scenario o categoria"
          ariaLabel="Cerca un avatar"
          className="w-full max-w-md"
        />
        <FilterTabs
          value={activeCategoryId ?? ALL}
          onChange={(value) => setActiveCategoryId(value === ALL ? null : value)}
          options={options}
          ariaLabel="Categoria degli avatar"
          variant="pills"
        />
      </div>

      {isLoading ? (
        <div className={gridCls}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-3xl border border-white/6 bg-gray-900/60"
            >
              <div className={`aspect-square ${shimmerCls}`} />
              <div className="p-6">
                <div className={`mb-2 h-3 w-3/5 rounded-md ${shimmerCls}`} />
                <div className={`mb-2 h-3 w-4/5 rounded-md ${shimmerCls}`} />
                <div className={`mb-2 h-3 rounded-md ${shimmerCls}`} />
              </div>
            </div>
          ))}
        </div>
      ) : isError && avatars.length === 0 ? (
        /* Niente a schermo e il server non risponde: non è un catalogo
           vuoto, ed è l'unico caso in cui c'è qualcosa da riprovare. */
        <div className="flex animate-fade-in flex-col items-center gap-4 p-16 max-md:p-8">
          <FormError
            variant="page"
            message="Impossibile caricare il catalogo degli avatar. Verifica la connessione e riprova."
          />
          <PrimaryButton onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? 'Nuovo tentativo in corso...' : 'Riprova'}
          </PrimaryButton>
        </div>
      ) : visibleAvatars.length === 0 ? (
        <AvatarGalleryEmpty
          reason={emptyReason}
          canManageAvatars={isSuperAdmin(user)}
          onClearSearch={() => setSearch('')}
          onShowAll={() => setActiveCategoryId(null)}
        />
      ) : (
        <div className={gridCls} id="avatar-grid">
          {visibleAvatars.map((avatar, index) => (
            <AvatarCard key={avatar.id} avatar={avatar} index={index} />
          ))}
        </div>
      )}

      {staleWarning && (
        <div className="fixed right-8 top-20 z-[1000] flex flex-col gap-2 max-md:inset-x-4 max-md:top-[4.5rem]">
          <Toast
            title="Aggiornamento non riuscito"
            message={staleWarning}
            type="error"
            onClose={clear}
          />
        </div>
      )}
    </>
  )
}
