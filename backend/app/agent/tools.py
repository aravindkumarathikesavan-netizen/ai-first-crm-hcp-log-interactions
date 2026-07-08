"""
Five tools available to the LangGraph HCP Sales Agent.

Each tool is a plain function (db, **kwargs) -> dict so it can be called
directly from a LangGraph node after the LLM has decided which tool to use
and extracted the arguments. This keeps DB session handling explicit and
avoids leaking a global session into tool closures.

Tools:
 1. log_interaction        - create a new Interaction record (LLM does
                              summarization + entity extraction from raw text)
 2. edit_interaction        - modify a previously logged interaction
 3. fetch_hcp_history       - pull recent interaction history for an HCP so
                              the agent has context (e.g. before suggesting
                              a next best action)
 4. suggest_next_best_action- LLM reasons over history + current interaction
                              to recommend what the rep should do next
 5. schedule_follow_up      - sets/updates a follow-up reminder date on an
                              interaction (simulates writing to a calendar/
                              task queue)
"""
import datetime
import json
from typing import Optional, List, Dict, Any

from sqlalchemy.orm import Session

from app import models
from app.agent.llm import get_primary_llm, get_context_llm

EXTRACTION_PROMPT = """You are a pharmaceutical CRM assistant. Extract structured
data from a field rep's free-text note about a Healthcare Professional (HCP)
interaction. Return STRICT JSON only, matching this schema:

{{
  "interaction_type": "Visit|Call|Email|Conference",
  "channel": "In-person|Virtual",
  "date": "YYYY-MM-DD (exact date only, e.g. 2026-07-08) or null",
  "time": "HH:MM (24-hour, e.g. 14:30) or null",
  "attendees": ["list of attendee names (if mentioned)"],
  "products_discussed": ["list of product names (if mentioned)"],
  "topics": ["list of topics (if mentioned)"],
  "materials_shared": ["list of materials shared (if mentioned)"],
  "sentiment": "Positive|Neutral|Negative",
  "key_discussion_points": "1-3 sentence summary",
  "next_best_action": "short recommended follow-up actions",
  "next_visit_date": "YYYY-MM-DD (exact date only, e.g. 2026-07-22) or null",
  "hcp_name": "Full name of the doctor/HCP (e.g. Dr. Ananya Rao) or null"
}}

CRITICAL DATE RULES (violations cause system errors):
- `date` and `next_visit_date` MUST be either a strict YYYY-MM-DD string OR the JSON
  value null. NEVER put descriptive text, relative expressions ("in two weeks",
  "next Monday", "YYYY-MM-DD format not specified"), or any other string in these
  fields. If you cannot determine the exact calendar date, set the field to null.
- `time` MUST be HH:MM format or null. Never put descriptive text.
- Do NOT include the doctor/HCP in the attendees list unless explicitly stated.
- For any field that is NOT mentioned in the text, return null or an empty list.
  DO NOT guess or hallucinate values.
- Return ONLY the raw JSON object, no Markdown wrappers, no backticks, no other text.

Rep note:
\"\"\"{note}\"\"\"
"""


import re as _re
_DATE_RE = _re.compile(r'^\d{4}-\d{2}-\d{2}$')
_TIME_RE = _re.compile(r'^\d{2}:\d{2}$')

def _sanitize_extracted(data: Dict[str, Any]) -> Dict[str, Any]:
    """Validate and sanitize date/time fields coming from the LLM.
    The LLM sometimes returns descriptive text (e.g. 'in two weeks') instead
    of a proper YYYY-MM-DD value. This function nullifies any field that doesn't
    match the expected format so the backend never receives an invalid datetime."""
    for field in ("date", "next_visit_date"):
        val = data.get(field)
        if val is not None:
            if not isinstance(val, str) or not _DATE_RE.match(val.strip()):
                data[field] = None
    time_val = data.get("time")
    if time_val is not None:
        if not isinstance(time_val, str) or not _TIME_RE.match(time_val.strip()):
            data["time"] = None
    return data


def _llm_extract(note: str) -> Dict[str, Any]:
    llm = get_primary_llm(temperature=0)
    prompt = EXTRACTION_PROMPT.format(note=note)
    resp = llm.invoke(prompt)
    text = resp.content.strip()
    # Guard against accidental markdown fences from the model
    if text.startswith("```"):
        text = text.strip("`")
        text = text.split("\n", 1)[-1] if "\n" in text else text
        text = text.rsplit("```", 1)[0] if "```" in text else text
    try:
        raw = json.loads(text)
    except json.JSONDecodeError:
        # Fail-safe fallback so the demo never crashes on a malformed LLM reply
        raw = {
            "interaction_type": "Visit",
            "channel": "In-person",
            "date": None,
            "time": None,
            "attendees": [],
            "products_discussed": [],
            "topics": [],
            "materials_shared": [],
            "sentiment": "Neutral",
            "samples_distributed": [],
            "key_discussion_points": note[:280],
            "next_best_action": "Follow up in 2 weeks.",
            "next_visit_date": None,
            "hcp_name": None,
        }
    # Always sanitize to strip any non-conforming date/time strings
    return _sanitize_extracted(raw)


def log_interaction(
    db: Session,
    hcp_id: str,
    hcp_name: str,
    raw_notes: str,
    rep_name: str = "Field Rep",
    source: str = "chat",
) -> Dict[str, Any]:
    """Tool 1: Create a new interaction record from free text using the LLM
    for summarization + entity extraction."""
    extracted = _llm_extract(raw_notes)

    final_hcp_id = hcp_id
    final_hcp_name = hcp_name

    # Check if we need to resolve the HCP name from extraction
    extracted_name = extracted.get("hcp_name")
    if (not hcp_id or hcp_id == "unknown-hcp" or not hcp_name or hcp_name == "Unknown HCP") and extracted_name:
        hcp_roster = [
            {"id": "hcp-001", "name": "Dr. Ananya Rao"},
            {"id": "hcp-002", "name": "Dr. Michael Chen"},
            {"id": "hcp-003", "name": "Dr. Priya Nair"},
        ]
        import re
        def clean_to_words(name_str):
            words = re.findall(r'\b\w+\b', name_str.lower())
            return {w for w in words if w not in {'dr', 'mr', 'ms', 'mrs', 'md', 'phd'}}

        extracted_words = clean_to_words(extracted_name)
        for member in hcp_roster:
            member_words = clean_to_words(member["name"])
            if extracted_words.intersection(member_words):
                final_hcp_id = member["id"]
                final_hcp_name = member["name"]
                break
        else:
            final_hcp_name = extracted_name

    # Clean up attendees list to use the full resolved name if there is an overlap
    if final_hcp_name and final_hcp_name != "Unknown HCP" and "attendees" in extracted and isinstance(extracted["attendees"], list):
        import re
        def clean_to_words(name_str):
            words = re.findall(r'\b\w+\b', name_str.lower())
            return {w for w in words if w not in {'dr', 'mr', 'ms', 'mrs', 'md', 'phd'}}
        
        hcp_words = clean_to_words(final_hcp_name)
        new_attendees = []
        for att in extracted["attendees"]:
            att_words = clean_to_words(att)
            if att_words.intersection(hcp_words):
                # Never copy the HCP name into the Attendees field unless the conversation explicitly states that the doctor is also an attendee.
                note_lower = raw_notes.lower()
                explicit_mentions = [
                    "also an attendee", "also attended", "attended as well", "was an attendee", 
                    "attended as a participant", "doctor is also an attendee", "doctor is an attendee",
                    "hcp is also an attendee", "hcp also attended"
                ]
                if any(phrase in note_lower for phrase in explicit_mentions):
                    new_attendees.append(final_hcp_name)
            else:
                new_attendees.append(att)
        extracted["attendees"] = new_attendees
        extracted["hcp_name"] = final_hcp_name

    # Date and follow-up date parsing
    date_val = datetime.datetime.utcnow()
    extracted_date = extracted.get("date")
    if extracted_date:
        try:
            date_val = datetime.datetime.strptime(extracted_date, "%Y-%m-%d")
        except Exception:
            pass

    follow_up_val = None
    extracted_next_visit = extracted.get("next_visit_date")
    if extracted_next_visit:
        try:
            follow_up_val = datetime.datetime.strptime(extracted_next_visit, "%Y-%m-%d")
        except Exception:
            pass

    interaction = models.Interaction(
        id=models.gen_id(),
        hcp_id=final_hcp_id,
        hcp_name=final_hcp_name,
        rep_name=rep_name,
        interaction_type=extracted.get("interaction_type", "Visit"),
        channel=extracted.get("channel", "In-person"),
        date=date_val,
        products_discussed=extracted.get("products_discussed", []),
        topics=extracted.get("topics", []),
        sentiment=extracted.get("sentiment", "Neutral"),
        samples_distributed=extracted.get("samples_distributed", []),
        materials_shared=extracted.get("materials_shared", []),
        attendees=extracted.get("attendees", []),
        interaction_time=extracted.get("time"),
        key_discussion_points=extracted.get("key_discussion_points"),
        raw_notes=raw_notes,
        next_best_action=extracted.get("next_best_action"),
        follow_up_date=follow_up_val,
        source=source,
        ai_confidence=0.9,
        created_at=datetime.datetime.utcnow(),
        updated_at=datetime.datetime.utcnow(),
    )
    db.add(interaction)
    db.commit()
    db.refresh(interaction)
    return {"interaction": interaction, "extracted": extracted}


def edit_interaction(
    db: Session,
    interaction_id: str,
    updates: Dict[str, Any],
) -> Dict[str, Any]:
    """Tool 2: Update fields on a previously logged interaction. Accepts a
    dict of already-validated fields (from the structured form) OR a raw
    instruction string that the LLM turns into a field diff."""
    interaction = db.query(models.Interaction).filter(
        models.Interaction.id == interaction_id
    ).first()
    if not interaction:
        return {"error": f"Interaction {interaction_id} not found"}

    for key, value in updates.items():
        if hasattr(interaction, key) and value is not None:
            setattr(interaction, key, value)
    interaction.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(interaction)
    return {"interaction": interaction}


def edit_interaction_from_instruction(
    db: Session,
    interaction_id: str,
    instruction: str,
) -> Dict[str, Any]:
    """Convenience wrapper for the chat interface: 'change sentiment to
    positive and add ProductC to products discussed' -> field diff via LLM."""
    interaction = db.query(models.Interaction).filter(
        models.Interaction.id == interaction_id
    ).first()
    if not interaction:
        return {"error": f"Interaction {interaction_id} not found"}

    llm = get_primary_llm(temperature=0)
    prompt = f"""Given this existing interaction JSON:
{json.dumps({
    "interaction_type": interaction.interaction_type,
    "channel": interaction.channel,
    "products_discussed": interaction.products_discussed,
    "topics": interaction.topics,
    "sentiment": interaction.sentiment,
    "key_discussion_points": interaction.key_discussion_points,
    "next_best_action": interaction.next_best_action,
})}

And this edit instruction from the rep: "{instruction}"

Return STRICT JSON containing ONLY the fields that should change."""
    resp = llm.invoke(prompt)
    text = resp.content.strip().strip("`")
    try:
        diff = json.loads(text)
    except json.JSONDecodeError:
        diff = {}
    return edit_interaction(db, interaction_id, diff)


def fetch_hcp_history(db: Session, hcp_id: str, limit: int = 5) -> Dict[str, Any]:
    """Tool 3: Retrieve recent interaction history for an HCP, giving the
    agent context before it logs a new interaction or suggests a next step."""
    rows: List[models.Interaction] = (
        db.query(models.Interaction)
        .filter(models.Interaction.hcp_id == hcp_id)
        .order_by(models.Interaction.date.desc())
        .limit(limit)
        .all()
    )
    return {"history": rows, "count": len(rows)}


def suggest_next_best_action(db: Session, hcp_id: str) -> Dict[str, Any]:
    """Tool 4: Use the larger context model to reason over an HCP's full
    interaction history and recommend the single best next action for the
    rep to take."""
    history = fetch_hcp_history(db, hcp_id, limit=10)["history"]
    if not history:
        return {"suggestion": "No prior history. Recommend an initial discovery visit."}

    history_text = "\n".join(
        f"- {i.date}: {i.interaction_type}, sentiment={i.sentiment}, "
        f"products={i.products_discussed}, notes={i.key_discussion_points}"
        for i in history
    )
    llm = get_context_llm(temperature=0.3)
    prompt = f"""You are a pharma sales strategist. Given this HCP's interaction
history (most recent first), recommend ONE concise next best action
(1-2 sentences) for the field rep.

History:
{history_text}
"""
    resp = llm.invoke(prompt)
    return {"suggestion": resp.content.strip()}


def schedule_follow_up(
    db: Session, interaction_id: str, follow_up_date: datetime.datetime
) -> Dict[str, Any]:
    """Tool 5: Set/update the follow-up reminder date on an interaction
    (stands in for pushing a task to a calendar/reminder queue)."""
    interaction = db.query(models.Interaction).filter(
        models.Interaction.id == interaction_id
    ).first()
    if not interaction:
        return {"error": f"Interaction {interaction_id} not found"}
    interaction.follow_up_date = follow_up_date
    db.commit()
    db.refresh(interaction)
    return {"interaction": interaction}
