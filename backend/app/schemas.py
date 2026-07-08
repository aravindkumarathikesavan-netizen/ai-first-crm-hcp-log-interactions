import datetime
from typing import List, Optional, Dict, Any

from pydantic import BaseModel


class InteractionBase(BaseModel):
    hcp_id: str
    hcp_name: str
    rep_name: Optional[str] = "Field Rep"
    interaction_type: Optional[str] = "Visit"
    channel: Optional[str] = "In-person"
    date: Optional[datetime.datetime] = None
    products_discussed: Optional[List[str]] = []
    topics: Optional[List[str]] = []
    sentiment: Optional[str] = "Neutral"
    samples_distributed: Optional[List[Dict[str, Any]]] = []
    materials_shared: Optional[List[str]] = []
    attendees: Optional[List[str]] = []
    interaction_time: Optional[str] = None
    key_discussion_points: Optional[str] = None
    raw_notes: Optional[str] = None
    next_best_action: Optional[str] = None
    follow_up_date: Optional[datetime.datetime] = None


class InteractionCreate(InteractionBase):
    pass


class InteractionUpdate(BaseModel):
    hcp_name: Optional[str] = None
    interaction_type: Optional[str] = None
    channel: Optional[str] = None
    date: Optional[datetime.datetime] = None
    products_discussed: Optional[List[str]] = None
    topics: Optional[List[str]] = None
    sentiment: Optional[str] = None
    samples_distributed: Optional[List[Dict[str, Any]]] = None
    materials_shared: Optional[List[str]] = None
    attendees: Optional[List[str]] = None
    interaction_time: Optional[str] = None
    key_discussion_points: Optional[str] = None
    raw_notes: Optional[str] = None
    next_best_action: Optional[str] = None
    follow_up_date: Optional[datetime.datetime] = None


class InteractionOut(InteractionBase):
    id: str
    source: str
    ai_confidence: float
    created_at: datetime.datetime
    updated_at: datetime.datetime

    class Config:
        from_attributes = True


class ChatMessageIn(BaseModel):
    session_id: str
    message: str
    hcp_id: Optional[str] = None
    hcp_name: Optional[str] = None
    interaction_id: Optional[str] = None


class ChatMessageOut(BaseModel):
    session_id: str
    reply: str
    tool_calls: List[str] = []
    interaction: Optional[InteractionOut] = None
    awaiting_confirmation: bool = False
    draft: Optional[Dict[str, Any]] = None
    extracted: Optional[Dict[str, Any]] = None
