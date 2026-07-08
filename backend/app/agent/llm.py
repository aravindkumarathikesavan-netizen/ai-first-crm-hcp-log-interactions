"""
Thin wrapper around Groq-hosted LLMs used by the LangGraph agent.

- gemma2-9b-it is the primary/default model (fast, cheap) used for most
  turn-by-turn extraction and conversation tasks.
- llama-3.3-70b-versatile is used as a fallback / "context" model for
  longer or more nuanced reasoning (e.g. summarizing a long interaction
  history before suggesting a Next Best Action).
"""
from langchain_groq import ChatGroq

from app.config import settings


def get_primary_llm(temperature: float = 0.2):
    return ChatGroq(
        api_key=settings.groq_api_key,
        model=settings.groq_primary_model,
        temperature=temperature,
    )


def get_context_llm(temperature: float = 0.2):
    return ChatGroq(
        api_key=settings.groq_api_key,
        model=settings.groq_context_model,
        temperature=temperature,
    )
