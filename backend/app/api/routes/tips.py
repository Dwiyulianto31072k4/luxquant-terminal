# app/api/routes/tips.py
import os
import uuid
import shutil
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc
from pydantic import BaseModel

from app.core.database import get_db
from app.api.deps import get_current_user, get_current_user_optional
from app.models.user import User
from app.models.tip import Tip

router = APIRouter(prefix="/tips", tags=["Tips"])

# ============ Config ============
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "uploads", "tips")
PDF_DIR = os.path.join(UPLOAD_DIR, "pdfs")
COVER_DIR = os.path.join(UPLOAD_DIR, "covers")

# Ensure directories exist
os.makedirs(PDF_DIR, exist_ok=True)
os.makedirs(COVER_DIR, exist_ok=True)

# ============ Schemas ============

class TipResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    cover_image: Optional[str] = None
    pdf_path: str
    category: str
    created_by: Optional[int] = None
    created_at: datetime
    is_active: bool

    class Config:
        from_attributes = True


class TipListResponse(BaseModel):
    items: List[TipResponse]
    total: int


# ============ Helpers ============

def require_admin(user: User):
    """Check if user is admin"""
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )


def save_upload_file(upload_file: UploadFile, directory: str, allowed_extensions: list) -> str:
    """Save uploaded file and return the filename"""
    ext = os.path.splitext(upload_file.filename)[1].lower()
    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type {ext} not allowed. Allowed: {', '.join(allowed_extensions)}"
        )

    # Generate unique filename
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(directory, filename)

    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(upload_file.file, buffer)

    return filename


# ============ Public Endpoints ============

@router.get("/", response_model=TipListResponse)
async def get_tips(
    category: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Get all active tips (public)"""
    query = db.query(Tip).filter(Tip.is_active == True)

    if category and category != "all":
        query = query.filter(Tip.category == category)

    if search:
        query = query.filter(
            Tip.title.ilike(f"%{search}%") | Tip.description.ilike(f"%{search}%")
        )

    total = query.count()
    items = query.order_by(desc(Tip.created_at))\
        .offset((page - 1) * page_size)\
        .limit(page_size)\
        .all()

    return TipListResponse(items=items, total=total)


@router.get("/categories")
async def get_categories(db: Session = Depends(get_db)):
    """Get list of unique categories"""
    result = db.query(Tip.category)\
        .filter(Tip.is_active == True)\
        .distinct()\
        .all()
    categories = sorted([r[0] for r in result if r[0]])
    return {"categories": categories}


@router.get("/file/pdf/{filename}")
async def serve_pdf(filename: str):
    """Serve PDF file"""
    filepath = os.path.join(PDF_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="PDF not found")
    return FileResponse(
        filepath,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"}
    )


@router.get("/file/cover/{filename}")
async def serve_cover(filename: str):
    """Serve cover image"""
    filepath = os.path.join(COVER_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(filepath)


@router.get("/{tip_id}", response_model=TipResponse)
async def get_tip(tip_id: int, db: Session = Depends(get_db)):
    """Get single tip"""
    tip = db.query(Tip).filter(Tip.id == tip_id, Tip.is_active == True).first()
    if not tip:
        raise HTTPException(status_code=404, detail="Tip not found")
    return tip


# ============ Admin Endpoints ============

@router.post("/", response_model=TipResponse, status_code=status.HTTP_201_CREATED)
async def create_tip(
    title: str = Form(...),
    description: str = Form(None),
    category: str = Form("General"),
    pdf_file: UploadFile = File(...),
    cover_file: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload new tip (admin only)"""
    require_admin(current_user)

    # Save PDF
    pdf_filename = save_upload_file(pdf_file, PDF_DIR, [".pdf"])

    # Save cover image (optional)
    cover_filename = None
    if cover_file and cover_file.filename:
        cover_filename = save_upload_file(cover_file, COVER_DIR, [".jpg", ".jpeg", ".png", ".webp"])

    # Create DB record
    tip = Tip(
        title=title,
        description=description,
        cover_image=cover_filename,
        pdf_path=pdf_filename,
        category=category,
        created_by=current_user.id
    )
    db.add(tip)
    db.commit()
    db.refresh(tip)

    return tip


@router.put("/{tip_id}", response_model=TipResponse)
async def update_tip(
    tip_id: int,
    title: str = Form(None),
    description: str = Form(None),
    category: str = Form(None),
    pdf_file: Optional[UploadFile] = File(None),
    cover_file: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update tip (admin only)"""
    require_admin(current_user)

    tip = db.query(Tip).filter(Tip.id == tip_id).first()
    if not tip:
        raise HTTPException(status_code=404, detail="Tip not found")

    if title is not None:
        tip.title = title
    if description is not None:
        tip.description = description
    if category is not None:
        tip.category = category

    # Replace PDF if new one uploaded
    if pdf_file and pdf_file.filename:
        # Delete old PDF
        old_path = os.path.join(PDF_DIR, tip.pdf_path)
        if os.path.exists(old_path):
            os.remove(old_path)
        tip.pdf_path = save_upload_file(pdf_file, PDF_DIR, [".pdf"])

    # Replace cover if new one uploaded
    if cover_file and cover_file.filename:
        # Delete old cover
        if tip.cover_image:
            old_cover = os.path.join(COVER_DIR, tip.cover_image)
            if os.path.exists(old_cover):
                os.remove(old_cover)
        tip.cover_image = save_upload_file(cover_file, COVER_DIR, [".jpg", ".jpeg", ".png", ".webp"])

    db.commit()
    db.refresh(tip)

    return tip


@router.delete("/{tip_id}")
async def delete_tip(
    tip_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete tip (admin only) - soft delete"""
    require_admin(current_user)

    tip = db.query(Tip).filter(Tip.id == tip_id).first()
    if not tip:
        raise HTTPException(status_code=404, detail="Tip not found")

    tip.is_active = False
    db.commit()

    return {"message": "Tip deleted", "id": tip_id}


@router.delete("/{tip_id}/permanent")
async def delete_tip_permanent(
    tip_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Permanently delete tip and files (admin only)"""
    require_admin(current_user)

    tip = db.query(Tip).filter(Tip.id == tip_id).first()
    if not tip:
        raise HTTPException(status_code=404, detail="Tip not found")

    # Delete files
    pdf_path = os.path.join(PDF_DIR, tip.pdf_path)
    if os.path.exists(pdf_path):
        os.remove(pdf_path)

    if tip.cover_image:
        cover_path = os.path.join(COVER_DIR, tip.cover_image)
        if os.path.exists(cover_path):
            os.remove(cover_path)

    db.delete(tip)
    db.commit()

    return {"message": "Tip permanently deleted", "id": tip_id}