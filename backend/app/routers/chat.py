from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import schemas
from app.database import get_db
from app.agent.graph import run_agent

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("", response_model=schemas.ChatMessageOut)
def chat(payload: schemas.ChatMessageIn, db: Session = Depends(get_db)):
    """Conversational path for the Log Interaction Screen. Routes the rep's
    free-text message through the LangGraph agent, which classifies intent
    and calls the matching tool (log/edit/history/suggest/follow-up)."""
    state = run_agent(
        db=db,
        session_id=payload.session_id,
        message=payload.message,
        hcp_id=payload.hcp_id,
        hcp_name=payload.hcp_name,
        interaction_id=payload.interaction_id,
    )

    result = state.get("result") or {}
    raw_interaction = result.get("interaction")
    extracted = result.get("extracted")

    # Safely convert the SQLAlchemy model to a dict that Pydantic can validate.
    # The interaction object is transient (not committed to DB) for log_interaction
    # calls, so we build a plain dict instead of relying on ORM serialization.
    interaction_out = None
    if raw_interaction is not None:
        try:
            interaction_out = schemas.InteractionOut.model_validate(
                raw_interaction, from_attributes=True
            )
        except Exception:
            # If Pydantic validation fails for any reason, skip the interaction
            # field — the `extracted` dict is still returned so the frontend
            # can populate the form correctly.
            interaction_out = None

    return schemas.ChatMessageOut(
        session_id=payload.session_id,
        reply=state.get("reply", ""),
        tool_calls=state.get("tool_calls", []),
        interaction=interaction_out,
        extracted=extracted,
    )
