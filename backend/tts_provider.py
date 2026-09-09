"""Chi dà la voce all'avatar, e da quale fornitore.

La sintesi è, come il roleplay, una scelta aperta fra due fornitori, e per la
stessa ragione: è l'altro pezzo della chiamata che qualcuno aspetta in linea,
quindi è l'altro pezzo in cui la velocità della prima parola conta più di
tutto il resto. La trascrizione invece resta su ElevenLabs
(`elevenlabs_service`), perché la fine del turno dell'operatore la decide la
sua VAD e cambiarla vorrebbe dire ritarare la conversazione, non il
fornitore.

`TTS_PROVIDER` sceglie chi parla, e serve a metterli a confronto sulle stesse
chiamate invece che sulla carta: quello che li separa è il tempo fra la
battuta pronta e il primo audio, e quel numero si legge in `turn_metrics`
(segmento `tts`), non nei benchmark pubblicati, perché dipende da quanto
testo gli si dà per volta più che dal modello.

I due protocolli non si somigliano, quindi qui non basta cambiare un cliente
come fa `roleplay_provider`: la forma unica che la pipeline conosce sta in
[tts_protocol](tts_protocol.py), e ogni fornitore ha il suo adattatore che la
implementa. Questo file è solo la scelta, e i nomi che ne derivano.

Solo il fornitore scelto viene preteso dal `.env`: le variabili di un
fornitore si leggono importando il suo adattatore, e l'altro non viene mai
importato, quindi chi resta su ElevenLabs non deve configurare Cartesia per
far partire il backend, e viceversa.
"""

import os

from dotenv import load_dotenv

load_dotenv()

PROVIDER_ELEVENLABS = "elevenlabs"
PROVIDER_CARTESIA = "cartesia"
_PROVIDERS = (PROVIDER_ELEVENLABS, PROVIDER_CARTESIA)

TTS_PROVIDER = os.getenv("TTS_PROVIDER")
if TTS_PROVIDER not in _PROVIDERS:
    raise RuntimeError(
        "TTS_PROVIDER non configurato o non riconosciuto "
        f"(atteso uno fra {', '.join(_PROVIDERS)}). Aggiungilo al file .env del backend."
    )

if TTS_PROVIDER == PROVIDER_CARTESIA:
    import cartesia_tts_service as _tts
else:
    import elevenlabs_tts_service as _tts

# ── Il fornitore scelto, con i nomi del protocollo ────────────────────
#
# Legati una volta sola all'avvio, non risolti a ogni chiamata: il fornitore
# non cambia mentre il backend gira, e questo è anche quello che permette a
# chi prova il pannello di sostituire il catalogo con uno finto agendo su
# questo modulo invece che sull'adattatore sotto.

PROVIDER_LABEL = _tts.PROVIDER_LABEL
API_KEY = _tts.API_KEY
TTS_SAMPLE_RATE = _tts.TTS_SAMPLE_RATE
TTS_LANGUAGE = _tts.TTS_LANGUAGE
DEFAULT_VOICE_ID = _tts.DEFAULT_VOICE_ID
VOICE_IN_URL = _tts.VOICE_IN_URL
KEEPALIVE_SECS = _tts.KEEPALIVE_SECS

ws_url = _tts.ws_url
ws_headers = _tts.ws_headers
resolve_voice_id = _tts.resolve_voice_id
chunk_message = _tts.chunk_message
end_message = _tts.end_message
cancel_message = _tts.cancel_message
keepalive_message = _tts.keepalive_message
parse_event = _tts.parse_event
list_voices = _tts.list_voices
synthesize_preview = _tts.synthesize_preview
