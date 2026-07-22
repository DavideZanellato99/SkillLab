"""List Cartesia voices and assign them to avatars.

Usage:
    python assign_voices.py list                     # elenca le voci Cartesia disponibili
    python assign_voices.py avatars                  # elenca gli avatar e le voci assegnate
    python assign_voices.py set "<nome avatar>" <voice_id>
"""

import sys

import tls_setup  # noqa: F401  (TLS via OS store: must precede the requests import)

import requests

from database import SessionLocal
from models import Avatar
from cartesia_service import CARTESIA_API_KEY, CARTESIA_VERSION


def list_voices():
    if not CARTESIA_API_KEY:
        print("[ERRORE] CARTESIA_API_KEY non configurata nel .env")
        sys.exit(1)
    resp = requests.get(
        "https://api.cartesia.ai/voices",
        headers={
            "X-API-Key": CARTESIA_API_KEY,
            "Cartesia-Version": CARTESIA_VERSION,
        },
        params={"limit": 100},
        timeout=15,
    )
    if resp.status_code >= 400:
        print(f"[ERRORE] {resp.status_code}: {resp.text}")
        sys.exit(1)
    payload = resp.json()
    voices = payload.get("data", payload if isinstance(payload, list) else [])
    for v in voices:
        language = v.get("language") or "?"
        print(f"  {v.get('id')}  [{language}]  —  {v.get('name')}")
    print(f"\n{len(voices)} voci trovate (le voci 'it' sono le più adatte).")


def list_avatars():
    with SessionLocal() as db:
        for a in db.query(Avatar).order_by(Avatar.name).all():
            voice = a.voice_id or "(default)"
            print(f"  {a.name} [{a.category}] — voce: {voice}")


def set_voice(avatar_name: str, voice_id: str):
    with SessionLocal() as db:
        avatar = db.query(Avatar).filter(Avatar.name == avatar_name).first()
        if not avatar:
            print(f"[ERRORE] Avatar '{avatar_name}' non trovato.")
            sys.exit(1)
        avatar.voice_id = voice_id
        db.commit()
        print(f"OK: {avatar.name} → {voice_id}")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    command = sys.argv[1]
    if command == "list":
        list_voices()
    elif command == "avatars":
        list_avatars()
    elif command == "set" and len(sys.argv) == 4:
        set_voice(sys.argv[2], sys.argv[3])
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
