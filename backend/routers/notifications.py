"""The user's own notifications.

Strictly first person: every endpoint answers about the caller and nobody
else, so there is no scope to resolve and no role to check beyond being
authenticated. An admin calling these reads their own bell, not their
students'.

Nothing is stored here except the read marks. What the notifications are,
and why they are derived rather than saved, is explained in ``notifications``.
"""

from fastapi import APIRouter, Depends
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


@router.get("", response_model=NotificationListResponse)
def list_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Everything there is to tell the current user, newest first."""
    return _payload(notifications.for_user(db, current_user))


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
