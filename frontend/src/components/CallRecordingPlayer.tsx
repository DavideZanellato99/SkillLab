import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchRecordingInfo, fetchRecordingBlob } from '../services/voice';

/* Playback of a finished call: the operator and the avatar mixed in one
 * track, as recorded in the browser during the call itself.
 *
 * The audio is fetched only when the user asks for it. The metadata query
 * is cheap (the blob column is deferred server-side), so the component can
 * decide whether there is anything to offer without moving any audio. */

interface CallRecordingPlayerProps {
  conversationId: string;
  /**
   * "dock" is the roomy version at the foot of a finished conversation.
   * "inline" is compact and right-aligned, to sit on a section heading
   * without pushing the content underneath it down the page.
   */
  variant?: 'dock' | 'inline';
}

/** "3:07" from milliseconds; the WebM container carries no duration. */
function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Extension matching what MediaRecorder produced, for the download name. */
function extensionFor(mimeType: string): string {
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
}

export default function CallRecordingPlayer({
  conversationId,
  variant = 'dock',
}: CallRecordingPlayerProps) {
  const isInline = variant === 'inline';
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const { data: info } = useQuery({
    queryKey: ['recording-info', conversationId],
    queryFn: () => fetchRecordingInfo(conversationId),
  });

  // Every object URL is revoked when it is replaced or the player goes
  // away, so a session of listening back never leaks blobs.
  useEffect(() => {
    if (!audioUrl) return;
    return () => URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  // A different conversation is different audio: drop the loaded one (the
  // effect above revokes it) and go back to offering the play button.
  useEffect(() => {
    setAudioUrl(null);
    setError('');
  }, [conversationId]);

  const handleLoad = async () => {
    setIsLoading(true);
    setError('');
    try {
      const blob = await fetchRecordingBlob(conversationId);
      setAudioUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Impossibile caricare la registrazione.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Nothing recorded: calls from before this feature, or a browser that
  // could not record. The rest of the conversation view is unaffected.
  if (!info) return null;

  const subtitle = [
    info.duration_ms !== null ? formatDuration(info.duration_ms) : null,
    formatSize(info.size_bytes),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className={`flex flex-col gap-2 ${
        isInline ? 'items-end' : 'w-full max-w-[520px] items-center'
      }`}
    >
      {audioUrl ? (
        <>
          <audio
            className={isInline ? 'h-8 w-[260px] max-w-full' : 'w-full'}
            controls
            autoPlay
            src={audioUrl}
            aria-label="Registrazione della chiamata"
          />
          <a
            className="flex items-center gap-1.5 text-[0.72rem] text-slate-500 transition hover:text-violet-400"
            href={audioUrl}
            download={`chiamata-${conversationId}.${extensionFor(info.mime_type)}`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Scarica l’audio
          </a>
        </>
      ) : (
        <button
          className={`flex shrink-0 cursor-pointer items-center whitespace-nowrap rounded-xl border border-white/6 bg-white/4 font-medium text-slate-400 transition hover:-translate-y-px hover:border-violet-600 hover:bg-violet-600/12 hover:text-violet-400 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 ${
            isInline ? 'gap-1.5 px-3 py-1 text-[0.72rem]' : 'gap-2 px-4 py-2 text-[0.85rem]'
          }`}
          onClick={handleLoad}
          disabled={isLoading}
        >
          {isLoading ? (
            <span
              className={`animate-spin rounded-full border-2 border-violet-600/25 border-t-violet-600 ${
                isInline ? 'h-3 w-3' : 'h-4 w-4'
              }`}
            />
          ) : (
            <svg width={isInline ? 12 : 16} height={isInline ? 12 : 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          )}
          {isLoading
            ? 'Caricamento...'
            : `${isInline ? 'Ascolta' : 'Ascolta la registrazione'} · ${subtitle}`}
        </button>
      )}

      {error && (
        <p className="text-[0.72rem] text-red-400">{error}</p>
      )}
    </div>
  );
}
