"""The trainer's review of a conversation: notes, and a corrected grade.

Written by the admins (both roles: the organization admin is the trainer of
its own students), read by them and by the student the conversation belongs
to. Same tenant boundary as every other admin read of a conversation, so a
trainer only ever annotates its own organization's transcripts.

Nothing here recomputes a score: the correction is stored as such and
resolved at read time by ``reviews.final_score``, which is the one place
that decides what a grade is.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

import audit
import reviews
from auth_dependency import get_current_admin, resolve_admin_scope
from database import get_db
from models import (
    ChatConversation,
    ChatMessage,
    ConversationEvaluation,
    ConversationReview,
    MessageAnnotation,
    User,
)
from routers.admin import _conversation_in_scope_or_404
from schemas import (
    ConversationReviewRequest,
    ConversationReviewResponse,
    MessageAnnotationRequest,
    MessageAnnotationResponse,
    MessageResponse,
)

router = APIRouter(prefix="/api/admin", tags=["review"])


def _conversation_or_404(
    db: Session, conversation_id: UUID, current_admin: User
) -> ChatConversation:
    """The conversation, if this admin is allowed to touch it at all."""
    conversation = db.query(ChatConversation).filter(ChatConversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversazione non trovata."
        )
    _conversation_in_scope_or_404(db, conversation, resolve_admin_scope(current_admin))
    return conversation


def _ai_score(db: Session, conversation_id: UUID) -> float | None:
    """The AI's own score for a conversation, None if it was never judged."""
    return (
        db.query(ConversationEvaluation.overall_score)
        .filter(ConversationEvaluation.conversation_id == conversation_id)
        .scalar()
    )


def _current_review(db: Session, conversation_id: UUID) -> ConversationReviewResponse | None:
    """Re-read the whole review after a write, header and notes together."""
    review = (
        db.query(ConversationReview)
        .filter(ConversationReview.conversation_id == conversation_id)
        .first()
    )
    return reviews.review_response(
        review,
        reviews.annotations_of(db, conversation_id),
        _ai_score(db, conversation_id),
    )


@router.put(
    "/conversations/{conversation_id}/review",
    response_model=ConversationReviewResponse,
)
def save_review(
    conversation_id: UUID,
    payload: ConversationReviewRequest,
    http_request: Request,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Write or rewrite the trainer's review of a conversation.

    One review per conversation, so a second trainer rewrites the first
    one's and signs it with their own name: several overlapping verdicts on
    the same call would leave the student with no answer at all.

    The AI score is snapshotted here (`ai_score_at_review`) precisely
    because it can change afterwards — see ConversationReview.
    """
    _conversation_or_404(db, conversation_id, current_admin)

    review = (
        db.query(ConversationReview)
        .filter(ConversationReview.conversation_id == conversation_id)
        .first()
    )
    if not review:
        review = ConversationReview(conversation_id=conversation_id)
        db.add(review)

    review.reviewer_id = current_admin.id
    review.reviewer_name = reviews.reviewer_name(current_admin)
    review.summary_note = payload.summary_note
    review.override_score = (
        round(payload.override_score, 1) if payload.override_score is not None else None
    )
    review.override_reason = payload.override_reason
    review.ai_score_at_review = _ai_score(db, conversation_id)
    db.commit()

    # The corrected grade is the one fact worth keeping for ever here: the
    # note and the reason are free text written about a student, and the
    # trail is not the place for them.
    audit.describe(
        http_request,
        punteggio_corretto=review.override_score,
        punteggio_ai=review.ai_score_at_review,
    )
    return _current_review(db, conversation_id)


@router.delete("/conversations/{conversation_id}/review", response_model=MessageResponse)
def delete_review(
    conversation_id: UUID,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Withdraw the review: the AI's own verdict becomes the grade again.

    The annotations survive: they are notes on single lines, not part of
    the verdict, and each is withdrawn on its own.
    """
    _conversation_or_404(db, conversation_id, current_admin)
    review = (
        db.query(ConversationReview)
        .filter(ConversationReview.conversation_id == conversation_id)
        .first()
    )
    if not review:
        raise HTTPException(status_code=404, detail="Questa conversazione non ha una revisione.")

    db.delete(review)
    db.commit()
    return MessageResponse(message="Revisione eliminata.", success=True)


@router.put(
    "/conversations/{conversation_id}/annotations",
    response_model=MessageAnnotationResponse,
)
def save_annotation(
    conversation_id: UUID,
    payload: MessageAnnotationRequest,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Pin a note to one of the operator's messages, replacing the note
    already on it.

    PUT rather than POST because there is at most one note per message (see
    MessageAnnotation): annotating twice is editing, not accumulating.

    Only the operator's lines can be annotated. The feedback is about what
    the student did, and everything the student did wrong is inside a line
    the student wrote: even when the avatar is the one giving the signal
    ("I'm in a hurry"), the mistake is in the reply that ignores it, not in
    the signal. Annotating the avatar would put the trainer's remark on
    words generated by the model, which nobody is being graded on.
    """
    _conversation_or_404(db, conversation_id, current_admin)

    # The message has to be one of this conversation's: a note anchored to
    # somebody else's transcript would surface under the wrong call.
    message = (
        db.query(ChatMessage)
        .filter(
            ChatMessage.id == payload.message_id,
            ChatMessage.conversation_id == conversation_id,
        )
        .first()
    )
    if not message:
        raise HTTPException(
            status_code=404, detail="Il messaggio non appartiene a questa conversazione."
        )
    if message.role != "user":
        raise HTTPException(
            status_code=400,
            detail=(
                "Si annotano solo i messaggi dell'operatore: per commentare una "
                "battuta dell'avatar, annota la risposta che l'ha seguita."
            ),
        )

    annotation = (
        db.query(MessageAnnotation)
        .filter(MessageAnnotation.message_id == payload.message_id)
        .first()
    )
    if not annotation:
        annotation = MessageAnnotation(
            conversation_id=conversation_id,
            message_id=payload.message_id,
        )
        db.add(annotation)

    annotation.note = payload.note
    annotation.reviewer_id = current_admin.id
    annotation.reviewer_name = reviews.reviewer_name(current_admin)
    db.commit()
    db.refresh(annotation)

    return MessageAnnotationResponse(
        id=annotation.id,
        message_id=annotation.message_id,
        note=annotation.note,
        reviewer_name=annotation.reviewer_name,
        created_at=annotation.created_at,
        updated_at=annotation.updated_at,
    )


@router.delete("/annotations/{annotation_id}", response_model=MessageResponse)
def delete_annotation(
    annotation_id: UUID,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Remove a note from a message."""
    annotation = db.query(MessageAnnotation).filter(MessageAnnotation.id == annotation_id).first()
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotazione non trovata.")
    # The note is reached by its own id, so the tenant check goes through
    # the conversation it hangs off: without it an org admin could delete a
    # colleague's note in another organization by guessing an id.
    _conversation_or_404(db, annotation.conversation_id, current_admin)

    db.delete(annotation)
    db.commit()
    return MessageResponse(message="Annotazione eliminata.", success=True)
