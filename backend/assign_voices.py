"""List Hume voices and assign them to avatars.

Usage:
    python assign_voices.py list                     # elenca le voci Hume disponibili
    python assign_voices.py avatars                  # elenca gli avatar e le voci assegnate
    python assign_voices.py set "<nome avatar>" <voice_id>
"""

import os
import sys

import truststore

truststore.inject_into_ssl()

import requests
from dotenv import load_dotenv

load_dotenv()

from database import SessionLocal
from models import Avatar

HUME_API_KEY = os.getenv("HUME_API_KEY", "")


def list_voices():
    if not HUME_API_KEY:
        print("[ERRORE] HUME_API_KEY non configurata nel .env")
        sys.exit(1)
    resp = requests.get(
        "https://api.hume.ai/v0/tts/voices",
        headers={"X-Hume-Api-Key": HUME_API_KEY},
        params={"provider": "HUME_AI", "page_size": 100},
        timeout=15,
    )
    if resp.status_code >= 400:
        print(f"[ERRORE] {resp.status_code}: {resp.text}")
        sys.exit(1)
    voices = resp.json().get("voices_page", [])
    for v in voices:
        print(f"  {v.get('id')}  —  {v.get('name')}")
    print(f"\n{len(voices)} voci trovate.")


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
        print(f"[OK] {avatar.name} → voce {voice_id}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    cmd = sys.argv[1]
    if cmd == "list":
        list_voices()
    elif cmd == "avatars":
        list_avatars()
    elif cmd == "set" and len(sys.argv) == 4:
        set_voice(sys.argv[2], sys.argv[3])
    else:
        print(__doc__)
        sys.exit(1)
