"""External API inventory — admin endpoints.

Backs the Management System "API Health" tab: every third-party key LuxQuant
depends on, its live status, and whatever balance or quota the provider is
willing to report.  See app/services/api_health.py for the provider registry.

  GET  /api/v1/workspace/api-health          cached inventory (probes stale rows)
  POST /api/v1/workspace/api-health/refresh  force a re-probe, quota floor still applies
"""
from fastapi import APIRouter, Depends

from app.api.deps import get_admin_user
from app.services import api_health

router = APIRouter(prefix="/api/v1/workspace/api-health", tags=["api-health"])


@router.get("")
async def get_api_health(_admin=Depends(get_admin_user)):
    return await api_health.collect(force=False)


@router.post("/refresh")
async def refresh_api_health(_admin=Depends(get_admin_user)):
    return await api_health.collect(force=True)
