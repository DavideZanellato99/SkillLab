"""Coerenza requirements: ogni dipendenza dichiarata nei file .in deve
comparire nel lock compilato corrispondente (requirements*.txt).

Non ricompila nulla (pip-compile richiede rete e l'immagine runtime): si
limita a intercettare il caso classico "dipendenza aggiunta al .in senza
rigenerare il lock", o viceversa una modifica a mano del solo .txt.

Uso: python check-requirements-sync.py <cartella con i requirements>
Esce con codice 1 se un pacchetto del .in manca nel .txt.
"""

import re
import sys
from pathlib import Path

PAIRS = [
    ("requirements.in", "requirements.txt"),
    ("requirements-dev.in", "requirements-dev.txt"),
]

_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*")


def canonical(name: str) -> str:
    """PEP 503: confronto case-insensitive con -, _ e . equivalenti."""
    return re.sub(r"[-_.]+", "-", name).lower()


def declared_names(path: Path) -> set[str]:
    """Nomi di pacchetto dichiarati in un file requirements (in o lock)."""
    names = set()
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].strip()
        # Righe vuote, opzioni (-r/--hash/...) e righe di continuazione hash
        # (indentate nel lock) non dichiarano pacchetti.
        if not line or line.startswith("-") or raw[:1].isspace():
            continue
        match = _NAME_RE.match(line)
        if match:
            names.add(canonical(match.group(0)))
    return names


def main() -> int:
    base = Path(sys.argv[1]) if len(sys.argv) > 1 else Path()
    failed = False
    for source, lock in PAIRS:
        source_path, lock_path = base / source, base / lock
        if not source_path.exists() or not lock_path.exists():
            continue
        missing = declared_names(source_path) - declared_names(lock_path)
        if missing:
            failed = True
            print(f"{source}: pacchetti assenti dal lock {lock}: {', '.join(sorted(missing))}")
            print(f"  Rigenera il lock con pip-compile (vedi header di {lock}).")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
