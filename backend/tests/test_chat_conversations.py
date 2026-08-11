"""Le conversazioni scritte: chi le vede, chi le rinomina, chi le chiude.

Il ciclo felice della chat sta in ``test_chat`` (primo messaggio, flusso,
valutazione); qui c'è quello che gli gira attorno, cioè i rifiuti.

Il filo che li tiene insieme è uno: una conversazione di un altro non è
vietata, è **inesistente**. Il 404 al posto del 403 è deliberato, perché un
403 confermerebbe che quella conversazione c'è, e su una piattaforma dove le
conversazioni sono registrazioni di come una persona ha lavorato, saperlo è
già saperne troppo.

L'altro filo è il canale, che si fissa alla creazione. Una telefonata non si
prosegue scrivendo e una chat non si chiude riagganciando: sono due
trascrizioni di due cose diverse, e mescolarle darebbe una trascrizione che
non è successa in nessuno dei due modi.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest

import routers.chat as chat_router
from models import (
    CONVERSATION_MODE_TEXT,
    CONVERSATION_MODE_VOICE,
    ChatConversation,
    ChatMessage,
    ConversationEvaluation,
    Organization,
)

MESSAGGIO = "/api/chat/message"


@pytest.fixture
def modello(monkeypatch):
    """L'avatar che risponde, con i pezzi che gli si danno."""

    def _installa(pezzi=("Buongiorno, ", "sono Anna.")):
        async def _stream(history, profile, channel):
            for pezzo in pezzi:
                yield pezzo

        monkeypatch.setattr(chat_router, "stream_avatar_response", _stream)

    return _installa


@pytest.fixture
def giudice(monkeypatch):
    """Il valutatore, con l'esito che serve al test."""
    from openai_service import EVALUATION_CRITERIA

    def _installa(voto=7.0, errore=None):
        async def _valuta(history, profile, channel):
            if errore is not None:
                raise errore
            return {
                "overall_score": voto,
                "summary": "sintesi",
                "criteria": [
                    {
                        "key": chiave,
                        "label": etichetta,
                        "weight": peso,
                        "score": voto,
                        "comment": "",
                        "suggestions": None,
                        "citations": [],
                    }
                    for chiave, etichetta, peso in EVALUATION_CRITERIA
                ],
            }

        monkeypatch.setattr(chat_router, "evaluate_conversation", _valuta)

    return _installa


@pytest.fixture
def make_conversazione(db_session, standard_user, make_avatar):
    """Una conversazione già scritta, del canale e del proprietario voluti."""

    def _factory(*, mode=CONVERSATION_MODE_TEXT, user=None, avatar=None, messaggi=(), **campi):
        avatar = avatar or make_avatar()
        conversazione = ChatConversation(
            avatar_id=avatar.id,
            user_id=(user or standard_user).id,
            title="Clienti 1",
            mode=mode,
            **campi,
        )
        db_session.add(conversazione)
        db_session.flush()
        istante = datetime.now(UTC) - timedelta(minutes=len(messaggi))
        for indice, (ruolo, testo) in enumerate(messaggi):
            db_session.add(
                ChatMessage(
                    conversation_id=conversazione.id,
                    role=ruolo,
                    content=testo,
                    created_at=istante + timedelta(minutes=indice),
                )
            )
        db_session.flush()
        return conversazione

    return _factory


@pytest.fixture
def altro_tenant(db_session):
    org = Organization(name="Altra org", slug="altra-org")
    db_session.add(org)
    db_session.flush()
    return org


# ── L'elenco delle conversazioni di un avatar ─────────────────────────


def test_l_elenco_riporta_solo_le_proprie_conversazioni(
    user_client, make_conversazione, make_avatar, org_admin_user
):
    avatar = make_avatar()
    make_conversazione(avatar=avatar, messaggi=[("user", "Buongiorno")])
    make_conversazione(avatar=avatar, user=org_admin_user)

    elenco = user_client.get(f"/api/chat/avatar/{avatar.id}/conversations").json()

    assert len(elenco) == 1
    assert elenco[0]["last_message_preview"] == "Buongiorno"


def test_l_anteprima_di_un_messaggio_lungo_si_ferma(user_client, make_conversazione, make_avatar):
    """Nella barra laterale ci sta una riga: il resto sarebbe testo che
    nessuno legge, caricato per ogni conversazione dell'elenco."""
    avatar = make_avatar()
    make_conversazione(avatar=avatar, messaggi=[("user", "x" * 150)])

    elenco = user_client.get(f"/api/chat/avatar/{avatar.id}/conversations").json()

    assert elenco[0]["last_message_preview"] == "x" * 100 + "..."


def test_una_conversazione_senza_messaggi_non_ha_un_anteprima(
    user_client, make_conversazione, make_avatar
):
    avatar = make_avatar()
    make_conversazione(avatar=avatar)

    elenco = user_client.get(f"/api/chat/avatar/{avatar.id}/conversations").json()

    assert elenco[0]["last_message_preview"] is None
    assert elenco[0]["message_count"] == 0


def test_l_elenco_di_un_avatar_che_non_si_vede_risponde_404(user_client, make_avatar, altro_tenant):
    avatar_altrui = make_avatar(name="Avatar altrui", organization_id=altro_tenant.id)

    assert user_client.get(f"/api/chat/avatar/{avatar_altrui.id}/conversations").status_code == 404


# ── Scrivere un messaggio ─────────────────────────────────────────────


def test_scrivere_a_un_avatar_che_non_si_vede_risponde_404(
    user_client, make_avatar, altro_tenant, modello
):
    modello()
    avatar_altrui = make_avatar(name="Avatar altrui", organization_id=altro_tenant.id)

    risposta = user_client.post(
        MESSAGGIO, json={"avatar_id": str(avatar_altrui.id), "content": "Buongiorno"}
    )

    assert risposta.status_code == 404


def test_scrivere_nella_conversazione_di_un_altro_risponde_404(
    user_client, make_conversazione, make_avatar, org_admin_user, modello
):
    modello()
    avatar = make_avatar()
    altrui = make_conversazione(avatar=avatar, user=org_admin_user)

    risposta = user_client.post(
        MESSAGGIO,
        json={
            "avatar_id": str(avatar.id),
            "conversation_id": str(altrui.id),
            "content": "Buongiorno",
        },
    )

    assert risposta.status_code == 404


def test_una_telefonata_non_si_prosegue_scrivendo(
    user_client, make_conversazione, make_avatar, modello
):
    modello()
    avatar = make_avatar()
    chiamata = make_conversazione(avatar=avatar, mode=CONVERSATION_MODE_VOICE)

    risposta = user_client.post(
        MESSAGGIO,
        json={
            "avatar_id": str(avatar.id),
            "conversation_id": str(chiamata.id),
            "content": "Buongiorno",
        },
    )

    assert risposta.status_code == 409
    assert "chiamata" in risposta.json()["detail"]


def test_una_chat_nuova_non_si_apre_su_un_avatar_archiviato(
    user_client, make_avatar, db_session, modello
):
    modello()
    avatar = make_avatar()
    avatar.deleted_at = datetime.now(UTC)
    db_session.flush()

    risposta = user_client.post(
        MESSAGGIO, json={"avatar_id": str(avatar.id), "content": "Buongiorno"}
    )

    assert risposta.status_code == 409


def test_una_chat_aperta_prima_dell_archiviazione_si_puo_finire(
    user_client, make_conversazione, make_avatar, db_session, modello
):
    """L'archiviazione toglie l'avatar dall'addestramento, non interrompe a
    metà una conversazione che qualcuno stava facendo."""
    modello()
    avatar = make_avatar()
    conversazione = make_conversazione(avatar=avatar, messaggi=[("user", "Buongiorno")])
    avatar.deleted_at = datetime.now(UTC)
    db_session.flush()

    risposta = user_client.post(
        MESSAGGIO,
        json={
            "avatar_id": str(avatar.id),
            "conversation_id": str(conversazione.id),
            "content": "Ancora una cosa",
        },
    )

    assert risposta.status_code == 200
    assert "done" in risposta.text


def test_un_avatar_che_non_dice_niente_e_un_errore_non_una_battuta_vuota(
    user_client, make_avatar, db_session, modello
):
    """Con una risposta vuota l'operatore resterebbe davanti a un turno a cui
    non può rispondere, e la trascrizione avrebbe un buco."""
    modello(pezzi=("", "   "))
    avatar = make_avatar()

    risposta = user_client.post(
        MESSAGGIO, json={"avatar_id": str(avatar.id), "content": "Buongiorno"}
    )

    assert "event: error" in risposta.text
    assert db_session.query(ChatMessage).count() == 0


# ── Rinominare ────────────────────────────────────────────────────────


def test_rinominare_non_sposta_la_conversazione_in_cima(
    user_client, make_conversazione, db_session
):
    """La barra laterale è ordinata per ultimo aggiornamento, che è anche la
    data della conversazione: se rinominare la toccasse, cambiare un titolo
    farebbe sembrare di ieri una chiamata del mese scorso."""
    conversazione = make_conversazione(messaggi=[("user", "Buongiorno")])
    # La colonna è naive, il valore appena assegnato porta il fuso: si
    # confrontano gli istanti, non le due scritture dello stesso istante
    prima = conversazione.updated_at.replace(tzinfo=None)

    risposta = user_client.patch(
        f"/api/chat/conversation/{conversazione.id}", json={"title": "Reclamo carta"}
    )

    assert risposta.status_code == 200
    assert risposta.json()["title"] == "Reclamo carta"
    db_session.refresh(conversazione)
    assert conversazione.updated_at.replace(tzinfo=None) == prima


def test_rinominare_la_conversazione_di_un_altro_risponde_404(
    user_client, make_conversazione, org_admin_user
):
    altrui = make_conversazione(user=org_admin_user)

    risposta = user_client.patch(
        f"/api/chat/conversation/{altrui.id}", json={"title": "Mia adesso"}
    )

    assert risposta.status_code == 404


# ── Chiudere ──────────────────────────────────────────────────────────


def test_chiudere_due_volte_la_stessa_chat_non_cambia_la_data(
    user_client, make_conversazione, db_session
):
    """Il pulsante si può premere due volte, e la seconda non deve
    riscrivere quando la conversazione è finita."""
    conversazione = make_conversazione(messaggi=[("user", "Buongiorno")])

    prima = user_client.post(f"/api/chat/conversation/{conversazione.id}/end").json()
    seconda = user_client.post(f"/api/chat/conversation/{conversazione.id}/end").json()

    assert prima["ended_at"] == seconda["ended_at"]


def test_una_telefonata_non_si_chiude_da_qui(user_client, make_conversazione):
    """Le chiamate le chiude la pipeline quando cade il socket: questa rotta
    serve il canale scritto."""
    chiamata = make_conversazione(mode=CONVERSATION_MODE_VOICE)

    risposta = user_client.post(f"/api/chat/conversation/{chiamata.id}/end")

    assert risposta.status_code == 409
    assert "riagganciando" in risposta.json()["detail"]


def test_chiudere_la_conversazione_di_un_altro_risponde_404(
    user_client, make_conversazione, org_admin_user
):
    altrui = make_conversazione(user=org_admin_user)

    assert user_client.post(f"/api/chat/conversation/{altrui.id}/end").status_code == 404


# ── Valutare ──────────────────────────────────────────────────────────


def test_una_conversazione_in_cui_l_operatore_non_ha_parlato_non_si_valuta(
    user_client, make_conversazione, giudice
):
    """Non c'è niente da giudicare: la valutazione riguarda l'operatore, e
    l'avatar che si presenta da solo non è una prestazione di nessuno."""
    giudice()
    conversazione = make_conversazione(messaggi=[("assistant", "Buongiorno, sono Anna.")])

    risposta = user_client.post(f"/api/chat/conversation/{conversazione.id}/evaluate")

    assert risposta.status_code == 400
    assert "troppo breve" in risposta.json()["detail"]


def test_un_valutatore_che_non_risponde_lo_dice_come_guasto_a_monte(
    user_client, make_conversazione, giudice
):
    giudice(errore=RuntimeError("Errore nella generazione: OpenAI non risponde"))
    conversazione = make_conversazione(messaggi=[("user", "Buongiorno, sono Mario Rossi.")])

    risposta = user_client.post(f"/api/chat/conversation/{conversazione.id}/evaluate")

    assert risposta.status_code == 502


def test_rivalutare_sostituisce_il_giudizio_invece_di_affiancarlo(
    user_client, make_conversazione, giudice, db_session
):
    """Due valutazioni della stessa conversazione sarebbero due voti veri
    contemporaneamente, e nessuno saprebbe quale conta."""
    conversazione = make_conversazione(messaggi=[("user", "Buongiorno, sono Mario Rossi.")])
    giudice(voto=5.0)
    user_client.post(f"/api/chat/conversation/{conversazione.id}/evaluate")

    giudice(voto=8.0)
    risposta = user_client.post(f"/api/chat/conversation/{conversazione.id}/evaluate")

    assert risposta.json()["overall_score"] == 8.0
    assert (
        db_session.query(ConversationEvaluation)
        .filter(ConversationEvaluation.conversation_id == conversazione.id)
        .count()
        == 1
    )


def test_valutare_la_conversazione_di_un_altro_risponde_404(
    user_client, make_conversazione, org_admin_user, giudice
):
    giudice()
    altrui = make_conversazione(user=org_admin_user, messaggi=[("user", "Buongiorno")])

    assert user_client.post(f"/api/chat/conversation/{altrui.id}/evaluate").status_code == 404


def test_una_conversazione_che_non_esiste_risponde_404_ovunque(user_client, giudice):
    giudice()
    inesistente = uuid.uuid4()

    assert user_client.get(f"/api/chat/conversation/{inesistente}").status_code == 404
    assert user_client.post(f"/api/chat/conversation/{inesistente}/end").status_code == 404
    assert user_client.post(f"/api/chat/conversation/{inesistente}/evaluate").status_code == 404
    assert (
        user_client.patch(f"/api/chat/conversation/{inesistente}", json={"title": "x"}).status_code
        == 404
    )
