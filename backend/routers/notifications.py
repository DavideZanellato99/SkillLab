"""The user's own notifications.

Strictly first person: every endpoint answers about the caller and nobody
else, so there is no scope to resolve and no role to check beyond being
authenticated. An admin calling these reads their own bell, not their
students'.

Nothing is stored here except the read marks. What the notifications are,
and why they are derived rather than saved, is explained in ``notifications``.
"""

import hashlib

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

import notifications
from auth_dependency import get_current_user
from database import get_db
from models import User
from schemas import (
    NotificationListResponse,
    NotificationReadRequest,
    NotificationResponse,
)

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def _payload(items: list[notifications.NotificationItem]) -> NotificationListResponse:
    return NotificationListResponse(
        items=[NotificationResponse(**vars(item)) for item in items],
        unread=sum(1 for item in items if not item.read),
    )


def _etag(payload: NotificationListResponse) -> str:
    """L'impronta di questa risposta, per riconoscerla se torna uguale.

    Sul corpo già serializzato e non su una chiave ricavata a parte: così non
    esiste nessuna seconda definizione di "cosa fa cambiare una notifica" da
    tenere allineata con la prima. Qualunque cosa cambi nella risposta,
    compreso il segno di lettura, cambia l'impronta; niente che non compaia
    nella risposta la fa cambiare.
    """
    corpo = payload.model_dump_json().encode()
    return f'"{hashlib.sha256(corpo).hexdigest()[:32]}"'


def _gia_in_mano(header: str | None, etag: str) -> bool:
    """Se chi chiede ha già esattamente questa risposta.

    L'intestazione può portarne più di una, separate da virgola, e ognuna può
    essere marcata debole: la marcatura si toglie prima di confrontare,
    perché la debolezza riguarda chi l'ha emessa e qui l'impronta è comunque
    quella del corpo esatto.
    """
    if not header:
        return False
    for candidato in header.split(","):
        candidato = candidato.strip()
        if candidato.startswith("W/"):
            candidato = candidato[2:]
        if candidato in (etag, "*"):
            return True
    return False


@router.get("", response_model=NotificationListResponse)
def list_notifications(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Everything there is to tell the current user, newest first.

    La campanella ricontrolla ogni due minuti finché una scheda resta aperta,
    e quasi sempre la risposta è identica a quella di prima: fra una tappa
    che si apre e una revisione che arriva passano ore, non minuti. Da qui
    l'ETag, che su quelle riletture fa tornare un 304 senza corpo, e il
    browser serve al posto suo quello che ha già in memoria, senza JSON da
    trasmettere né da rileggere.

    **Quello che l'ETag non risparmia è il lavoro del database**, perché
    l'impronta si calcola sulla risposta e la risposta va comunque prodotta.
    Risparmiarlo vorrebbe dire una seconda definizione di cosa fa cambiare
    una notifica, tenuta allineata a mano con quella vera, e le notifiche
    esistono derivate proprio per non avere copie che invecchiano (vedi
    ``notifications``).
    """
    payload = _payload(notifications.for_user(db, current_user))
    etag = _etag(payload)
    intestazioni = {
        "ETag": etag,
        # Conservabile ma mai riusata senza chiedere: la risposta cambia da
        # sola col passare del tempo (una scadenza che si avvicina non è una
        # scrittura di nessuno), quindi non esiste un intervallo in cui sia
        # sicuro darla per buona senza passare di qui.
        "Cache-Control": "private, no-cache",
        # La risposta è di una persona sola. Oggi il confronto la protegge da
        # sé, perché un 304 esce solo quando l'impronta coincide con quella
        # appena calcolata per chi chiede; questa riga la protegge anche dal
        # giorno in cui qualcuno aggiungesse un max-age qui sopra.
        "Vary": "Cookie",
    }
    if _gia_in_mano(request.headers.get("if-none-match"), etag):
        return Response(status_code=304, headers=intestazioni)
    response.headers.update(intestazioni)
    return payload


@router.post("/read", response_model=NotificationListResponse)
def mark_notifications_read(
    payload: NotificationReadRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark some notifications as read, or all of them when no key is given.

    The updated list comes back in the response: the bell has to redraw its
    counter straight away, and a second round trip to learn a number the
    server has just computed would be waste.
    """
    items = notifications.for_user(db, current_user)
    keys = payload.keys if payload.keys else [item.key for item in items]
    notifications.mark_read(db, current_user, keys)

    marked = set(keys)
    for item in items:
        if item.key in marked:
            item.read = True
    return _payload(items)
