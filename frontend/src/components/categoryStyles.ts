/** Tailwind classes for the category badge pill, keyed by category slug. */
export const CATEGORY_BADGE_CLASSES: Record<string, string> = {
  fantasy: 'bg-violet-600/15 text-violet-400',
  'sci-fi': 'bg-cyan-500/15 text-cyan-400',
  nature: 'bg-emerald-500/15 text-emerald-500',
  abstract: 'bg-pink-500/15 text-pink-500',
};

export function categoryBadgeClasses(category: string): string {
  return CATEGORY_BADGE_CLASSES[category.toLowerCase()] ?? 'bg-white/6 text-slate-400';
}
