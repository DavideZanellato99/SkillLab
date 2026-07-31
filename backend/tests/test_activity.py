"""L'ultima attività di un account: quando è stato visto vivo l'ultima volta.

Le richieste qui passano dalla vera ``get_current_user`` invece che
dall'override delle altre suite: il timbro sta dentro la dependency, e un
client già autenticato per finta non la eseguirebbe mai. Cognito resta fuori,
la verifica del token è sostituita da un dizionario di claim.

Due cose che questa suite difende più della scrittura in sé: che l'ultima
attività non venga confusa con l'ultimo accesso, e che timbrarla non risulti
come una modifica dell'account fatta dall'utente stesso.
"""

from datetime import UTC, datetime, timedelta

import pytest

import activity
import auth_dependency
from auth_dependency import ACCESS_TOKEN_COOKIE
from models import USER_STATUS_SUSPENDED, User

ME = "/api/auth/me"


@pytest.fixture
def signed_in(client, monkeypatch, standard_user):
    """Il client con un accesso valido addosso, senza passare da Cognito."""
    monkeypatch.setattr(
        auth_dependency,
        "verify_access_token",
        lambda token: {"sub": standard_user.cognito_sub, "jti": "jti-di-test"},
    )
    monkeypatch.setattr(auth_dependency, "is_jti_revoked", lambda *args, **kwargs: False)
    monkeypatch.setattr(auth_dependency, "enforce_session_binding", lambda *args, **kwargs: None)
    client.cookies.set(ACCESS_TOKEN_COOKIE, "token-di-test")
    return client


def _stored(db_session, user: User) -> User:
    """L'utente riletto dal database: il timbro viaggia su una sessione sua."""
    db_session.expire(user)
    return db_session.query(User).filter(User.id == user.id).one()


def _set_activity(db_session, user: User, value) -> None:
    """Sposta indietro l'ultima attività senza passare dall'oggetto, così il
    preparativo non timbra a sua volta le colonne di paternità."""
    db_session.query(User).filter(User.id == user.id).update({"last_activity_at": value})
    db_session.flush()
    db_session.expire(user)


# ── La scrittura ──────────────────────────────────────


def test_an_authenticated_request_marks_the_account_as_active(signed_in, db_session, standard_user):
    assert standard_user.last_activity_at is None

    assert signed_in.get(ME).status_code == 200

    assert _stored(db_session, standard_user).last_activity_at is not None


def test_the_response_carries_the_activity_just_written(signed_in, standard_user):
    """L'utente serializzato è lo stesso oggetto che la dependency ha appena
    timbrato: se il valore in memoria non venisse allineato, la risposta
    direbbe ancora "mai attivo"."""
    body = signed_in.get(ME).json()

    assert body["last_activity_at"] is not None


def test_a_request_right_after_another_does_not_write_again(signed_in, db_session, standard_user):
    """Il valore si riscrive a intervalli: una UPDATE per ogni click sarebbe
    una scrittura continua per un dato che si legge in una scheda."""
    poco_fa = datetime.now(UTC).replace(tzinfo=None) - timedelta(minutes=1)
    _set_activity(db_session, standard_user, poco_fa)

    assert signed_in.get(ME).status_code == 200

    assert _stored(db_session, standard_user).last_activity_at == poco_fa


def test_activity_is_written_again_once_the_interval_has_passed(
    signed_in, db_session, standard_user
):
    vecchia = (
        datetime.now(UTC).replace(tzinfo=None) - activity.STAMP_INTERVAL - timedelta(minutes=1)
    )
    _set_activity(db_session, standard_user, vecchia)

    assert signed_in.get(ME).status_code == 200

    assert _stored(db_session, standard_user).last_activity_at > vecchia


def test_a_failed_stamp_does_not_take_the_request_down(signed_in, monkeypatch, standard_user):
    """L'attività è un di più: se il database la rifiuta, la richiesta che la
    stava producendo deve rispondere lo stesso."""

    class _SessioneRotta:
        def execute(self, *args, **kwargs):
            raise RuntimeError("database irraggiungibile")

        def rollback(self): ...

        def close(self): ...

    monkeypatch.setattr(activity, "session_factory", _SessioneRotta)

    assert signed_in.get(ME).status_code == 200


# ── Quello che il browser fa da solo ──────────────────


def test_the_notification_polling_is_not_activity(signed_in, db_session, standard_user):
    """La campanella si ricontrolla ogni due minuti finché la pagina è
    aperta: se contasse, una scheda dimenticata aperta racconterebbe una
    persona al lavoro fino allo scadere del logout per inattività."""
    assert signed_in.get("/api/notifications").status_code == 200

    assert _stored(db_session, standard_user).last_activity_at is None


def test_marking_the_notifications_read_is_activity(signed_in, db_session, standard_user):
    """L'altra faccia della regola: il polling è il browser, il pulsante
    "segna come lette" è una persona."""
    assert signed_in.post("/api/notifications/read", json={}).status_code == 200

    assert _stored(db_session, standard_user).last_activity_at is not None


# ── Quello che l'attività non deve diventare ──────────


def test_stamping_activity_is_not_an_edit_of_the_account(signed_in, db_session, standard_user):
    """La scheda utente mostra chi ha modificato l'account per ultimo: se il
    timbro passasse dall'oggetto ORM, ogni utente collegato risulterebbe
    riscrivere se stesso ogni cinque minuti e la modifica vera di un
    amministratore sparirebbe sotto."""
    prima = _stored(db_session, standard_user)
    updated_at, updated_by_email = prima.updated_at, prima.updated_by_email

    assert signed_in.get(ME).status_code == 200

    dopo = _stored(db_session, standard_user)
    assert dopo.last_activity_at is not None
    assert dopo.updated_at == updated_at
    assert dopo.updated_by_email == updated_by_email


def test_activity_is_not_an_access(signed_in, db_session, standard_user):
    """Le due colonne rispondono a domande diverse: navigare con una sessione
    già aperta non è un nuovo accesso, e un invito mai accettato deve restare
    riconoscibile anche dopo che l'utente ha cominciato a usare la
    piattaforma."""
    assert signed_in.get(ME).status_code == 200

    dopo = _stored(db_session, standard_user)
    assert dopo.last_activity_at is not None
    assert dopo.last_login_at is None


def test_a_suspended_account_is_not_active(signed_in, db_session, standard_user):
    """Una sessione che continua a bussare dopo la sospensione non è una
    persona che usa la piattaforma: è un browser aperto che viene respinto."""
    db_session.query(User).filter(User.id == standard_user.id).update(
        {"status": USER_STATUS_SUSPENDED}
    )
    db_session.flush()

    assert signed_in.get(ME).status_code == 401

    assert _stored(db_session, standard_user).last_activity_at is None


# ── Quello che le pagine di amministrazione leggono ────


def test_the_users_api_answers_with_the_activity(admin_client, standard_user, db_session):
    """La scheda dell'utente legge la riga della lista: il campo deve
    arrivare da lì, non da una chiamata a parte."""
    _set_activity(db_session, standard_user, datetime(2026, 7, 30, 15, 45))

    response = admin_client.get("/api/admin/users")

    assert response.status_code == 200
    riga = next(u for u in response.json()["items"] if u["id"] == str(standard_user.id))
    assert riga["last_activity_at"].startswith("2026-07-30T15:45")
