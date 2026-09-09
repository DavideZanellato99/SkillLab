"""Cosa deve saper fare un fornitore di sintesi, perché la pipeline lo regga.

La chiamata vocale parla con un fornitore solo per volta, scelto da
``TTS_PROVIDER`` in [tts_provider](tts_provider.py), ma i due protocolli non
si somigliano quasi in niente: la voce sta nell'indirizzo o nel messaggio, il
turno si chiude o si annulla con parole diverse, e l'audio torna dentro
campi con nomi diversi. Qui sta la forma unica che `voice_pipeline` conosce,
e ogni adattatore (`elevenlabs_tts_service`, `cartesia_tts_service`) la
implementa con questi nomi:

``PROVIDER_LABEL``
    Il nome del fornitore come va scritto nei log e nei messaggi d'errore.
``API_KEY``
    La chiave, vuota se non configurata: la sessione vocale la guarda prima
    di aprire il socket, per rifiutare la chiamata con un messaggio invece
    che con una connessione che cade.
``TTS_SAMPLE_RATE``, ``TTS_LANGUAGE``
    La frequenza dell'audio grezzo che torna, e la lingua della sintesi.
``DEFAULT_VOICE_ID``
    La voce di chi non ne ha una assegnata, vuota se non configurata.
``VOICE_IN_URL``
    Se la voce viaggia nell'handshake. Quando è vera, un id sbagliato non
    rovina un turno, impedisce la chiamata, e chi apre il socket ha una
    seconda possibilità da giocarsi con la voce predefinita.
``KEEPALIVE_SECS``
    Ogni quanto tenere viva la socket, oppure ``None`` se il fornitore non
    la chiude da solo e il giro dei keep alive non va nemmeno acceso.
``ws_url(voice_id)``, ``ws_headers()``
    Dove e con quali intestazioni si apre la connessione della sintesi.
``resolve_voice_id(avatar_voice_id)``
    La voce dell'avatar, o quella predefinita se l'avatar non ne ha.
``chunk_message(context_id, text, voice_id)``
    Un pezzo di battuta da sintetizzare dentro il contesto di un turno.
``end_message(context_id, voice_id)``
    Fine del turno: manda in sintesi quel che è rimasto in cassa.
``cancel_message(context_id)``
    Interruzione: il turno non serve più perché l'operatore ha ripreso a
    parlare. Dove il protocollo non distingue i due casi è lo stesso
    messaggio della chiusura, e a scartare l'audio in arrivo ci pensa la
    pipeline, che sa quale contesto è ancora quello buono.
``keepalive_message(context_id, voice_id)``
    Un messaggio che non sintetizza niente e riarma il tetto di inattività.
``parse_event(raw)``
    Un messaggio del fornitore letto come ``TtsEvent``.
``list_voices(limit)``, ``synthesize_preview(voice_id, text)``
    Il catalogo e l'anteprima del pannello avatar, le due chiamate che non
    appartengono alla pipeline dal vivo.

Il `voice_id` passa anche dove un fornitore non ne ha bisogno: la
connessione è di una voce sola per tutta la chiamata, ma dove la voce sta in
ogni messaggio va ripetuta a ogni messaggio, e un parametro ignorato costa
meno di due firme diverse da tenere allineate.
"""

from typing import NamedTuple


class TtsEvent(NamedTuple):
    """Un messaggio del fornitore, ridotto a quel che la pipeline ne fa.

    Un evento può portare audio e chiudere il turno insieme, oppure solo
    l'uno o solo l'altro: i campi non si escludono a vicenda perché nemmeno
    i protocolli lo fanno.
    """

    # Il turno a cui l'evento appartiene. Può mancare sugli errori, che
    # certi fornitori mandano prima di sapere di quale contesto parlano.
    context_id: str | None
    # PCM16 già decodificato, vuoto quando l'evento non porta audio.
    audio: bytes
    # Il fornitore ha finito di sintetizzare questo contesto.
    final: bool
    # Il messaggio d'errore, quando l'evento è un errore.
    error: str | None
