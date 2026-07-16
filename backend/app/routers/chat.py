from typing import Optional
from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app import schemas
from app.database import get_db
from app.agent.graph import run_agent

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("", response_model=schemas.ChatMessageOut)
def chat(
    payload: schemas.ChatMessageIn,
    db: Session = Depends(get_db),
    x_groq_api_key: Optional[str] = Header(default=None, alias="X-Groq-API-Key"),
):
    """Conversational path for the Log Interaction Screen. Routes the rep's
    free-text message through the LangGraph agent, which classifies intent
    and calls the matching tool (log/edit/history/suggest/follow-up)."""
    try:
        state = run_agent(
            db=db,
            session_id=payload.session_id,
            message=payload.message,
            hcp_id=payload.hcp_id,
            hcp_name=payload.hcp_name,
            interaction_id=payload.interaction_id,
            groq_api_key=x_groq_api_key,
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
    except Exception as e:
        error_msg = str(e)
        user_friendly_msg = (
            "⚠️ AI Agent Error: Something went wrong when connecting to the AI agent. "
            "This is usually caused by an invalid or missing Groq API Key, or a rate limit issue. "
            "Please check/update your Groq API Key in the settings (gear icon) at the top of the chat."
        )
        if "invalid_api_key" in error_msg or "authentication" in error_msg.lower() or "401" in error_msg or "apikey" in error_msg.lower() or "api key" in error_msg.lower() or "missing or not configured" in error_msg:
            user_friendly_msg = (
                "⚠️ Authentication Error: The Groq API key is invalid, missing, or has expired. "
                "Please click the settings (gear) icon in the chat header to configure a valid API key."
            )
        elif "rate_limit" in error_msg.lower() or "429" in error_msg:
            user_friendly_msg = (
                "⚠️ Rate Limit: Groq API rate limit reached. "
                "Please try again in a few seconds or use a custom API key with higher limits."
            )

        return schemas.ChatMessageOut(
            session_id=payload.session_id,
            reply=user_friendly_msg,
            tool_calls=[],
            interaction=None,
            extracted=None,
        )
