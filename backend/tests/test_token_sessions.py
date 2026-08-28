"""Il legame fra un token e il browser che se lo è fatto emettere.

È la difesa contro il cookie rubato: un token che arriva da un indirizzo o
da un browser diversi da quelli in cui è nato viene rifiutato e portato via
insieme a tutta la sessione. Si prova qui, sulle funzioni, e non solo
attraverso un endpoint, perché il caso che conta, il token usato da un
altro, è proprio quello che nessuna richiesta legittima produce e che quindi
in una prova di endpoint andrebbe costruito a mano lo stesso.

L'ancora della sessione (origin_jti) merita attenzione a parte: è scritta al
login e non si tocca più, ed è l'unica cosa che il rinnovo confronta. Se un
rinnovo la riscrivesse con il contesto di chi lo chiede, chi ha rubato il
cookie si registrerebbe come proprietario al primo rinnovo, che è
esattamente il contrario di quello che serve.
"""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException, Request

import token_denylist
from models import TokenSession
from token_denylist import is_jti_revoked
from token_sessions import (
    access_binding_matches,
    bind_access_token,
    client_ip,
    enforce_session_binding,
    revocation_entries,
    revoke_user_sessions,
    session_anchor_matches,
)


@pytest.fixture(autouse=True)
def _reset_denylist_cache():
    """La denylist tiene una cache di processo: i jti revocati da un test
    non devono farsi trovare revocati nel successivo."""
    token_denylist._cache.clear()
    token_denylist._cache_loaded_at = None
    yield
    token_denylist._cache.clear()
    token_denylist._cache_loaded_at = None


def _request(*, ip="203.0.113.7", user_agent="Firefox/120.0", forwarded=None) -> Request:
    """Una richiesta con il solo contesto che il legame guarda."""
    headers = []
    if user_agent is not None:
        headers.append((b"user-agent", user_agent.encode()))
    if forwarded is not None:
        headers.append((b"x-forwarded-for", forwarded.encode()))
    scope = {"type": "http", "headers": headers, "client": (ip, 51234)}
    return Request(scope)


def _naive_utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


# ── Da dove viene la richiesta ────────────────────────────────────────


def test_l_indirizzo_e_il_primo_salto_dichiarato_dal_proxy():
    """Dietro il reverse proxy l'indirizzo del cliente sta nell'intestazione,
    e i salti successivi sono quelli attraversati dopo di lui."""
    richiesta = _request(ip="10.0.0.5", forwarded="198.51.100.4, 10.0.0.1")
    assert client_ip(richiesta) == "198.51.100.4"


def test_senza_proxy_vale_l_indirizzo_della_connessione():
    assert client_ip(_request(ip="198.51.100.9")) == "198.51.100.9"


def test_una_richiesta_senza_mittente_non_fa_cadere_il_controllo():
    """Non capita da un browser, capita da un test o da un trasporto interno:
    da qui esce una stringa, e il confronto la tratta come tutte le altre."""
    assert client_ip(Request({"type": "http", "headers": [], "client": None})) == "unknown"


# ── La registrazione del contesto ─────────────────────────────────────


def test_il_token_appena_emesso_lascia_la_riga_del_jti_e_quella_della_sessione(db_session):
    bind_access_token(
        db_session,
        {"jti": "jti-1", "origin_jti": "origin-1"},
        _request(ip="198.51.100.4", user_agent="Firefox/120.0"),
    )

    riga = db_session.get(TokenSession, "jti-1")
    assert riga.client_ip == "198.51.100.4"
    assert riga.user_agent == "Firefox/120.0"
    ancora = db_session.get(TokenSession, "origin-1")
    assert ancora.client_ip == "198.51.100.4"
    # L'ancora deve coprire tutta la vita del token di rinnovo, quindi vive
    # molto più a lungo della riga del singolo token di accesso
    assert ancora.expires_at > riga.expires_at


def test_un_token_senza_jti_non_scrive_niente(db_session):
    """È l'admin locale, che non passa da Cognito e non ha un jti: senza
    questa uscita anticipata il suo login proverebbe a scrivere una riga
    senza chiave primaria."""
    prima = db_session.query(TokenSession).count()
    bind_access_token(db_session, {}, _request())
    assert db_session.query(TokenSession).count() == prima


def test_la_scadenza_della_riga_e_quella_scritta_nel_token(db_session):
    scadenza = _naive_utcnow() + timedelta(minutes=42)
    claims = {"jti": "jti-exp", "exp": int(scadenza.replace(tzinfo=UTC).timestamp())}
    bind_access_token(db_session, claims, _request())

    riga = db_session.get(TokenSession, "jti-exp")
    assert abs((riga.expires_at - scadenza).total_seconds()) < 2


def test_un_token_senza_scadenza_dichiarata_prende_quella_di_un_accesso(db_session):
    """Un token di Cognito la porta sempre: il ripiego serve a non lasciare
    una riga immortale se un domani arrivasse senza."""
    bind_access_token(db_session, {"jti": "jti-senza-exp"}, _request())

    riga = db_session.get(TokenSession, "jti-senza-exp")
    assert riga.expires_at > _naive_utcnow() + timedelta(minutes=50)


def test_il_rinnovo_non_riscrive_l_ancora_della_sessione(db_session):
    """Il contesto registrato al login è la verità della sessione.

    Se il rinnovo lo sovrascrivesse, chi ha rubato il cookie diventerebbe il
    proprietario al primo rinnovo e il legame non proteggerebbe più niente.
    """
    claims = {"jti": "jti-login", "origin_jti": "origin-condiviso"}
    bind_access_token(db_session, claims, _request(ip="198.51.100.4"))

    # Stessa sessione, altro token, altro posto: è il rinnovo di chi ha rubato
    bind_access_token(
        db_session,
        {"jti": "jti-rinnovo", "origin_jti": "origin-condiviso"},
        _request(ip="192.0.2.66"),
    )

    assert db_session.get(TokenSession, "origin-condiviso").client_ip == "198.51.100.4"
    # La riga del nuovo token invece è sua, ed è quella che lo tradisce
    assert db_session.get(TokenSession, "jti-rinnovo").client_ip == "192.0.2.66"


def test_le_righe_scadute_spariscono_quando_se_ne_scrive_una_nuova(db_session):
    """La tabella si pulisce da sola: nessuno passa a cancellare le sessioni
    di chi ha fatto il login il mese scorso."""
    db_session.add(
        TokenSession(
            jti="jti-vecchio",
            client_ip="192.0.2.1",
            user_agent="Netscape",
            expires_at=_naive_utcnow() - timedelta(days=1),
        )
    )
    db_session.flush()

    bind_access_token(db_session, {"jti": "jti-nuovo"}, _request())

    assert db_session.get(TokenSession, "jti-vecchio") is None
    assert db_session.get(TokenSession, "jti-nuovo") is not None


def test_uno_user_agent_lunghissimo_entra_comunque_nella_colonna(db_session):
    """Le stringhe le manda il client, e la colonna è larga 400: senza il
    taglio, un'intestazione gonfiata farebbe fallire il login invece del
    controllo."""
    bind_access_token(db_session, {"jti": "jti-ua"}, _request(user_agent="Mozilla/" + "x" * 900))

    assert len(db_session.get(TokenSession, "jti-ua").user_agent) == 400


# ── L'ancora della sessione, quella che guarda il rinnovo ─────────────


def test_l_ancora_riconosce_chi_ha_fatto_il_login(db_session):
    richiesta = _request(ip="198.51.100.4", user_agent="Firefox/120.0")
    bind_access_token(db_session, {"jti": "j", "origin_jti": "o"}, richiesta)

    assert session_anchor_matches(db_session, {"origin_jti": "o"}, richiesta) is True


def test_l_ancora_non_riconosce_un_altro_posto_o_un_altro_browser(db_session):
    bind_access_token(
        db_session,
        {"jti": "j", "origin_jti": "o"},
        _request(ip="198.51.100.4", user_agent="Firefox/120.0"),
    )

    altrove = _request(ip="192.0.2.66", user_agent="Firefox/120.0")
    altro_browser = _request(ip="198.51.100.4", user_agent="Chrome/120.0")
    assert session_anchor_matches(db_session, {"origin_jti": "o"}, altrove) is False
    assert session_anchor_matches(db_session, {"origin_jti": "o"}, altro_browser) is False


def test_un_rinnovo_senza_ancora_non_passa(db_session):
    """Nessun origin_jti e nessuna riga sono la stessa cosa: non c'è niente
    con cui confrontarsi, quindi il rinnovo non si concede."""
    assert session_anchor_matches(db_session, {}, _request()) is False
    assert session_anchor_matches(db_session, {"origin_jti": "mai-vista"}, _request()) is False


# ── Il legame del singolo token di accesso ────────────────────────────


def test_il_legame_riconosce_il_proprietario(db_session):
    richiesta = _request()
    bind_access_token(db_session, {"jti": "jti-mio"}, richiesta)

    assert access_binding_matches(db_session, {"jti": "jti-mio"}, richiesta) is True


def test_un_token_senza_legame_registrato_non_passa(db_session):
    """Un jti mai visto è un token che non è nato qui: senza questa riga il
    legame si aggirerebbe presentando un token qualsiasi."""
    assert access_binding_matches(db_session, {"jti": "sconosciuto"}, _request()) is False


def test_l_admin_locale_passa_perche_non_ha_un_jti(db_session):
    assert access_binding_matches(db_session, {}, _request()) is True


def test_un_token_usato_da_un_altro_viene_rifiutato_e_revocato(db_session):
    """La parte che conta: il cookie rubato muore per tutti.

    Anche per il proprietario legittimo, ed è voluto: un login in più costa
    molto meno di una sessione in mano a qualcun altro.
    """
    claims = {"jti": "jti-rubato", "origin_jti": "origin-rubata"}
    bind_access_token(db_session, claims, _request(ip="198.51.100.4"))

    with pytest.raises(HTTPException) as errore:
        enforce_session_binding(db_session, claims, _request(ip="192.0.2.66"))

    assert errore.value.status_code == 401
    # Non solo il token presentato: tutta la sessione, cioè anche i token
    # fratelli nati dallo stesso rinnovo
    assert is_jti_revoked(db_session, "jti-rubato") is True
    assert is_jti_revoked(db_session, "origin-rubata") is True


def test_il_proprietario_passa_senza_che_succeda_niente(db_session):
    richiesta = _request()
    bind_access_token(db_session, {"jti": "jti-buono"}, richiesta)

    enforce_session_binding(db_session, {"jti": "jti-buono"}, richiesta)

    assert is_jti_revoked(db_session, "jti-buono") is False


def test_la_revoca_porta_via_il_token_e_la_sua_sessione():
    scadenza = _naive_utcnow() + timedelta(minutes=30)
    voci = revocation_entries(
        {
            "jti": "j",
            "origin_jti": "o",
            "exp": int(scadenza.replace(tzinfo=UTC).timestamp()),
        }
    )

    assert [jti for jti, _ in voci] == ["j", "o"]
    # Il jti muore quando muore il token; l'ancora deve sopravvivere ai
    # fratelli ancora in giro, che durano al massimo un accesso
    per_chiave = dict(voci)
    assert abs((per_chiave["j"] - scadenza).total_seconds()) < 2
    assert per_chiave["o"] > _naive_utcnow() + timedelta(minutes=50)


def test_un_token_senza_niente_da_revocare_non_produce_voci():
    assert revocation_entries({}) == []


# ── Chiudere tutte le sessioni di una persona ─────────────────────────


def _sessione(db, jti, user_id, *, scaduta=False):
    db.add(
        TokenSession(
            jti=jti,
            user_id=user_id,
            client_ip="203.0.113.7",
            user_agent="Firefox/120.0",
            expires_at=_naive_utcnow() + timedelta(minutes=-5 if scaduta else 60),
        )
    )
    db.flush()


def test_si_revocano_tutte_le_sessioni_di_un_account(db_session, standard_user):
    """Il registro sa quali token esistono su un account: è la sola strada
    per fermarli tutti senza doverseli far mostrare da chi li ha."""
    _sessione(db_session, "jti-1", standard_user.id)
    _sessione(db_session, "jti-2", standard_user.id)

    assert revoke_user_sessions(db_session, standard_user.id) == 2
    assert is_jti_revoked(db_session, "jti-1")
    assert is_jti_revoked(db_session, "jti-2")


def test_le_sessioni_di_un_altro_account_restano_dove_sono(
    db_session, standard_user, org_admin_user
):
    _sessione(db_session, "jti-mia", standard_user.id)
    _sessione(db_session, "jti-di-un-altro", org_admin_user.id)

    revoke_user_sessions(db_session, standard_user.id)

    assert is_jti_revoked(db_session, "jti-mia")
    assert not is_jti_revoked(db_session, "jti-di-un-altro")


def test_la_sessione_da_tenere_sopravvive(db_session, standard_user):
    """Chi chiude le altre sessioni sta usando la sua, e non deve ritrovarsi
    fuori per averlo chiesto."""
    _sessione(db_session, "jti-questa", standard_user.id)
    _sessione(db_session, "jti-altrove", standard_user.id)

    assert revoke_user_sessions(db_session, standard_user.id, keep={"jti-questa"}) == 1
    assert not is_jti_revoked(db_session, "jti-questa")
    assert is_jti_revoked(db_session, "jti-altrove")


def test_una_sessione_gia_scaduta_non_si_revoca(db_session, standard_user):
    """Non serve a niente e allungherebbe la denylist con voci che nessuno
    può più spendere."""
    _sessione(db_session, "jti-vecchio", standard_user.id, scaduta=True)

    assert revoke_user_sessions(db_session, standard_user.id) == 0
    assert not is_jti_revoked(db_session, "jti-vecchio")
