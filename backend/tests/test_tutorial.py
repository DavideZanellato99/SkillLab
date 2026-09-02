"""La guida introduttiva, dal lato del server.

Il server non sa cosa la guida racconta né a chi: tiene una data sola, quella
in cui l'account l'ha vista la prima volta. È il frontend a leggerla dal
profilo e a decidere se mostrarla (vedi ``TutorialTour``).

Quello che si prova qui è che la data nasca vuota, che si scriva una volta e
che non si sposti più: la riapertura a mano dal proprio profilo non passa da
questo endpoint, e se ci passasse per errore non deve riscrivere niente.
"""


def test_un_account_nuovo_non_ha_ancora_visto_la_guida(user_client):
    """Null è la condizione che fa comparire la guida al primo ingresso."""
    profilo = user_client.get("/api/auth/me").json()

    assert profilo["tutorial_seen_at"] is None


def test_segnarla_vista_scrive_la_data_sull_account(user_client, standard_user):
    response = user_client.post("/api/auth/me/tutorial")

    assert response.status_code == 200
    assert response.json()["tutorial_seen_at"] is not None
    assert standard_user.tutorial_seen_at is not None


def test_la_data_non_si_sposta_piu(user_client):
    """Dice quando l'account ha incontrato la guida, non l'ultima lettura."""
    prima = user_client.post("/api/auth/me/tutorial").json()["tutorial_seen_at"]

    dopo = user_client.post("/api/auth/me/tutorial").json()["tutorial_seen_at"]

    assert dopo == prima


def test_vale_anche_per_chi_amministra_una_organizzazione(org_admin_client):
    """La guida è di due ruoli, e la data la porta l'account di entrambi."""
    response = org_admin_client.post("/api/auth/me/tutorial")

    assert response.status_code == 200
    assert response.json()["tutorial_seen_at"] is not None


def test_senza_sessione_non_si_scrive_niente(client):
    assert client.post("/api/auth/me/tutorial").status_code == 401
