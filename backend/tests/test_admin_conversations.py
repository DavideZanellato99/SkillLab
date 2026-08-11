"""Le conversazioni altrui viste dall'amministrazione, e fin dove si vedono.

La revisione del formatore sta in ``test_conversation_review``; qui c'è il
confine che le sta sotto, cioè quali conversazioni un admin può aprire,
scaricare e cancellare.

La regola è una sola, e vale su tutte e tre le rotte: il super admin sta
sopra i tenant e vede tutto, un admin di organizzazione vede solo le
conversazioni delle persone della sua. Fuori da lì la risposta è "non
trovata", mai "vietato", perché la differenza fra le due direbbe a un admin
di un'altra azienda che quella conversazione esiste.

Il confine si misura su **chi ha fatto** la conversazione e non su
dov'è l'avatar: è la persona ad appartenere a un'organizzazione, e una
conversazione è il modo in cui quella persona ha lavorato.
"""

import uuid

import pytest

from models import (
    ChatConversation,
    ChatMessage,
    ConversationEvaluation,
    Organization,
)

CONVERSAZIONI = "/api/admin/conversations"


@pytest.fixture
def altro_tenant(db_session):
    org = Organization(name="Altra org", slug="altra-org")
    db_session.add(org)
    db_session.flush()
    return org


@pytest.fixture
def make_conversazione(db_session, make_avatar):
    """Una conversazione di qualcuno, valutata o no."""

    def _factory(user, *, valutata=True, voto=6.0, avatar=None):
        avatar = avatar or make_avatar()
        conversazione = ChatConversation(
            user_id=user.id, avatar_id=avatar.id, title="Clienti 1", mode="text"
        )
        db_session.add(conversazione)
        db_session.flush()
        db_session.add_all(
            [
                ChatMessage(
                    conversation_id=conversazione.id, role="user", content="Buongiorno, sono Mario."
                ),
                ChatMessage(conversation_id=conversazione.id, role="assistant", content="Salve."),
            ]
        )
        if valutata:
            db_session.add(
                ConversationEvaluation(
                    conversation_id=conversazione.id,
                    overall_score=voto,
                    result={"summary": "sintesi", "criteria": []},
                )
            )
        db_session.flush()
        return conversazione

    return _factory


@pytest.fixture
def utente_di_un_altro_tenant(db_session, altro_tenant):
    from auth_dependency import ensure_roles
    from models import ROLE_USER, User

    roles = ensure_roles(db_session)
    utente = User(
        cognito_sub=f"test-{uuid.uuid4()}",
        email=f"{uuid.uuid4()}@test.invalid",
        nome="Estranea",
        cognome="Altrove",
        role_id=roles[ROLE_USER].id,
        organization_id=altro_tenant.id,
    )
    db_session.add(utente)
    db_session.flush()
    return utente


# ── Il dettaglio ──────────────────────────────────────────────────────


def test_il_dettaglio_porta_la_trascrizione_e_il_voto(
    admin_client, make_conversazione, standard_user
):
    conversazione = make_conversazione(standard_user, voto=7.5)

    corpo = admin_client.get(f"{CONVERSAZIONI}/{conversazione.id}").json()

    assert [m["content"] for m in corpo["messages"]] == ["Buongiorno, sono Mario.", "Salve."]
    assert corpo["evaluation"]["overall_score"] == 7.5


def test_una_conversazione_mai_valutata_si_apre_lo_stesso(
    admin_client, make_conversazione, standard_user
):
    """La trascrizione c'è comunque, ed è quello che serve per decidere se
    valutarla: negarla renderebbe invisibile proprio il caso da guardare."""
    conversazione = make_conversazione(standard_user, valutata=False)

    corpo = admin_client.get(f"{CONVERSAZIONI}/{conversazione.id}").json()

    assert corpo["evaluation"] is None
    assert len(corpo["messages"]) == 2


def test_l_admin_di_un_altra_organizzazione_non_la_trova(
    client, act_as, org_admin_user, make_conversazione, utente_di_un_altro_tenant
):
    conversazione = make_conversazione(utente_di_un_altro_tenant)
    act_as(org_admin_user)

    assert client.get(f"{CONVERSAZIONI}/{conversazione.id}").status_code == 404


def test_il_super_admin_le_apre_tutte(admin_client, make_conversazione, utente_di_un_altro_tenant):
    conversazione = make_conversazione(utente_di_un_altro_tenant)

    assert admin_client.get(f"{CONVERSAZIONI}/{conversazione.id}").status_code == 200


def test_una_conversazione_che_non_esiste_risponde_404(admin_client):
    inesistente = uuid.uuid4()

    assert admin_client.get(f"{CONVERSAZIONI}/{inesistente}").status_code == 404
    assert admin_client.get(f"{CONVERSAZIONI}/{inesistente}/evaluation/pdf").status_code == 404
    assert admin_client.delete(f"{CONVERSAZIONI}/{inesistente}").status_code == 404


# ── Il referto in PDF ─────────────────────────────────────────────────


def test_il_referto_e_lo_stesso_che_scarica_chi_ha_svolto_la_conversazione(
    admin_client, make_conversazione, standard_user
):
    conversazione = make_conversazione(standard_user)

    risposta = admin_client.get(f"{CONVERSAZIONI}/{conversazione.id}/evaluation/pdf")

    assert risposta.status_code == 200
    assert risposta.headers["content-type"] == "application/pdf"
    assert risposta.content.startswith(b"%PDF")


def test_senza_valutazione_non_c_e_niente_da_stampare(
    admin_client, make_conversazione, standard_user
):
    conversazione = make_conversazione(standard_user, valutata=False)

    risposta = admin_client.get(f"{CONVERSAZIONI}/{conversazione.id}/evaluation/pdf")

    assert risposta.status_code == 404
    assert "non ha ancora una valutazione" in risposta.json()["detail"]


def test_il_referto_di_un_altro_tenant_non_si_scarica(
    client, act_as, org_admin_user, make_conversazione, utente_di_un_altro_tenant
):
    conversazione = make_conversazione(utente_di_un_altro_tenant)
    act_as(org_admin_user)

    assert client.get(f"{CONVERSAZIONI}/{conversazione.id}/evaluation/pdf").status_code == 404


# ── La cancellazione ──────────────────────────────────────────────────


def test_cancellare_una_conversazione_porta_via_messaggi_e_valutazione(
    admin_client, make_conversazione, standard_user, db_session
):
    conversazione = make_conversazione(standard_user)

    risposta = admin_client.delete(f"{CONVERSAZIONI}/{conversazione.id}")

    assert risposta.status_code == 200
    assert (
        db_session.query(ChatConversation).filter(ChatConversation.id == conversazione.id).count()
        == 0
    )
    assert (
        db_session.query(ChatMessage)
        .filter(ChatMessage.conversation_id == conversazione.id)
        .count()
        == 0
    )
    assert (
        db_session.query(ConversationEvaluation)
        .filter(ConversationEvaluation.conversation_id == conversazione.id)
        .count()
        == 0
    )


def test_la_conversazione_di_un_altro_tenant_non_si_cancella(
    client, act_as, org_admin_user, make_conversazione, utente_di_un_altro_tenant, db_session
):
    conversazione = make_conversazione(utente_di_un_altro_tenant)
    act_as(org_admin_user)

    risposta = client.delete(f"{CONVERSAZIONI}/{conversazione.id}")

    assert risposta.status_code == 404
    assert (
        db_session.query(ChatConversation).filter(ChatConversation.id == conversazione.id).count()
        == 1
    )


# ── Il report delle valutazioni ───────────────────────────────────────


def test_il_report_di_un_admin_si_ferma_alla_sua_organizzazione(
    client, act_as, org_admin_user, standard_user, make_conversazione, utente_di_un_altro_tenant
):
    """È lo stesso confine del dettaglio, applicato a una lista: un report
    che mostrasse una riga in più direbbe di un'altra azienda quante
    conversazioni ha fatto e con che voti."""
    make_conversazione(standard_user, voto=7.0)
    make_conversazione(utente_di_un_altro_tenant, voto=4.0)
    act_as(org_admin_user)

    righe = client.get("/api/admin/evaluations-report").json()

    assert [r["user_email"] for r in righe] == [standard_user.email]


def test_il_super_admin_vede_il_report_di_tutti(
    admin_client, standard_user, make_conversazione, utente_di_un_altro_tenant
):
    make_conversazione(standard_user, voto=7.0)
    make_conversazione(utente_di_un_altro_tenant, voto=4.0)

    email = [r["user_email"] for r in admin_client.get("/api/admin/evaluations-report").json()]

    assert standard_user.email in email
    assert utente_di_un_altro_tenant.email in email
