"""Cartesia voice catalogue and one-shot preview (super admin only).

Exists for one screen: the avatar admin form, where the voice of a persona
used to be an opaque id copied by hand from a CLI script. Here the catalogue
is listed and a line can be heard before saving.

Nothing in this module touches the database: it is a thin, authenticated
proxy in front of Cartesia, so the API key never reaches the browser.
"""

from fastapi import APIRouter, Depends, HTTPException, Response, status

import cartesia_service
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
    """Cartesia unreachable or misconfigured, told as a 503 the page can show."""
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=f"Catalogo voci Cartesia non disponibile: {exc}",
    )


@router.get("", response_model=list[VoiceOption])
def list_voices(
    current_admin: User = Depends(get_current_super_admin),
):
    """Only the Cartesia voices in the configured language, by name.

    The synthesis always speaks CARTESIA_LANGUAGE: a voice built for another
    language would just read Italian with the wrong accent, so those voices
    are filtered out instead of merely sorted down. A voice already saved on
    an avatar survives the filter anyway, the form keeps showing it and flags
    it as fuori catalogo.

    Fallback: if the account exposes nothing in that language the whole
    catalogue comes back, because an empty picker is worse than a wide one.
    """
    try:
        voices = cartesia_service.list_voices()
    except Exception as exc:  # network, auth, malformed payload
        raise _unavailable(exc) from exc

    language = _base_language(cartesia_service.CARTESIA_LANGUAGE)
    in_language = [v for v in voices if _base_language(v["language"]) == language]
    voices = in_language or voices
    voices.sort(key=lambda v: v["name"].lower())
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
        audio = cartesia_service.synthesize_preview(payload.voice_id, text)
    except Exception as exc:
        raise _unavailable(exc) from exc

    # no-store: a preview is a throwaway, and the next one may use a
    # different voice behind the same URL.
    return Response(
        content=audio,
        media_type="audio/wav",
        headers={"Cache-Control": "no-store"},
    )
