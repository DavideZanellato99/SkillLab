/* Le targhette di un avatar: la categoria e, se la scheda persona la
 * indica, il grado di difficoltà dello scenario. Vanno sempre insieme e
 * nello stesso ordine, quindi sono un pezzo unico: erano ricopiate
 * identiche nella card della galleria e nella sidebar della chat, dove
 * l'unica differenza era il centraggio. */

import { categoryBadgeClasses } from './categoryStyles'
import Tooltip from './Tooltip'

interface AvatarBadgesProps {
  category: string
  /** Grado di difficoltà (es. "8/10"), assente se la scheda non lo dice. */
  difficulty: string | null
  /** Centra le targhette, come nella colonna della chat. */
  center?: boolean
}

export default function AvatarBadges({ category, difficulty, center = false }: AvatarBadgesProps) {
  return (
    <div className={`mb-2 flex items-center gap-2 ${center ? 'justify-center' : ''}`}>
      <span
        className={`inline-block rounded-full px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-widest ${categoryBadgeClasses(category)}`}
      >
        {category}
      </span>
      {difficulty && (
        <Tooltip content="Grado di difficoltà dello scenario">
          <span className="inline-flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[0.7rem] font-semibold text-orange-400">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l2.9 6.26L21.5 9.27l-4.75 4.63 1.12 6.53L12 17.35l-5.87 3.08 1.12-6.53L2.5 9.27l6.6-1.01L12 2z" />
            </svg>
            Difficoltà: {difficulty}
          </span>
        </Tooltip>
      )}
    </div>
  )
}
