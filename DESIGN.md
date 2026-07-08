# Design Notes — AI-First CRM HCP Module: Log Interaction Screen

## 1. Objective, reframed

A field rep's highest-friction moment is *after* an HCP visit: they're
tired, in a car park or airport lounge, and the last thing they want is a
12-field form. An AI-first CRM should let the rep talk the way they'd
describe the visit to a colleague, and have the system do the structuring
— while still offering the form for reps who prefer it, or for edits where
precision matters more than speed.

## 2. Role of the LangGraph agent

The LangGraph agent sits behind the chat surface of the Log Interaction
Screen and acts as an **intent router + structured-data extractor** for
HCP engagement data. Concretely it:

1. **Classifies** the rep's free-text message into one of six intents
   (log a new interaction, edit an existing one, fetch history, get a
   next-best-action suggestion, schedule a follow-up, or general chit-chat).
2. **Routes** to a dedicated tool node per intent, so each concern (logging
   vs. editing vs. reasoning about history) has its own focused prompt and
   database access pattern rather than one giant prompt trying to do
   everything.
3. **Extracts** structured fields from unstructured rep notes using the
   Groq-hosted `llama-3.1-8b-instant` model — interaction type, channel, products
   discussed, topics, sentiment, samples distributed, a short summary, and
   a recommended next action.
4. **Persists** the result to the same `Interaction` table the structured
   form writes to, so downstream reporting doesn't need to know which path
   created a given record.
5. **Escalates** to a larger model (`llama-3.3-70b-versatile`) specifically
   for the "suggest next best action" tool, where reasoning over several
   past interactions benefits from a larger context window and stronger
   reasoning, while the higher-volume, lower-latency extraction work stays
   on the smaller/cheaper `llama-3.1-8b-instant`.

Using LangGraph (rather than a single prompt-and-parse call) makes the
intent-to-tool routing explicit and inspectable, and makes it straightforward
to add new tools (e.g. a "check formulary access" tool) as new nodes without
restructuring the whole agent.

## 3. The five tools

| # | Tool | Purpose | LLM involvement |
|---|------|---------|------------------|
| 1 | **Log Interaction** | Creates a new `Interaction` record from a rep's free-text note. | Uses `llama-3.1-8b-instant` to extract interaction type, channel, products discussed, topics, sentiment, samples distributed, a 1–3 sentence summary, and a suggested next action from the raw text (`_llm_extract` in `agent/tools.py`). |
| 2 | **Edit Interaction** | Updates a previously logged interaction, either from an explicit field diff (structured form path) or a natural-language instruction like *"change sentiment to positive and add ProductC"* (chat path). | For the chat path, the LLM is given the existing interaction as JSON plus the instruction and returns only the fields that should change — a minimal diff rather than a full rewrite, so unrelated fields are never clobbered. |
| 3 | **Fetch HCP History** | Retrieves the N most recent interactions for an HCP, giving the agent (and the rep, via the "show history" chat intent) context before logging or advising. | No LLM call — pure DB read, used as context input to tools 1, 2, and 4. |
| 4 | **Suggest Next Best Action** | Reasons over an HCP's full interaction history and recommends one concrete next step. | Uses the larger `llama-3.3-70b-versatile` model since this requires synthesizing a whole history rather than a single message. |
| 5 | **Schedule Follow-up** | Sets/updates a follow-up reminder date on an interaction (stands in for pushing a task into a calendar/reminder system). | No LLM call in the reference implementation — the date is proposed as "+14 days" from the interaction date. A production build would let the LLM parse rep-specified dates like "follow up in 3 weeks" or "next Tuesday". |

Tools 1 (Log Interaction) and 2 (Edit Interaction) are the two mandated by
the assignment; tools 3–5 round out a realistic sales-support toolkit: you
can't log an interaction usefully without history for context, you can't
recommend a next step without history, and every logged interaction
eventually needs a follow-up scheduled.

## 4. Data model

A single `Interaction` table backs both entry paths:

- `source` (`structured_form` | `chat`) — preserves provenance without
  affecting downstream reads.
- `raw_notes` — the original free text (or a serialized note from the
  form) is always kept, so a human can audit what the AI extracted from.
- `ai_confidence` — a placeholder field for a production system to
  down-weight or flag AI-extracted records that might need human review
  (e.g. below a confidence threshold, prompt the rep to confirm before the
  record is finalized).
- `products_discussed`, `topics`, `samples_distributed` are stored as JSON
  columns — flexible enough for the variety of a chat-derived extraction
  without needing a fully normalized products/samples schema for a v1.

## 5. Human-in-the-loop consideration

Because tool 1 involves an LLM inferring structured facts (sentiment,
products, next action) from unstructured text, the chat interface echoes
back what it logged in the same turn ("Logged a Visit with Dr. Rao.
Sentiment: Positive. Summary: ... Suggested next step: ..."). This gives the
rep an immediate, cheap way to catch a misread before it becomes stale CRM
data — a real product would add an explicit "confirm / edit" step before
committing, rather than committing immediately; this is called out as a
simplification made for the assignment's scope.

## 6. What's simplified for this assignment

- **HCP master data** is a hardcoded demo roster in the frontend rather than
  a full HCP management module (out of scope for "Log Interaction Screen").
- **Auth / multi-rep accounts** are not implemented — `rep_name` defaults to
  a placeholder.
- **Follow-up scheduling** doesn't integrate with a real calendar; it just
  sets a `follow_up_date` field as a stand-in for that integration point.
- **Confirmation step** before committing an AI-parsed interaction is
  mentioned above as the recommended production hardening, not built here,
  to keep the demo's chat flow to one round-trip per log action as shown in
  the demo video.
