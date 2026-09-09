"""Catalogo voci e anteprima del fornitore di sintesi attivo (solo super admin).

Exists for one screen: the avatar admin form, where the voice of a persona
used to be an opaque id copied by hand from a CLI script. Here the catalogue
is listed and a line can be heard before saving.

Il catalogo è quello del fornitore scelto da `TTS_PROVIDER`, ed è l'unico che
possa essere: un id di voce vale soltanto per chi lo ha emesso, e il campo
dell'avatar su cui finisce è uno solo. Cambiando fornitore le voci assegnate
vanno quindi riscelte da qui, e fino ad allora gli avatar parlano con quella
predefinita.

Nothing in this module touches the database: it is a thin, authenticated
proxy in front of the provider, so the API key never reaches the browser.
"""

from fastapi import APIRouter, Depends, HTTPException, Response, status

import tts_provider
from auth_dependency import get_current_super_admin
from models import User
from schemas import VoiceOption, VoicePreviewRequest

router = APIRouter(prefix="/api/admin/voices", tags=["admin"])

# What a preview says when the admin does not supply a line of their own.
# A full sentence with some punctuation: it is meant to tell voices apart,
# and a single word says nothing about rhythm or intonation.
_DEFAULT_PREVIEW_TEXT = (
    "Buongiorno, la chiamo perché ho un problema con il mio conto e vorrei capire cosa è successo."
)

# Long enough for a couple of sentences, short enough that a preview stays a
# preview: this endpoint bills a TTS call on every click.
_MAX_PREVIEW_CHARS = 300


def _base_language(code: str) -> str:
    """`it-IT`, `IT`, `it` are the same language as far as this filter cares."""
    return (code or "").strip().lower().replace("_", "-").split("-")[0]


def _unavailable(exc: Exception) -> HTTPException:
    """Fornitore irraggiungibile o mal configurato, detto come un 503 mostrabile."""
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=f"Catalogo voci {tts_provider.PROVIDER_LABEL} non disponibile: {exc}",
    )


@router.get("", response_model=list[VoiceOption])
def list_voices(
    current_admin: User = Depends(get_current_super_admin),
):
    """The whole voice catalogue, the ones in the app's language first.

    Ordinate, non filtrate, ed è una differenza che vale la pena spiegare: il
    modello di sintesi è multilingue e la lingua gliela imponiamo noi, non la
    voce, quindi qualunque voce del catalogo legge l'italiano. Togliere
    quelle che dichiarano un'altra lingua nasconderebbe voci perfettamente
    usabili, e la lingua dichiarata resta comunque il criterio con cui si
    parte, perché una voce nata italiana l'accento giusto ce l'ha già.

    Una voce già salvata su un avatar ma non più in catalogo non compare qui:
    la scheda la tiene in elenco per conto suo e la segnala.
    """
    try:
        voices = tts_provider.list_voices()
    except Exception as exc:  # network, auth, malformed payload
        raise _unavailable(exc) from exc

    language = _base_language(tts_provider.TTS_LANGUAGE)
    voices.sort(key=lambda v: (_base_language(v["language"]) != language, v["name"].lower()))
    return [VoiceOption(**v) for v in voices]


@router.post("/preview")
def preview_voice(
    payload: VoicePreviewRequest,
    current_admin: User = Depends(get_current_super_admin),
):
    """Speak one line with the given voice and return it as WAV audio."""
    text = (payload.text or "").strip() or _DEFAULT_PREVIEW_TEXT
    if len(text) > _MAX_PREVIEW_CHARS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Il testo dell'anteprima non può superare {_MAX_PREVIEW_CHARS} caratteri.",
        )

    try:
        audio = tts_provider.synthesize_preview(payload.voice_id, text)
    except Exception as exc:
        raise _unavailable(exc) from exc

    # no-store: a preview is a throwaway, and the next one may use a
    # different voice behind the same URL.
    return Response(
        content=audio,
        media_type="audio/wav",
        headers={"Cache-Control": "no-store"},
    )
