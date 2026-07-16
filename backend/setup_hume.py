"""Create or update the SkillLab EVI config on Hume AI.

Usage:
    python setup_hume.py https://<tunnel-pubblico>          # es. URL ngrok

The script points the config's Custom Language Model at
<url>/api/voice/clm/chat/completions. Run it again whenever the public
tunnel URL changes. On first run it prints the config id: put it in .env
as HUME_EVI_CONFIG_ID.
"""

import os
import sys

import truststore

truststore.inject_into_ssl()

import requests
from dotenv import load_dotenv

load_dotenv()

HUME_API_KEY = os.getenv("HUME_API_KEY", "")
HUME_EVI_CONFIG_ID = os.getenv("HUME_EVI_CONFIG_ID", "")
HUME_DEFAULT_VOICE_ID = os.getenv("HUME_DEFAULT_VOICE_ID", "")

CLM_PATH = "/api/voice/clm/chat/completions"
CONFIG_NAME = "SkillLab Voice"


def build_config_body(clm_url: str) -> dict:
    return {
        "evi_version": "4-mini",  # Octave 2: supporta l'italiano
        "name": CONFIG_NAME,
        "language_model": {
            "model_provider": "CUSTOM_LANGUAGE_MODEL",
            "model_resource": clm_url,
        },
        # Voce di default del config; per-avatar viene sovrascritta
        # alla connessione via session settings
        "voice": {"provider": "HUME_AI", "id": HUME_DEFAULT_VOICE_ID},
        "event_messages": {
            "on_new_chat": {"enabled": False, "text": ""},
        },
    }


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)

    if not HUME_API_KEY:
        print("[ERRORE] HUME_API_KEY non configurata nel .env")
        sys.exit(1)

    if not HUME_DEFAULT_VOICE_ID:
        print("[ERRORE] HUME_DEFAULT_VOICE_ID non configurata nel .env (voce richiesta dal config EVI)")
        sys.exit(1)

    base_url = sys.argv[1].rstrip("/")
    clm_url = base_url + CLM_PATH
    headers = {"X-Hume-Api-Key": HUME_API_KEY}
    body = build_config_body(clm_url)

    if HUME_EVI_CONFIG_ID:
        # New version of the existing config
        url = f"https://api.hume.ai/v0/evi/configs/{HUME_EVI_CONFIG_ID}"
        body["version_description"] = f"CLM -> {clm_url}"
        resp = requests.post(url, headers=headers, json=body, timeout=15)
        if resp.status_code >= 400:
            print(f"[ERRORE] {resp.status_code}: {resp.text}")
            sys.exit(1)
        data = resp.json()
        print(f"[OK] Config aggiornato: id={HUME_EVI_CONFIG_ID} versione={data.get('version')}")
        print(f"     CLM: {clm_url}")
    else:
        resp = requests.post(
            "https://api.hume.ai/v0/evi/configs", headers=headers, json=body, timeout=15
        )
        if resp.status_code >= 400:
            print(f"[ERRORE] {resp.status_code}: {resp.text}")
            sys.exit(1)
        data = resp.json()
        config_id = data.get("id")
        print(f"[OK] Config creato: id={config_id}")
        print(f"     CLM: {clm_url}")
        print(f"\nAggiungi al .env:\n  HUME_EVI_CONFIG_ID={config_id}")


if __name__ == "__main__":
    main()
