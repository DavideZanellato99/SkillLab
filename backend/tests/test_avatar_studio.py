"""What the avatar admin form calls while it is being filled in.

Three helpers that belong to the editor rather than to an avatar row: the
portrait upload, the preview of the roleplay prompt a sheet produces, and
the Cartesia voice catalogue with its one-shot preview. Cartesia is never
reached from here: the catalogue is exercised with no API key (the honest
503) and the preview is monkeypatched.
"""

import pytest

import cartesia_service
import routers.admin_avatars as admin_avatars
import routers.admin_voices as admin_voices

# The smallest valid PNG: signature plus a minimal IHDR, enough for the
# signature check that guards the upload.
_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


@pytest.fixture(autouse=True)
def uploads_in_tmp(tmp_path, monkeypatch):
    """Send uploaded portraits to a throwaway directory.

    The endpoint writes a real file, so without this the suite would litter
    the repository's static/avatars with one image per run.
    """
    monkeypatch.setattr(admin_avatars, "_AVATARS_DIR", str(tmp_path))


def test_prompt_preview_renders_the_sheet(admin_client):
    response = admin_client.post(
        "/api/admin/avatars/prompt-preview",
        json={
            "profile": {
                "NOME": "Giovanni",
                "COGNOME": "Salemmi",
                "EMOZIONE_INIZIALE": "Arrabbiato",
                "SEGRETI": "Ha già chiuso un conto altrove",
            },
            "channel": "voice",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert "Giovanni Salemmi" in body["prompt"]
    assert "Arrabbiato" in body["prompt"]
    assert body["channel"] == "voice"
    assert body["ignored_fields"] == []


def test_prompt_preview_reports_the_fields_it_dropped(admin_client):
    """A "/" in a cell is not data: the author must see it vanished."""
    response = admin_client.post(
        "/api/admin/avatars/prompt-preview",
        json={
            "profile": {"NOME": "Anna", "COGNOME": "Bianchi", "NUMERO_FIGLI": "/", "PAURE": "n/d"},
            "channel": "text",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["ignored_fields"] == ["NUMERO_FIGLI", "PAURE"]
    assert "n/d" not in body["prompt"]


def test_prompt_preview_follows_the_channel(admin_client):
    profile = {"NOME": "Luca", "COGNOME": "Verdi"}
    voice = admin_client.post(
        "/api/admin/avatars/prompt-preview", json={"profile": profile, "channel": "voice"}
    ).json()["prompt"]
    text = admin_client.post(
        "/api/admin/avatars/prompt-preview", json={"profile": profile, "channel": "text"}
    ).json()["prompt"]
    assert "TELEFONO" in voice.upper()
    assert "CHAT" in text.upper()
    assert voice != text


def test_prompt_preview_rejects_an_unknown_channel(admin_client):
    response = admin_client.post(
        "/api/admin/avatars/prompt-preview",
        json={"profile": {"NOME": "Luca"}, "channel": "piccione"},
    )
    assert response.status_code == 422


def test_image_upload_accepts_a_png(admin_client):
    response = admin_client.post(
        "/api/admin/avatars/image",
        files={"file": ("ritratto.png", _PNG, "image/png")},
    )
    assert response.status_code == 200
    assert response.json()["image_url"].startswith("/static/avatars/upload_")
    assert response.json()["image_url"].endswith(".png")


def test_image_upload_refuses_anything_a_browser_could_execute(admin_client):
    """An SVG claiming to be a PNG is still an SVG: the bytes decide."""
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    response = admin_client.post(
        "/api/admin/avatars/image",
        files={"file": ("innocuo.png", svg, "image/png")},
    )
    assert response.status_code == 400
    assert "PNG" in response.json()["detail"]


def test_image_upload_refuses_an_empty_file(admin_client):
    response = admin_client.post(
        "/api/admin/avatars/image",
        files={"file": ("vuoto.png", b"", "image/png")},
    )
    assert response.status_code == 400


def test_image_upload_refuses_an_oversized_file(admin_client):
    too_big = _PNG + b"\x00" * (2 * 1024 * 1024)
    response = admin_client.post(
        "/api/admin/avatars/image",
        files={"file": ("enorme.png", too_big, "image/png")},
    )
    assert response.status_code == 413


def test_voice_catalogue_says_so_when_cartesia_is_unreachable(admin_client, monkeypatch):
    """A missing key or a network failure is a 503 the page can show, not a 500.

    Patched rather than left to the environment: a developer with a real
    .env would otherwise make the suite call Cartesia for real.
    """

    def _boom():
        raise RuntimeError("CARTESIA_API_KEY non configurata.")

    monkeypatch.setattr(cartesia_service, "list_voices", _boom)

    response = admin_client.get("/api/admin/voices")
    assert response.status_code == 503
    assert "Cartesia" in response.json()["detail"]


def test_voice_catalogue_keeps_only_the_app_language(admin_client, monkeypatch):
    """Le voci di altre lingue non compaiono, e le italiane sono in ordine."""
    monkeypatch.setattr(
        cartesia_service,
        "list_voices",
        lambda: [
            {"id": "en-1", "name": "Zoe", "language": "en", "description": None},
            {"id": "it-2", "name": "Marco", "language": "it", "description": "Voce maschile"},
            {"id": "it-1", "name": "Anna", "language": "it-IT", "description": None},
        ],
    )
    monkeypatch.setattr(cartesia_service, "CARTESIA_LANGUAGE", "it")

    response = admin_client.get("/api/admin/voices")
    assert response.status_code == 200
    assert [v["id"] for v in response.json()] == ["it-1", "it-2"]


def test_voice_catalogue_falls_back_when_the_language_has_no_voices(admin_client, monkeypatch):
    """Nessuna voce nella lingua dell'app: meglio l'elenco intero del vuoto."""
    monkeypatch.setattr(
        cartesia_service,
        "list_voices",
        lambda: [
            {"id": "en-1", "name": "Zoe", "language": "en", "description": None},
            {"id": "fr-1", "name": "Amelie", "language": "fr", "description": None},
        ],
    )
    monkeypatch.setattr(cartesia_service, "CARTESIA_LANGUAGE", "it")

    response = admin_client.get("/api/admin/voices")
    assert response.status_code == 200
    assert [v["id"] for v in response.json()] == ["fr-1", "en-1"]


def test_voice_preview_returns_audio(admin_client, monkeypatch):
    spoken = {}

    def _fake_preview(voice_id, transcript):
        spoken["voice_id"] = voice_id
        spoken["transcript"] = transcript
        return b"RIFF----WAVEfmt "

    monkeypatch.setattr(cartesia_service, "synthesize_preview", _fake_preview)

    response = admin_client.post("/api/admin/voices/preview", json={"voice_id": "it-1"})
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/wav"
    assert response.content.startswith(b"RIFF")
    assert spoken["voice_id"] == "it-1"
    # No text given: the default line is spoken, so voices stay comparable
    assert spoken["transcript"] == admin_voices._DEFAULT_PREVIEW_TEXT


def test_voice_preview_refuses_a_long_text(admin_client):
    response = admin_client.post(
        "/api/admin/voices/preview",
        json={"voice_id": "it-1", "text": "a" * 301},
    )
    assert response.status_code == 400


def test_the_form_helpers_are_super_admin_only(user_client):
    assert user_client.get("/api/admin/voices").status_code == 403
    assert (
        user_client.post("/api/admin/voices/preview", json={"voice_id": "it-1"}).status_code == 403
    )
    assert (
        user_client.post(
            "/api/admin/avatars/prompt-preview", json={"profile": {"NOME": "X"}}
        ).status_code
        == 403
    )
    assert (
        user_client.post(
            "/api/admin/avatars/image", files={"file": ("a.png", _PNG, "image/png")}
        ).status_code
        == 403
    )
