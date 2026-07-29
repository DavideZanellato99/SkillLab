"""The trainer's review, and the single definition of what a grade is.

An AI evaluation is a proposal: a trainer who disagrees corrects it, and
from that moment the corrected number IS the grade. So everything that
reads a score reads it through ``final_score`` here — the student's report,
the progress of an assigned goal, the dashboard charts, the PDF and the
spreadsheet. Anything that skipped it would show one grade to the student
and count a different one towards their objective.

The correction is never copied onto the evaluation row: it is resolved at
read time, exactly like the progress of a training assignment, so re-running
the AI judgement can never leave a stale grade behind and deleting a review
restores the machine's own verdict by itself.
"""

from collections import defaultdict
from uuid import UUID

from sqlalchemy.orm import Session

from models import ConversationReview, MessageAnnotation
from schemas import ConversationReviewResponse, MessageAnnotationResponse

# Below this the two scores are the same number: they come from a float
# column and from an LLM rounded to one decimal, so an exact comparison
# would report a review as stale over 1e-9.
_SCORE_EPSILON = 0.05


def final_score(ai_score: float | None, review: ConversationReview | None) -> float | None:
    """The grade that counts: the trainer's correction when there is one.

    None in, None out: a conversation with no evaluation and no correction
    has no grade, and inventing a 0 for it would be a lie the whole
    dashboard would then average.
    """
    if review is not None and review.override_score is not None:
        return review.override_score
    return ai_score


def is_stale(review: ConversationReview | None, current_ai_score: float | None) -> bool:
    """True when the AI score moved after the review was written.

    Only ever true if there was a score to move: a review written before any
    evaluation existed is not stale, it simply predates the machine.
    """
    if review is None or review.ai_score_at_review is None or current_ai_score is None:
        return False
    return abs(review.ai_score_at_review - current_ai_score) > _SCORE_EPSILON


def reviews_by_conversation(
    db: Session, conversation_ids: list[UUID]
) -> dict[UUID, ConversationReview]:
    """conversation_id -> review, in one query for a whole page.

    The reports read hundreds of rows at a time; a lookup per conversation
    would turn the dashboard into an N+1.
    """
    if not conversation_ids:
        return {}
    rows = (
        db.query(ConversationReview)
        .filter(ConversationReview.conversation_id.in_(conversation_ids))
        .all()
    )
    return {r.conversation_id: r for r in rows}


def annotations_of(db: Session, conversation_id: UUID) -> list[MessageAnnotation]:
    """The notes pinned to a conversation's messages, oldest first."""
    return (
        db.query(MessageAnnotation)
        .filter(MessageAnnotation.conversation_id == conversation_id)
        .order_by(MessageAnnotation.created_at.asc())
        .all()
    )


def annotations_by_conversation(
    db: Session, conversation_ids: list[UUID]
) -> dict[UUID, list[MessageAnnotation]]:
    """conversation_id -> its notes, in one query."""
    if not conversation_ids:
        return {}
    rows = (
        db.query(MessageAnnotation)
        .filter(MessageAnnotation.conversation_id.in_(conversation_ids))
        .order_by(MessageAnnotation.created_at.asc())
        .all()
    )
    by_conversation: dict[UUID, list[MessageAnnotation]] = defaultdict(list)
    for row in rows:
        by_conversation[row.conversation_id].append(row)
    return by_conversation


def review_response(
    review: ConversationReview | None,
    annotations: list[MessageAnnotation],
    current_ai_score: float | None = None,
) -> ConversationReviewResponse | None:
    """Assemble the review as the API exposes it, None when there is none.

    Annotations without a review row are a real state — a trainer can go
    through a transcript pinning notes without writing a summary or touching
    the score — and they are served under a synthetic header rather than
    dropped, otherwise the notes would exist in the database and nowhere
    else. There is no row to date, so the notes date it themselves.
    """
    annotation_responses = [
        MessageAnnotationResponse(
            id=a.id,
            message_id=a.message_id,
            note=a.note,
            reviewer_name=a.reviewer_name,
            created_at=a.created_at,
            updated_at=a.updated_at,
        )
        for a in annotations
    ]

    if review is None:
        if not annotation_responses:
            return None
        return ConversationReviewResponse(
            conversation_id=annotations[0].conversation_id,
            reviewer_name=annotations[-1].reviewer_name,
            annotations=annotation_responses,
            created_at=annotations[0].created_at,
            updated_at=annotations[-1].updated_at,
        )

    return ConversationReviewResponse(
        conversation_id=review.conversation_id,
        reviewer_name=review.reviewer_name,
        summary_note=review.summary_note,
        override_score=review.override_score,
        override_reason=review.override_reason,
        ai_score_at_review=review.ai_score_at_review,
        is_stale=is_stale(review, current_ai_score),
        annotations=annotation_responses,
        created_at=review.created_at,
        updated_at=review.updated_at,
    )


def reviewer_name(user) -> str:
    """The trainer's name as it is frozen onto a review or an annotation."""
    return f"{user.nome} {user.cognome}".strip() or user.email
