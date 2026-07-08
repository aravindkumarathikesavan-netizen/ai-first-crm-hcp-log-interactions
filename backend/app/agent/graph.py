"""
LangGraph agent that powers the conversational side of the Log Interaction
Screen.

Role of the agent
------------------
The rep types free-form messages ("Met Dr. Rao today, discussed CardioX,
she was positive, send 2 samples") into the chat interface. The LangGraph
agent:
  1. classifies the rep's intent (log a new interaction, edit an existing
     one, ask for HCP history, ask for a next-best-action suggestion, or
     schedule a follow-up),
  2. routes to the matching tool node, which calls the Groq LLM (llama-3.1-8b-instant)
     to extract structured fields and calls into the database layer,
  3. returns a natural-language confirmation the rep can review/confirm
     before the record is finalized (human-in-the-loop for CRM accuracy).

This gives the rep the same underlying data model whether they use the
structured form or the chat -- the chat is just a faster, more natural front
door onto the same `log_interaction` / `edit_interaction` tools.
"""
from typing import TypedDict, Optional, List, Dict, Any

from langgraph.graph import StateGraph, END
from sqlalchemy.orm import Session

from app.agent import tools
from app.agent.llm import get_primary_llm

INTENTS = [
    "log_interaction",
    "edit_interaction",
    "fetch_history",
    "suggest_action",
    "schedule_follow_up",
    "chit_chat",
]

CLASSIFY_PROMPT = """You are a CRM assistant for pharmaceutical field reps. Classify
the rep's message into EXACTLY ONE of these intents:
  log_interaction, edit_interaction, fetch_history, suggest_action,
  schedule_follow_up, chit_chat

CLASSIFICATION RULES (in priority order):

1. log_interaction  →  The message describes an interaction that JUST HAPPENED:
   - Contains a doctor/HCP name AND describes a meeting, visit, call, or email
   - Mentions products, drugs, samples, efficacy, dosing, or clinical topics
   - Uses phrases like "met", "visited", "called", "emailed", "discussed",
     "spoke with", "today", "this morning", "just had a meeting"
   - Even if the sentence uses words like "check", "review", "fill", those
     words do NOT change this into an edit if a doctor+interaction is described.
   - WHEN IN DOUBT and the message mentions a doctor or product, use log_interaction.

2. edit_interaction  →  The message EXPLICITLY asks to change a PREVIOUSLY LOGGED entry:
   - Must reference "the last interaction", "the previous log", "interaction ID",
     "what I just saved", "the record I logged", or "change/update/fix the entry".
   - Do NOT classify as edit just because the message contains words like
     "correct", "fix", or "update" unless it clearly refers to a past saved record.

3. fetch_history    →  Asking to see past interactions: "show history", "what
   happened last time", "previous visits", "interaction list".

4. suggest_action   →  Asking for a recommendation: "what should I do next",
   "next best action", "what do you recommend".

5. schedule_follow_up → Asking to set a reminder/follow-up date on a logged
   interaction: "remind me in 2 weeks", "schedule follow-up".

6. chit_chat        →  Greetings, thank-yous, questions unrelated to CRM.

Reply with ONLY the intent label (one of the six above), nothing else.

Message: "{message}"
"""


class AgentState(TypedDict, total=False):
    session_id: str
    message: str
    hcp_id: Optional[str]
    hcp_name: Optional[str]
    interaction_id: Optional[str]
    intent: str
    tool_calls: List[str]
    reply: str
    result: Dict[str, Any]


def classify_intent(state: AgentState) -> AgentState:
    llm = get_primary_llm(temperature=0)
    prompt = CLASSIFY_PROMPT.format(message=state["message"])
    resp = llm.invoke(prompt)
    intent = resp.content.strip().lower().replace(" ", "_")
    if intent not in INTENTS:
        intent = "chit_chat"
    state["intent"] = intent
    return state


def make_node_log_interaction(db: Session):
    def _node(state: AgentState) -> AgentState:
        result = tools.log_interaction(
            db=db,
            hcp_id=state.get("hcp_id") or "unknown-hcp",
            hcp_name=state.get("hcp_name") or "Unknown HCP",
            raw_notes=state["message"],
            source="chat",
        )
        state.setdefault("tool_calls", []).append("log_interaction")
        state["result"] = result
        extracted = result["extracted"]
        hcp_label = state.get("hcp_name") or extracted.get("hcp_name") or "the HCP"
        itype = extracted.get("interaction_type", "interaction")
        sentiment = extracted.get("sentiment", "")
        sentiment_note = f" Sentiment: {sentiment}." if sentiment else ""
        state["reply"] = (
            f"✅ Got it! I've logged your {itype.lower()} with {hcp_label} and saved it to the database.{sentiment_note} "
            f"The Structured Form has been pre-filled with all extracted details — "
            f"switch over to review, edit if needed, and click 'Log Interaction' to update the record."
        )
        return state
    return _node


def make_node_edit_interaction(db: Session):
    def _node(state: AgentState) -> AgentState:
        interaction_id = state.get("interaction_id")
        if not interaction_id:
            state["reply"] = (
                "I couldn't tell which logged interaction to edit. "
                "Please select one from the list first."
            )
            return state
        result = tools.edit_interaction_from_instruction(
            db=db, interaction_id=interaction_id, instruction=state["message"]
        )
        state.setdefault("tool_calls", []).append("edit_interaction")
        state["result"] = result
        state["reply"] = "Updated the interaction with your requested changes."
        return state
    return _node


def make_node_fetch_history(db: Session):
    def _node(state: AgentState) -> AgentState:
        result = tools.fetch_hcp_history(db=db, hcp_id=state.get("hcp_id") or "")
        state.setdefault("tool_calls", []).append("fetch_hcp_history")
        state["result"] = result
        count = result["count"]
        state["reply"] = f"Found {count} prior interaction(s) on file for this HCP."
        return state
    return _node


def make_node_suggest_action(db: Session):
    def _node(state: AgentState) -> AgentState:
        result = tools.suggest_next_best_action(db=db, hcp_id=state.get("hcp_id") or "")
        state.setdefault("tool_calls", []).append("suggest_next_best_action")
        state["result"] = result
        state["reply"] = result["suggestion"]
        return state
    return _node


def make_node_schedule_follow_up(db: Session):
    def _node(state: AgentState) -> AgentState:
        interaction_id = state.get("interaction_id")
        if not interaction_id:
            state["reply"] = "I need an interaction to attach the follow-up to."
            return state
        import datetime
        follow_up = datetime.datetime.utcnow() + datetime.timedelta(days=14)
        result = tools.schedule_follow_up(db=db, interaction_id=interaction_id, follow_up_date=follow_up)
        state.setdefault("tool_calls", []).append("schedule_follow_up")
        state["result"] = result
        state["reply"] = f"Follow-up scheduled for {follow_up.strftime('%Y-%m-%d')}."
        return state
    return _node


def node_chit_chat(state: AgentState) -> AgentState:
    state["reply"] = (
        "I can help you log an HCP interaction, edit one, look up history, "
        "suggest a next best action, or schedule a follow-up. What would you like to do?"
    )
    return state


def route_by_intent(state: AgentState) -> str:
    return state["intent"]


def build_agent_graph(db: Session):
    """Builds and compiles the LangGraph StateGraph, bound to a request-scoped
    DB session so each tool node can read/write interactions."""
    graph = StateGraph(AgentState)

    graph.add_node("classify_intent", classify_intent)
    graph.add_node("log_interaction", make_node_log_interaction(db))
    graph.add_node("edit_interaction", make_node_edit_interaction(db))
    graph.add_node("fetch_history", make_node_fetch_history(db))
    graph.add_node("suggest_action", make_node_suggest_action(db))
    graph.add_node("schedule_follow_up", make_node_schedule_follow_up(db))
    graph.add_node("chit_chat", node_chit_chat)

    graph.set_entry_point("classify_intent")
    graph.add_conditional_edges(
        "classify_intent",
        route_by_intent,
        {
            "log_interaction": "log_interaction",
            "edit_interaction": "edit_interaction",
            "fetch_history": "fetch_history",
            "suggest_action": "suggest_action",
            "schedule_follow_up": "schedule_follow_up",
            "chit_chat": "chit_chat",
        },
    )

    for node in [
        "log_interaction", "edit_interaction", "fetch_history",
        "suggest_action", "schedule_follow_up", "chit_chat",
    ]:
        graph.add_edge(node, END)

    return graph.compile()


def run_agent(db: Session, session_id: str, message: str,
              hcp_id: Optional[str] = None, hcp_name: Optional[str] = None,
              interaction_id: Optional[str] = None) -> AgentState:
    app = build_agent_graph(db)
    initial_state: AgentState = {
        "session_id": session_id,
        "message": message,
        "hcp_id": hcp_id,
        "hcp_name": hcp_name,
        "interaction_id": interaction_id,
        "tool_calls": [],
    }
    final_state = app.invoke(initial_state)
    return final_state
