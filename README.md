# AI-First CRM — HCP Module: Log Interaction Screen

An AI-first CRM module for pharmaceutical field representatives to log,
review, and edit interactions with Healthcare Professionals (HCPs) — via a
structured form **or** a natural-language chat interface backed by a
LangGraph agent running on Groq LLMs.

See [`DESIGN.md`](./DESIGN.md) for the full conceptual write-up (agent role,
tool definitions, data model rationale).

---

## Tech stack

| Layer          | Choice                                            |
|-----------------|---------------------------------------------------|
| Frontend        | React + Redux Toolkit                              |
| Backend         | Python + FastAPI                                    |
| AI agent        | LangGraph                                           |
| LLMs            | Groq — `gemma2-9b-it` (primary), `llama-3.3-70b-versatile` (context/reasoning) |
| Database        | PostgreSQL / MySQL (SQLAlchemy ORM; SQLite fallback for zero-config local demo) |
| Font            | Google Inter                                        |

---

## Project structure

```
hcp-crm/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app, CORS, router mounting
│   │   ├── config.py               # Settings (.env driven)
│   │   ├── database.py             # SQLAlchemy engine/session
│   │   ├── models.py                # Interaction & HCP ORM models
│   │   ├── schemas.py               # Pydantic request/response schemas
│   │   ├── agent/
│   │   │   ├── llm.py                # Groq LLM client wrapper
│   │   │   ├── tools.py              # The 5 LangGraph tools
│   │   │   └── graph.py              # LangGraph StateGraph (the agent)
│   │   └── routers/
│   │       ├── interactions.py       # REST CRUD (structured form path)
│   │       └── chat.py               # Conversational path -> agent
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── App.jsx                   # Shell + HCP picker
    │   ├── components/
    │   │   ├── LogInteractionScreen.jsx  # Tab toggle: Chat vs Form
    │   │   ├── StructuredForm.jsx
    │   │   ├── ChatInterface.jsx
    │   │   └── InteractionList.jsx       # History + inline edit
    │   ├── store/                     # Redux Toolkit slices
    │   └── api/api.js                 # Axios client
    └── package.json
```

---

## How it works

The **Log Interaction Screen** gives a rep two equivalent paths into the
same data model:

1. **Structured Form** — direct field entry (type, channel, products,
   sentiment, notes, next action). No LLM call needed; fastest path when the
   rep already knows exactly what to record.
2. **Conversational Chat** — the rep types a free-text note (e.g. *"Met Dr.
   Rao today, discussed CardioX efficacy data, she was very positive and
   asked for 2 samples"*). This is sent to `/api/chat`, which invokes the
   **LangGraph agent**. The agent classifies intent, then routes to one of
   five tools (see `DESIGN.md`), the primary one being `log_interaction`,
   which uses the Groq `gemma2-9b-it` model to extract structured fields
   (type, products, sentiment, samples, summary, next-best-action) from the
   free text and persist an `Interaction` row — identical in shape to what
   the structured form produces.

Both paths write to the same `interactions` table, so the history panel and
edit flow work uniformly regardless of how a record was created.

---

## Running locally

### 1. Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate   # Windows: .\venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env and set GROQ_API_KEY (get one free at https://console.groq.com)
# DATABASE_URL defaults to a local SQLite file if you don't set one, so you
# can run the demo with zero DB setup. For Postgres/MySQL, uncomment the
# relevant DATABASE_URL line in .env.

uvicorn app.main:app --reload --port 8000
```

API docs (Swagger UI) will be at `http://localhost:8000/docs`.

### 2. Frontend

```bash
cd frontend
npm install
npm start
```

App runs at `http://localhost:3000` and talks to the backend at
`http://localhost:8000` (override with `REACT_APP_API_BASE` env var if
needed).

### 3. Database (optional — Postgres example)

```bash
createdb hcp_crm
# or with docker:
docker run -d --name hcp-pg -e POSTGRES_USER=hcp_user -e POSTGRES_PASSWORD=hcp_pass \
  -e POSTGRES_DB=hcp_crm -p 5432:5432 postgres:16
```

Tables are auto-created on backend startup via `Base.metadata.create_all`.

---

## API summary

| Method | Path                          | Purpose                              |
|--------|-------------------------------|---------------------------------------|
| POST   | `/api/interactions`           | Create interaction (structured form)   |
| GET    | `/api/interactions?hcp_id=`   | List interactions, optional HCP filter |
| GET    | `/api/interactions/{id}`      | Fetch one interaction                  |
| PATCH  | `/api/interactions/{id}`      | Edit interaction (structured)           |
| DELETE | `/api/interactions/{id}`      | Delete interaction                      |
| POST   | `/api/chat`                   | Send message to LangGraph agent         |
| GET    | `/api/health`                 | Health check                            |

---

## Notes on the assignment

- This is a conceptual/technical assignment submission. The code is a
  complete, runnable reference implementation of the required screen, data
  model, REST API, and LangGraph agent with 5 tools — sized for a take-home
  assignment rather than a production system (e.g. auth, multi-tenant HCP
  master data, and a real calendar integration for follow-ups are stubbed
  or simplified, and called out as such in `DESIGN.md`).
- Swap `GROQ_PRIMARY_MODEL` / `GROQ_CONTEXT_MODEL` in `.env` if Groq
  deprecates either model — the code reads them from settings rather than
  hardcoding model names beyond the default.
