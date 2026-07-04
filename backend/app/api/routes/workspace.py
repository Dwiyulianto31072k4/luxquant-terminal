# backend/app/api/routes/workspace.py
"""
Admin Workspace API — Follow-ups, Marketing Campaigns, Brand TODOs.
All endpoints require admin role. All data SHARED across admins.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_, func, or_
from datetime import datetime, timezone, timedelta
from typing import Optional

from app.core.database import get_db
from app.api.deps import get_admin_user
from app.models.user import User
from app.models.workspace import AdminFollowup, MarketingCampaign, BrandTodo
from app.schemas.workspace import (
    FollowupCreate, FollowupUpdate, FollowupResponse,
    CampaignCreate, CampaignUpdate, CampaignResponse,
    TodoCreate, TodoUpdate, TodoResponse,
    WorkspaceStats,
)


router = APIRouter(prefix="/api/v1/workspace", tags=["workspace"])


# ════════════════════════════════════════════════════════════════════
# Helper: serialize Campaign (extra_data field instead of metadata)
# ════════════════════════════════════════════════════════════════════

def _serialize_campaign(c: MarketingCampaign) -> dict:
    """Serialize MarketingCampaign."""
    return {
        "id": c.id,
        "name": c.name,
        "description": c.description,
        "platform": c.platform,
        "budget_usd": float(c.budget_usd or 0),
        "spent_usd": float(c.spent_usd or 0),
        "extra_data": c.extra_data or {},
        "line_items": c.line_items or [],
        "start_date": c.start_date,
        "end_date": c.end_date,
        "status": c.status,
        "created_by": c.created_by,
        "creator": {"id": c.creator.id, "username": c.creator.username} if c.creator else None,
        "created_at": c.created_at,
        "updated_at": c.updated_at,
    }


# ════════════════════════════════════════════════════════════════════
# STATS — workspace overview
# ════════════════════════════════════════════════════════════════════

@router.get("/stats", response_model=WorkspaceStats)
def workspace_stats(
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)

    # Follow-up counts
    followups_pending = db.query(AdminFollowup).filter(
        AdminFollowup.status.in_(['pending', 'in_progress'])
    ).count()

    followups_overdue = db.query(AdminFollowup).filter(
        AdminFollowup.status.in_(['pending', 'in_progress']),
        AdminFollowup.due_date < now,
    ).count()

    followups_today = db.query(AdminFollowup).filter(
        AdminFollowup.status.in_(['pending', 'in_progress']),
        AdminFollowup.due_date >= today_start,
        AdminFollowup.due_date < today_end,
    ).count()

    # Marketing
    campaigns_active = db.query(MarketingCampaign).filter(
        MarketingCampaign.status == 'active'
    ).count()

    budget_row = db.query(
        func.coalesce(func.sum(MarketingCampaign.budget_usd), 0),
        func.coalesce(func.sum(MarketingCampaign.spent_usd), 0),
    ).filter(MarketingCampaign.status != 'cancelled').first()

    total_budget = float(budget_row[0] or 0)
    total_spent = float(budget_row[1] or 0)

    # TODOs
    todos_in_progress = db.query(BrandTodo).filter(BrandTodo.status == 'in_progress').count()
    todos_backlog = db.query(BrandTodo).filter(BrandTodo.status == 'backlog').count()
    todos_urgent = db.query(BrandTodo).filter(
        BrandTodo.status.in_(['backlog', 'in_progress']),
        BrandTodo.priority == 'urgent',
    ).count()

    return WorkspaceStats(
        followups_pending=followups_pending,
        followups_overdue=followups_overdue,
        followups_today=followups_today,
        campaigns_active=campaigns_active,
        total_budget=total_budget,
        total_spent=total_spent,
        todos_in_progress=todos_in_progress,
        todos_backlog=todos_backlog,
        todos_urgent=todos_urgent,
    )


# ════════════════════════════════════════════════════════════════════
# FOLLOW-UPS
# ════════════════════════════════════════════════════════════════════

@router.get("/followups")
def list_followups(
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    user_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    q = db.query(AdminFollowup)

    if status:
        if status == 'open':
            q = q.filter(AdminFollowup.status.in_(['pending', 'in_progress']))
        elif status == 'overdue':
            q = q.filter(
                AdminFollowup.status.in_(['pending', 'in_progress']),
                AdminFollowup.due_date < datetime.now(timezone.utc),
            )
        else:
            q = q.filter(AdminFollowup.status == status)

    if category:
        q = q.filter(AdminFollowup.category == category)
    if priority:
        q = q.filter(AdminFollowup.priority == priority)
    if user_id:
        q = q.filter(AdminFollowup.user_id == user_id)
    if search:
        like = f"%{search}%"
        q = q.filter(or_(
            AdminFollowup.title.ilike(like),
            AdminFollowup.note.ilike(like),
        ))

    # Sort: open first by due_date asc, done last
    q = q.order_by(
        AdminFollowup.status.asc(),  # cancelled/done last alphabetically
        AdminFollowup.due_date.asc(),
    )

    items = q.all()

    def serialize(f):
        return {
            "id": f.id,
            "user_id": f.user_id,
            "user": {"id": f.user.id, "username": f.user.username} if f.user else None,
            "title": f.title,
            "note": f.note,
            "category": f.category,
            "due_date": f.due_date,
            "status": f.status,
            "priority": f.priority,
            "created_by": f.created_by,
            "creator": {"id": f.creator.id, "username": f.creator.username} if f.creator else None,
            "completed_by": f.completed_by,
            "completer": {"id": f.completer.id, "username": f.completer.username} if f.completer else None,
            "completed_at": f.completed_at,
            "created_at": f.created_at,
            "updated_at": f.updated_at,
        }

    return {"items": [serialize(f) for f in items], "total": len(items)}


@router.post("/followups", status_code=201)
def create_followup(
    data: FollowupCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    # Validate user_id exists if provided
    if data.user_id:
        target = db.query(User).filter(User.id == data.user_id).first()
        if not target:
            raise HTTPException(status_code=404, detail="User not found")

    f = AdminFollowup(
        user_id=data.user_id,
        title=data.title,
        note=data.note,
        category=data.category,
        due_date=data.due_date,
        priority=data.priority,
        status='pending',
        created_by=admin.id,
    )
    db.add(f)
    db.commit()
    db.refresh(f)

    return {"success": True, "id": f.id, "message": "Follow-up created"}


@router.patch("/followups/{followup_id}")
def update_followup(
    followup_id: int,
    data: FollowupUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    f = db.query(AdminFollowup).filter(AdminFollowup.id == followup_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="Follow-up not found")

    payload = data.model_dump(exclude_unset=True)

    # If transitioning to done/cancelled, record completion
    if 'status' in payload and payload['status'] in ('done', 'cancelled'):
        if f.status not in ('done', 'cancelled'):
            f.completed_by = admin.id
            f.completed_at = datetime.now(timezone.utc)
    elif 'status' in payload and payload['status'] not in ('done', 'cancelled'):
        # Reopened — clear completion
        f.completed_by = None
        f.completed_at = None

    for k, v in payload.items():
        setattr(f, k, v)

    db.commit()
    db.refresh(f)

    return {"success": True, "message": "Follow-up updated"}


@router.delete("/followups/{followup_id}")
def delete_followup(
    followup_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    f = db.query(AdminFollowup).filter(AdminFollowup.id == followup_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="Follow-up not found")

    db.delete(f)
    db.commit()
    return {"success": True, "message": "Follow-up deleted"}


# ════════════════════════════════════════════════════════════════════
# MARKETING CAMPAIGNS
# ════════════════════════════════════════════════════════════════════

@router.get("/campaigns")
def list_campaigns(
    status: Optional[str] = Query(None),
    platform: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    q = db.query(MarketingCampaign)

    if status:
        q = q.filter(MarketingCampaign.status == status)
    if platform:
        q = q.filter(MarketingCampaign.platform == platform)
    if search:
        like = f"%{search}%"
        q = q.filter(or_(
            MarketingCampaign.name.ilike(like),
            MarketingCampaign.description.ilike(like),
        ))

    q = q.order_by(MarketingCampaign.created_at.desc())
    items = q.all()
    return {"items": [_serialize_campaign(c) for c in items], "total": len(items)}


@router.post("/campaigns", status_code=201)
def create_campaign(
    data: CampaignCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    c = MarketingCampaign(
        name=data.name,
        description=data.description,
        platform=data.platform,
        budget_usd=data.budget_usd,
        spent_usd=data.spent_usd,
        extra_data=data.extra_data or {},
        line_items=data.line_items or [],
        start_date=data.start_date,
        end_date=data.end_date,
        status=data.status,
        created_by=admin.id,
    )
    db.add(c)
    db.commit()
    db.refresh(c)

    return {"success": True, "id": c.id, "message": "Campaign created"}


@router.patch("/campaigns/{campaign_id}")
def update_campaign(
    campaign_id: int,
    data: CampaignUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    c = db.query(MarketingCampaign).filter(MarketingCampaign.id == campaign_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")

    payload = data.model_dump(exclude_unset=True)

    for k, v in payload.items():
        setattr(c, k, v)

    db.commit()
    db.refresh(c)
    return {"success": True, "message": "Campaign updated"}


@router.delete("/campaigns/{campaign_id}")
def delete_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    c = db.query(MarketingCampaign).filter(MarketingCampaign.id == campaign_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")

    db.delete(c)
    db.commit()
    return {"success": True, "message": "Campaign deleted"}


# ════════════════════════════════════════════════════════════════════
# BRAND TODOS
# ════════════════════════════════════════════════════════════════════

@router.get("/todos")
def list_todos(
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    q = db.query(BrandTodo)

    if status:
        if status == 'open':
            q = q.filter(BrandTodo.status.in_(['backlog', 'in_progress']))
        else:
            q = q.filter(BrandTodo.status == status)

    if category:
        q = q.filter(BrandTodo.category == category)
    if priority:
        q = q.filter(BrandTodo.priority == priority)
    if search:
        like = f"%{search}%"
        q = q.filter(or_(
            BrandTodo.title.ilike(like),
            BrandTodo.description.ilike(like),
        ))

    # Sort: priority urgent first, then by created
    priority_order = {'urgent': 0, 'high': 1, 'normal': 2, 'low': 3}
    items = q.all()
    items.sort(key=lambda t: (
        0 if t.status in ('backlog', 'in_progress') else 1,
        priority_order.get(t.priority, 99),
        -(t.created_at.timestamp() if t.created_at else 0),
    ))

    def serialize(t):
        return {
            "id": t.id,
            "title": t.title,
            "description": t.description,
            "category": t.category,
            "status": t.status,
            "priority": t.priority,
            "due_date": t.due_date,
            "tags": t.tags or [],
            "created_by": t.created_by,
            "creator": {"id": t.creator.id, "username": t.creator.username} if t.creator else None,
            "completed_by": t.completed_by,
            "completer": {"id": t.completer.id, "username": t.completer.username} if t.completer else None,
            "completed_at": t.completed_at,
            "created_at": t.created_at,
            "updated_at": t.updated_at,
        }

    return {"items": [serialize(t) for t in items], "total": len(items)}


@router.post("/todos", status_code=201)
def create_todo(
    data: TodoCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    t = BrandTodo(
        title=data.title,
        description=data.description,
        category=data.category,
        priority=data.priority,
        due_date=data.due_date,
        tags=data.tags or [],
        status='backlog',
        created_by=admin.id,
    )
    db.add(t)
    db.commit()
    db.refresh(t)

    return {"success": True, "id": t.id, "message": "Todo created"}


@router.patch("/todos/{todo_id}")
def update_todo(
    todo_id: int,
    data: TodoUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    t = db.query(BrandTodo).filter(BrandTodo.id == todo_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Todo not found")

    payload = data.model_dump(exclude_unset=True)

    # Completion tracking
    if 'status' in payload and payload['status'] in ('done', 'cancelled'):
        if t.status not in ('done', 'cancelled'):
            t.completed_by = admin.id
            t.completed_at = datetime.now(timezone.utc)
    elif 'status' in payload and payload['status'] not in ('done', 'cancelled'):
        t.completed_by = None
        t.completed_at = None

    for k, v in payload.items():
        setattr(t, k, v)

    db.commit()
    db.refresh(t)
    return {"success": True, "message": "Todo updated"}


@router.delete("/todos/{todo_id}")
def delete_todo(
    todo_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    t = db.query(BrandTodo).filter(BrandTodo.id == todo_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Todo not found")

    db.delete(t)
    db.commit()
    return {"success": True, "message": "Todo deleted"}
