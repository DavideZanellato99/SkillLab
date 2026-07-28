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
    """The Cartesia voices, the ones in the configured language first.

    The app speaks one language (CARTESIA_LANGUAGE), so those voices are the
    only realistic choice and are floated to the top; the rest stay listed
    rather than hidden, since a persona may legitimately be a foreigner.
    """
    try:
        voices = cartesia_service.list_voices()
    except Exception as exc:  # network, auth, malformed payload
        raise _unavailable(exc) from exc

    language = cartesia_service.CARTESIA_LANGUAGE
    voices.sort(key=lambda v: (v["language"] != language, v["name"].lower()))
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
