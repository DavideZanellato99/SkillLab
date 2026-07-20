import type { ConversationMode } from '../services/api';

/** The word the badge shows, also what table search matches the channel on. */
export function conversationModeLabel(mode: ConversationMode): string {
  return mode === 'text' ? 'Chat' : 'Chiamata';
}

/**
 * The channel a conversation ran on: a phone call or a written chat.
 *
 * Shared by everything that lists conversations (the activity report, the
 * expanded conversations panel) so the two channels look the same
 * everywhere: violet phone for a call, cyan bubble for a chat.
 *
 * With iconOnly the word is dropped and only the glyph is drawn, for dense
 * places like the dashboard table. The label stays in the markup for screen
 * readers, and the hover title spells the channel out either way.
 */
export default function ConversationModeBadge({
  mode,
  iconOnly = false,
}: {
  mode: ConversationMode;
  iconOnly?: boolean;
}) {
  const isText = mode === 'text';
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border text-[0.62rem] font-semibold uppercase tracking-wider ${
        iconOnly ? 'p-1' : 'gap-1 px-2 py-0.5'
      } ${
        isText
          ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400'
          : 'border-violet-600/35 bg-violet-600/10 text-violet-400'
      }`}
      title={isText ? 'Conversazione scritta in chat' : 'Conversazione al telefono'}
    >
      {isText ? (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ) : (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
      )}
      <span className={iconOnly ? 'sr-only' : undefined}>{conversationModeLabel(mode)}</span>
    </span>
  );
}
