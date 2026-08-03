"""Il recupero dei passaggi, senza modello e senza database.

Sono le tre funzioni pure su cui si regge la generazione: se il documento
viene spezzato male o la somiglianza sbaglia ordine, le domande nascono dal
punto sbagliato del manuale e non c'è modo di accorgersene guardando il
risultato, perché una domanda sul paragrafo sbagliato sembra comunque una
domanda.
"""

import document_text
from simulation_rag import (
    CHUNK_CHARS,
    MIN_CHUNK_CHARS,
    cosine_similarity,
    most_similar,
    sample_evenly,
    split_into_chunks,
)


def test_paragrafi_brevi_restano_interi():
    """Due paragrafi che ci stanno insieme non vengono divisi a metà frase."""
    testo = "\n\n".join(
        [f"Paragrafo numero {i}. " + "Contenuto della procedura. " * 5 for i in range(3)]
    )
    chunks = split_into_chunks(testo)
    assert chunks
    # Nessun passaggio supera la misura, e il documento c'è tutto
    assert all(len(c) <= CHUNK_CHARS + MIN_CHUNK_CHARS for c in chunks)
    assert "Paragrafo numero 0" in chunks[0]
    assert any("Paragrafo numero 2" in c for c in chunks)


def test_paragrafo_lunghissimo_viene_spezzato():
    """Un elenco senza righe vuote non può diventare un passaggio solo."""
    testo = "A" * (CHUNK_CHARS * 3)
    chunks = split_into_chunks(testo)
    assert len(chunks) > 1
    assert all(len(c) <= CHUNK_CHARS for c in chunks)


def test_documento_cortissimo_resta_un_passaggio():
    """Sotto la soglia minima non si torna a mani vuote."""
    assert split_into_chunks("Procedura breve.") == ["Procedura breve."]
    assert split_into_chunks("   ") == []


def test_similarita_riconosce_il_vettore_uguale():
    assert cosine_similarity([1.0, 0.0], [1.0, 0.0]) == 1.0
    assert cosine_similarity([1.0, 0.0], [0.0, 1.0]) == 0.0
    # Vettori di lunghezza diversa o nulli non fanno cadere niente
    assert cosine_similarity([1.0], [1.0, 0.0]) == 0.0
    assert cosine_similarity([0.0, 0.0], [1.0, 0.0]) == 0.0


def test_i_passaggi_tornano_dal_piu_vicino():
    query = [1.0, 0.0]
    candidati = [
        (1, [0.0, 1.0]),  # perpendicolare
        (2, [1.0, 0.0]),  # identico
        (3, [0.9, 0.1]),  # vicino
    ]
    assert most_similar(query, candidati, 2) == [2, 3]
    assert most_similar(query, candidati, 10) == [2, 3, 1]


def test_il_campione_copre_tutto_il_documento():
    """Il campionamento prende da tutto il documento, non solo dall'inizio."""
    passaggi = [f"passaggio {i} " + "x" * 100 for i in range(50)]
    campione = sample_evenly(passaggi, budget_chars=500)
    assert 0 < len(campione) < len(passaggi)
    # Il primo c'è, e l'ultimo scelto viene dalla seconda metà: se il
    # campionamento leggesse solo la testa, qui sarebbero tutti consecutivi
    assert campione[0] == passaggi[0]
    assert passaggi.index(campione[-1]) > len(passaggi) // 2


def test_il_campione_non_taglia_quando_ci_sta_tutto():
    passaggi = ["breve", "anche questo"]
    assert sample_evenly(passaggi, budget_chars=10_000) == passaggi
    assert sample_evenly([], budget_chars=100) == []


def test_il_testo_normalizzato_perde_spazi_e_righe_di_troppo():
    """Lo spazio unificatore dei PDF diventa uno spazio normale."""
    grezzo = "Riga  con\ttabulazioni\xa0e spazi.\r\n\r\n\r\n\r\nAltro paragrafo.  "
    assert document_text.extract_text("procedura.txt", grezzo.encode("utf-8")) == (
        "Riga con tabulazioni e spazi.\n\nAltro paragrafo."
    )


def test_formati_supportati():
    assert document_text.is_supported("procedura.PDF")
    assert document_text.is_supported("manuale.docx")
    assert document_text.is_supported("note.md")
    assert not document_text.is_supported("foglio.xlsx")
    assert not document_text.is_supported("senza-estensione")
