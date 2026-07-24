"""Unit tests for the evaluation normalization (openai_service).

No OpenAI call is involved: these cover the pure re-shaping of the judge's
JSON, in particular the citations that anchor each criterion to the
transcript messages it rests on.
"""

from openai_service import (
    EVALUATION_CRITERIA,
    EVALUATION_MAX_CITATIONS,
    _normalize_citations,
    _normalize_evaluation,
    _transcript_entries,
)


def _raw_evaluation(**first_criterion_extra):
    """A well-formed judge response; extras land on the first criterion."""
    criteria = {}
    for i, (key, _, _) in enumerate(EVALUATION_CRITERIA):
        criteria[key] = {"score": 6, "comment": f"commento {i}", "suggestions": "fai meglio"}
    criteria[EVALUATION_CRITERIA[0][0]].update(first_criterion_extra)
    return {"overall_score": 6.0, "overall_feedback": "riassunto", "criteria": criteria}


class TestTranscriptEntries:
    def test_skips_blank_messages_and_keeps_ids(self):
        history = [
            {"id": "a", "role": "user", "content": "Buongiorno"},
            {"id": "b", "role": "assistant", "content": "   "},
            {"role": "assistant", "content": "Salve"},
        ]
        assert _transcript_entries(history) == [
            ("a", "user", "Buongiorno"),
            (None, "assistant", "Salve"),
        ]


class TestNormalizeCitations:
    def test_maps_indices_to_message_ids(self):
        citations = _normalize_citations([2, 1], ["id-1", "id-2", "id-3"])
        assert citations == [
            {"index": 2, "message_id": "id-2"},
            {"index": 1, "message_id": "id-1"},
        ]

    def test_drops_out_of_range_duplicates_and_junk(self):
        citations = _normalize_citations([0, 1, 1, "2", 99, None, "boh"], ["id-1", "id-2"])
        assert citations == [
            {"index": 1, "message_id": "id-1"},
            {"index": 2, "message_id": "id-2"},
        ]

    def test_caps_the_number_of_citations(self):
        ids = [f"id-{i}" for i in range(10)]
        citations = _normalize_citations(list(range(1, 11)), ids)
        assert len(citations) == EVALUATION_MAX_CITATIONS

    def test_tolerates_a_missing_or_malformed_list(self):
        assert _normalize_citations(None, ["id-1"]) == []
        assert _normalize_citations("3", ["id-1"]) == []


class TestNormalizeEvaluation:
    def test_criteria_carry_their_citations(self):
        raw = _raw_evaluation(citations=[2, 1])
        result = _normalize_evaluation(raw, ["id-1", "id-2"])
        first, *rest = result["criteria"]
        assert first["citations"] == [
            {"index": 2, "message_id": "id-2"},
            {"index": 1, "message_id": "id-1"},
        ]
        # The judge answered without citations for the other criteria
        assert all(c["citations"] == [] for c in rest)

    def test_message_without_stored_id_is_still_citable(self):
        raw = _raw_evaluation(citations=[1])
        result = _normalize_evaluation(raw, [None])
        assert result["criteria"][0]["citations"] == [{"index": 1, "message_id": None}]

    def test_overall_score_is_the_weighted_average(self):
        result = _normalize_evaluation(_raw_evaluation(), [])
        assert result["overall_score"] == 6.0
        assert result["summary"] == "riassunto"
