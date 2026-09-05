"""Il ritratto segnaposto di un avatar: iniziali su una sfumatura.

Nasce quando un avatar viene creato senza foto, e resta finché qualcuno non
ne carica una vera. Sta in un modulo suo e non dentro il router che lo
chiamava perché è un disegno, non una risposta HTTP: da qui lo scrivono la
creazione di un avatar e lo script che riempie il database di dati finti
(``demo/dati_mock.py``), e importarlo dal router vorrebbe dire tirarsi dietro
l'autenticazione e il client dell'identity provider per disegnare un
quadrato con due lettere sopra.
"""

import os
from uuid import UUID

_AVATARS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "avatars")

_PLACEHOLDER_PALETTES = [
    ("#7c3aed", "#06b6d4"),
    ("#dc2626", "#f97316"),
    ("#059669", "#34d399"),
    ("#0284c7", "#22d3ee"),
    ("#be185d", "#f472b6"),
    ("#b45309", "#fbbf24"),
]


def generated_image_url(avatar_id: UUID) -> str:
    """L'indirizzo pubblico del segnaposto di questo avatar."""
    return f"/static/avatars/avatar_{avatar_id}.svg"


def generate_avatar_image(name: str, avatar_id: UUID) -> str:
    """Scrive il segnaposto SVG e restituisce il suo indirizzo pubblico."""
    parts = [p for p in name.split() if p]
    initials = "".join(p[0] for p in parts[:2]).upper() or "?"
    c1, c2 = _PLACEHOLDER_PALETTES[avatar_id.int % len(_PLACEHOLDER_PALETTES)]
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">'
        '<defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">'
        f'<stop offset="0%" stop-color="{c1}"/><stop offset="100%" stop-color="{c2}"/>'
        "</linearGradient></defs>"
        '<rect width="400" height="400" fill="url(#g)"/>'
        '<text x="200" y="210" font-family="Arial, sans-serif" font-size="140" font-weight="bold" '
        f'fill="white" fill-opacity="0.92" text-anchor="middle" dominant-baseline="middle">{initials}</text>'
        "</svg>"
    )
    os.makedirs(_AVATARS_DIR, exist_ok=True)
    filename = f"avatar_{avatar_id}.svg"
    with open(os.path.join(_AVATARS_DIR, filename), "w", encoding="utf-8") as f:
        f.write(svg)
    return generated_image_url(avatar_id)
