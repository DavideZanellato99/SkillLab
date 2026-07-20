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

  // ── Cleanup ─────────────────────────────────────────

  private teardown() {
    if (this.closed) return;
    this.closed = true;
    this.flushPlayback();
    this.captureNode?.port.close();
    this.captureNode?.disconnect();
    this.micSource?.disconnect();
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => undefined);
    this.captureNode = null;
    this.micSource = null;
    this.micStream = null;
    this.ctx = null;
  }
}
