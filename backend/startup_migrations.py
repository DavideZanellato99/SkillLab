"""Idempotent schema/data migrations run once at application startup.

The project manages its schema with ``Base.metadata.create_all`` rather than
a migration tool: that creates missing tables but never ALTERs existing ones,
so every column, backfill or constraint added after the first deploy lives
here. Everything in this module is idempotent (``ADD COLUMN IF NOT EXISTS``,
``UPDATE ... WHERE ... IS NULL``, guarded ``SET NOT NULL``), so it can run on
every boot without harm, on a fresh database or on one already up to date.

It is called at import time from ``main`` (before the app starts serving), so
the DDL is in place before any request or test fixture touches the tables.
Keep the three phases in order: add columns, backfill the old rows, then lock
the constraints down once no offending rows remain.

Entry point: ``prepare_schema``, which holds an advisory lock for the whole
job (see there for why).
"""

import logging
from contextlib import contextmanager

from sqlalchemy import or_, text

from auth_dependency import ensure_roles, get_or_create_mock_admin
from authorship import SYSTEM_ACTOR_EMAIL, UTC_NOW_SQL
from cognito_service import DEV_ADMIN_LOGIN_ENABLED
from conversation_titles import next_conversation_title
from database import Base, SessionLocal, engine
from models import (
    DEFAULT_AVATAR_CATEGORY_NAME,
    ROLE_SUPER_ADMIN,
    Avatar,
    AvatarCategory,
    ChatConversation,
    Organization,
    Role,
    User,
)

logger = logging.getLogger(__name__)

# Advisory lock key. Advisory means Postgres attaches no meaning to it: it is
# just a number the processes agree on, unrelated to any table. Arbitrary but
# fixed forever — changing it would let an old and a new container run the
# schema job at the same time, which is the one thing it exists to prevent.
_SCHEMA_LOCK_KEY = 774_155_001

# The tables that carry the paternity columns and predate them, so they need
# the columns added and their old rows attributed (see the `Authored` mixin in
# `authorship`). `technical_simulations` is absent on purpose: it was born with
# the mixin already on it, so create_all makes the columns and there is no
# older row to go looking for.
_AUTHORED_TABLES = ("users", "organizations", "avatars")

# Where to read the author of the rows that predate the columns: for each
# table, the audit action that created a row and the ones that modified it.
# Deletions are absent on purpose, there is no row left to attribute.
_AUTHORSHIP_ACTIONS = (
    ("users", "user.create", ("user.update", "user.status")),
    ("organizations", "organization.create", ("organization.update", "organization.status")),
    ("avatars", "avatar.create", ("avatar.update", "avatar.delete", "avatar.restore")),
)


def _add_columns() -> None:
    """Create columns added to models after the first deploy (idempotent)."""
    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
                "status VARCHAR(20) NOT NULL DEFAULT 'active'"
            )
        )
        conn.execute(
            text("ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS title VARCHAR(120)")
        )
        conn.execute(
            text("ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP")
        )
        conn.execute(
            text(
                "ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS "
                "mode VARCHAR(10) NOT NULL DEFAULT 'voice'"
            )
        )
        # A call lives inside its WebSocket, which dies with the process, so
        # no call survives a restart even though its session row now does:
        # every call still open at boot is over and is closed retroactively.
        # Text chats hold no server-side state, so they stay open across
        # restarts.
        conn.execute(
            text(
                "UPDATE chat_conversations SET ended_at = updated_at "
                "WHERE ended_at IS NULL AND mode = 'voice'"
            )
        )
        # Call recordings are already-compressed Opus (or AAC on Safari), so
        # TOAST's compression pass only burns CPU on incompressible bytes.
        # EXTERNAL stores them out of line, uncompressed.
        conn.execute(
            text("ALTER TABLE conversation_recordings ALTER COLUMN audio SET STORAGE EXTERNAL")
        )
        # Multi-tenant columns (the organizations table itself is created by
        # create_all). Added nullable here; avatars.organization_id is locked
        # down to NOT NULL later, after any legacy rows are adopted. On users
        # NULL still means "super admin".
        conn.execute(
            text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
                "organization_id UUID REFERENCES organizations(id)"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE avatars ADD COLUMN IF NOT EXISTS "
                "organization_id UUID REFERENCES organizations(id)"
            )
        )
        # La categoria di un avatar diventa una riga di `avatar_categories`
        # (la tabella la crea create_all) invece della stringa scritta a mano
        # che era. Nasce nullable perché gli avatar di prima non ce l'hanno:
        # la riempie e la blocca _migrate_avatar_categories, che è anche il
        # posto in cui la vecchia colonna se ne va.
        conn.execute(text("ALTER TABLE avatars ADD COLUMN IF NOT EXISTS category_id UUID"))
        # L'indice lo fa create_all solo su un database nuovo: qui la tabella
        # esiste già, e senza questa riga il filtro per categoria della
        # galleria scansionerebbe tutti gli avatar del tenant. Il nome è
        # quello che sceglie SQLAlchemy, così le due strade coincidono.
        conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_avatars_category_id ON avatars (category_id)")
        )
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP"))
        # L'ultima richiesta autenticata, gemella della colonna sopra (vedi
        # `activity`). Il valore di partenza lo mette _backfill_last_login,
        # dopo che l'ultimo accesso è stato a sua volta ricostruito.
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP"))
        # Avatars are deleted logically: pre-existing rows are all active, so
        # NULL (the column default) is already the right value for them and no
        # backfill is needed. The partial index serves the only query shape
        # there is, "the active avatars of a tenant".
        conn.execute(text("ALTER TABLE avatars ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP"))
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_avatars_active_org "
                "ON avatars (organization_id) WHERE deleted_at IS NULL"
            )
        )
        # Why a tenant is suspended, written by the admin who suspended it.
        # Nullable by nature: an active organization has no reason to carry.
        conn.execute(
            text("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS suspension_reason TEXT")
        )
        # I punti di un test consegnato, da cui ora si ricava il voto: una
        # risposta giusta vale meno se è arrivata tardi. Nasce nullable
        # perché i tentativi di prima non ne hanno, e viene riempita e
        # bloccata subito dopo (vedi _backfill_simulation_points).
        conn.execute(
            text(
                "ALTER TABLE simulation_attempts ADD COLUMN IF NOT EXISTS "
                "earned_points DOUBLE PRECISION"
            )
        )
        # Come si risponde a un test. Le simulazioni che esistevano prima
        # sono tutte a scelta multipla, che è anche il default della colonna:
        # non serve backfill, il valore giusto per loro è già quello.
        conn.execute(
            text(
                "ALTER TABLE technical_simulations ADD COLUMN IF NOT EXISTS "
                "kind VARCHAR(20) NOT NULL DEFAULT 'multiple'"
            )
        )
        # Chi ha scritto le domande. Le simulazioni che esistevano prima
        # nascono tutte da un documento letto dal modello, che è il default
        # della colonna: come per ``kind``, il valore giusto per loro è già
        # quello e non serve backfill.
        conn.execute(
            text(
                "ALTER TABLE technical_simulations ADD COLUMN IF NOT EXISTS "
                "source VARCHAR(20) NOT NULL DEFAULT 'ai'"
            )
        )
        # L'esito dell'ultimo controllo del serbatoio, la sua data e
        # l'impronta delle domande su cui è girato. Tutte e tre nullable e
        # senza backfill, ed è il valore giusto: sulle simulazioni che
        # esistevano prima nessuno ha ancora chiesto il controllo, che è una
        # cosa diversa da un controllo passato senza rilievi.
        conn.execute(
            text("ALTER TABLE technical_simulations ADD COLUMN IF NOT EXISTS review_report JSONB")
        )
        conn.execute(
            text("ALTER TABLE technical_simulations ADD COLUMN IF NOT EXISTS review_at TIMESTAMP")
        )
        conn.execute(
            text(
                "ALTER TABLE technical_simulations ADD COLUMN IF NOT EXISTS "
                "review_fingerprint VARCHAR(64)"
            )
        )
        # La chiave di una domanda aperta. Vuota sulle domande a scelta
        # multipla, che è quello che il default dà già alle righe di prima.
        conn.execute(
            text(
                "ALTER TABLE simulation_questions ADD COLUMN IF NOT EXISTS "
                "expected_answer TEXT NOT NULL DEFAULT ''"
            )
        )
        # Le chiavi dei due tipi aggiunti dopo: i passi nell'ordine giusto e
        # le coppie da abbinare. Nascono vuote e restano vuote su tutte le
        # domande di prima, che sono di un tipo che non le usa: è la stessa
        # cosa che vale fra ``options`` e ``expected_answer``, dove ogni
        # domanda riempie la colonna del proprio tipo e lascia stare le altre.
        conn.execute(
            text("ALTER TABLE simulation_questions ADD COLUMN IF NOT EXISTS ordered_steps JSONB")
        )
        conn.execute(text("ALTER TABLE simulation_questions ADD COLUMN IF NOT EXISTS pairs JSONB"))
        # Alternative e indice della corretta diventano nullable: su una
        # domanda aperta non esistono, e riempirli di finto significherebbe
        # far leggere a chi rilegge il test una scelta che nessuno ha fatto.
        conn.execute(text("ALTER TABLE simulation_questions ALTER COLUMN options DROP NOT NULL"))
        conn.execute(
            text("ALTER TABLE simulation_questions ALTER COLUMN correct_option DROP NOT NULL")
        )
        # La scadenza di una tappa diventa una data e un'ora a calendario, al
        # posto dei giorni che partivano dallo sblocco (vedi
        # ``TrainingPathStep``). I giorni non si possono convertire in una
        # data: dicevano "tre giorni da quando si apre", e quando quella
        # tappa si aprirà dipende da chi la sta percorrendo. Le tappe di
        # prima restano quindi senza scadenza, che è l'unica cosa vera che si
        # può dire di loro, e chi governa il percorso ci scrive le date.
        conn.execute(
            text("ALTER TABLE training_path_steps ADD COLUMN IF NOT EXISTS due_at TIMESTAMP")
        )
        conn.execute(text("ALTER TABLE training_path_steps DROP COLUMN IF EXISTS due_days"))
        # Le soglie sui singoli criteri di una tappa di conversazione (vedi
        # ``TrainingPathStep.criteria_targets``). Nascono vuote su tutte le
        # tappe di prima, ed è quello che devono dire: quelle tappe chiedono
        # il voto complessivo e nient'altro, che è la regola con cui sono
        # state scritte e con cui qualcuno le sta percorrendo.
        conn.execute(
            text("ALTER TABLE training_path_steps ADD COLUMN IF NOT EXISTS criteria_targets JSONB")
        )
        # Il secchiello di un limite non è più solo "email" o "ip": adesso ci
        # sono anche le chiamate al modello, contate per funzione e per
        # persona (vedi ``llm_limits``), e "llm-valutazione" in dieci
        # caratteri non ci sta. Allargare basta: la tabella tiene eventi che
        # scadono da soli, quindi non c'è niente da convertire.
        conn.execute(text("ALTER TABLE login_attempts ALTER COLUMN scope TYPE VARCHAR(40)"))


def _add_authorship_columns() -> None:
    """Create the paternity columns on the tables an administrator governs.

    Runs before every ORM-based step below: the mapped classes already carry
    these columns, so the very first SELECT on users, organizations or avatars
    would fail on a database that does not have them yet.

    The email columns land NOT NULL with a default, so the rows that already
    exist say "sistema" instead of nothing: nobody knows who created them, and
    that is exactly what the label means. The timestamps are locked down later
    (see `_backfill_authorship`), once the legacy NULLs are gone.
    """
    with engine.begin() as conn:
        # Avatars never had an updated_at: editing a persona sheet left no
        # trace on the row at all.
        conn.execute(text("ALTER TABLE avatars ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP"))
        for table in _AUTHORED_TABLES:
            for column in ("created_by", "updated_by"):
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} UUID"))
                # The foreign key is added separately: ADD COLUMN IF NOT EXISTS
                # would skip it on a column that is already there, and on a
                # fresh database create_all has already made both.
                conn.execute(text(_foreign_key_ddl(table, column)))
            for column in ("created_by_email", "updated_by_email"):
                conn.execute(
                    text(
                        f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} "
                        f"VARCHAR(255) NOT NULL DEFAULT '{SYSTEM_ACTOR_EMAIL}'"
                    )
                )


def _foreign_key_ddl(table: str, column: str) -> str:
    """DDL that points `column` at users.id, unless something already does.

    Existence is checked on the column and not on the constraint name: the
    name create_all picks is not the name spelled here, and matching by name
    would add a second identical foreign key on every fresh database.
    """
    return f"""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conrelid = '{table}'::regclass
                  AND contype = 'f'
                  AND conkey = ARRAY[(
                      SELECT attnum FROM pg_attribute
                      WHERE attrelid = '{table}'::regclass AND attname = '{column}'
                  )]
            ) THEN
                ALTER TABLE {table} ADD CONSTRAINT fk_{table}_{column}
                    FOREIGN KEY ({column}) REFERENCES users(id) ON DELETE SET NULL;
            END IF;
        END $$;
    """  # noqa: S608 (table and column are ours, nothing comes from outside)


# The statements of the paternity backfill, one per line of reasoning. They
# are templates rather than f-strings because the only thing interpolated is a
# table name from the tuple above, and keeping the interpolation in one place
# (see `_on_table`) keeps it obvious that no value from outside ever gets in.
_MISSING_CREATED_AT = f"UPDATE {{table}} SET created_at = {UTC_NOW_SQL} WHERE created_at IS NULL"  # noqa: S608

_MISSING_UPDATED_AT = "UPDATE {table} SET updated_at = created_at WHERE updated_at IS NULL"

# On a POST the new id is not in the path, so the endpoint puts it in the
# details: `details.target_id` is the only way back from a creation to what
# was created. The oldest row wins, a retry cannot rewrite the author.
_AUTHOR_FROM_CREATE_ACTION = """
    UPDATE {table} AS r
    SET created_by = a.user_id, created_by_email = a.user_email
    FROM (
        SELECT DISTINCT ON (details->>'target_id')
               details->>'target_id' AS target_id, user_id, user_email
        FROM audit_logs
        WHERE action = :create_action AND details->>'target_id' IS NOT NULL
        ORDER BY details->>'target_id', created_at ASC
    ) AS a
    WHERE a.target_id = r.id::text AND r.created_by_email = :system
"""

# Modifications carry the id in the path, so the middleware already has it.
# The newest row wins: what is wanted is the last hand on the row.
_AUTHOR_FROM_UPDATE_ACTIONS = """
    UPDATE {table} AS r
    SET updated_by = a.user_id, updated_by_email = a.user_email
    FROM (
        SELECT DISTINCT ON (resource_id) resource_id, user_id, user_email
        FROM audit_logs
        WHERE action = ANY(:update_actions) AND resource_id IS NOT NULL
        ORDER BY resource_id, created_at DESC
    ) AS a
    WHERE a.resource_id = r.id::text AND r.updated_by_email = :system
"""

# Never modified since it was created: whoever created it is the last person
# who touched it, exactly as updated_at equals created_at on those same rows.
_NEVER_MODIFIED = """
    UPDATE {table} SET updated_by = created_by, updated_by_email = created_by_email
    WHERE updated_by_email = :system AND created_by_email <> :system
"""

_LOCK_TIMESTAMPS = f"""
    ALTER TABLE {{table}}
        ALTER COLUMN created_at SET NOT NULL,
        ALTER COLUMN updated_at SET NOT NULL,
        ALTER COLUMN created_at SET DEFAULT {UTC_NOW_SQL},
        ALTER COLUMN updated_at SET DEFAULT {UTC_NOW_SQL}
"""


def _on_table(statement: str, table: str):
    """One of the templates above, aimed at a table of `_AUTHORED_TABLES`."""
    return text(statement.format(table=table))


def _backfill_authorship() -> None:
    """Give the pre-existing rows a date and an author, then lock the columns.

    The audit trail already knows who created and who last touched most of
    these rows, so it is the honest source to read them from instead of
    stamping everything as "sistema": creations carry the new id in
    `details.target_id` (the id is not in the path on a POST), modifications
    carry it in `resource_id`.

    A row nobody can be found for keeps NULL and the "sistema" label, which is
    the truthful answer: it was created before anyone was recording, or by the
    system itself.

    Idempotent by the label: only rows still marked "sistema" are considered,
    so a real author, once written, is never overwritten by a later boot.
    """
    with engine.begin() as conn:
        # Dates first: an avatar has always had a creation date, so its own
        # is the only defensible value for the modification date it never had.
        conn.execute(
            text(
                "UPDATE avatars SET updated_at = created_at "
                "WHERE updated_at IS NULL AND created_at IS NOT NULL"
            )
        )
        for table in _AUTHORED_TABLES:
            conn.execute(_on_table(_MISSING_CREATED_AT, table))
            conn.execute(_on_table(_MISSING_UPDATED_AT, table))

        for table, create_action, update_actions in _AUTHORSHIP_ACTIONS:
            conn.execute(
                _on_table(_AUTHOR_FROM_CREATE_ACTION, table),
                {"create_action": create_action, "system": SYSTEM_ACTOR_EMAIL},
            )
            conn.execute(
                _on_table(_AUTHOR_FROM_UPDATE_ACTIONS, table),
                {"update_actions": list(update_actions), "system": SYSTEM_ACTOR_EMAIL},
            )
            conn.execute(_on_table(_NEVER_MODIFIED, table), {"system": SYSTEM_ACTOR_EMAIL})

        # No row is left without a date, so the constraint can go on.
        for table in _AUTHORED_TABLES:
            conn.execute(_on_table(_LOCK_TIMESTAMPS, table))


def _backfill_conversation_titles() -> None:
    """Give pre-existing untitled conversations the default title, then lock it.

    The title is mandatory: conversations created before it became so are
    backfilled with the same "<Category> <n>" default used for new ones, then
    the column is set NOT NULL (both steps idempotent).
    """
    with SessionLocal() as db:
        untitled = (
            db.query(ChatConversation, AvatarCategory.name)
            .join(Avatar, Avatar.id == ChatConversation.avatar_id)
            .join(AvatarCategory, AvatarCategory.id == Avatar.category_id)
            .filter(or_(ChatConversation.title.is_(None), ChatConversation.title == ""))
            .order_by(ChatConversation.created_at.asc())
            .all()
        )
        for conv, category in untitled:
            conv.title = next_conversation_title(db, conv.user_id, category)
            db.flush()
        db.commit()

    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE chat_conversations ALTER COLUMN title SET NOT NULL"))


def _seed_roles_and_admin() -> None:
    """Ensure the system roles exist, and the mock super admin where it can log in.

    L'utente finto segue il suo accesso: senza DEV_ADMIN_LOGIN nessuno può
    autenticarsi come lui (vedi cognito_service), e crearlo lo stesso
    lascerebbe in elenco un super admin che non è di nessuno. Su
    un'installazione che lo ha già la riga resta dov'è, questo non la
    rimuove, semplicemente smette di essere spendibile.
    """
    with SessionLocal() as db:
        ensure_roles(db)
        if DEV_ADMIN_LOGIN_ENABLED:
            get_or_create_mock_admin(db)


def _backfill_user_organizations() -> None:
    """Adopt every pre-existing non-super-admin user into a default tenant.

    Idempotent: it only touches users still without an organization. A default
    organization is created once, on demand, when such orphans exist.
    """
    with SessionLocal() as db:
        default_org = db.query(Organization).filter(Organization.slug == "default").first()
        orphans = (
            db.query(User)
            .join(Role, Role.id == User.role_id)
            .filter(User.organization_id.is_(None), Role.name != ROLE_SUPER_ADMIN)
            .count()
        )
        if orphans and not default_org:
            default_org = Organization(name="Organizzazione predefinita", slug="default")
            db.add(default_org)
            db.commit()
            db.refresh(default_org)
        if default_org:
            super_admin_role = db.query(Role).filter(Role.name == ROLE_SUPER_ADMIN).first()
            (
                db.query(User)
                .filter(User.organization_id.is_(None), User.role_id != super_admin_role.id)
                .update({User.organization_id: default_org.id}, synchronize_session=False)
            )
            db.commit()


def _backfill_avatar_organizations() -> None:
    """Adopt legacy global avatars into the sole tenant, then lock the column.

    Global avatars are no longer supported: every avatar must belong to exactly
    one organization. Defensive: it only assigns when exactly one organization
    exists, and only sets NOT NULL once no orphan avatar rows remain.
    """
    with SessionLocal() as db:
        orphan_avatars = db.query(Avatar).filter(Avatar.organization_id.is_(None)).count()
        if orphan_avatars:
            orgs = db.query(Organization).all()
            if len(orgs) == 1:
                (
                    db.query(Avatar)
                    .filter(Avatar.organization_id.is_(None))
                    .update({Avatar.organization_id: orgs[0].id}, synchronize_session=False)
                )
                db.commit()
        remaining = db.query(Avatar).filter(Avatar.organization_id.is_(None)).count()

    if remaining == 0:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE avatars ALTER COLUMN organization_id SET NOT NULL"))


def _migrate_avatar_categories() -> None:
    """Trasformare la categoria degli avatar da stringa a riga di anagrafica.

    Prima la categoria era testo scritto a mano su ogni avatar, quindi lo
    stesso gruppo poteva esistere in tre grafie diverse e rinominarlo voleva
    dire riaprire ogni scheda. Ora è una riga per organizzazione, che si
    crea, rinomina e colora dalla pagina di amministrazione.

    Le categorie di partenza sono esattamente quelle già scritte sugli
    avatar, una per coppia (organizzazione, nome): nessuno si ritrova un
    gruppo che non aveva, e nessun avatar cambia gruppo.

    Ogni organizzazione ne ha comunque almeno una, anche se non ha ancora un
    avatar: senza, la pagina di amministrazione non avrebbe niente da
    scegliere e il primo avatar del tenant non si potrebbe creare. Questo
    vale anche dopo, non solo alla prima migrazione: un'organizzazione
    rimasta senza categorie se le rivede seminata al riavvio.

    Idempotente in ogni fase: le categorie si aggiungono solo se mancano, la
    UPDATE guarda solo gli avatar ancora senza categoria, e i vincoli si
    stringono soltanto quando non è rimasto nessuno fuori.
    """
    with engine.begin() as conn:
        # Le categorie avevano un ordinamento a mano, tolto perché nessuno lo
        # avrebbe compilato: si presentano in ordine alfabetico. La riga resta
        # per i database che hanno visto la colonna, dove il modello che non
        # la conosce più non riuscirebbe a inserire una categoria.
        conn.execute(text("ALTER TABLE avatar_categories DROP COLUMN IF EXISTS sort_order"))

    with SessionLocal() as db:
        legacy_column = db.execute(
            text(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_name = 'avatars' AND column_name = 'category'"
            )
        ).first()

        if legacy_column:
            existing = {
                (org_id, name)
                for org_id, name in db.query(
                    AvatarCategory.organization_id, AvatarCategory.name
                ).all()
            }
            legacy = db.execute(
                text(
                    "SELECT DISTINCT organization_id, btrim(category) AS name FROM avatars "
                    "WHERE organization_id IS NOT NULL AND btrim(coalesce(category, '')) <> ''"
                )
            ).all()
            for organization_id, name in legacy:
                if (organization_id, name) not in existing:
                    db.add(AvatarCategory(organization_id=organization_id, name=name))
            db.commit()

        for organization in db.query(Organization).all():
            has_any = (
                db.query(AvatarCategory)
                .filter(AvatarCategory.organization_id == organization.id)
                .first()
            )
            if not has_any:
                db.add(
                    AvatarCategory(
                        organization_id=organization.id,
                        name=DEFAULT_AVATAR_CATEGORY_NAME,
                    )
                )
        db.commit()

        if legacy_column:
            db.execute(
                text(
                    "UPDATE avatars a SET category_id = c.id FROM avatar_categories c "
                    "WHERE a.category_id IS NULL AND c.organization_id = a.organization_id "
                    "AND c.name = btrim(a.category)"
                )
            )
            db.commit()

        orphans = db.query(Avatar).filter(Avatar.category_id.is_(None)).count()

    if legacy_column:
        with engine.begin() as conn:
            # La vecchia colonna smette di essere obbligatoria prima di ogni
            # altra cosa: il modello non la conosce più, quindi da qui in
            # avanti ogni INSERT la lascerebbe vuota. Va fatto anche quando
            # il resto della migrazione non può concludersi, altrimenti un
            # database in ritardo non riuscirebbe più a salvare un avatar.
            conn.execute(text("ALTER TABLE avatars ALTER COLUMN category DROP NOT NULL"))

    if orphans:
        # Succede solo su un database che ha ancora avatar senza
        # organizzazione (vedi _backfill_avatar_organizations): finché sono
        # lì, la colonna resta libera e la vecchia rimane al suo posto.
        logger.warning(
            "Categorie avatar: %s avatar senza organizzazione, migrazione rimandata.", orphans
        )
        return

    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE avatars ALTER COLUMN category_id SET NOT NULL"))
        # La chiave esterna è composta apposta: porta con sé
        # l'organizzazione, così una categoria di un altro tenant non può
        # finire su questo avatar nemmeno per errore di programmazione. Il
        # nome è lo stesso che scrive create_all su un database nuovo, e la
        # guardia lo cerca per non aggiungerne una seconda identica.
        conn.execute(
            text(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conname = 'fk_avatars_category_org'
                          AND conrelid = 'avatars'::regclass
                    ) THEN
                        ALTER TABLE avatars ADD CONSTRAINT fk_avatars_category_org
                            FOREIGN KEY (category_id, organization_id)
                            REFERENCES avatar_categories (id, organization_id);
                    END IF;
                END $$;
                """
            )
        )
        # Il valore vecchio ora vive nell'anagrafica, tenerne una seconda
        # copia sull'avatar significherebbe solo lasciarle divergere.
        conn.execute(text("ALTER TABLE avatars DROP COLUMN IF EXISTS category"))


def _backfill_last_login() -> None:
    """Seed the last-access and last-activity columns from the audit trail.

    The column is new, so on the first boot every pre-existing account would
    read as "never accessed" while plenty of them sign in daily. The registry
    already records every successful authentication, so the most recent one
    per user is the honest starting value. Accounts whose last login fell
    outside the audit retention window stay NULL, which is the truthful
    answer there: we genuinely do not know.

    Idempotent, and it runs at import, before the first sweep of
    ``housekeeping``, so it can still see the oldest rows: only users still
    NULL are touched, so a real login always wins over the backfill.
    """
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE users SET last_login_at = latest.last_login FROM ("
                "  SELECT user_id, MAX(created_at) AS last_login FROM audit_logs"
                "  WHERE action IN ('auth.login', 'auth.password_set') AND user_id IS NOT NULL"
                "  GROUP BY user_id"
                ") AS latest "
                "WHERE users.id = latest.user_id AND users.last_login_at IS NULL"
            )
        )
        # L'ultima attività parte dall'ultimo accesso: è l'ultimo momento in
        # cui un account che esisteva già è stato visto, e lasciarlo vuoto lo
        # farebbe leggere come "mai attivo", che è falso. Anche questa è
        # idempotente: dalla prima richiesta dell'utente in poi la colonna non
        # è più NULL e nessun avvio successivo la tocca.
        conn.execute(
            text(
                "UPDATE users SET last_activity_at = last_login_at "
                "WHERE last_activity_at IS NULL AND last_login_at IS NOT NULL"
            )
        )


def _backfill_simulation_points() -> None:
    """Dare un punteggio ai test consegnati prima che il tempo contasse.

    Fino a ieri il voto era "quante ne ha prese", quindi una risposta giusta
    valeva un punto pieno: assegnare `correct_count` non è una stima di
    comodo, è quello che quei tentativi valevano davvero, e li lascia con lo
    stesso voto che mostravano prima.

    Idempotente due volte: l'UPDATE guarda solo le righe ancora vuote, e il
    vincolo si può rimettere su una colonna che ce l'ha già.
    """
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE simulation_attempts SET earned_points = correct_count "
                "WHERE earned_points IS NULL"
            )
        )
        conn.execute(
            text("ALTER TABLE simulation_attempts ALTER COLUMN earned_points SET NOT NULL")
        )


def _drop_legacy_training_assignments() -> None:
    """Portare via gli obiettivi singoli, sostituiti dai percorsi a tappe.

    Un obiettivo era una riga sola, un utente su un avatar. Ora un percorso
    è un modello riusabile con tappe numerate che si sbloccano una dopo
    l'altra (vedi ``TrainingPath``), e una tappa può anche essere un test
    tecnico: la vecchia riga non è un percorso di una tappa, perché non ha
    né il percorso a cui appartenere né il tipo di bersaglio, e tenerla
    vuol dire tenere in vita due modelli che rispondono alla stessa
    domanda.

    Le chiavi di lettura delle notifiche che quegli obiettivi avevano
    prodotto restano in ``notification_reads`` e non corrispondono più a
    niente, che è esattamente il caso innocuo che quella tabella mette in
    conto (vedi ``NotificationRead``).
    """
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS training_assignments"))


def _version_debriefings() -> None:
    """Dare una chiave propria a ogni debriefing, invece che alla persona.

    La tabella nasceva con ``user_id`` come chiave primaria, cioè una riga
    per persona: rigenerare il quadro d'insieme sovrascriveva quello di
    prima. Da qui in avanti ogni generazione è una riga sua, perché "questa
    persona sta migliorando" è una frase che si può scrivere solo avendo
    sotto mano il quadro precedente (vedi ``UserDebriefing``).

    Le righe che c'erano restano, e diventano la prima versione dello
    storico di ciascuno: non hanno la direzione, ed è giusto così, perché
    nessuno le ha scritte confrontandole con niente.

    Tre passaggi nell'ordine obbligato: la colonna, il valore su ogni riga,
    e solo alla fine lo scambio della chiave primaria. Lo scambio è dentro
    un blocco condizionale perché su un database nuovo la chiave giusta
    l'ha già messa create_all, e in quel caso qui non c'è niente da fare.
    """
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE user_debriefings ADD COLUMN IF NOT EXISTS id UUID"))
        conn.execute(text("UPDATE user_debriefings SET id = gen_random_uuid() WHERE id IS NULL"))
        # La condizione guarda le colonne della chiave attuale e non il suo
        # nome: se è già (id), qui non si entra e la migrazione è passata.
        conn.execute(
            text(
                """
                DO $$
                DECLARE chiave text;
                BEGIN
                    SELECT con.conname INTO chiave
                      FROM pg_constraint con
                     WHERE con.conrelid = 'user_debriefings'::regclass
                       AND con.contype = 'p'
                       AND con.conkey <> ARRAY[
                             (SELECT attnum FROM pg_attribute
                               WHERE attrelid = 'user_debriefings'::regclass
                                 AND attname = 'id')
                           ]::smallint[];
                    IF chiave IS NOT NULL THEN
                        EXECUTE format(
                            'ALTER TABLE user_debriefings DROP CONSTRAINT %I', chiave
                        );
                        ALTER TABLE user_debriefings ALTER COLUMN id SET NOT NULL;
                        ALTER TABLE user_debriefings ADD PRIMARY KEY (id);
                    END IF;
                END $$;
                """
            )
        )
        # La persona non è più la chiave, ma resta il modo in cui la tabella
        # si legge sempre: tutti i quadri di qualcuno, in ordine di tempo.
        # Il vecchio indice sulla sola colonna se ne va dopo, come per le
        # conversazioni: è il prefisso di questo, e una replica interrotta a
        # metà deve trovare comunque un indice al suo posto.
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_user_debriefings_user_created "
                "ON user_debriefings (user_id, created_at)"
            )
        )
        conn.execute(text("DROP INDEX IF EXISTS ix_user_debriefings_user_id"))


def _drop_avatar_difficulty() -> None:
    """Togliere il grado di difficoltà dalle schede persona già salvate.

    Era un campo della scheda (``GRADO_DIFFICOLTA``) e l'unico che la
    galleria mostrava allo studente. Non esiste più: né il form lo scrive,
    né i prompt lo leggono, quindi quello che resta nelle schede vecchie è
    un valore che nessuno aggiorna e che riaffiorerebbe solo agli occhi di
    chi rilegge il JSON.

    Idempotente: ``-`` su una chiave che non c'è restituisce l'oggetto
    com'era, e il WHERE guarda solo le righe che ce l'hanno ancora.
    """
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE avatars SET profile = profile - 'GRADO_DIFFICOLTA' "
                "WHERE jsonb_exists(profile, 'GRADO_DIFFICOLTA')"
            )
        )


def _drop_user_selections() -> None:
    """Portare via le selezioni degli avatar, che nessuno ha mai scritto.

    Una riga diceva "questa persona ha scelto questo avatar in questo
    momento", e c'era l'endpoint per scriverla, ma nessuna schermata lo
    chiamava: la galleria apre direttamente la chat. La tabella è quindi
    rimasta vuota, mentre il contatore che ne usciva, sempre a zero, costava
    una query aggregata a ogni caricamento del catalogo e una sezione vuota
    nell'export dell'articolo 15.

    Quello che la selezione avrebbe dovuto dire lo dicono già le
    conversazioni, che hanno la persona, l'avatar e la data: è da lì che
    viene lo storico mostrato sulle tessere (vedi `_own_history` in
    routers/avatars). Un dato personale in meno da conservare, e senza
    perderne nessuno, perché non ce n'era nessuno da perdere.

    Idempotente: IF EXISTS, e su un database nuovo la tabella non nasce
    proprio, perché il modello non esiste più.
    """
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS user_selections"))


def _index_audit_logs() -> None:
    """Index the audit trail the way it is read.

    The registry is always read newest-first, filtered by user or by
    action, so both indexes are composite and descending on created_at.

    Expiring the rows is not done here: retention runs on its own clock in
    ``housekeeping``, so it also fires on a process that has been up for
    months, not only on the ones that happen to restart.
    """
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_audit_logs_user_created "
                "ON audit_logs (user_id, created_at DESC)"
            )
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_audit_logs_action_created "
                "ON audit_logs (action, created_at DESC)"
            )
        )


def _index_conversations() -> None:
    """Indicizzare conversazioni e messaggi nel modo in cui si leggono.

    Su un database nuovo li fa create_all a partire dai modelli; qui le
    tabelle esistono già, e senza queste righe resterebbero con i vecchi
    indici a una colonna sola. Le forme sono due, e sono le uniche due che
    l'applicazione usa: le conversazioni di una persona dalla più recente, e
    i messaggi di una conversazione in ordine di tempo.

    I due indici a una colonna se ne vanno subito dopo: sono il prefisso dei
    nuovi, quindi non rispondono a niente che i nuovi non risolvano già, e
    tenerli vorrebbe dire pagarli a ogni messaggio scritto. Vanno via dopo la
    creazione e non prima, così una replica interrotta a metà lascia sempre
    almeno un indice buono al posto suo.
    """
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_chat_conversations_user_created "
                "ON chat_conversations (user_id, created_at)"
            )
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_chat_messages_conversation_created "
                "ON chat_messages (conversation_id, created_at)"
            )
        )
        conn.execute(text("DROP INDEX IF EXISTS ix_chat_conversations_user_id"))
        conn.execute(text("DROP INDEX IF EXISTS ix_chat_messages_conversation_id"))


def run_startup_migrations() -> None:
    """Run every idempotent startup migration, in dependency order."""
    _add_columns()
    _add_authorship_columns()
    _seed_roles_and_admin()
    _backfill_user_organizations()
    _backfill_avatar_organizations()
    # Prima dei titoli: il titolo di default porta dentro il nome della
    # categoria, che da qui in avanti si legge dall'anagrafica e non più
    # dalla colonna che questa migrazione porta via.
    _migrate_avatar_categories()
    _backfill_conversation_titles()
    _backfill_last_login()
    _backfill_authorship()
    _backfill_simulation_points()
    _drop_legacy_training_assignments()
    _version_debriefings()
    _drop_avatar_difficulty()
    _drop_user_selections()
    _index_audit_logs()
    _index_conversations()


@contextmanager
def _schema_lock():
    """Hold the schema job's advisory lock for as long as the job runs.

    On its own connection, and in AUTOCOMMIT: a session-level advisory lock
    belongs to the connection that took it, and the job itself opens and
    closes several connections of its own along the way. AUTOCOMMIT so this
    one never sits on an open transaction while other connections are trying
    to ALTER the very tables it would be holding.

    Nothing here has to survive a crash: Postgres drops the lock when the
    connection goes, so a container killed mid-migration frees the next one
    instead of wedging the whole deployment.
    """
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        taken = conn.execute(
            text("SELECT pg_try_advisory_lock(:key)"), {"key": _SCHEMA_LOCK_KEY}
        ).scalar()
        if not taken:
            # Worth a line in the log: without it a replica waiting its turn
            # looks exactly like a replica that has hung on startup.
            logger.info("Schema: un'altra replica lo sta preparando, aspetto il suo turno.")
            conn.execute(text("SELECT pg_advisory_lock(:key)"), {"key": _SCHEMA_LOCK_KEY})
        try:
            yield
        finally:
            conn.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": _SCHEMA_LOCK_KEY})


def prepare_schema() -> None:
    """Bring the database to the schema this version of the app expects.

    The single entry point, and the reason it exists instead of two calls in
    ``main``: both halves have to happen under the same lock. Start four
    containers at once and, without it, four processes issue the same DDL on
    the same tables in the same instant — concurrent ALTERs on one table
    block each other or fail outright, and the container that fails restarts
    and tries again forever. The worst case is not even the crash loop: it is
    a migration applied halfway, its ALTER through and its backfill not,
    leaving a schema in a state nobody designed.

    So one process does the work and the others queue up behind it. When they
    get in, everything is already done, and since every step is idempotent
    they simply pass through.
    """
    with _schema_lock():
        Base.metadata.create_all(bind=engine)
        run_startup_migrations()
