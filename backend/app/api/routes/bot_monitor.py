"""Telegram bot monitor — admin endpoints for Management System › Bots.

  GET  /api/v1/workspace/bots          cached snapshot (60s)
  POST /api/v1/workspace/bots/refresh  re-probe; a snapshot under 15s old is reused

See app/services/bot_monitor.py for what is checked and why.
"""
from fastapi import APIRouter, Depends

from app.api.deps import get_admin_user
from app.services import bot_monitor

router = APIRouter(prefix="/api/v1/workspace/bots", tags=["bot-monitor"])


@router.get("")
async def get_bots(_admin=Depends(get_admin_user)):
    return await bot_monitor.collect(force=False)


@router.post("/refresh")
async def refresh_bots(_admin=Depends(get_admin_user)):
    return await bot_monitor.collect(force=True)
