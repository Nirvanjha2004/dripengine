from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from ..services.dashboard_service import (
    get_overview,
    get_sequences_health,
    get_contact_timeline,
    get_delivery_logs,
)

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/overview", summary="Home page summary stats")
async def overview():
    """
    Returns:
      - total contacts
      - active enrollments
      - total sent / skipped / failed
      - emails sent in last 24h
      - last 5 delivery events
    """
    try:
        return await get_overview()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sequences", summary="Per-sequence health")
async def sequences():
    """
    Returns a list of all sequences with:
      - how many contacts are actively enrolled
      - total sent / skipped / failed per sequence
    """
    try:
        return await get_sequences_health()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/contacts", summary="Contact timeline")
async def contact_timeline(
    email: str = Query(..., description="Email address to look up")
):
    """
    Returns the full history for a single contact:
      - their stored properties
      - all sequences they've been enrolled in
      - all events they've fired
      - every delivery log entry (sent/skipped/failed + reason)
    """
    try:
        result = await get_contact_timeline(email)
        if not result["found"]:
            raise HTTPException(
                status_code=404,
                detail=f"No contact found with email '{email}'"
            )
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/logs", summary="Paginated delivery log")
async def delivery_logs(
    page:        int            = Query(1,    ge=1,  description="Page number"),
    limit:       int            = Query(50,   ge=1, le=200, description="Items per page"),
    status:      Optional[str]  = Query(None, description="Filter: sent | skipped | failed"),
    sequence_id: Optional[str]  = Query(None, description="Filter by sequence ID"),
):
    """
    Chronological feed of all delivery events.
    Supports pagination and filtering by status or sequence.
    """
    try:
        return await get_delivery_logs(page, limit, status, sequence_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))