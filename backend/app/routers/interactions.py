from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/api/interactions", tags=["interactions"])


@router.post("", response_model=schemas.InteractionOut)
def create_interaction(payload: schemas.InteractionCreate, db: Session = Depends(get_db)):
    """Structured-form path: rep fills out fields directly (no LLM needed),
    used when the rep prefers the form over the chat interface."""
    data = payload.model_dump()
    hcp_id = data.get("hcp_id")
    hcp_name = data.get("hcp_name")

    if not hcp_id or hcp_id == "unknown-hcp":
        existing = db.query(models.Interaction).filter(models.Interaction.hcp_name == hcp_name).first()
        if existing:
            data["hcp_id"] = existing.hcp_id
        else:
            data["hcp_id"] = f"hcp-{models.gen_id()[:8]}"

    interaction = models.Interaction(**data)
    interaction.source = "structured_form"
    db.add(interaction)
    db.commit()
    db.refresh(interaction)
    return interaction


@router.get("", response_model=List[schemas.InteractionOut])
def list_interactions(hcp_id: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(models.Interaction)
    if hcp_id:
        q = q.filter(models.Interaction.hcp_id == hcp_id)
    return q.order_by(models.Interaction.date.desc()).all()


@router.get("/{interaction_id}", response_model=schemas.InteractionOut)
def get_interaction(interaction_id: str, db: Session = Depends(get_db)):
    interaction = db.query(models.Interaction).filter(models.Interaction.id == interaction_id).first()
    if not interaction:
        raise HTTPException(status_code=404, detail="Interaction not found")
    return interaction


@router.patch("/{interaction_id}", response_model=schemas.InteractionOut)
def update_interaction(interaction_id: str, payload: schemas.InteractionUpdate, db: Session = Depends(get_db)):
    """Structured 'Edit Interaction' path -- direct field updates."""
    interaction = db.query(models.Interaction).filter(models.Interaction.id == interaction_id).first()
    if not interaction:
        raise HTTPException(status_code=404, detail="Interaction not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(interaction, key, value)
    db.commit()
    db.refresh(interaction)
    return interaction


@router.delete("/{interaction_id}")
def delete_interaction(interaction_id: str, db: Session = Depends(get_db)):
    interaction = db.query(models.Interaction).filter(models.Interaction.id == interaction_id).first()
    if not interaction:
        raise HTTPException(status_code=404, detail="Interaction not found")
    db.delete(interaction)
    db.commit()
    return {"ok": True}
