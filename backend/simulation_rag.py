"""Il recupero dei passaggi rilevanti di un documento, per le simulazioni.

Tre cose, in ordine: spezzare il documento in passaggi, dare a ognuno il suo
vettore, e ritrovare quelli che parlano di un certo argomento. È il pezzo che
permette a una domanda di nascere dal punto giusto di un manuale di ottanta
pagine invece che dalle sue prime righe, e di portarsi dietro il riferimento
al punto da cui è nata.

La somiglianza si calcola qui in Python, con Postgres che si limita a
custodire i vettori come JSON. Non è una scorciatoia, è la scelta che regge
il vincolo del progetto: un'estensione come pgvector va installata sul
database, e questa è un'applicazione che dopo il primo deploy non si tocca
più. Il conto è un prodotto scalare per passaggio, quindi qualche centinaio
di passaggi si confrontano in millisecondi, e la lettura dei vettori di UNA
simulazione è una query indicizzata su ``simulation_id``: la stessa cosa che
farebbe l'estensione, senza l'estensione. Il giorno in cui i documenti
diventassero migliaia questo modulo è il solo posto da riscrivere.
"""

import math

# Quanto è lungo un passaggio, in caratteri, e quanto ne condivide con il
# precedente.
#
# La misura vuole due cose in contrasto: abbastanza testo perché il passaggio
# si spieghi da solo (una domanda su "come si sblocca la carta" nasce male da
# tre righe che iniziano a metà procedura), e abbastanza poco perché il
# vettore parli di un argomento e non di cinque. Milleduecento caratteri sono
# più o meno due paragrafi, che su una procedura è un passo intero.
#
# La sovrapposizione esiste per il caso peggiore del taglio: una frase
# spezzata a metà fra due passaggi non si ritrova con nessuno dei due, e con
# duecento caratteri di coda in comune si ritrova sempre con almeno uno.
CHUNK_CHARS = 1200
CHUNK_OVERLAP_CHARS = 200

# Sotto questa lunghezza un passaggio non è un passaggio: è la coda di un
# titolo o una riga rimasta sola. Non porta significato ma porta un vettore,
# e i vettori dei frammenti brevi somigliano un po' a tutto.
MIN_CHUNK_CHARS = 80


def split_into_chunks(text: str) -> list[str]:
    """Il documento diviso in passaggi che si sovrappongono.

    Taglia sui confini dei paragrafi finché può, perché un paragrafo è
    l'unità che l'autore del documento ha già deciso; solo un paragrafo più
    lungo di un passaggio intero viene spezzato al suo interno.
    """
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: list[str] = []
    current = ""

    def flush() -> None:
        nonlocal current
        if current.strip():
            chunks.append(current.strip())
        current = ""

    for paragraph in paragraphs:
        # Un paragrafo che da solo supera la misura viene tagliato a pezzi:
        # succede con gli elenchi lunghi e con i PDF che non hanno righe
        # vuote fra un blocco e l'altro.
        if len(paragraph) > CHUNK_CHARS:
            flush()
            start = 0
            while start < len(paragraph):
                chunks.append(paragraph[start : start + CHUNK_CHARS].strip())
                start += CHUNK_CHARS - CHUNK_OVERLAP_CHARS
            continue
        if len(current) + len(paragraph) + 2 > CHUNK_CHARS:
            flush()
            # La coda del passaggio appena chiuso apre il successivo, così una
            # frase a cavallo dei due resta intera almeno da una parte.
            if chunks:
                current = chunks[-1][-CHUNK_OVERLAP_CHARS:].strip() + "\n\n"
        current += paragraph + "\n\n"
    flush()

    kept = [c for c in chunks if len(c) >= MIN_CHUNK_CHARS]
    # Un documento cortissimo sta tutto sotto la soglia: meglio un passaggio
    # breve che nessun passaggio.
    return kept or ([text.strip()] if text.strip() else [])


def vector_norm(vector: list[float]) -> float:
    """La lunghezza di un vettore.

    Sta per conto suo perché è la metà cara del coseno, e l'unica che si può
    riusare: il prodotto scalare cambia a ogni coppia, la lunghezza di un
    vettore no. Chi confronta lo stesso vettore contro molti altri la calcola
    una volta e la passa a ``cosine_with_norms``.
    """
    return math.sqrt(sum(x * x for x in vector))


def cosine_with_norms(a: list[float], norm_a: float, b: list[float], norm_b: float) -> float:
    """Il coseno fra due vettori di cui si conosce già la lunghezza."""
    if not norm_a or not norm_b or len(a) != len(b):
        return 0.0
    return sum(x * y for x, y in zip(a, b, strict=True)) / (norm_a * norm_b)


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Quanto due vettori puntano dalla stessa parte, fra -1 e 1."""
    if not a or not b or len(a) != len(b):
        return 0.0
    return cosine_with_norms(a, vector_norm(a), b, vector_norm(b))


def most_similar(
    query_embedding: list[float],
    candidates: list[tuple[int, list[float]]],
    limit: int,
) -> list[int]:
    """Gli ordinali dei passaggi più vicini alla domanda, dal più vicino.

    `candidates` sono coppie (ordinale, vettore), cioè le righe già lette dal
    database: questa funzione non conosce SQLAlchemy e si prova senza.
    """
    return most_similar_each([query_embedding], candidates, limit)[0]


def most_similar_each(
    query_embeddings: list[list[float]],
    candidates: list[tuple[int, list[float]]],
    limit: int,
) -> list[list[int]]:
    """Lo stesso recupero per più domande insieme, una lista di ordinali per
    domanda e nello stesso ordine.

    Esiste per il ciclo della generazione, che cerca i passaggi di
    venticinque argomenti dentro lo stesso documento. Chiamando
    ``most_similar`` una volta per argomento, la lunghezza di ogni vettore
    dei passaggi veniva ricalcolata venticinque volte identica, ed è il conto
    più caro dei tre che compongono il coseno: qui si calcola una volta sola
    e vale per tutti gli argomenti. Su un manuale di ottanta pagine sono
    circa centosettanta passaggi, quindi due passate risparmiate su tre.
    """
    prepared = [(ordinal, embedding, vector_norm(embedding)) for ordinal, embedding in candidates]

    results: list[list[int]] = []
    for query in query_embeddings:
        query_norm = vector_norm(query)
        scored = [
            (cosine_with_norms(query, query_norm, embedding, norm), ordinal)
            for ordinal, embedding, norm in prepared
        ]
        scored.sort(key=lambda pair: pair[0], reverse=True)
        results.append([ordinal for _, ordinal in scored[:limit]])
    return results


def sample_evenly(items: list[str], budget_chars: int) -> list[str]:
    """Passaggi presi a distanza regolare finché stanno nel budget.

    Serve alla prima passata della generazione, quella che deve farsi un'idea
    di cosa contiene il documento intero: di un manuale lungo non si può dare
    tutto in pasto al modello, e prendere le prime pagine darebbe un
    serbatoio di domande sull'indice e sulla premessa. Prendendo passaggi a distanza
    regolare gli argomenti restano distribuiti come nel documento.
    """
    if not items:
        return []
    total = sum(len(i) for i in items)
    if total <= budget_chars:
        return items
    # Quanti ne stanno, e ogni quanti prenderne uno perché coprano tutto
    average = max(1, total // len(items))
    keep = max(1, budget_chars // average)
    if keep >= len(items):
        return items
    step = len(items) / keep
    return [items[min(len(items) - 1, int(i * step))] for i in range(keep)]
