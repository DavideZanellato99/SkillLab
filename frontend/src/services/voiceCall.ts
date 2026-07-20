/* Realtime voice call client (ElevenLabs STT + Cartesia TTS via backend WS).
 *
 * Streams the microphone to the backend as binary PCM16 @ 16 kHz frames and
 * plays back the assistant's PCM16 @ 24 kHz audio chunks as they arrive.
 * JSON text frames carry transcripts and call state events.
 */

/** Sample rate of the mic frames the backend expects (ElevenLabs STT). */
const CAPTURE_SAMPLE_RATE = 16000;
/** Sample rate of the TTS audio the backend sends (Cartesia). */
const PLAYBACK_SAMPLE_RATE = 24000;

/* Containers for the call recording, best first. Chrome and Firefox take
 * the Opus ones, Safari only records mp4/AAC. */
const RECORDING_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

/* Speech-tuned bitrate: roughly 2.4 MB for a ten minute call, against the
 * ~19 MB the same call would take as uncompressed PCM. */
const RECORDING_BITS_PER_SECOND = 32000;

/* Chunk interval. The blob is assembled at the end either way, this just
 * keeps the recorder from holding one growing buffer for the whole call. */
const RECORDING_TIMESLICE_MS = 5000;

/** The mixed audio of one call, ready to upload. */
export interface CallRecording {
  blob: Blob;
  mimeType: string;
  /** Measured wall-clock length: WebM from MediaRecorder carries none. */
  durationMs: number;
}

function pickRecordingMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return RECORDING_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

/* AudioWorklet that resamples the mic to 16 kHz mono PCM16 and posts
 * ~40ms chunks. Runs off the main thread; inlined so no extra asset. */
const CAPTURE_WORKLET_SOURCE = `
class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._ratio = sampleRate / ${CAPTURE_SAMPLE_RATE};
    this._pending = new Float32Array(0);
    this._pos = 0;
    this._chunk = [];
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch || ch.length === 0) return true;
    const merged = new Float32Array(this._pending.length + ch.length);
    merged.set(this._pending, 0);
    merged.set(ch, this._pending.length);
    let pos = this._pos;
    while (pos + 1 < merged.length) {
      const i = Math.floor(pos);
      const frac = pos - i;
      this._chunk.push(merged[i] * (1 - frac) + merged[i + 1] * frac);
      pos += this._ratio;
    }
    const keepFrom = Math.floor(pos);
    this._pending = merged.slice(keepFrom);
    this._pos = pos - keepFrom;
    // ~40ms at 16 kHz
    if (this._chunk.length >= 640) {
      const pcm = new Int16Array(this._chunk.length);
      for (let i = 0; i < this._chunk.length; i++) {
        const s = Math.max(-1, Math.min(1, this._chunk[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
      this._chunk = [];
    }
    return true;
  }
}
registerProcessor('pcm-capture', PCMCaptureProcessor);
`;

export interface VoiceCallCallbacks {
  /** Interim transcript of what the operator is saying. */
  onUserPartial?: (text: string) => void;
  /** Final transcript of the operator's turn. */
  onUserFinal: (text: string) => void;
  /** Full text of the assistant's turn (once complete or interrupted). */
  onAssistantEnd: (text: string) => void;
  /** True while assistant audio is audible, false when it finishes. */
  onSpeakingChange: (speaking: boolean) => void;
  /** True from the operator's final transcript until audio starts. */
  onProcessingChange: (processing: boolean) => void;
  onError: (message: string) => void;
  /** The call is over (remote close, error or hangup). */
  onClose: () => void;
}

export class VoiceCall {
  private ws: WebSocket | null = null;
  private ctx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private captureNode: AudioWorkletNode | null = null;

  // Recording: both voices are summed into recDest by the audio graph
  // itself, so the file follows the real timeline the operator heard,
  // pauses included. Null when the browser has no usable MediaRecorder.
  private recDest: MediaStreamAudioDestinationNode | null = null;
  private recorder: MediaRecorder | null = null;
  private recChunks: Blob[] = [];
  private recMimeType = '';
  private recStartedAt = 0;
  private recordingReady: Promise<CallRecording | null>;
  private resolveRecording!: (value: CallRecording | null) => void;

  private playhead = 0;
  private scheduled = new Set<AudioBufferSourceNode>();
  private serverDoneSpeaking = true;
  private audible = false;
  // True from the operator's committed turn until the avatar's reply audio
  // starts (or the turn dies). Mic is gated while processing or audible.
  private processing = false;

  private muted = true; // stays muted until start() (during the ring)
  private closed = false;

  private readonly sessionId: string;
  private readonly cb: VoiceCallCallbacks;

  constructor(sessionId: string, cb: VoiceCallCallbacks) {
    this.sessionId = sessionId;
    this.cb = cb;
    this.recordingReady = new Promise((resolve) => {
      this.resolveRecording = resolve;
    });
  }

  /** Open mic + WebSocket; resolves when the backend pipeline is ready. */
  async connect(): Promise<void> {
    // Mic first: permission prompt must happen inside the user gesture
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this.ctx = new AudioContext();
    await this.ctx.resume();
    const workletUrl = URL.createObjectURL(
      new Blob([CAPTURE_WORKLET_SOURCE], { type: 'application/javascript' }),
    );
    try {
      await this.ctx.audioWorklet.addModule(workletUrl);
    } finally {
      URL.revokeObjectURL(workletUrl);
    }
    this.captureNode = new AudioWorkletNode(this.ctx, 'pcm-capture');
    this.captureNode.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      if (this.muted || this.ws?.readyState !== WebSocket.OPEN) return;
      if (this.processing || this.audible) {
        // Half-duplex: the operator never talks over the avatar. Send
        // same-length silence instead of the mic so the STT stream stays
        // alive and its VAD closes any utterance cleanly.
        this.ws.send(new ArrayBuffer(e.data.byteLength));
      } else {
        this.ws.send(e.data);
      }
    };
    this.micSource = this.ctx.createMediaStreamSource(this.micStream);
    this.micSource.connect(this.captureNode);
    // No connection to destination: the worklet is capture-only

    this.setupRecorder();

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${window.location.host}/api/voice/ws?session_id=${encodeURIComponent(this.sessionId)}`;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Timeout durante la connessione alla chiamata.'));
          ws.close();
        }
      }, 15000);

      ws.onmessage = (event) => {
        if (typeof event.data !== 'string') {
          this.playChunk(event.data as ArrayBuffer);
          return;
        }
        let msg: { type: string; text?: string; message?: string };
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        switch (msg.type) {
          case 'ready':
            if (!settled) {
              settled = true;
              clearTimeout(timeout);
              resolve();
            }
            break;
          case 'user_partial':
            this.cb.onUserPartial?.(msg.text ?? '');
            break;
          case 'user_final':
            this.processing = true;
            this.cb.onUserFinal(msg.text ?? '');
            this.cb.onProcessingChange(true);
            break;
          case 'assistant_end':
            if (msg.text) this.cb.onAssistantEnd(msg.text);
            break;
          case 'speaking_start':
            this.serverDoneSpeaking = false;
            this.processing = false;
            this.cb.onProcessingChange(false);
            break;
          case 'speaking_end':
            this.serverDoneSpeaking = true;
            this.processing = false;
            this.cb.onProcessingChange(false);
            // If the queue already drained, close the speaking state now
            if (this.scheduled.size === 0) this.setAudible(false);
            break;
          case 'interrupt':
            this.flushPlayback();
            this.processing = false;
            this.cb.onProcessingChange(false);
            break;
          case 'error':
            this.cb.onError(msg.message ?? 'Errore nella chiamata.');
            break;
        }
      };

      ws.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error('Connessione alla chiamata non riuscita.'));
        }
      };

      ws.onclose = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error('Connessione alla chiamata chiusa inaspettatamente.'));
          return;
        }
        this.teardown();
        this.cb.onClose();
      };
    });
  }

  /** The ring is over: unmute the mic and let the avatar speak first. */
  start() {
    this.muted = false;
    this.ws?.send(JSON.stringify({ type: 'start' }));
    // Recording starts here, not at connect(): the setup happens during the
    // ring, and the ringback is not part of the conversation.
    if (this.recorder && this.recorder.state === 'inactive') {
      this.recStartedAt = Date.now();
      this.recorder.start(RECORDING_TIMESLICE_MS);
    }
  }

  mute() {
    this.muted = true;
  }

  unmute() {
    this.muted = false;
  }

  /** Hang up. Safe to call multiple times. */
  disconnect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: 'end' }));
      } catch {
        /* closing anyway */
      }
    }
    this.ws?.close();
    this.teardown();
  }

  // ── Playback ────────────────────────────────────────

  private playChunk(buf: ArrayBuffer) {
    if (!this.ctx || buf.byteLength < 2) return;
    // Drop a trailing odd byte: Int16Array requires an even length
    const pcm = new Int16Array(buf, 0, buf.byteLength >> 1);
    const floats = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) floats[i] = pcm[i] / 32768;

    // Buffers are tagged 24 kHz; the context resamples on playback
    const audioBuf = this.ctx.createBuffer(1, floats.length, PLAYBACK_SAMPLE_RATE);
    audioBuf.copyToChannel(floats, 0);
    const src = this.ctx.createBufferSource();
    src.buffer = audioBuf;
    src.connect(this.ctx.destination);
    // Same node into the recorder: the avatar lands in the file at the
    // instant it is actually heard, not when the chunk arrived.
    if (this.recDest) src.connect(this.recDest);

    // Small initial cushion absorbs network jitter between chunks
    const startAt = Math.max(this.playhead, this.ctx.currentTime + 0.08);
    src.start(startAt);
    this.playhead = startAt + audioBuf.duration;
    this.scheduled.add(src);
    this.setAudible(true);
    src.onended = () => {
      this.scheduled.delete(src);
      if (this.scheduled.size === 0 && this.serverDoneSpeaking) {
        this.setAudible(false);
      }
    };
  }

  private flushPlayback() {
    for (const src of this.scheduled) {
      try {
        src.onended = null;
        src.stop();
      } catch {
        /* already stopped */
      }
    }
    this.scheduled.clear();
    this.playhead = 0;
    this.serverDoneSpeaking = true;
    this.setAudible(false);
  }

  private setAudible(value: boolean) {
    if (this.audible !== value) {
      this.audible = value;
      this.cb.onSpeakingChange(value);
    }
  }

  // ── Recording ───────────────────────────────────────

  private setupRecorder() {
    const mimeType = pickRecordingMimeType();
    if (!mimeType || !this.ctx || !this.micSource) {
      // No supported container: the call still works, it just is not saved
      this.resolveRecording(null);
      return;
    }
    this.recMimeType = mimeType;
    this.recDest = this.ctx.createMediaStreamDestination();
    // The mic goes in unconditionally, including while the half-duplex gate
    // is sending silence to the STT: the file keeps what the operator
    // really said, even the part the avatar talked over.
    this.micSource.connect(this.recDest);

    const recorder = new MediaRecorder(this.recDest.stream, {
      mimeType,
      audioBitsPerSecond: RECORDING_BITS_PER_SECOND,
    });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.recChunks.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(this.recChunks, { type: mimeType });
      this.recChunks = [];
      this.resolveRecording(
        blob.size > 0
          ? { blob, mimeType, durationMs: Date.now() - this.recStartedAt }
          : null,
      );
    };
    recorder.onerror = () => this.resolveRecording(null);
    this.recorder = recorder;
  }

  /**
   * The recording of this call, once the recorder has flushed.
   * Null when nothing was captured: browser without MediaRecorder, or a
   * call hung up during the ring before start() ever ran.
   *
   * Safe to await after disconnect(): the promise settles either way.
   */
  recording(): Promise<CallRecording | null> {
    return this.recordingReady;
  }

  // ── Cleanup ─────────────────────────────────────────

  private teardown() {
    if (this.closed) return;
    this.closed = true;
    this.flushPlayback();

    // Stop the recorder before dismantling what feeds it, so the last
    // chunk is complete. It flushes asynchronously, hence the promise.
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop();
    } else {
      // Never started: hung up during the ring, nothing to save
      this.resolveRecording(null);
    }
    this.recorder = null;

    this.captureNode?.port.close();
    this.captureNode?.disconnect();
    this.micSource?.disconnect();
    this.micStream?.getTracks().forEach((t) => t.stop());

    // The context outlives the teardown until the recorder is done:
    // closing it any earlier truncates the tail of the recording.
    const ctx = this.ctx;
    void this.recordingReady.finally(() => {
      this.recDest = null;
      ctx?.close().catch(() => undefined);
    });

    this.captureNode = null;
    this.micSource = null;
    this.micStream = null;
    this.ctx = null;
  }
}
