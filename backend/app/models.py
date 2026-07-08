import datetime
import uuid

from sqlalchemy import Column, String, Text, DateTime, JSON, Float

from app.database import Base


def gen_id():
    return str(uuid.uuid4())


class HCP(Base):
    """Healthcare Professional master record (minimal, for demo/lookups)."""
    __tablename__ = "hcps"

    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String, nullable=False)
    specialty = Column(String)
    hospital = Column(String)
    email = Column(String)
    phone = Column(String)
    segment = Column(String)  # e.g. High Value, Medium, Low
    last_interaction_at = Column(DateTime)


class Interaction(Base):
    """
    A single logged interaction with an HCP.
    Can be created via the structured form OR the conversational chat
    interface (which is parsed by the LangGraph agent into this same shape).
    """
    __tablename__ = "interactions"

    id = Column(String, primary_key=True, default=gen_id)
    hcp_id = Column(String, nullable=False)
    hcp_name = Column(String, nullable=False)
    rep_name = Column(String, default="Field Rep")

    interaction_type = Column(String)  # Visit, Call, Email, Conference
    channel = Column(String)           # In-person, Virtual
    date = Column(DateTime, default=datetime.datetime.utcnow)

    products_discussed = Column(JSON, default=list)   # ["ProductA", "ProductB"]
    topics = Column(JSON, default=list)                # extracted key topics
    sentiment = Column(String)                          # Positive/Neutral/Negative
    samples_distributed = Column(JSON, default=list)    # [{"product": "..","qty": 1}]
    materials_shared = Column(JSON, default=list)
    attendees = Column(JSON, default=list)
    interaction_time = Column(String, nullable=True)

    key_discussion_points = Column(Text)  # summarized notes
    raw_notes = Column(Text)              # original free-text / chat transcript
    next_best_action = Column(Text)
    follow_up_date = Column(DateTime, nullable=True)

    source = Column(String, default="structured_form")  # structured_form | chat
    ai_confidence = Column(Float, default=1.0)

    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
