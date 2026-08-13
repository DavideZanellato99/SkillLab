"""Le due domande di salute, che non sono la stessa.

La radice dice che il processo risponde ed è quella dell'healthcheck del
compose e dello smoke test della CI; /health dice che questa replica è in
grado di servire, ed è quella su cui il proxy decide dove mandare il
traffico. Il motivo per cui sono due sta in ``main`` e in
``database.replica_health``.
"""

import database


def test_root_health(client):
    response = client.get("/")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"


def test_health_is_ok_when_the_database_answers(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_health_reports_a_pool_with_no_room_left(client, monkeypatch):
    """Un pool esaurito è una risposta negativa, non un dettaglio di carico.

    È lo stato in cui le scritture cominciano a mettersi in coda, quindi la
    replica va lasciata fuori dal giro finché non si libera.
    """
    monkeypatch.setattr(database, "_POOL_SIZE", 2)
    monkeypatch.setattr(database, "_MAX_OVERFLOW", 1)
    monkeypatch.setattr(database.engine.pool, "checkedout", lambda: 3)

    response = client.get("/health")

    assert response.status_code == 503
    assert response.json()["status"] == "degraded"
    assert "pool esaurito" in response.json()["detail"]


def test_health_does_not_wait_for_a_free_connection(monkeypatch):
    """Col pool pieno non si prova nemmeno a prendere una connessione.

    Aspettare vorrebbe dire restare in coda fino a ``pool_timeout``, e un
    controllo che ci mette dieci secondi a dire di stare male è già il guasto
    che avrebbe dovuto segnalare.
    """
    monkeypatch.setattr(database, "_POOL_SIZE", 1)
    monkeypatch.setattr(database, "_MAX_OVERFLOW", 0)
    monkeypatch.setattr(database.engine.pool, "checkedout", lambda: 1)

    def non_chiamarmi():
        raise AssertionError("connect non va chiamata a pool esaurito")

    monkeypatch.setattr(database.engine, "connect", non_chiamarmi)

    healthy, detail = database.replica_health()

    assert healthy is False
    assert "pool esaurito" in detail


def test_health_reports_a_database_that_does_not_answer(client, monkeypatch):
    def connessione_rifiutata():
        raise OSError("connection refused")

    monkeypatch.setattr(database.engine, "connect", connessione_rifiutata)

    response = client.get("/health")

    assert response.status_code == 503
    detail = response.json()["detail"]
    assert "database irraggiungibile" in detail
    # Il tipo dell'errore, non il messaggio: la risposta la legge un proxy e
    # l'indirizzo del database non è una cosa da scrivere in giro.
    assert "OSError" in detail
    assert "connection refused" not in detail
