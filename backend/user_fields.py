"""Validation and lookup of the user identity fields shared by the routers.

Email, nome and cognome are written from two places that must agree on what
a valid value is: the admin API (a super admin managing anyone) and the
self-service profile endpoint. This module is that single agreement, so a
rule can never hold on one side and not on the other.
"""

import re

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from models import User

# Deliberately permissive: it checks the shape that lets an address be a
# Cognito username and reach a mailbox, nothing more. Anything stricter
# starts rejecting addresses that are perfectly valid.
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_email(email: str) -> str:
    """Canonical form of an address: trimmed and lowercased.

    Cognito resolves its usernames case-insensitively, so an account created
    as 'Mario.Rossi@x.it' authenticates fine when the user types
    'mario.rossi@x.it'. Without a canonical form the local row would then be
    missed and a perfectly good login rejected with a generic 401.
    """
    return email.strip().lower()


def find_user_by_email(db: Session, email: str) -> User | None:
    """Look up a user by email, ignoring case and surrounding spaces.

    Rows written before the normalisation existed can still hold a
    mixed-case address, so the comparison lowercases the stored value too
    instead of assuming what is in the column.
    """
    return db.query(User).filter(func.lower(User.email) == normalize_email(email)).first()


def clean_email_or_400(email: str) -> str:
    """The normalised address, or 400 if it cannot be one."""
    normalized = normalize_email(email)
    if not _EMAIL_RE.match(normalized):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="L'indirizzo email non è valido.",
        )
    return normalized


def clean_name_or_400(value: str, label: str) -> str:
    """The trimmed nome/cognome, or 400 if the caller blanked it out.

    `label` is the Italian field name as it appears in the message
    ("nome", "cognome").
    """
    cleaned = value.strip()
    if not cleaned:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Il {label} non può essere vuoto.",
        )
    return cleaned
