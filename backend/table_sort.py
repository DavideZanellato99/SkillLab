"""L'ordinamento degli elenchi che il browser legge a finestre.

Le tabelle dell'area amministrazione ordinano da sole quello che hanno in
mano, e per quasi tutte va bene: i dati sono tutti lì. Due no, la gestione
utenti e il registro attività, perché di quegli elenchi arriva una finestra
per volta (`limit`/`offset`) e in memoria c'è sempre e solo un pezzo. Ordinare
quel pezzo mostrerebbe come primo della classe il primo dei duecento
scaricati, che è una risposta sbagliata data senza dirlo.

Quindi l'ordine lo fa il database, e queste due funzioni sono quello che
serve per farglielo fare senza aprire la porta a una stringa qualsiasi dentro
un `order_by`: la colonna arriva da un elenco scritto nel router, e quello che
non ci sta dentro viene rifiutato prima di toccare la query.

Sta in un file suo perché i due router che la usano non hanno nient'altro in
comune, e la seconda copia di queste dieci righe sarebbe la prima a scostarsi
dall'altra.
"""

from fastapi import HTTPException, status


def sort_or_400(sort: str | None, allowed: dict) -> str | None:
    """La colonna su cui ordinare, o un 400 che dice quali esistono.

    `None` passa e vuol dire "l'ordine di sempre", quello che il router
    applica quando nessuno ha chiesto niente.
    """
    if sort is None or sort in allowed:
        return sort
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"L'ordinamento deve essere uno tra: {', '.join(allowed)}.",
    )


def ordered(query, columns: tuple, direction: str, tiebreak):
    """La query ordinata come è stato chiesto, con il pareggio sempre sciolto
    allo stesso modo.

    Il tie-break non è un dettaglio di forma: due righe che il criterio scelto
    lascia pari sono libere di scambiarsi di posto fra una lettura e l'altra,
    e una finestra a offset ne salterebbe una e ne ripeterebbe un'altra, cioè
    "carica altri 200" mostrerebbe due volte la stessa riga e mai una che
    esiste. L'id non pareggia mai, quindi chiude sempre la fila.
    """
    order = [column.desc() if direction == "desc" else column.asc() for column in columns]
    return query.order_by(*order, tiebreak.desc())
